import type {
  ActorSnapshot,
  AttemptDetail,
  AttemptEventInput,
  AttemptEventRecord,
  AttemptEventSource,
  AttemptFilters,
  AttemptInput,
  AttemptSummary,
  DeliveryStatus,
  ExecutionStatus,
  Health,
  InitialDispatchRegistration,
  Page,
  ClientInput,
  ClientRecord,
  ClientFilters,
  DispatchRequest,
} from "../../src/lib/admin-contracts";
import { pageRecords } from "./admin/pagination";
import {
  safeDiagnosticPreviewUrl,
  type AttemptObservation,
} from "../../scripts/generation-tracking-contract.mjs";

const executions = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
  "unknown",
];
const deliveries = [
  "none",
  "diagnostic",
  "attention",
  "preview_ready",
  "published",
];
const profiles = ["full", "full-preview", "creative-only", "seo-only"];
const sources = ["legacy-import", "callback", "github-reconcile"];
type Clock = { source: AttemptEventSource; version: number };
type State = {
  execution: Clock;
  delivery: Clock;
  executionVersions: Partial<Record<AttemptEventSource, number>>;
  snapshotVersion: number;
};
type AttemptRow = { attempt_id: string; data: string; state: string };
type EventRow = { data: string };
const terminal = (status: string) =>
  ["succeeded", "failed", "cancelled", "skipped"].includes(status);
const invalid = (field: string): never => {
  throw new Error(`invalid ${field}`);
};
const conflict = (field: string): never => {
  throw new Error(`conflict: immutable ${field}`);
};
const timestamp = (value: number) => Number.isSafeInteger(value) && value >= 0;
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
function pageLimit(limit?: number) {
  if (limit === undefined) return 50;
  if (!Number.isFinite(limit) || limit < 1) return invalid("limit");
  return Math.min(100, Math.floor(limit));
}
function actorKey(actor: ActorSnapshot) {
  return JSON.stringify([
    actor.kind,
    actor.id,
    actor.name,
    actor.email,
    actor.source,
  ]);
}
function mergeActor(
  old: ActorSnapshot,
  incoming: ActorSnapshot,
  field: string,
) {
  if (old.kind === "unknown") return incoming;
  if (incoming.kind === "unknown") return old;
  if (actorKey(old) !== actorKey(incoming)) return conflict(field);
  return old;
}
function newer(incoming: Clock, old: Clock) {
  return (
    incoming.version > old.version ||
    (incoming.version === old.version &&
      sources.indexOf(incoming.source) > sources.indexOf(old.source))
  );
}
function executionAllowed(
  status: ExecutionStatus,
  clock: Clock,
  oldStatus: ExecutionStatus,
  oldClock: Clock,
) {
  const authoritative = clock.source === "github-reconcile" && terminal(status);
  const locked = oldClock.source === "github-reconcile" && terminal(oldStatus);
  if (locked) return authoritative && newer(clock, oldClock);
  if (authoritative) return true;
  if (terminal(oldStatus) && !terminal(status)) return false;
  if (oldStatus === "running" && ["queued", "unknown"].includes(status))
    return false;
  return newer(clock, oldClock);
}
function observeExecution(
  state: State,
  status: ExecutionStatus,
  clock: Clock,
  oldStatus: ExecutionStatus,
) {
  const previous = state.executionVersions[clock.source];
  if (previous !== undefined && clock.version <= previous) return false;
  state.executionVersions[clock.source] = clock.version;
  return executionAllowed(status, clock, oldStatus, state.execution);
}
function validateInput(input: AttemptInput) {
  if (!nonempty(input.attemptId)) invalid("attemptId");
  for (const key of ["requestId", "clientId", "repository", "runId"] as const)
    if (input[key] !== null && !nonempty(input[key])) invalid(key);
  for (const key of ["issueNumber", "runAttempt"] as const)
    if (
      input[key] !== null &&
      (!Number.isSafeInteger(input[key]) || input[key]! < 1)
    )
      invalid(key);
  if (!profiles.includes(input.profile)) invalid("profile");
  if (!executions.includes(input.executionStatus)) invalid("executionStatus");
  if (!deliveries.includes(input.deliveryStatus)) invalid("deliveryStatus");
  for (const key of ["createdAt", "updatedAt"] as const)
    if (!timestamp(input[key])) invalid(key);
  for (const key of ["startedAt", "completedAt"] as const)
    if (input[key] !== null && !timestamp(input[key]!)) invalid(key);
  if (typeof input.stale !== "boolean") invalid("stale");
  for (const actor of [input.initiator, input.invitationCreator]) {
    if (
      !actor ||
      !["admin", "client", "github", "system", "unknown"].includes(
        actor.kind,
      ) ||
      ![
        "neon",
        "cloudflare-access",
        "intake",
        "github",
        "system",
        "legacy",
      ].includes(actor.source)
    )
      invalid("actor");
    for (const key of ["id", "name", "email"] as const)
      if (actor[key] !== null && typeof actor[key] !== "string")
        invalid("actor");
  }
  if (!input.failure) invalid("failure");
  for (const key of [
    "category",
    "stage",
    "summary",
    "evidenceUrl",
    "nextStep",
  ] as const)
    if (input.failure[key] !== null && typeof input.failure[key] !== "string")
      invalid("failure");
}

