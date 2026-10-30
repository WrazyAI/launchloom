/**
 * Synthetic admin workspace fixtures. Import only from tests; never from
 * `src/admin` runtime modules or the built bundle.
 */
import type {
  ActorSnapshot,
  AttemptDetail,
  AttemptEventRecord,
  AttemptSummary,
  ClientRecord,
  Health,
  Page,
} from "../../src/lib/admin-contracts";

const BASE_TIME = Date.UTC(2026, 9, 19, 14, 0, 0);

export const adminCreator: ActorSnapshot = {
  kind: "admin",
  id: "admin:creator",
  name: "Avery Chen",
  email: "avery@example.test",
  source: "cloudflare-access",
};

export const adminInitiator: ActorSnapshot = {
  kind: "admin",
  id: "admin:initiator",
  name: "Morgan Ellis",
  email: "morgan@example.test",
  source: "cloudflare-access",
};

export const clientInitiator: ActorSnapshot = {
  kind: "client",
  id: "client:submitter",
  name: "Zoë Laurent",
  email: "zoe@example.test",
  source: "intake",
};

export const systemInitiator: ActorSnapshot = {
  kind: "system",
  id: null,
  name: null,
  email: null,
  source: "system",
};

export const unknownActor: ActorSnapshot = {
  kind: "unknown",
  id: null,
  name: null,
  email: null,
  source: "legacy",
};

export const baseHealth: Health = {
  lastSyncAt: BASE_TIME - 60_000,
  coverageStart: Date.UTC(2026, 8, 1),
  partial: false,
  lastError: null,
  pendingProjectionCount: 0,
};

export function fixtureHealth(overrides: Partial<Health> = {}): Health {
  return { ...baseHealth, ...overrides };
}

const profiles = ["full", "full-preview", "creative-only", "seo-only"] as const;
const executions = [
  "succeeded",
  "succeeded",
  "succeeded",
  "failed",
  "queued",
  "running",
  "cancelled",
  "skipped",
  "unknown",
] as const;

function statusDelivery(execution: string): AttemptSummary["deliveryStatus"] {
  if (execution === "succeeded") return "published";
  if (execution === "failed") return "diagnostic";
  if (execution === "running") return "preview_ready";
  return "none";
}

function baseAttempt(n: number): AttemptSummary {
  const executionStatus = executions[n % executions.length];
  const createdAt = BASE_TIME - n * 60_000;
  const failed = executionStatus === "failed";
  return {
    attemptId: `attempt-${String(n).padStart(4, "0")}`,
    requestId: `request-${String(n).padStart(4, "0")}`,
    clientId: `submission:client-${n % 160}`,
    issueNumber: 1000 + n,
    profile: profiles[n % profiles.length],
    initiator:
      n % 5 === 0
        ? clientInitiator
        : n % 7 === 0
          ? systemInitiator
          : adminInitiator,
    invitationCreator: adminCreator,
    repository: "WrazyAI/launchloom",
    runId: String(90000 + n),
    runAttempt: 1,
    executionStatus,
    deliveryStatus: statusDelivery(executionStatus),
    ...(statusDelivery(executionStatus) === "published" ||
    statusDelivery(executionStatus) === "preview_ready"
      ? { siteUrl: `https://business-${n}.pages.dev/` }
      : {}),
    stale: executionStatus === "running" && n % 11 === 0,
    createdAt,
    startedAt: createdAt + 1_000,
    completedAt:
      executionStatus === "succeeded" ||
      executionStatus === "failed" ||
      executionStatus === "cancelled" ||
      executionStatus === "skipped"
        ? createdAt + 120_000
        : null,
    updatedAt: createdAt + (failed ? 180_000 : 120_000),
    failure: failed
      ? {
          category: "generation",
          stage: "creative",
          summary: "The preview build did not complete.",
          evidenceUrl: `https://github.com/WrazyAI/launchloom/actions/runs/${90000 + n}`,
          nextStep: "Check the linked run before deciding whether to retry.",
        }
      : {
          category: null,
          stage: null,
          summary: null,
          evidenceUrl: null,
          nextStep: null,
        },
    costs: {
      actualUsd: failed ? null : 0.0025 * (n % 40),
      estimatedUsd: n % 3 === 0 ? null : 0.003,
      unreportedCount: n % 17 === 0 ? 1 : 0,
    },
  };
}

function unknownAttempt(): AttemptSummary {
  return {
    ...baseAttempt(5),
    attemptId: "attempt-unknown",
    requestId: "request-unknown",
    clientId: "submission:client-unknown",
    issueNumber: 1900,
    profile: "full-preview",
    initiator: unknownActor,
    invitationCreator: unknownActor,
    repository: null,
    runId: null,
    runAttempt: null,
    executionStatus: "unknown",
    deliveryStatus: "none",
    stale: true,
    createdAt: BASE_TIME - 400 * 60_000,
    startedAt: BASE_TIME - 399 * 60_000,
    completedAt: null,
    updatedAt: BASE_TIME - 399 * 60_000,
    failure: {
      category: null,
      stage: null,
      summary: null,
      evidenceUrl: null,
      nextStep: null,
    },
    costs: { actualUsd: null, estimatedUsd: null, unreportedCount: 1 },
  };
}

