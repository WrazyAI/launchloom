import type {
  ActorSnapshot,
  AttemptDetail,
  AttemptEventRecord,
  AttemptFilters,
  AttemptSummary,
  ClientFilters,
  ClientRecord,
  Health,
  Page,
} from "../lib/admin-contracts";

const ADMIN_API_PREFIX = "/api/admin/";
const WORKSPACE_PREFIX = "/api/admin/onboarding-invites/workspace";
const AUTH_PREFIX = "/api/admin/onboarding-invites/auth";
const LEGACY_INVITES_PATH = "/api/admin/onboarding-invites";
const MAX_ERROR_MESSAGE = 300;

/**
 * Same-window signal for an expired/lost workspace session. The workspace
 * owner listens and routes back to the login shell; the login page never
 * dispatches it.
 */
export const ADMIN_UNAUTHORIZED_EVENT = "launchloom:admin-unauthorized";

type ErrorEnvelope = {
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

export type AdminRequestInit<T> = RequestInit & {
  /** Only for an endpoint whose success contract is explicitly empty. */
  expectNoContent?: boolean;
  /** Optional runtime shape guard for the parsed JSON body. */
  validate?: (value: unknown) => value is T;
};

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

// Retain the earlier exported name for callers that adopted it during Task 7.
export { ApiRequestError as AdminApiError };

function safeMessage(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/\s+/gu, " ").slice(0, MAX_ERROR_MESSAGE)
    : fallback;
}

function safeCode(value: unknown) {
  return typeof value === "string" && /^[a-z0-9_-]{1,64}$/u.test(value)
    ? value
    : "request_failed";
}

function parseJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function errorEnvelope(text: string): ErrorEnvelope {
  const parsed = text ? parseJson(text) : undefined;
  return parsed && typeof parsed === "object" ? (parsed as ErrorEnvelope) : {};
}