type Cursor = { v: 1; scope: string; time: number; key: string };
function encodeCursor(scope: string, time: number, key: string) {
  return btoa(encodeURIComponent(JSON.stringify({ v: 1, scope, time, key })));
}
function decodeCursor(
  cursor: string | undefined,
  scope: string,
): Cursor | null {
  if (cursor === undefined) return null;
  try {
    const value = JSON.parse(decodeURIComponent(atob(cursor))) as Cursor;
    if (
      value.v !== 1 ||
      value.scope !== scope ||
      !timestamp(value.time) ||
      !nonempty(value.key)
    )
      throw new Error();
    return value;
  } catch {
    throw new Error("invalid cursor or cursor filters");
  }
}

/** Additive SQLite model owned by GenerationLedger; no network or legacy-table writes. */
export class GenerationAttempts {
  constructor(private storage: DurableObjectStorage) {}

  initialize() {
    this.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS generation_attempts (
        attempt_id TEXT PRIMARY KEY, request_id TEXT, client_id TEXT, issue_number INTEGER,
        repository TEXT COLLATE NOCASE, run_id TEXT, run_attempt INTEGER,
        profile TEXT NOT NULL, execution_status TEXT NOT NULL,
        initiator_id TEXT, creator_id TEXT, created_at INTEGER NOT NULL,
        data TEXT NOT NULL, state TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS generation_attempts_execution
        ON generation_attempts(repository, run_id, run_attempt)
        WHERE repository IS NOT NULL AND run_id IS NOT NULL AND run_attempt IS NOT NULL;
      CREATE INDEX IF NOT EXISTS generation_attempts_date ON generation_attempts(created_at DESC, attempt_id DESC);
      CREATE INDEX IF NOT EXISTS generation_attempts_client ON generation_attempts(client_id, created_at DESC, attempt_id DESC);
      CREATE INDEX IF NOT EXISTS generation_attempts_status ON generation_attempts(execution_status, created_at DESC, attempt_id DESC);
      CREATE INDEX IF NOT EXISTS generation_attempts_initiator ON generation_attempts(initiator_id, created_at DESC, attempt_id DESC);
      CREATE INDEX IF NOT EXISTS generation_attempts_creator ON generation_attempts(creator_id, created_at DESC, attempt_id DESC);
      CREATE INDEX IF NOT EXISTS generation_attempts_request ON generation_attempts(request_id);
      CREATE TABLE IF NOT EXISTS generation_dispatches (
        request_id TEXT PRIMARY KEY, initial_attempt_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS attempt_events (
        attempt_id TEXT NOT NULL, event_key TEXT NOT NULL, created_at INTEGER NOT NULL,
        cost_usd REAL, cost_kind TEXT NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY (attempt_id, event_key)
      );
      CREATE INDEX IF NOT EXISTS attempt_events_date ON attempt_events(attempt_id, created_at DESC, event_key DESC);
      CREATE TABLE IF NOT EXISTS admin_sync_state (
        id INTEGER PRIMARY KEY CHECK (id = 1), last_sync_at INTEGER, coverage_start INTEGER,
        partial INTEGER NOT NULL DEFAULT 1, last_error TEXT, pending_projection_count INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO admin_sync_state(id) VALUES (1);
      CREATE TABLE IF NOT EXISTS admin_clients (
        client_id TEXT PRIMARY KEY, invite_id TEXT UNIQUE, submission_id TEXT UNIQUE,
        issue_number INTEGER NOT NULL UNIQUE, data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS admin_dispatch_requests (
        request_id TEXT PRIMARY KEY, data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS generation_reconciliation_state (
        id INTEGER PRIMARY KEY CHECK(id=1), checkpoint TEXT
      );
    `);
  }

  private row(id: string) {
    return this.storage.sql
      .exec<AttemptRow>(
        "SELECT attempt_id, data, state FROM generation_attempts WHERE attempt_id = ?",
        id,
      )
      .toArray()[0];
  }

  /** Trusted ingestion transaction: bindings, events and cursor either all persist
   * or none do. Only the persisted dispatch operation can supply client actors. */
  ingestObservations(
    batch: Array<{
      observation: AttemptObservation;
      events: AttemptEventInput[];
    }>,
    sync?: {
      checkpoint: string | null;
      health: Omit<Health, "pendingProjectionCount">;
    },
  ) {
    return this.storage.transactionSync(() => {
      const ids: string[] = [];
      const unknown: ActorSnapshot = {
        kind: "unknown",
        id: null,
        name: null,
        email: null,
        source: "legacy",
      };
      for (const { observation: o, events } of batch) {
        const dispatchRow = o.requestId
          ? this.storage.sql
              .exec<{ data: string }>(
                "SELECT data FROM admin_dispatch_requests WHERE request_id=?",
                o.requestId,
              )
              .toArray()[0]
          : null;
        const dispatch: DispatchRequest | null = dispatchRow
          ? JSON.parse(dispatchRow.data)
          : null;
        const initial = o.requestId
          ? this.storage.sql
              .exec<{ initial_attempt_id: string }>(
                "SELECT initial_attempt_id FROM generation_dispatches WHERE request_id=?",
                o.requestId,
              )
              .toArray()[0]
          : null;
        const executed = this.storage.sql
          .exec<AttemptRow>(
            "SELECT attempt_id,data,state FROM generation_attempts WHERE repository=? COLLATE NOCASE AND run_id=? AND run_attempt=?",
            o.repository,
            o.runId,
            o.runAttempt,
          )
          .toArray()[0];
        const existing: AttemptInput | null = executed
          ? JSON.parse(executed.data)
          : null;
        if (
          dispatch &&
          (dispatch.issueNumber !== o.issueNumber || o.profile !== "full")
        )
          conflict("dispatch routing");
        // A request reference alone, even attempt 1, is never initial binding.
        // Only a producer carrying the explicitly registered initial ID can bind it.
        const bindsInitial = !!(
          dispatch &&
          initial &&
          o.attemptId === initial.initial_attempt_id &&
          o.runAttempt === 1
        );
        if (o.attemptId && !bindsInitial && o.attemptId !== existing?.attemptId)
          conflict("unverified attempt id");
        const id = bindsInitial
          ? initial!.initial_attempt_id
          : (existing?.attemptId ?? `github:${o.runId}:${o.runAttempt}`);
        const prior = this.row(id);
        const previous: AttemptInput | null = prior
          ? JSON.parse(prior.data)
          : null;
        const github: ActorSnapshot = o.triggeringActor
          ? {
              kind: "github",
              id: o.triggeringActor,
              name: null,
              email: null,
              source: "github",
            }
          : unknown;
        if (
          previous?.initiator.kind === "github" &&
          github.kind === "github" &&
          previous.initiator.id !== github.id
        )
          conflict("triggering actor");
        const result = this.upsertAttempt({
          attemptId: id,
          requestId: o.requestId,
          clientId: dispatch?.clientId ?? null,
          issueNumber: o.issueNumber,
          profile: o.profile,
          initiator: bindsInitial
            ? dispatch!.initiator
            : previous && previous.initiator.kind !== "unknown"
              ? previous.initiator
              : github,
          invitationCreator:
            dispatch?.invitationCreator ??
            previous?.invitationCreator ??
            unknown,
          repository: o.repository,
          runId: o.runId,
          runAttempt: o.runAttempt,
          executionStatus: o.executionStatus,
          deliveryStatus: o.deliveryStatus,
          previewUrl: o.previewUrl,
          stale: false,
          createdAt: previous?.createdAt ?? o.createdAt ?? o.observedAt,
          startedAt: o.startedAt,
          completedAt: o.completedAt,
          updatedAt: o.observedAt,
          failure: o.failure,
        });
        const outcome: AttemptEventInput = {
          eventKey: "execution",
          stage: "execution",
          status: o.executionStatus,
          source: o.source,
          observedAt: o.observedAt,
          createdAt: o.observedAt,
          detail: null,
        };
        const delivery: AttemptEventInput[] =
          o.deliveryStatus === "none"
            ? []
            : [
                {
                  eventKey: "delivery",
                  stage: "delivery",
                  status: o.deliveryStatus,
                  source: o.source,
                  observedAt: o.observedAt,
                  createdAt: o.observedAt,
                },
              ];
        this.recordAttemptEvents(result.attemptId, [
          outcome,
          ...delivery,
          ...events,
        ]);
        ids.push(result.attemptId);
      }
      if (sync) {
        const h = sync.health;
        this.storage.sql.exec(
          "INSERT INTO generation_reconciliation_state(id,checkpoint) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET checkpoint=excluded.checkpoint",
          sync.checkpoint,
        );
        this.storage.sql.exec(
          "UPDATE admin_sync_state SET last_sync_at=?, coverage_start=CASE WHEN coverage_start IS NULL THEN ? WHEN ? IS NULL THEN coverage_start ELSE MIN(coverage_start,?) END, partial=?, last_error=? WHERE id=1",
          h.lastSyncAt,
          h.coverageStart,
          h.coverageStart,
          h.coverageStart,
          h.partial ? 1 : 0,
          h.lastError,
        );
      }
      return { attemptIds: ids };
    });
  }
  upsertClient(input: ClientInput): ClientRecord {
    if (
      !nonempty(input.clientId) ||
      !Number.isSafeInteger(input.issueNumber) ||
      input.issueNumber < 1 ||
      (input.submittedAt !== null && !timestamp(input.submittedAt))
    )
      invalid("client");
    if (
      input.submissionId
        ? input.clientId !== `submission:${input.submissionId}`
        : input.clientId !== `legacy-issue:${input.issueNumber}`
    )
      invalid("client identity");
    return this.storage.transactionSync(() => {
      const old = this.getClient(input.clientId);
      const collision = this.storage.sql
        .exec<{ client_id: string }>(
          "SELECT client_id FROM admin_clients WHERE (invite_id=? OR submission_id=? OR issue_number=?) AND client_id<>?",
          input.inviteId,
          input.submissionId,
          input.issueNumber,
          input.clientId,
        )
        .toArray()[0];
      if (collision) conflict("client references");
      if (old) {
        for (const k of [
          "inviteId",
          "submissionId",
          "issueNumber",
          "submittedAt",
          "businessName",
          "contactName",
          "email",
          "phone",
        ] as const)
          if (input[k] !== null && old[k] !== null && old[k] !== input[k])
            conflict(`client ${k}`);
      }
      const record: ClientRecord = {
        ...input,
        creator: old
          ? mergeActor(old.creator, input.creator, "client creator")
          : input.creator,
        createdAt: old?.createdAt ?? input.submittedAt ?? Date.now(),
        updatedAt: old?.updatedAt ?? input.submittedAt ?? Date.now(),
        previewUrl: old?.previewUrl ?? null,
        productionUrl: old?.productionUrl ?? null,
      };
      if (old)
        for (const k of [
          "inviteId",
          "submissionId",
          "businessName",
          "contactName",
          "email",
          "phone",
        ] as const)
          record[k] ??= old[k];
      record.submittedAt ??= old?.submittedAt ?? null;
      this.storage.sql.exec(
        `INSERT INTO admin_clients(client_id,invite_id,submission_id,issue_number,data) VALUES(?,?,?,?,?)
        ON CONFLICT(client_id) DO UPDATE SET invite_id=excluded.invite_id,submission_id=excluded.submission_id,data=excluded.data`,
        record.clientId,
        record.inviteId,
        record.submissionId,
        record.issueNumber,
        JSON.stringify(record),
      );
      return record;
    });
  }
  getClient(id: string): ClientRecord | null {
    const row = this.storage.sql
      .exec<{ data: string }>(
        "SELECT data FROM admin_clients WHERE client_id=?",
        id,
      )
      .toArray()[0];
    return row ? JSON.parse(row.data) : null;
  }
  listClients(query: ClientFilters): Page<ClientRecord> {
    const filters = {
      search: query.search?.trim().toLowerCase() || null,
      from: query.from ?? null,
      to: query.to ?? null,
    };
    for (const t of [filters.from, filters.to])
      if (t !== null && !timestamp(t)) invalid("date filter");
    const rows = this.storage.sql
      .exec<{ data: string }>("SELECT data FROM admin_clients")
      .toArray()
      .map((row) => JSON.parse(row.data) as ClientRecord)
      .filter(
        (c) =>
          (filters.from === null || c.createdAt >= filters.from) &&
          (filters.to === null || c.createdAt <= filters.to) &&
          (!filters.search ||
            [
              c.clientId,
              c.inviteId,
              c.submissionId,
              c.issueNumber,
              c.businessName,
              c.contactName,
              c.email,
            ].some((v) =>
              String(v ?? "")
                .toLowerCase()
                .includes(filters.search!),
            )),
      );
    return pageRecords(
      rows,
      query,
      JSON.stringify(["clients", filters]),
      (c) => c.clientId,
      (c) => c.createdAt,
    );
  }
  registerDispatch(input: DispatchRequest): {
    attemptId: string;
    requestId: string;
  } {
    return this.storage.transactionSync(() => {
      const client = this.getClient(input.clientId);
      if (
        !client ||
        client.inviteId !== input.inviteId ||
        client.submissionId !== input.submissionId ||
        client.issueNumber !== input.issueNumber
      )
        conflict("dispatch client evidence");
      const old = this.storage.sql
        .exec<{ data: string }>(
          "SELECT data FROM admin_dispatch_requests WHERE request_id=?",
          input.requestId,
        )
        .toArray()[0];
      if (old) {
        const previous: DispatchRequest = JSON.parse(old.data);
        for (const key of [
          "requestId",
          "attemptId",
          "clientId",
          "inviteId",
          "submissionId",
          "issueNumber",
          "createdAt",
        ] as const)
          if (previous[key] !== input[key]) conflict("dispatch evidence");
        if (
          actorKey(previous.initiator) !== actorKey(input.initiator) ||
          actorKey(previous.invitationCreator) !==
            actorKey(input.invitationCreator)
        )
          conflict("dispatch actor evidence");
      }
      if (!old)
        this.storage.sql.exec(
          "INSERT INTO admin_dispatch_requests(request_id,data) VALUES(?,?)",
          input.requestId,
          JSON.stringify(input),
        );
      const result = this.upsertAttempt({
        attemptId: input.attemptId,
        requestId: input.requestId,
        clientId: input.clientId,
        issueNumber: input.issueNumber,
        profile: "full",
        initiator: input.initiator,
        invitationCreator: input.invitationCreator,
        repository: null,
        runId: null,
        runAttempt: null,
        executionStatus: "queued",
        deliveryStatus: "none",
        stale: false,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
        startedAt: null,
        completedAt: null,
        failure: {
          category: null,
          stage: null,
          summary: null,
          evidenceUrl: null,
          nextStep: null,
        },
      });
      return this.registerInitialDispatch({
        requestId: input.requestId,
        initialAttemptId: result.attemptId,
      });
    });
  }
  private save(input: AttemptInput, state: State) {
    this.storage.sql.exec(
      `INSERT INTO generation_attempts
      (attempt_id, request_id, client_id, issue_number, repository, run_id, run_attempt, profile,
       execution_status, initiator_id, creator_id, created_at, data, state)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(attempt_id) DO UPDATE SET request_id=excluded.request_id, client_id=excluded.client_id,
        issue_number=excluded.issue_number, repository=excluded.repository, run_id=excluded.run_id,
        run_attempt=excluded.run_attempt, initiator_id=excluded.initiator_id, creator_id=excluded.creator_id,
        execution_status=excluded.execution_status, data=excluded.data, state=excluded.state`,
      input.attemptId,
      input.requestId,
      input.clientId,
      input.issueNumber,
      input.repository,
      input.runId,
      input.runAttempt,
      input.profile,
      input.executionStatus,
      input.initiator.id,
      input.invitationCreator.id,
      input.createdAt,
      JSON.stringify(input),
      JSON.stringify(state),
    );
  }

  registerInitialDispatch(input: InitialDispatchRegistration): {
    requestId: string;
    attemptId: string;
  } {
    if (!nonempty(input.requestId) || !nonempty(input.initialAttemptId))
      invalid("initial dispatch");
    return this.storage.transactionSync(() => {
      const row = this.row(input.initialAttemptId);
      if (!row) throw new Error("attempt not found");
      const attempt: AttemptInput = JSON.parse(row.data);
      if (attempt.requestId !== input.requestId) conflict("dispatch request");
      if (attempt.runAttempt !== null && attempt.runAttempt !== 1)
        conflict("initial dispatch attempt");
      const binding = this.storage.sql
        .exec<{ initial_attempt_id: string }>(
          "SELECT initial_attempt_id FROM generation_dispatches WHERE request_id=?",
          input.requestId,
        )
        .toArray()[0];
      if (binding && binding.initial_attempt_id !== attempt.attemptId)
        conflict("initial dispatch binding");
      if (!binding)
        this.storage.sql.exec(
          "INSERT INTO generation_dispatches(request_id,initial_attempt_id) VALUES (?,?)",
          input.requestId,
          attempt.attemptId,
        );
      return { requestId: input.requestId, attemptId: attempt.attemptId };
    });
  }

  upsertAttempt(input: AttemptInput): { attemptId: string; created: boolean } {
    validateInput(input);
    return this.storage.transactionSync(() => {
      let existing = this.row(input.attemptId);
      if (
        input.repository !== null &&
        input.runId !== null &&
        input.runAttempt !== null
      ) {
        const canonical = this.storage.sql
          .exec<AttemptRow>(
            "SELECT attempt_id, data, state FROM generation_attempts WHERE repository = ? AND run_id = ? AND run_attempt = ?",
            input.repository,
            input.runId,
            input.runAttempt,
          )
          .toArray()[0];
        if (
          canonical &&
          existing &&
          canonical.attempt_id !== existing.attempt_id
        )
          conflict("execution identity");
        existing ??= canonical;
      }
      const clock: Clock = { source: "callback", version: input.updatedAt };
      if (!existing) {
        this.save(input, {
          execution: clock,
          delivery:
            input.deliveryStatus === "none"
              ? { source: "legacy-import", version: -1 }
              : clock,
          executionVersions: { callback: input.updatedAt },
          snapshotVersion: input.updatedAt,
        });
        return { attemptId: input.attemptId, created: true };
      }
      const old: AttemptInput = JSON.parse(existing.data);
      const state: State = JSON.parse(existing.state);
      const merged = { ...old };
      if (input.previewUrl) {
        if (old.previewUrl && old.previewUrl !== input.previewUrl)
          conflict("previewUrl");
        merged.previewUrl = input.previewUrl;
      }
      for (const key of [
        "requestId",
        "clientId",
        "issueNumber",
        "repository",
        "runId",
        "runAttempt",
      ] as const) {
        const incoming = input[key];
        if (incoming === null) continue;
        const equal =
          key === "repository"
            ? String(old[key]).toLowerCase() === String(incoming).toLowerCase()
            : old[key] === incoming;
        if (old[key] !== null && !equal) conflict(key);
        // Assign via a common record to retain the correlated key/value types.
        Object.assign(merged, { [key]: old[key] ?? incoming });
      }
      if (
        merged.repository !== null &&
        merged.runId !== null &&
        merged.runAttempt !== null
      ) {
        const collision = this.storage.sql
          .exec<{ attempt_id: string }>(
            "SELECT attempt_id FROM generation_attempts WHERE repository=? AND run_id=? AND run_attempt=? AND attempt_id<>?",
            merged.repository,
            merged.runId,
            merged.runAttempt,
            merged.attemptId,
          )
          .toArray()[0];
        if (collision) conflict("execution identity");
      }
      if (old.profile !== input.profile) conflict("profile");
      merged.initiator = mergeActor(
        old.initiator,
        input.initiator,
        "initiator",
      );
      merged.invitationCreator = mergeActor(
        old.invitationCreator,
        input.invitationCreator,
        "invitationCreator",
      );
      if (
        observeExecution(
          state,
          input.executionStatus,
          clock,
          old.executionStatus,
        )
      ) {
        merged.executionStatus = input.executionStatus;
        merged.completedAt = input.completedAt ?? old.completedAt;
        merged.failure = input.failure;
        state.execution = clock;
      }
      if (input.deliveryStatus !== "none" && newer(clock, state.delivery)) {
        // 'none' is absence of delivery evidence, not a demotion of an existing delivery.
        merged.deliveryStatus = input.deliveryStatus;
        state.delivery = clock;
      }
      if (input.updatedAt > state.snapshotVersion) {
        // Trusted matching-result snapshots can enrich a late diagnosis without
        // changing the source/version that locked the execution outcome.
        if (
          terminal(old.executionStatus) &&
          input.executionStatus === old.executionStatus
        ) {
          merged.failure = {
            category: input.failure.category ?? old.failure.category,
            stage: input.failure.stage ?? old.failure.stage,
            summary: input.failure.summary ?? old.failure.summary,
            evidenceUrl: input.failure.evidenceUrl ?? old.failure.evidenceUrl,
            nextStep: input.failure.nextStep ?? old.failure.nextStep,
          };
        }
        merged.stale = input.stale;
        state.snapshotVersion = input.updatedAt;
      }
      merged.startedAt ??= input.startedAt;
      // Observation versions are not execution timestamps. Only fill completion
      // from an explicit verified snapshot matching the retained terminal result.
      if (
        terminal(merged.executionStatus) &&
        input.executionStatus === merged.executionStatus
      )
        merged.completedAt ??= input.completedAt;
      merged.updatedAt = Math.max(old.updatedAt, input.updatedAt);
      this.save(merged, state);
      return { attemptId: old.attemptId, created: false };
    });
  }

  private summary(row: AttemptRow): AttemptSummary {
    const attempt = JSON.parse(row.data) as AttemptInput;
    const clientRow = attempt.clientId
      ? this.storage.sql
          .exec<{ data: string }>(
            "SELECT data FROM admin_clients WHERE client_id=? LIMIT 1",
            attempt.clientId,
          )
          .toArray()[0]
      : attempt.issueNumber
        ? this.storage.sql
            .exec<{ data: string }>(
              "SELECT data FROM admin_clients WHERE issue_number=? LIMIT 1",
              attempt.issueNumber,
            )
            .toArray()[0]
        : undefined;
    let clientName: string | null = null;
    let clientId = attempt.clientId;
    if (clientRow) {
      try {
        const client = JSON.parse(clientRow.data) as {
          clientId?: string | null;
          businessName?: string | null;
          contactName?: string | null;
        };
        clientId ??= client.clientId ?? null;
        const business =
          typeof client.businessName === "string"
            ? client.businessName.trim()
            : "";
        const contact =
          typeof client.contactName === "string"
            ? client.contactName.trim()
            : "";
        clientName = business || contact || null;
      } catch {
        clientName = null;
      }
    }
    const costs = this.storage.sql
      .exec<{
        actual: number | null;
        estimated: number | null;
        unreported: number;
      }>(
        `
      SELECT SUM(CASE WHEN cost_kind='actual' THEN cost_usd END) AS actual,
             SUM(CASE WHEN cost_kind='estimated' THEN cost_usd END) AS estimated,
             COALESCE(SUM(CASE WHEN cost_kind='unreported' THEN 1 ELSE 0 END), 0) AS unreported
      FROM attempt_events WHERE attempt_id=?`,
        row.attempt_id,
      )
      .one();
    return {
      ...attempt,
      clientId,
      previewUrl: safeDiagnosticPreviewUrl(attempt.previewUrl),
      clientName,
      costs: {
        actualUsd: costs.actual,
        estimatedUsd: costs.estimated,
        unreportedCount: costs.unreported,
      },
    };
  }
  getAttempt(id: string): AttemptDetail | null {
    const row = this.row(id);
    if (!row) return null;
    const page = this.getAttemptEvents(id);
    return {
      ...this.summary(row),
      events: page.items,
      eventsNextCursor: page.nextCursor,
      eventCount: page.total,
      relatedPreview: null,
    };
  }
  /**
   * Latest other full attempt for the exact issue whose execution succeeded
   * and whose delivery reached preview_ready or published. Focused profiles
   * are excluded: they are diagnostic evidence, not approved client delivery.
   */
  latestDeliveredAttempt(
    issueNumber: number,
    excludeAttemptId: string,
  ): AttemptInput | null {
    if (!Number.isSafeInteger(issueNumber) || issueNumber < 1)
      invalid("issueNumber");
    if (!nonempty(excludeAttemptId)) invalid("attemptId");
    const rows = this.storage.sql
      .exec<AttemptRow>(
        `SELECT attempt_id, data, state FROM generation_attempts
        WHERE issue_number = ? AND profile = 'full' AND attempt_id <> ?
        ORDER BY created_at DESC, attempt_id DESC`,
        issueNumber,
        excludeAttemptId,
      )
      .toArray();
    for (const row of rows) {
      const attempt = JSON.parse(row.data) as AttemptInput;
      if (attempt.issueNumber !== issueNumber || attempt.stale) continue;
      if (attempt.executionStatus !== "succeeded") continue;
      if (
        attempt.deliveryStatus !== "preview_ready" &&
        attempt.deliveryStatus !== "published"
      )
        continue;
      return attempt;
    }
    return null;
  }
  listAttempts(filters: AttemptFilters): Page<AttemptSummary> {
    const normalized = {
      search: filters.search?.trim().toLowerCase() || null,
      executionStatus: filters.executionStatus ?? null,
      initiatorId: filters.initiatorId ?? null,
      creatorId: filters.creatorId ?? null,
      profile: filters.profile ?? null,
      clientId: filters.clientId ?? null,
      attention: filters.attention === true,
      from: filters.from ?? null,
      to: filters.to ?? null,
    };
    if (
      normalized.executionStatus !== null &&
      !executions.includes(normalized.executionStatus)
    )
      invalid("executionStatus");
    if (normalized.profile !== null && !profiles.includes(normalized.profile))
      invalid("profile");
    for (const time of [normalized.from, normalized.to])
      if (time !== null && !timestamp(time)) invalid("date filter");
    const scope = JSON.stringify(["attempts", normalized]);
    const cursor = decodeCursor(filters.cursor, scope);
    const clauses: string[] = [];
    const args: (string | number)[] = [];
    for (const [key, column] of [
      ["executionStatus", "execution_status"],
      ["initiatorId", "initiator_id"],
      ["creatorId", "creator_id"],
      ["profile", "profile"],
      ["clientId", "client_id"],
    ] as const) {
      if (normalized[key] !== null) {
        clauses.push(`${column} = ?`);
        args.push(normalized[key]!);
      }
    }
    if (normalized.attention) {
      clauses.push(
        `(execution_status IN ('failed','unknown')
          OR json_extract(data,'$.deliveryStatus') IN ('attention','diagnostic')
          OR json_extract(data,'$.stale')=1)`,
      );
    }
    if (normalized.search !== null) {
      clauses.push(
        `(instr(lower(attempt_id), ?) > 0 OR instr(lower(COALESCE(client_id,'')), ?) > 0 OR instr(lower(COALESCE(run_id,'')), ?) > 0 OR instr(lower(COALESCE(repository,'')), ?) > 0 OR instr(lower(COALESCE(request_id,'')), ?) > 0 OR CAST(issue_number AS TEXT) = ?
          OR EXISTS (SELECT 1 FROM admin_clients c WHERE c.client_id=generation_attempts.client_id AND (
            instr(lower(COALESCE(json_extract(c.data,'$.businessName'),'')),?)>0 OR
            instr(lower(COALESCE(json_extract(c.data,'$.contactName'),'')),?)>0 OR
            instr(lower(COALESCE(json_extract(c.data,'$.email'),'')),?)>0)))`,
      );
      args.push(...Array<string>(9).fill(normalized.search));
    }
    if (normalized.from !== null) {
      clauses.push("created_at >= ?");
      args.push(normalized.from);
    }
    if (normalized.to !== null) {
      clauses.push("created_at <= ?");
      args.push(normalized.to);
    }
    const where = clauses.length ? clauses.join(" AND ") : "1=1";
    const total = this.storage.sql
      .exec<{ total: number }>(
        `SELECT COUNT(*) AS total FROM generation_attempts WHERE ${where}`,
        ...args,
      )
      .one().total;
    if (cursor) {
      clauses.push("(created_at < ? OR (created_at = ? AND attempt_id < ?))");
      args.push(cursor.time, cursor.time, cursor.key);
    }
    const limit = pageLimit(filters.limit);
    const rows = this.storage.sql
      .exec<AttemptRow>(
        `SELECT attempt_id, data, state FROM generation_attempts
      WHERE ${clauses.length ? clauses.join(" AND ") : "1=1"} ORDER BY created_at DESC, attempt_id DESC LIMIT ?`,
        ...args,
        limit + 1,
      )
      .toArray();
    const items = rows.slice(0, limit).map((row) => this.summary(row));
    const last = items.at(-1);
    return {
      items,
      total,
      nextCursor:
        rows.length > limit && last
          ? encodeCursor(scope, last.createdAt, last.attemptId)
          : null,
    };
  }

  recordAttemptEvents(
    id: string,
    events: AttemptEventInput[],
  ): { recorded: number } {
    return this.storage.transactionSync(() => {
      const row = this.row(id);
      if (!row) throw new Error("attempt not found");
      const attempt: AttemptInput = JSON.parse(row.data);
      const state: State = JSON.parse(row.state);
      let recorded = 0;
      let observedExecution = false;
      for (const event of events) {
        if (
          !nonempty(event.eventKey) ||
          !nonempty(event.stage) ||
          !nonempty(event.status) ||
          !timestamp(event.observedAt) ||
          !sources.includes(event.source)
        )
          invalid("event");
        if (event.createdAt != null && !timestamp(event.createdAt))
          invalid("event.createdAt");
        if (
          event.costUsd != null &&
          (!Number.isFinite(event.costUsd) || event.costUsd < 0)
        )
          invalid("event.costUsd");
        if (
          event.costKind !== undefined &&
          !["actual", "estimated", "unreported"].includes(event.costKind)
        )
          invalid("event.costKind");
        if (event.stage === "execution" && !executions.includes(event.status))
          invalid("execution observation");
        if (event.stage === "delivery" && !deliveries.includes(event.status))
          invalid("delivery observation");
        const previousRow = this.storage.sql
          .exec<EventRow>(
            "SELECT data FROM attempt_events WHERE attempt_id=? AND event_key=?",
            id,
            event.eventKey,
          )
          .toArray()[0];
        const previous: AttemptEventRecord | null = previousRow
          ? JSON.parse(previousRow.data)
          : null;
        const clock: Clock = {
          source: event.source,
          version: event.observedAt,
        };
        // Outcome authority and per-source watermarks must see observations
        // even when the materialized event row would deduplicate by timestamp.
        if (event.stage === "execution") {
          observedExecution = true;
          if (
            observeExecution(
              state,
              event.status as ExecutionStatus,
              clock,
              attempt.executionStatus,
            )
          ) {
            attempt.executionStatus = event.status as ExecutionStatus;
            state.execution = clock;
            attempt.updatedAt = Math.max(attempt.updatedAt, event.observedAt);
          }
        }
        if (
          previous &&
          !(event.stage === "execution" && previous.stage === "execution"
            ? executionAllowed(
                event.status as ExecutionStatus,
                clock,
                previous.status as ExecutionStatus,
                { source: previous.source, version: previous.observedAt },
              )
            : newer(clock, {
                source: previous.source,
                version: previous.observedAt,
              }))
        )
          continue;
        const record: AttemptEventRecord = {
          ...event,
          attemptId: id,
          provider: event.provider ?? null,
          model: event.model ?? null,
          costUsd: event.costUsd ?? null,
          costKind: event.costKind ?? "unreported",
          detail: event.detail ?? null,
          createdAt: previous?.createdAt ?? event.createdAt ?? event.observedAt,
          updatedAt: Date.now(),
        };
        this.storage.sql.exec(
          `INSERT INTO attempt_events(attempt_id,event_key,created_at,cost_usd,cost_kind,data) VALUES(?,?,?,?,?,?)
          ON CONFLICT(attempt_id,event_key) DO UPDATE SET cost_usd=excluded.cost_usd,cost_kind=excluded.cost_kind,data=excluded.data`,
          id,
          event.eventKey,
          record.createdAt,
          record.costUsd,
          record.costKind,
          JSON.stringify(record),
        );
        recorded++;
        if (event.stage === "delivery" && newer(clock, state.delivery)) {
          attempt.deliveryStatus = event.status as DeliveryStatus;
          state.delivery = clock;
        }
        attempt.updatedAt = Math.max(attempt.updatedAt, event.observedAt);
      }
      if (recorded || observedExecution) this.save(attempt, state);
      return { recorded };
    });
  }
  getAttemptEvents(
    id: string,
    cursor?: string,
    limit?: number,
  ): Page<AttemptEventRecord> {
    const scope = JSON.stringify(["events", id]);
    const position = decodeCursor(cursor, scope);
    const bounded = pageLimit(limit);
    const total = this.storage.sql
      .exec<{ total: number }>(
        "SELECT COUNT(*) AS total FROM attempt_events WHERE attempt_id=?",
        id,
      )
      .one().total;
    const rows = this.storage.sql
      .exec<EventRow>(
        `SELECT data FROM attempt_events WHERE attempt_id=?
      ${position ? "AND (created_at < ? OR (created_at = ? AND event_key < ?))" : ""}
      ORDER BY created_at DESC, event_key DESC LIMIT ?`,
        id,
        ...(position ? [position.time, position.time, position.key] : []),
        bounded + 1,
      )
      .toArray();
    const items: AttemptEventRecord[] = rows
      .slice(0, bounded)
      .map((row) => JSON.parse(row.data));
    const last = items.at(-1);
    return {
      items,
      total,
      nextCursor:
        rows.length > bounded && last
          ? encodeCursor(scope, last.createdAt, last.eventKey)
          : null,
    };
  }
  getHealth(): Health {
    const row = this.storage.sql
      .exec<{
        last_sync_at: number | null;
        coverage_start: number | null;
        partial: number;
        last_error: string | null;
        pending_projection_count: number;
      }>("SELECT * FROM admin_sync_state WHERE id=1")
      .one();
    return {
      lastSyncAt: row.last_sync_at,
      coverageStart: row.coverage_start,
      partial: Boolean(row.partial),
      lastError: row.last_error,
      pendingProjectionCount: row.pending_projection_count,
    };
  }
}