function unsafeAttempt(): AttemptSummary {
  return {
    ...baseAttempt(6),
    attemptId: "attempt-unsafe",
    requestId: "request-unsafe",
    clientId: "submission:client-unsafe",
    issueNumber: 1901,
    executionStatus: "failed",
    deliveryStatus: "diagnostic",
    failure: {
      category: "generation",
      stage: "build",
      summary:
        '<img src="x" onerror="window.__adminFxss=1"> build failed & review needed',
      evidenceUrl: "javascript:window.__adminFxss=2",
      nextStep: "Use the recorded run evidence before retrying.",
    },
    costs: { actualUsd: null, estimatedUsd: null, unreportedCount: 1 },
  };
}

function diagnosticAttempt(): AttemptSummary {
  return {
    ...baseAttempt(8),
    attemptId: "attempt-diagnostic",
    requestId: "request-diagnostic",
    clientId: "submission:client-a",
    issueNumber: 1902,
    executionStatus: "failed",
    deliveryStatus: "diagnostic",
    completedAt: BASE_TIME - 47 * 60_000,
    failure: {
      category: "prerequisite",
      stage: "setup",
      summary: "The workflow could not verify its required inputs.",
      evidenceUrl: "https://github.com/WrazyAI/launchloom/actions/runs/90123",
      nextStep: "Review the run log and confirm the missing input.",
    },
    costs: { actualUsd: 0.42, estimatedUsd: 0.5, unreportedCount: 0 },
  };
}

function publishedEarlierAttempt(): AttemptSummary {
  return {
    ...baseAttempt(2),
    attemptId: "attempt-published-earlier",
    requestId: "request-published",
    clientId: "submission:client-a",
    issueNumber: 1903,
    executionStatus: "succeeded",
    deliveryStatus: "published",
    createdAt: BASE_TIME - 120 * 60_000,
    startedAt: BASE_TIME - 119 * 60_000,
    completedAt: BASE_TIME - 100 * 60_000,
    updatedAt: BASE_TIME - 100 * 60_000,
    failure: {
      category: null,
      stage: null,
      summary: null,
      evidenceUrl: null,
      nextStep: null,
    },
    costs: { actualUsd: 0.62, estimatedUsd: null, unreportedCount: 0 },
  };
}

function fullFailedNoPreviewAttempt(): AttemptSummary {
  return {
    ...baseAttempt(12),
    attemptId: "attempt-related-preview",
    requestId: "request-related-preview",
    clientId: null,
    issueNumber: 1910,
    profile: "full",
    executionStatus: "failed",
    deliveryStatus: "none",
    initiator: adminInitiator,
    runId: "40745664388",
    runAttempt: 1,
    createdAt: BASE_TIME - 600 * 60_000,
    startedAt: BASE_TIME - 599 * 60_000,
    completedAt: BASE_TIME - 590 * 60_000,
    updatedAt: BASE_TIME - 590 * 60_000,
    failure: {
      category: "creative_authoring",
      stage: "authoring",
      summary: "The copy stage stopped before deploy.",
      evidenceUrl:
        "https://github.com/WrazyAI/launchloom/actions/runs/40745664388",
      nextStep: "Open the related successful attempt for this issue.",
    },
    costs: { actualUsd: 0.18, estimatedUsd: null, unreportedCount: 0 },
  };
}

export function syntheticAttempts(): AttemptSummary[] {
  const generated = Array.from({ length: 280 }, (_value, index) =>
    baseAttempt(index),
  );
  const specials = [
    unknownAttempt(),
    unsafeAttempt(),
    diagnosticAttempt(),
    publishedEarlierAttempt(),
    fullFailedNoPreviewAttempt(),
  ];
  return [...generated, ...specials].sort(
    (left, right) => right.createdAt - left.createdAt,
  );
}

function baseClient(n: number): ClientRecord {
  return {
    clientId: `submission:client-${n}`,
    inviteId: `invite-${String(n).padStart(4, "0")}`,
    submissionId: `submission-${String(n).padStart(4, "0")}`,
    issueNumber: 1000 + n,
    businessName: `Business ${n}`,
    contactName: n % 4 === 0 ? "Zoë Laurent" : "Sam Rivera",
    email: `client${n}@example.test`,
    phone: null,
    creator: adminCreator,
    submittedAt: BASE_TIME - n * 3_600_000,
    createdAt: BASE_TIME - n * 3_600_000,
    updatedAt: BASE_TIME - n * 3_600_000 + 60_000,
    previewUrl: n % 2 === 0 ? `https://preview-${n}.pages.dev/` : null,
    productionUrl: n % 3 === 0 ? `https://client-${n}.pages.dev/` : null,
  };
}

