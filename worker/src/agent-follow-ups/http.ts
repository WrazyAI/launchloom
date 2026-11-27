import type {
  AgentRunEvidence,
  AgentSuggestion,
  AgentSuggestionInput,
  PreviewDelivery,
} from "../../../src/lib/agent-follow-ups";
import { buildRevisionBrief } from "./brief";
import { classifyFollowUp } from "./classify";
import { answerFollowUp } from "./answer";

const PREVIEW_PATH = "/api/internal/agent-follow-ups/preview-deliveries";
const EVIDENCE_PATH = "/api/internal/agent-follow-ups/run-evidence";
const ADMIN_PREFIX = "/api/admin/onboarding-invites/workspace";
const ADMIN_THREAD = /^\/attempts\/([^/]+)\/agent-follow-ups$/u;
const ADMIN_APPLY = /^\/attempts\/([^/]+)\/agent-follow-ups\/([^/]+)\/apply$/u;
const REPO = /^WrazyAI\/[a-z0-9][a-z0-9-]{0,100}$/u;
const ATTEMPT = /^[A-Za-z0-9:_-]{1,160}$/u;
const PROJECT = /^[a-z0-9][a-z0-9-]{0,62}$/u;
const SHA = /^[a-f0-9]{40}$/u;
const DEPLOYMENT = /^[a-z0-9]{6,32}$/u;

type InternalEnv = {
  REVISION_COORDINATOR_SECRET: string;
  REVISION_COORDINATOR: {
    getByName(name: string): {
      recordPreviewDelivery(input: PreviewDelivery): Promise<{ ok: true }>;
      recordAgentRunEvidence(input: AgentRunEvidence): Promise<{ ok: true }>;
    };
  };
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function sameSecret(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function boundedString(value: unknown, pattern: RegExp): string | null {
  if (typeof value !== "string" || !pattern.test(value)) return null;
  return value;
}

export function parsePreviewDelivery(
  value: unknown,
): PreviewDelivery | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const repository = boundedString(body.repository, REPO);
  const attemptId = boundedString(body.attemptId, ATTEMPT);
  const project = boundedString(body.project, PROJECT);
  const sha = boundedString(body.sha, SHA);
  const deploymentId = boundedString(body.deploymentId, DEPLOYMENT);
  const pr = body.pr;
  if (
    !repository ||
    !attemptId ||
    !project ||
    !sha ||
    !deploymentId ||
    !Number.isSafeInteger(pr) ||
    Number(pr) < 1
  )
    return null;
  if (typeof body.previewUrl !== "string") return null;
  let preview: URL;
  try {
    preview = new URL(body.previewUrl);
  } catch {
    return null;
  }
  if (
    preview.protocol !== "https:" ||
    preview.search ||
    preview.hash ||
    !preview.hostname.endsWith(".pages.dev") ||
    !preview.hostname.startsWith(`${deploymentId}.`)
  )
    return null;
  return {
    repository,
    attemptId,
    project,
    pr: Number(pr),
    sha,
    deploymentId,
    previewUrl: preview.href.replace(/\/$/u, ""),
  };
}

export function parseRunEvidence(value: unknown): AgentRunEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const repository = boundedString(body.repository, REPO);
  const attemptId = boundedString(body.attemptId, ATTEMPT);
  const profile = boundedString(body.profile, /^[a-z-]{1,60}$/u);
  const verdict = boundedString(body.verdict, /^(passed|failed)$/u);
  if (
    !repository ||
    !attemptId ||
    !profile ||
    !verdict ||
    !Array.isArray(body.candidates) ||
    !Array.isArray(body.gates) ||
    !Array.isArray(body.failures) ||
    !Array.isArray(body.routeChecks) ||
    !Number.isSafeInteger(body.recordedAt)
  )
    return null;
  const preview = body.preview === null ? null : parsePreviewDelivery(body.preview);
  if (body.preview !== null && !preview) return null;
  return {
    attemptId,
    repository,
    siteId: typeof body.siteId === "string" ? body.siteId.slice(0, 80) : null,
    issueNumber: Number.isSafeInteger(body.issueNumber)
      ? Number(body.issueNumber)
      : null,
    profile,
    renderer: typeof body.renderer === "string" ? body.renderer.slice(0, 60) : null,
    verdict,
    selectedCandidateId:
      typeof body.selectedCandidateId === "string"
        ? body.selectedCandidateId.slice(0, 80)
        : null,
    candidates: body.candidates.slice(0, 12) as AgentRunEvidence["candidates"],
    gates: body.gates.slice(0, 20) as AgentRunEvidence["gates"],
    failures: body.failures.slice(0, 8) as AgentRunEvidence["failures"],
    routeChecks: body.routeChecks.slice(0, 20) as AgentRunEvidence["routeChecks"],
    assets:
      body.assets === null
        ? null
        : (body.assets as AgentRunEvidence["assets"]),
    preview,
    recordedAt: Number(body.recordedAt),
  };
}

