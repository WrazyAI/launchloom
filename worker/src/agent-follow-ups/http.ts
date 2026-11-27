import type { PreviewDelivery } from "../../../src/lib/agent-follow-ups";

const PREVIEW_PATH = "/api/internal/agent-follow-ups/preview-deliveries";
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

export async function agentFollowUpInternal(
  request: Request,
  env: InternalEnv,
  pathname: string,
): Promise<Response | null> {
  if (pathname !== PREVIEW_PATH) return null;
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
  const delivery = parsePreviewDelivery(value);
  if (!delivery) return json({ error: "Invalid preview delivery." }, 400);
  await env.REVISION_COORDINATOR.getByName(
    delivery.repository.toLowerCase(),
  ).recordPreviewDelivery(delivery);
  return json({ ok: true });
}
