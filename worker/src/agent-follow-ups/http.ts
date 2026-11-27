import type {
  AgentRunEvidence,
  PreviewDelivery,
} from "../../../src/lib/agent-follow-ups";

const PREVIEW_PATH = "/api/internal/agent-follow-ups/preview-deliveries";
const EVIDENCE_PATH = "/api/internal/agent-follow-ups/run-evidence";
const ADMIN_PREFIX = "/api/admin/onboarding-invites/workspace";
const ADMIN_THREAD = /^\/attempts\/([^/]+)\/agent-follow-ups$/u;
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
  GENERATION_LEDGER: {
    getByName(name: string): {
      getAttempt(id: string): Promise<{
        repository: string | null;
        attemptId: string;
      } | null>;
    };
  };
  REVISION_COORDINATOR: {
    getByName(name: string): {
      readAgentThread(repo: string): Promise<unknown>;
    };
  };
};

export async function agentFollowUpsAdmin(
  request: Request,
  env: AdminFollowUpEnv,
  principal: { role?: string } | null | undefined,
  pathname: string,
): Promise<Response | null> {
  const suffix = pathname.startsWith(ADMIN_PREFIX)
    ? pathname.slice(ADMIN_PREFIX.length)
    : pathname;
  const match = ADMIN_THREAD.exec(suffix);
  if (!match) return null;
  if (!principal?.role || !["admin", "owner"].includes(principal.role))
    return json({ error: { code: "forbidden", message: "Admin access required." } }, 403);
  if (request.method !== "GET")
    return json({ error: { code: "method_not_allowed", message: "Use GET." } }, 405);
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
  const thread = await env.REVISION_COORDINATOR.getByName(
    attempt.repository.toLowerCase(),
  ).readAgentThread(attempt.repository);
  return json({ thread });
}