export async function agentFollowUpInternal(
  request: Request,
  env: InternalEnv,
  pathname: string,
): Promise<Response | null> {
  if (pathname !== PREVIEW_PATH && pathname !== EVIDENCE_PATH) return null;
  if (request.method !== "POST")
    return json({ error: "Use POST." }, 405);
  const authorization = request.headers.get("Authorization") || "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!sameSecret(supplied, env.REVISION_COORDINATOR_SECRET))
    return json({ error: "Unauthorized" }, 401);
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  if (pathname === EVIDENCE_PATH) {
    const evidence = parseRunEvidence(value);
    if (!evidence) return json({ error: "Invalid run evidence." }, 400);
    await env.REVISION_COORDINATOR.getByName(
      evidence.repository.toLowerCase(),
    ).recordAgentRunEvidence(evidence);
    return json({ ok: true });
  }
  const delivery = parsePreviewDelivery(value);
  if (!delivery) return json({ error: "Invalid preview delivery." }, 400);
  await env.REVISION_COORDINATOR.getByName(
    delivery.repository.toLowerCase(),
  ).recordPreviewDelivery(delivery);
  return json({ ok: true });
}

type AdminFollowUpEnv = {
  AGENT_FOLLOW_UPS_ENABLED?: string;
  OPENCODE_GO_API_KEY?: string;
  GENERATION_LEDGER: {
    getByName(name: string): {
      getAttempt(id: string): Promise<{
        repository: string | null;
        attemptId: string;
        previewUrl?: string | null;
      } | null>;
    };
  };
  REVISION_COORDINATOR: {
    getByName(name: string): {
      readAgentThread(repo: string): Promise<{
        messages: Array<{
          role: string;
          text: string;
          suggestions: AgentSuggestion[];
        }>;
        latestEvidence: AgentRunEvidence | null;
        latestPreview: PreviewDelivery | null;
        writable: boolean;
      }>;
      reserveAgentCommand(
        repo: string,
        requestId: string,
      ): Promise<{ duplicate: boolean }>;
      appendAgentExchange(input: {
        repo: string;
        attemptId: string;
        adminText: string;
        agentText: string;
        intent: "question" | "improvement" | "mixed" | "unsupported";
        suggestions: AgentSuggestionInput[];
      }): Promise<{ message: { id: string } }>;
      enqueueAgentFollowUp(input: {
        requestId: string;
        repo: string;
        baseSha: string;
        baseDeploymentId: string;
        brief: string;
        suggestionId: string;
      }): Promise<
        | { ok: true; requestId: string; queueStatus: string }
        | { ok: false; code: string; error: string }
      >;
    };
  };
};