function sharedEmailClients(): ClientRecord[] {
  return [
    {
      ...baseClient(0),
      clientId: "submission:client-a",
      inviteId: "invite-acme-a",
      submissionId: "submission-acme-a",
      issueNumber: 9001,
      businessName: "Acme & Sons",
      contactName: "Zoë Laurent",
      email: "same@example.test",
      submittedAt: BASE_TIME - 90_000,
      createdAt: BASE_TIME - 90_000,
      updatedAt: BASE_TIME - 80_000,
      previewUrl: "https://acme-preview.pages.dev/",
      productionUrl: "https://acme.pages.dev/",
    },
    {
      ...baseClient(1),
      clientId: "submission:client-b",
      inviteId: "invite-acme-b",
      submissionId: "submission-acme-b",
      issueNumber: 9002,
      businessName: "Acme & Sons Studio",
      contactName: "Émile Martin",
      email: "same@example.test",
      submittedAt: BASE_TIME - 80_000,
      createdAt: BASE_TIME - 80_000,
      updatedAt: BASE_TIME - 70_000,
      previewUrl: null,
      productionUrl: null,
    },
    {
      ...baseClient(2),
      clientId: "submission:client-unknown",
      inviteId: "invite-unknown",
      submissionId: "submission-unknown",
      issueNumber: 9003,
      businessName: "Zoë & Sons, Gardeners",
      contactName: "Zoë Laurent",
      email: null,
      submittedAt: 9e15,
      createdAt: BASE_TIME - 70_000,
      updatedAt: BASE_TIME - 60_000,
      previewUrl: "https://garden.pages.dev/",
      productionUrl: null,
    },
    {
      ...baseClient(3),
      clientId: "submission:client-unsafe",
      inviteId: "invite-unsafe",
      submissionId: "submission-unsafe",
      issueNumber: 9004,
      businessName: "Unsafe Link Co.",
      contactName: "Casey",
      email: "unsafe@example.test",
      submittedAt: BASE_TIME - 60_000,
      createdAt: BASE_TIME - 60_000,
      updatedAt: BASE_TIME - 50_000,
      previewUrl: "https://preview.pages.dev/?token=secret",
      productionUrl: "javascript:window.__adminFxss=3",
    },
  ];
}

export function syntheticClients(): ClientRecord[] {
  const generated = Array.from({ length: 160 }, (_value, index) =>
    baseClient(index),
  );
  return [...sharedEmailClients(), ...generated].sort(
    (left, right) => right.createdAt - left.createdAt,
  );
}

export function syntheticEvents(attempt: AttemptSummary): AttemptEventRecord[] {
  const observedAt = attempt.updatedAt;
  const events: AttemptEventRecord[] = [
    {
      attemptId: attempt.attemptId,
      eventKey: "evt-execution",
      stage: "execution",
      status: attempt.executionStatus,
      provider: null,
      model: null,
      costUsd: null,
      costKind: "unreported",
      detail: null,
      createdAt: observedAt - 3_000,
      observedAt: observedAt - 3_000,
      updatedAt: observedAt - 3_000,
      source: "callback",
    },
    {
      attemptId: attempt.attemptId,
      eventKey: "evt-delivery",
      stage: "delivery",
      status: attempt.deliveryStatus,
      provider: null,
      model: null,
      costUsd: null,
      costKind: "unreported",
      detail:
        attempt.deliveryStatus === "diagnostic"
          ? "Diagnostic preview recorded for review."
          : null,
      createdAt: observedAt - 2_000,
      observedAt: observedAt - 2_000,
      updatedAt: observedAt - 2_000,
      source: "callback",
    },
    {
      attemptId: attempt.attemptId,
      eventKey: "evt-model",
      stage: "creative",
      status: "succeeded",
      provider: "openrouter",
      model: "synthetic/model",
      costUsd: attempt.costs.actualUsd,
      costKind: "actual",
      detail:
        attempt.attemptId === "attempt-unsafe"
          ? "<script>window.__adminFxss=4</script>"
          : "Stage evidence recorded.",
      createdAt: observedAt - 1_000,
      observedAt: observedAt - 1_000,
      updatedAt: observedAt - 1_000,
      source: "callback",
    },
  ];
  return events.sort((left, right) => right.createdAt - left.createdAt);
}

export function attemptDetail(attempt: AttemptSummary): AttemptDetail {
  const events = syntheticEvents(attempt);
  return {
    ...attempt,
    events,
    eventsNextCursor: null,
    eventCount: events.length,
    relatedPreview: null,
  };
}

export function pageOf<T>(items: T[], offset = 0, limit = 50): Page<T> {
  const bounded = Math.min(Math.max(limit, 1), 100);
  const start = Math.max(offset, 0);
  return {
    items: items.slice(start, start + bounded),
    total: items.length,
    nextCursor:
      start + bounded < items.length ? `offset:${start + bounded}` : null,
  };
}