function isJsonContentType(value: string | null) {
  const mediaType = (value || "").split(";")[0].trim().toLowerCase();
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

/**
 * Same-origin admin transport. Cookies are sent by the browser; no bearer or
 * storage token is read or written here. A successful response must carry a
 * JSON body unless the caller explicitly marks the endpoint as no-content.
 * Error bodies are reduced to a safe message rather than being forwarded.
 */
export async function fetchAdmin<T>(
  path: string,
  init: AdminRequestInit<T> = {},
): Promise<T> {
  if (
    !path.startsWith(ADMIN_API_PREFIX) ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.includes("\n") ||
    path.includes("\r")
  )
    throw new ApiRequestError(0, "invalid_path", "Invalid admin request path.");

  const { expectNoContent = false, validate, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  let response: Response;
  try {
    response = await fetch(path, {
      ...requestInit,
      credentials: "same-origin",
      cache: "no-store",
      headers,
    });
  } catch {
    throw new ApiRequestError(
      0,
      "network_unavailable",
      "The admin workspace is unavailable.",
    );
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new ApiRequestError(
      response.status,
      "invalid_response",
      "The admin response could not be read.",
    );
  }

  if (!response.ok) {
    const envelope = errorEnvelope(text);
    if (
      response.status === 401 &&
      !path.startsWith(`${AUTH_PREFIX}/`) &&
      typeof window !== "undefined" &&
      typeof document !== "undefined" &&
      document.body?.dataset.adminView === "workspace"
    ) {
      window.dispatchEvent(new CustomEvent(ADMIN_UNAUTHORIZED_EVENT));
    }
    throw new ApiRequestError(
      response.status,
      safeCode(envelope.error?.code),
      safeMessage(envelope.error?.message, "The admin request failed."),
    );
  }

  if (response.status === 204 || expectNoContent) return undefined as T;

  if (!isJsonContentType(response.headers.get("Content-Type")))
    throw new ApiRequestError(
      response.status,
      "invalid_response",
      "The admin response was not JSON.",
    );
  if (!text.trim())
    throw new ApiRequestError(
      response.status,
      "invalid_response",
      "The admin response was empty.",
    );
  const payload = parseJson(text);
  if (payload === undefined || payload === null)
    throw new ApiRequestError(
      response.status,
      "invalid_response",
      "The admin response was malformed.",
    );
  if (validate && !validate(payload))
    throw new ApiRequestError(
      response.status,
      "invalid_response",
      "The admin response had an unexpected shape.",
    );
  return payload as T;
}

export type AdminRequestOptions = {
  signal?: AbortSignal;
};

export type ClientPage = Page<ClientRecord> & { health: Health };

/**
 * Interim Access-mode identity. The stable id is server-derived; no browser
 * field can choose it. `displayName` remains null until persistent profiles
 * are enabled, so the UI never invents a name.
 */
export type AccessModePrincipal = {
  id: string;
  email: string;
  displayName: string | null;
  role: "admin";
  authSource: "cloudflare-access";
};

/** Verified persistent identity. `displayName` is the stored profile name. */
export type NeonIdentity = {
  id: string;
  email: string;
  displayName: string;
  role: "owner" | "admin";
  authSource: "neon";
};

/** Active membership row returned by `/workspace/me` and `/workspace/team`. */
export type NeonMember = NeonIdentity & {
  active: boolean;
  createdAt: number;
  updatedAt: number;
  initials: string;
  avatarKey: string | null;
};

/** The principal shape differs by the server's configured auth mode. */
export type WorkspacePrincipal = AccessModePrincipal | NeonMember;

export type EnrollmentLink = {
  id: string;
  url: string;
  expiresAt: number;
};

export type TeamMember = NeonMember;

export type AuthUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

export type AuthResult = {
  user: AuthUser | null;
  session: { expiresAt: number } | null;
};

export type MemberChange = {
  role?: "owner" | "admin";
  active?: boolean;
};

export type ProfileUpdate = {
  displayName?: string;
  avatarKey?: string | null;
};

/** Legacy invitation list row. Creator is absent unless the server recorded it. */
export type LegacyInvite = {
  inviteId: string;
  clientEmail: string | null;
  submitterEmail: string | null;
  expiresAt: number;
  status: string;
  createdAt: number;
  updatedAt: number;
  submissionId: string | null;
  issueNumber: number | null;
  recoveryRequired: boolean;
  recoveryAttempts: number | null;
  creator: ActorSnapshot | null;
};

export type CreatedInvite = {
  inviteId: string;
  clientEmail: string | null;
  expiresAt: number;
  url: string;
};

export type BackfillResult = { backfilled: number; remaining: number };
export type RecoveryResult = { issue: number; duplicate: boolean };

/**
 * Workspace API used by the implemented views. Account calls are same-origin
 * cookie flows only; no provider token is read, stored or returned here.
 */
export type AdminApi = {
  getMe(options?: AdminRequestOptions): Promise<WorkspacePrincipal>;
  listInvites(options?: AdminRequestOptions): Promise<LegacyInvite[]>;
  createInvite(
    clientEmail: string | null,
    options?: AdminRequestOptions,
  ): Promise<CreatedInvite>;
  revokeInvite(inviteId: string, options?: AdminRequestOptions): Promise<void>;
  backfillInvites(options?: AdminRequestOptions): Promise<BackfillResult>;
  recoverInviteIntake(
    inviteId: string,
    issueNumber: number,
    options?: AdminRequestOptions,
  ): Promise<RecoveryResult>;
  getTeam(options?: AdminRequestOptions): Promise<TeamMember[]>;
  createEnrollment(
    email: string,
    options?: AdminRequestOptions,
  ): Promise<EnrollmentLink>;
  changeMember(
    id: string,
    change: MemberChange,
    options?: AdminRequestOptions,
  ): Promise<TeamMember>;
  updateProfile(
    update: ProfileUpdate,
    options?: AdminRequestOptions,
  ): Promise<NeonMember>;
  updateOwnProfile(
    update: ProfileUpdate,
    options?: AdminRequestOptions,
  ): Promise<NeonMember>;
  acceptEnrollment(
    token: string,
    options?: AdminRequestOptions,
  ): Promise<NeonIdentity>;
  signIn(
    email: string,
    password: string,
    options?: AdminRequestOptions,
  ): Promise<AuthResult>;
  signOut(options?: AdminRequestOptions): Promise<void>;
  requestPasswordReset(
    email: string,
    options?: AdminRequestOptions,
  ): Promise<void>;
  resetPassword(
    token: string,
    newPassword: string,
    options?: AdminRequestOptions,
  ): Promise<void>;
  changePassword(
    currentPassword: string,
    newPassword: string,
    options?: AdminRequestOptions,
  ): Promise<void>;
  verifyEmail(token: string, options?: AdminRequestOptions): Promise<void>;
  listAttempts(
    filters: AttemptFilters,
    options?: AdminRequestOptions,
  ): Promise<Page<AttemptSummary>>;
  getAttempt(id: string, options?: AdminRequestOptions): Promise<AttemptDetail>;
  getAttemptEvents(
    id: string,
    cursor?: string | null,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<Page<AttemptEventRecord>>;
  listClients(
    filters: ClientFilters,
    options?: AdminRequestOptions,
  ): Promise<ClientPage>;
  getClient(id: string, options?: AdminRequestOptions): Promise<ClientRecord>;
  getHealth(options?: AdminRequestOptions): Promise<Health>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPageShape(value: unknown): value is Page<unknown> {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    typeof value.total === "number" &&
    Number.isSafeInteger(value.total) &&
    value.total >= 0 &&
    (value.nextCursor === null || typeof value.nextCursor === "string")
  );
}

function isHealth(value: unknown): value is Health {
  return (
    isRecord(value) &&
    (value.lastSyncAt === null || typeof value.lastSyncAt === "number") &&
    (value.coverageStart === null || typeof value.coverageStart === "number") &&
    typeof value.partial === "boolean" &&
    (value.lastError === null || typeof value.lastError === "string") &&
    typeof value.pendingProjectionCount === "number" &&
    Number.isSafeInteger(value.pendingProjectionCount)
  );
}

function isAttemptEnvelope(
  value: unknown,
): value is { attempt: AttemptDetail } {
  return (
    isRecord(value) &&
    isRecord(value.attempt) &&
    typeof value.attempt.attemptId === "string"
  );
}

function isClientEnvelope(value: unknown): value is { client: ClientRecord } {
  return (
    isRecord(value) &&
    isRecord(value.client) &&
    typeof value.client.clientId === "string"
  );
}

function isClientPage(value: unknown): value is ClientPage {
  return isPageShape(value) && isHealth((value as { health?: unknown }).health);
}

function isAccessModePrincipal(value: unknown): value is AccessModePrincipal {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    /^access:[a-f0-9]{64}$/u.test(value.id) &&
    typeof value.email === "string" &&
    value.email.length > 0 &&
    (value.displayName === null || typeof value.displayName === "string") &&
    value.role === "admin" &&
    value.authSource === "cloudflare-access"
  );
}

function isSiteId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200 &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function isRole(value: unknown): value is "owner" | "admin" {
  return value === "owner" || value === "admin";
}

function isNeonIdentity(value: unknown): value is NeonIdentity {
  return (
    isRecord(value) &&
    isSiteId(value.id) &&
    isSiteId(value.email) &&
    value.email.includes("@") &&
    typeof value.displayName === "string" &&
    value.displayName.trim().length > 0 &&
    isRole(value.role) &&
    value.authSource === "neon"
  );
}

function isNeonMember(value: unknown): value is NeonMember {
  if (!isRecord(value) || !isNeonIdentity(value)) return false;
  const member = value as Record<string, unknown>;
  return (
    typeof member.active === "boolean" &&
    typeof member.createdAt === "number" &&
    Number.isFinite(member.createdAt) &&
    typeof member.updatedAt === "number" &&
    Number.isFinite(member.updatedAt) &&
    typeof member.initials === "string" &&
    (member.avatarKey === null || typeof member.avatarKey === "string")
  );
}

function isWorkspacePrincipal(value: unknown): value is WorkspacePrincipal {
  return isAccessModePrincipal(value) || isNeonMember(value);
}

function isPrincipalEnvelope(
  value: unknown,
): value is { principal: WorkspacePrincipal } {
  return isRecord(value) && isWorkspacePrincipal(value.principal);
}

function isNeonPrincipalEnvelope(
  value: unknown,
): value is { principal: NeonIdentity } {
  return isRecord(value) && isNeonIdentity(value.principal);
}

function isMemberEnvelope(value: unknown): value is { member: TeamMember } {
  return isRecord(value) && isNeonMember(value.member);
}

function isTeamPayload(value: unknown): value is { members: TeamMember[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.members) &&
    value.members.every(isNeonMember)
  );
}

function isEnrollmentLink(value: unknown): value is EnrollmentLink {
  return (
    isRecord(value) &&
    isSiteId(value.id) &&
    typeof value.url === "string" &&
    value.url.length > 0 &&
    value.url.length <= 2_048 &&
    typeof value.expiresAt === "number" &&
    Number.isFinite(value.expiresAt)
  );
}

function isEnrollmentPayload(
  value: unknown,
): value is { enrollment: EnrollmentLink } {
  return isRecord(value) && isEnrollmentLink(value.enrollment);
}

function isAuthResult(value: unknown): value is AuthResult {
  if (!isRecord(value)) return false;
  const user = value.user;
  const session = value.session;
  const userOk =
    user === null ||
    (isRecord(user) &&
      isSiteId(user.id) &&
      isSiteId(user.email) &&
      typeof user.emailVerified === "boolean" &&
      typeof user.name === "string");
  const sessionOk =
    session === null ||
    (isRecord(session) &&
      typeof session.expiresAt === "number" &&
      Number.isFinite(session.expiresAt));
  return userOk && sessionOk;
}

function isOkBody(value: unknown): value is { ok: true } {
  return isRecord(value) && value.ok === true;
}

function isActor(value: unknown): value is ActorSnapshot {
  return (
    isRecord(value) &&
    (value.kind === "admin" ||
      value.kind === "client" ||
      value.kind === "github" ||
      value.kind === "system" ||
      value.kind === "unknown") &&
    (value.id === null || typeof value.id === "string") &&
    (value.name === null || typeof value.name === "string") &&
    (value.email === null || typeof value.email === "string") &&
    (value.source === "neon" ||
      value.source === "cloudflare-access" ||
      value.source === "intake" ||
      value.source === "github" ||
      value.source === "system" ||
      value.source === "legacy")
  );
}

function isLegacyInvite(value: unknown): value is LegacyInvite {
  return (
    isRecord(value) &&
    typeof value.inviteId === "string" &&
    value.inviteId.length > 0 &&
    (value.clientEmail === null || typeof value.clientEmail === "string") &&
    (value.submitterEmail === null ||
      typeof value.submitterEmail === "string") &&
    typeof value.expiresAt === "number" &&
    Number.isSafeInteger(value.expiresAt) &&
    typeof value.status === "string" &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number" &&
    (value.submissionId === null ||
      value.submissionId === undefined ||
      typeof value.submissionId === "string") &&
    (value.issueNumber === null ||
      value.issueNumber === undefined ||
      typeof value.issueNumber === "number") &&
    (value.recoveryRequired === undefined ||
      typeof value.recoveryRequired === "boolean") &&
    (value.recoveryAttempts === undefined ||
      value.recoveryAttempts === null ||
      typeof value.recoveryAttempts === "number") &&
    (value.creator === undefined ||
      value.creator === null ||
      isActor(value.creator))
  );
}

function inviteListFromPayload(payload: unknown): LegacyInvite[] {
  if (!isRecord(payload) || !Array.isArray(payload.invites))
    throw new ApiRequestError(
      200,
      "invalid_response",
      "The invitation list had an unexpected shape.",
    );
  return payload.invites.map((item) => {
    if (!isLegacyInvite(item))
      throw new ApiRequestError(
        200,
        "invalid_response",
        "The invitation list contained an unexpected record.",
      );
    return {
      ...item,
      submissionId: item.submissionId ?? null,
      issueNumber: item.issueNumber ?? null,
      recoveryRequired: item.recoveryRequired ?? false,
      recoveryAttempts: item.recoveryAttempts ?? null,
      creator: item.creator ?? null,
    };
  });
}

function isCreatedInvite(value: unknown): value is CreatedInvite {
  return (
    isRecord(value) &&
    typeof value.inviteId === "string" &&
    value.inviteId.length > 0 &&
    (value.clientEmail === null || typeof value.clientEmail === "string") &&
    typeof value.expiresAt === "number" &&
    typeof value.url === "string" &&
    value.url.length > 0
  );
}

function isBackfillResult(value: unknown): value is BackfillResult {
  return (
    isRecord(value) &&
    typeof value.backfilled === "number" &&
    Number.isSafeInteger(value.backfilled) &&
    value.backfilled >= 0 &&
    typeof value.remaining === "number" &&
    Number.isSafeInteger(value.remaining) &&
    value.remaining >= 0
  );
}

function isRecoveryResult(value: unknown): value is RecoveryResult {
  return (
    isRecord(value) &&
    typeof value.issue === "number" &&
    Number.isSafeInteger(value.issue) &&
    value.issue > 0 &&
    typeof value.duplicate === "boolean"
  );
}

function add(
  params: URLSearchParams,
  key: string,
  value: string | number | null | undefined,
) {
  if (value === null || value === undefined) return;
  const text = String(value).trim();
  if (!text) return;
  params.set(key, text);
}

/** Server filter names, not browser route aliases. */
export function buildAttemptQuery(filters: AttemptFilters = {}) {
  const params = new URLSearchParams();
  add(params, "search", filters.search?.trim());
  add(params, "executionStatus", filters.executionStatus);
  add(params, "initiatorId", filters.initiatorId);
  add(params, "creatorId", filters.creatorId);
  add(params, "profile", filters.profile);
  add(params, "clientId", filters.clientId);
  if (Number.isSafeInteger(filters.from)) add(params, "from", filters.from);
  if (Number.isSafeInteger(filters.to)) add(params, "to", filters.to);
  add(params, "cursor", filters.cursor);
  if (
    Number.isSafeInteger(filters.limit) &&
    filters.limit! >= 1 &&
    filters.limit! <= 100
  )
    add(params, "limit", filters.limit);
  return params;
}

export function buildClientQuery(filters: ClientFilters = {}) {
  const params = new URLSearchParams();
  add(params, "search", filters.search?.trim());
  if (Number.isSafeInteger(filters.from)) add(params, "from", filters.from);
  if (Number.isSafeInteger(filters.to)) add(params, "to", filters.to);
  add(params, "cursor", filters.cursor);
  if (
    Number.isSafeInteger(filters.limit) &&
    filters.limit! >= 1 &&
    filters.limit! <= 100
  )
    add(params, "limit", filters.limit);
  return params;
}

function querySuffix(params: URLSearchParams) {
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function createAdminApi(
  fetcher: typeof fetchAdmin = fetchAdmin,
): AdminApi {
  const post = <T>(
    body: Record<string, unknown>,
    options: AdminRequestOptions | undefined,
    validate: (value: unknown) => value is T,
  ) =>
    fetcher<T>(LEGACY_INVITES_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: options?.signal,
      validate,
    });

  const send = <T>(
    path: string,
    method: "GET" | "POST" | "PATCH",
    body: Record<string, unknown> | undefined,
    options: AdminRequestOptions | undefined,
    validate: (value: unknown) => value is T,
  ) =>
    fetcher<T>(path, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
      signal: options?.signal,
      validate,
    });

  const authPost = <T>(
    route: string,
    body: Record<string, unknown>,
    options: AdminRequestOptions | undefined,
    validate: (value: unknown) => value is T,
  ) => send<T>(`${AUTH_PREFIX}/${route}`, "POST", body, options, validate);

  const updateProfileRequest = async (
    update: ProfileUpdate,
    options: AdminRequestOptions | undefined,
  ) => {
    const body: Record<string, unknown> = {};
    if (update.displayName !== undefined) body.displayName = update.displayName;
    if (update.avatarKey !== undefined) body.avatarKey = update.avatarKey;
    const payload = await send<{ principal: WorkspacePrincipal }>(
      `${WORKSPACE_PREFIX}/me`,
      "PATCH",
      body,
      options,
      isPrincipalEnvelope,
    );
    if (!isNeonMember(payload.principal))
      throw new ApiRequestError(
        200,
        "invalid_response",
        "The profile response had an unexpected shape.",
      );
    return payload.principal;
  };

  return {
    async getMe(options) {
      const payload = await fetcher<{ principal: WorkspacePrincipal }>(
        `${WORKSPACE_PREFIX}/me`,
        { signal: options?.signal, validate: isPrincipalEnvelope },
      );
      return payload.principal;
    },
    async listInvites(options) {
      const payload = await fetcher<unknown>(LEGACY_INVITES_PATH, {
        signal: options?.signal,
      });
      return inviteListFromPayload(payload);
    },
    createInvite(clientEmail, options) {
      const email = clientEmail?.trim().toLowerCase() || null;
      return post<CreatedInvite>(
        { action: "create", ...(email ? { clientEmail: email } : {}) },
        options,
        isCreatedInvite,
      );
    },
    async revokeInvite(inviteId, options) {
      await post<{ ok: true }>(
        { action: "revoke", inviteId },
        options,
        (value): value is { ok: true } => isRecord(value) && value.ok === true,
      );
    },
    backfillInvites(options) {
      return post<BackfillResult>(
        { action: "backfill" },
        options,
        isBackfillResult,
      );
    },
    recoverInviteIntake(inviteId, issueNumber, options) {
      return post<RecoveryResult>(
        {
          action: "recover-intake",
          inviteId,
          issueNumber,
          confirmed: true,
        },
        options,
        isRecoveryResult,
      );
    },
    async getTeam(options) {
      const payload = await send<{ members: TeamMember[] }>(
        `${WORKSPACE_PREFIX}/team`,
        "GET",
        undefined,
        options,
        isTeamPayload,
      );
      return payload.members;
    },
    async createEnrollment(email, options) {
      const payload = await send<{ enrollment: EnrollmentLink }>(
        `${WORKSPACE_PREFIX}/team/enrollments`,
        "POST",
        { email: email.trim().toLowerCase() },
        options,
        isEnrollmentPayload,
      );
      return payload.enrollment;
    },
    async changeMember(id, change, options) {
      const body: Record<string, unknown> = {};
      if (change.role !== undefined) body.role = change.role;
      if (change.active !== undefined) body.active = change.active;
      const payload = await send<{ member: TeamMember }>(
        `${WORKSPACE_PREFIX}/team/${encodeURIComponent(id)}`,
        "PATCH",
        body,
        options,
        isMemberEnvelope,
      );
      return payload.member;
    },
    async updateProfile(update, options) {
      return updateProfileRequest(update, options);
    },
    updateOwnProfile(update, options) {
      return updateProfileRequest(update, options);
    },
    async acceptEnrollment(token, options) {
      const payload = await send<{ principal: NeonIdentity }>(
        `${WORKSPACE_PREFIX}/enrollments/accept`,
        "POST",
        { token },
        options,
        isNeonPrincipalEnvelope,
      );
      return payload.principal;
    },
    async signIn(email, password, options) {
      const payload = await authPost<AuthResult>(
        "sign-in/email",
        { email: email.trim().toLowerCase(), password },
        options,
        isAuthResult,
      );
      if (!payload.user)
        throw new ApiRequestError(
          200,
          "auth_failed",
          "Sign-in did not return an account.",
        );
      return payload;
    },
    async signOut(options) {
      await authPost<{ ok: true }>("sign-out", {}, options, isOkBody);
    },
    async requestPasswordReset(email, options) {
      await authPost<{ ok: true }>(
        "request-password-reset",
        {
          email: email.trim().toLowerCase(),
          redirectTo: "/admin/login",
        },
        options,
        isOkBody,
      );
    },
    async resetPassword(token, newPassword, options) {
      await authPost<{ ok: true }>(
        "reset-password",
        { token, newPassword },
        options,
        isOkBody,
      );
    },
    async changePassword(currentPassword, newPassword, options) {
      await authPost<{ ok: true }>(
        "change-password",
        { currentPassword, newPassword, revokeOtherSessions: true },
        options,
        isOkBody,
      );
    },
    async verifyEmail(token, options) {
      await send<{ ok: true }>(
        `${AUTH_PREFIX}/verify-email?token=${encodeURIComponent(token)}`,
        "GET",
        undefined,
        options,
        isOkBody,
      );
    },
    listAttempts(filters, options) {
      return fetcher<Page<AttemptSummary>>(
        `${WORKSPACE_PREFIX}/attempts${querySuffix(buildAttemptQuery(filters))}`,
        {
          signal: options?.signal,
          validate: (value): value is Page<AttemptSummary> =>
            isPageShape(value),
        },
      );
    },
    async getAttempt(id, options) {
      const payload = await fetcher<{ attempt: AttemptDetail }>(
        `${WORKSPACE_PREFIX}/attempts/${encodeURIComponent(id)}`,
        { signal: options?.signal, validate: isAttemptEnvelope },
      );
      return payload.attempt;
    },
    getAttemptEvents(id, cursor, limit, signal) {
      const params = new URLSearchParams();
      add(params, "cursor", cursor);
      if (Number.isSafeInteger(limit) && limit! >= 1 && limit! <= 100)
        add(params, "limit", limit);
      return fetcher<Page<AttemptEventRecord>>(
        `${WORKSPACE_PREFIX}/attempts/${encodeURIComponent(id)}/events${querySuffix(params)}`,
        {
          signal,
          validate: (value): value is Page<AttemptEventRecord> =>
            isPageShape(value),
        },
      );
    },
    listClients(filters, options) {
      return fetcher<ClientPage>(
        `${WORKSPACE_PREFIX}/clients${querySuffix(buildClientQuery(filters))}`,
        { signal: options?.signal, validate: isClientPage },
      );
    },
    async getClient(id, options) {
      const payload = await fetcher<{ client: ClientRecord }>(
        `${WORKSPACE_PREFIX}/clients/${encodeURIComponent(id)}`,
        { signal: options?.signal, validate: isClientEnvelope },
      );
      return payload.client;
    },
    getHealth(options) {
      return fetcher<Health>(`${WORKSPACE_PREFIX}/health`, {
        signal: options?.signal,
        validate: isHealth,
      });
    },
  };
}