async function applyAgentSuggestion(
  request: Request,
  env: AdminFollowUpEnv,
  attemptId: string,
  suggestionId: string,
): Promise<Response> {
  if (request.method !== "POST")
    return json({ error: { code: "method_not_allowed", message: "Use POST." } }, 405);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: { code: "invalid_input", message: "Invalid JSON." } }, 400);
  }
  const requestId = String(body.requestId || "");
  const baseDeploymentId = String(body.baseDeploymentId || "");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(
      requestId,
    ) ||
    !DEPLOYMENT.test(baseDeploymentId)
  )
    return json(
      { error: { code: "invalid_input", message: "Invalid apply request." } },
      400,
    );
  const attempt = await env.GENERATION_LEDGER.getByName(
    "launchloom-generations",
  ).getAttempt(attemptId);
  if (!attempt)
    return json({ error: { code: "not_found", message: "Attempt not found." } }, 404);
  if (!attempt.repository)
    return json(
      { error: { code: "unavailable", message: "This attempt has no client site." } },
      409,
    );
  const coordinator = env.REVISION_COORDINATOR.getByName(
    attempt.repository.toLowerCase(),
  );
  const thread = await coordinator.readAgentThread(attempt.repository);
  const suggestion = thread.messages
    .flatMap((message) => message.suggestions)
    .find((item) => item.id === suggestionId);
  if (!suggestion)
    return json(
      { error: { code: "not_found", message: "Suggestion not found." } },
      404,
    );
  if (suggestion.status !== "suggested")
    return json(
      {
        error: {
          code: "suggestion_already_started",
          message: "This suggestion already has a revision.",
        },
      },
      409,
    );
  if (!suggestion.baseSha || !suggestion.baseDeploymentId)
    return json(
      {
        error: {
          code: "preview_base_missing",
          message: "This suggestion has no pinned preview. Ask for a new suggestion.",
        },
      },
      409,
    );
  const result = await coordinator.enqueueAgentFollowUp({
    requestId,
    repo: attempt.repository,
    baseSha: suggestion.baseSha,
    baseDeploymentId: suggestion.baseDeploymentId,
    brief: suggestion.brief,
    suggestionId,
  });
  if (!result.ok) {
    const status = result.code === "preview_base_moved" ? 409 : 409;
    return json({ error: { code: result.code, message: result.error } }, status);
  }
  return json(
    {
      ok: true,
      requestId: result.requestId,
      queueStatus: result.queueStatus,
    },
    202,
  );
}

export async function agentFollowUpsAdmin(
  request: Request,
  env: AdminFollowUpEnv,
  principal: { role?: string } | null | undefined,
  pathname: string,
): Promise<Response | null> {
  const suffix = pathname.startsWith(ADMIN_PREFIX)
    ? pathname.slice(ADMIN_PREFIX.length)
    : pathname;
  const applyMatch = ADMIN_APPLY.exec(suffix);
  if (applyMatch) {
    if (!principal?.role || !["admin", "owner"].includes(principal.role))
      return json({ error: { code: "forbidden", message: "Admin access required." } }, 403);
    if (env.AGENT_FOLLOW_UPS_ENABLED !== "true")
      return json(
        { error: { code: "not_enabled", message: "Agent follow-ups are not enabled." } },
        503,
      );
    let attemptId: string;
    let suggestionId: string;
    try {
      attemptId = decodeURIComponent(applyMatch[1]);
      suggestionId = decodeURIComponent(applyMatch[2]);
    } catch {
      return json({ error: { code: "invalid_input", message: "Invalid request." } }, 400);
    }
    return applyAgentSuggestion(request, env, attemptId, suggestionId);
  }
  const match = ADMIN_THREAD.exec(suffix);
  if (!match) return null;
  if (!principal?.role || !["admin", "owner"].includes(principal.role))
    return json({ error: { code: "forbidden", message: "Admin access required." } }, 403);
  if (request.method !== "GET" && request.method !== "POST")
    return json(
      { error: { code: "method_not_allowed", message: "Use GET or POST." } },
      405,
    );
  if (env.AGENT_FOLLOW_UPS_ENABLED !== "true")
    return json(
      { error: { code: "not_enabled", message: "Agent follow-ups are not enabled." } },
      503,
    );
  let attemptId: string;
  try {
    attemptId = decodeURIComponent(match[1]);
  } catch {
    return json({ error: { code: "invalid_input", message: "Invalid attempt." } }, 400);
  }
  const attempt = await env.GENERATION_LEDGER.getByName(
    "launchloom-generations",
  ).getAttempt(attemptId);
  if (!attempt)
    return json({ error: { code: "not_found", message: "Attempt not found." } }, 404);
  if (!attempt.repository)
    return json(
      { error: { code: "unavailable", message: "This attempt has no client site." } },
      409,
    );
  const coordinator = env.REVISION_COORDINATOR.getByName(
    attempt.repository.toLowerCase(),
  );
  if (request.method === "GET") {
    const thread = await coordinator.readAgentThread(attempt.repository);
    if (
      thread.latestPreview &&
      thread.latestPreview.previewUrl !== (attempt.previewUrl || "")
    )
      thread.writable = false;
    return json({ thread });
  }
  if (!env.OPENCODE_GO_API_KEY)
    return json(
      { error: { code: "unavailable", message: "The follow-up agent is unavailable." } },
      503,
    );
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: { code: "invalid_input", message: "Invalid JSON." } }, 400);
  }
  const requestId = String(body.requestId || "");
  const text = String(body.text || "").trim().slice(0, 2_000);
  const mode = String(body.mode || "auto");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(requestId) ||
    !text ||
    !["auto", "question", "improvement"].includes(mode)
  )
    return json(
      { error: { code: "invalid_input", message: "Invalid follow-up request." } },
      400,
    );
  const reservation = await coordinator.reserveAgentCommand(
    attempt.repository,
    requestId,
  );
  if (reservation.duplicate) {
    const thread = await coordinator.readAgentThread(attempt.repository);
    return json({ thread });
  }
  const current = await coordinator.readAgentThread(attempt.repository);
  if (
    mode === "improvement" &&
    String(body.baseDeploymentId || "") !==
      String(current.latestPreview?.deploymentId || "")
  )
    return json(
      {
        error: {
          code: "preview_base_moved",
          message: "Open the latest preview before requesting this change.",
        },
      },
      409,
    );
  const history = current.messages
    .slice(-12)
    .map((message) => `${message.role}: ${message.text}`)
    .join("\n");
  let intent: "question" | "improvement" | "mixed" | "unsupported" =
    mode === "improvement" ? "improvement" : "question";
  if (mode === "auto") {
    try {
      const classified = await classifyFollowUp({
        apiKey: env.OPENCODE_GO_API_KEY,
        text,
        evidence: current.latestEvidence,
        signal: AbortSignal.timeout(20_000),
      });
      intent = classified.intent;
    } catch {
      await coordinator.appendAgentExchange({
        repo: attempt.repository,
        attemptId,
        adminText: text,
        agentText: "Please choose Ask about this run or Request an improvement.",
        intent: "unsupported",
        suggestions: [],
      });
      return json({ ok: true, fallback: "choose_mode" });
    }
  }
  let answer: string;
  let rawSuggestions: Awaited<ReturnType<typeof answerFollowUp>>["suggestions"];
  try {
    const result = await answerFollowUp({
      apiKey: env.OPENCODE_GO_API_KEY,
      text,
      intent,
      evidence: current.latestEvidence,
      history,
      signal: AbortSignal.timeout(45_000),
    });
    answer = result.answer;
    rawSuggestions = result.suggestions;
  } catch {
    answer = "The agent could not answer this request. Retry in a moment.";
    rawSuggestions = [];
  }
  const preview = current.latestPreview;
  const suggestions = rawSuggestions.map((suggestion) => ({
    ...suggestion,
    baseDeploymentId: preview?.deploymentId || null,
    baseSha: preview?.sha || null,
    brief: buildRevisionBrief({
      suggestion,
      adminText: text,
      preview,
    }),
  }));
  await coordinator.appendAgentExchange({
    repo: attempt.repository,
    attemptId,
    adminText: text,
    agentText: answer,
    intent,
    suggestions,
  });
  const thread = await coordinator.readAgentThread(attempt.repository);
  if (
    thread.latestPreview &&
    thread.latestPreview.previewUrl !== (attempt.previewUrl || "")
  )
    thread.writable = false;
  return json({ ok: true, thread });
}
