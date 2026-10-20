import { neon } from "@neondatabase/serverless";
import type { AdminPrincipal } from "../../../src/lib/admin-contracts";
import type { VerifiedSession } from "./neon-auth";
import { legacyAccessId } from "./workspace-api";

/**
 * Server-only membership persistence. Every write goes through the SQL
 * functions in `db/admin/001-membership.sql`; the Worker never trusts a role,
 * actor or email field supplied by a browser.
 */

export type MembershipErrorCode =
  | "forbidden"
  | "last_owner"
  | "not_found"
  | "conflict"
  | "invalid"
  | "email_mismatch"
  | "enrollment_used"
  | "expired"
  | "dependency_unavailable";

const ERROR_STATUS: Record<MembershipErrorCode, number> = {
  forbidden: 403,
  last_owner: 409,
  not_found: 404,
  conflict: 409,
  invalid: 400,
  email_mismatch: 403,
  enrollment_used: 409,
  expired: 410,
  dependency_unavailable: 503,
};

export class MembershipError extends Error {
  readonly code: MembershipErrorCode;
  readonly status: number;

  constructor(code: MembershipErrorCode, message: string) {
    super(message);
    this.name = "MembershipError";
    this.code = code;
    this.status = ERROR_STATUS[code];
  }
}

/** Injectable query surface so unit tests never need a database. */
export type MembershipSql = {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
};

export type AdminMember = AdminPrincipal & {
  active: boolean;
  createdAt: number;
  updatedAt: number;
  initials: string;
  avatarKey: string | null;
};

export type CreatedEnrollment = {
  enrollmentId: string;
  /** Copy-once link. The clear token exists only in this return value. */
  url: string;
  expiresAt: number;
};

export type UpdateProfileInput = {
  displayName?: string;
  /** Approved local avatar key. `null` keeps the current avatar. */
  avatarKey?: string | null;
};

export type ChangeMemberInput = {
  role?: "owner" | "admin";
  active?: boolean;
};

export interface MembershipStore {
  findActive(subject: string): Promise<AdminPrincipal | null>;
  get(subject: string): Promise<AdminMember | null>;
  list(): Promise<AdminMember[]>;
  createEnrollment(ownerId: string, email: string): Promise<CreatedEnrollment>;
  acceptEnrollment(
    session: VerifiedSession,
    token: string,
  ): Promise<AdminPrincipal>;
  updateOwnProfile(
    subject: string,
    input: UpdateProfileInput,
  ): Promise<AdminMember>;
  changeMember(
    ownerId: string,
    targetId: string,
    input: ChangeMemberInput,
  ): Promise<AdminMember>;
}

export type MembershipStoreOptions = {
  now?: () => number;
  /** UI path that consumes the one-use enrollment token. */
  enrollmentPath?: string;
};

const ENROLLMENT_TTL_MS = 72 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const AVATAR_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;
const SUBJECT_LIMIT = 200;

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

export async function hashEnrollmentToken(token: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function issueEnrollmentToken() {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function normalizeEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email || email.length > 240 || !EMAIL_PATTERN.test(email))
    throw new MembershipError("invalid", "Enter a valid email address.");
  return email;
}

function requireSubject(value: unknown, label: string) {
  const subject = typeof value === "string" ? value.trim() : "";
  if (!subject || subject.length > SUBJECT_LIMIT)
    throw new MembershipError("invalid", `${label} is not valid.`);
  return subject;
}

/** 1-100 Unicode code points; control characters are rejected, text is kept. */
export function normalizeDisplayName(value: unknown) {
  const displayName = typeof value === "string" ? value.trim() : "";
  const length = [...displayName].length;
  if (length < 1 || length > 100 || CONTROL_CHARACTERS.test(displayName))
    throw new MembershipError(
      "invalid",
      "Display name must be 1 to 100 characters.",
    );
  return displayName;
}

function normalizeAvatarKey(value: unknown) {
  if (value === undefined || value === null) return null;
  const key = typeof value === "string" ? value.trim() : "";
  if (!AVATAR_KEY_PATTERN.test(key))
    throw new MembershipError("invalid", "Choose an approved avatar.");
  return key;
}

/** Accessible initials, derived from stored text only. */
export function initialsFor(displayName: string) {
  const parts = displayName.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts
    .slice(0, 2)
    .map((part) => Array.from(part)[0] || "")
    .join("");
  return Array.from(letters.toUpperCase()).slice(0, 2).join("") || "?";
}

function epoch(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

type MemberRow = {
  subject: string;
  email: string;
  display_name: string | null;
  avatar_key: string | null;
  role: "owner" | "admin";
  active: boolean;
  created_at: unknown;
  updated_at: unknown;
};

function memberFromRow(row: MemberRow): AdminMember {
  const displayName =
    typeof row.display_name === "string" && row.display_name.trim()
      ? row.display_name.trim()
      : row.email;
  return {
    id: row.subject,
    email: row.email,
    displayName,
    role: row.role,
    authSource: "neon",
    active: row.active === true,
    createdAt: epoch(row.created_at),
    updatedAt: epoch(row.updated_at),
    initials: initialsFor(displayName),
    avatarKey: row.avatar_key ?? null,
  };
}

function principalFromMember(member: AdminMember): AdminPrincipal {
  return {
    id: member.id,
    email: member.email,
    displayName: member.displayName,
    role: member.role,
    authSource: "neon",
  };
}

const DB_TOKENS: Array<[RegExp, MembershipErrorCode, string]> = [
  [
    /\benrollment_used\b/u,
    "enrollment_used",
    "This invitation has already been used.",
  ],
  [
    /\benrollment_expired\b/u,
    "expired",
    "This invitation has expired.",
  ],
  [
    /\bemail_mismatch\b/u,
    "email_mismatch",
    "This invitation belongs to a different verified email.",
  ],
  [
    /\bmember_conflict\b/u,
    "conflict",
    "This account cannot claim the invitation.",
  ],
  [/\blast_owner\b/u, "last_owner", "At least one active owner is required."],
  [/\bowner_exists\b/u, "conflict", "An active owner already exists."],
  [/\bforbidden\b/u, "forbidden", "You do not have permission for this action."],
  [/\bnot_found\b/u, "not_found", "Member not found."],
  [
    /\b(?:invalid_enrollment|invalid_token|invalid_email|invalid_role|invalid_expiry|invalid_display_name|no_change)\b/u,
    "invalid",
    "The request is not valid.",
  ],
  [
    /\bworkspace_guard_missing\b/u,
    "dependency_unavailable",
    "Membership data is temporarily unavailable.",
  ],
  [
    /\blegacy_identity_conflict\b/u,
    "conflict",
    "This legacy identity is already linked to another account.",
  ],
  [
    /\b(?:invalid_legacy_id|invalid_subject)\b/u,
    "invalid",
    "The legacy identity link is not valid.",
  ],
];

/** Never exposes raw database text, SQL, constraints or connection details. */
export function toMembershipError(error: unknown): MembershipError {
  if (error instanceof MembershipError) return error;
  const record =
    error && typeof error === "object"
      ? (error as { code?: unknown; message?: unknown })
      : {};
  const message = typeof record.message === "string" ? record.message : "";
  const pgCode = typeof record.code === "string" ? record.code : "";
  for (const [pattern, code, safeMessage] of DB_TOKENS) {
    if (pattern.test(message)) return new MembershipError(code, safeMessage);
  }
  if (pgCode === "23505" || pgCode === "23503" || /\bduplicate key\b/u.test(message))
    return new MembershipError(
      "conflict",
      "That change conflicts with the current membership.",
    );
  if (pgCode === "23514" || pgCode.startsWith("22"))
    return new MembershipError("invalid", "The request is not valid.");
  return new MembershipError(
    "dependency_unavailable",
    "Membership data is temporarily unavailable.",
  );
}

export function databaseSql(connectionString: string): MembershipSql {
  return neon(connectionString) as unknown as MembershipSql;
}

export function createMembershipStore(
  sql: MembershipSql,
  options: MembershipStoreOptions = {},
): MembershipStore {
  const now = options.now ?? (() => Date.now());
  const enrollmentPath = options.enrollmentPath ?? "/admin/login";

  async function query<T = Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ) {
    try {
      return await sql.query<T>(text, params);
    } catch (error) {
      throw toMembershipError(error);
    }
  }

  async function get(subject: string) {
    const normalized = requireSubject(subject, "Member");
    const rows = await query<MemberRow>(
      "select * from launchloom_admin.get_member($1)",
      [normalized],
    );
    return rows[0] ? memberFromRow(rows[0]) : null;
  }

  return {
    async findActive(subject) {
      const normalized = requireSubject(subject, "Member");
      const rows = await query<MemberRow>(
        "select * from launchloom_admin.find_active_member($1)",
        [normalized],
      );
      if (!rows[0]) return null;
      const member = memberFromRow(rows[0]);
      return member.active ? principalFromMember(member) : null;
    },

    get,

    async list() {
      const rows = await query<MemberRow>(
        "select * from launchloom_admin.list_members()",
      );
      return rows.map(memberFromRow);
    },

    async createEnrollment(ownerId, email) {
      const actor = requireSubject(ownerId, "Owner");
      const normalizedEmail = normalizeEmail(email);
      const token = issueEnrollmentToken();
      const tokenHash = await hashEnrollmentToken(token);
      const expiresAt = now() + ENROLLMENT_TTL_MS;
      const rows = await query<{ id: string }>(
        "select launchloom_admin.create_enrollment($1, $2, $3, $4) as id",
        [normalizedEmail, tokenHash, actor, new Date(expiresAt).toISOString()],
      );
      const enrollmentId = rows[0]?.id;
      if (!enrollmentId)
        throw new MembershipError(
          "dependency_unavailable",
          "Membership data is temporarily unavailable.",
        );
      const separator = enrollmentPath.includes("?") ? "&" : "?";
      return {
        enrollmentId,
        url: `${enrollmentPath}${separator}enrollment=${encodeURIComponent(token)}`,
        expiresAt,
      };
    },

    async acceptEnrollment(session, tokenValue) {
      if (!session || session.emailVerified !== true)
        throw new MembershipError(
          "forbidden",
          "Verify your email before accepting the invitation.",
        );
      const subject = requireSubject(session.subject, "Account");
      const email = normalizeEmail(session.email);
      const token = typeof tokenValue === "string" ? tokenValue.trim() : "";
      if (!TOKEN_PATTERN.test(token))
        throw new MembershipError("invalid", "This invitation is not valid.");
      const displayName =
        typeof session.displayName === "string" &&
        session.displayName.trim() &&
        [...session.displayName.trim()].length <= 100 &&
        !CONTROL_CHARACTERS.test(session.displayName)
          ? session.displayName.trim()
          : null;
      const tokenHash = await hashEnrollmentToken(token);
      const legacyId = await legacyAccessId(email);
      const rows = await query<MemberRow>(
        "select * from launchloom_admin.accept_enrollment($1, $2, $3, $4, $5)",
        [tokenHash, subject, email, displayName, legacyId],
      );
      if (!rows[0])
        throw new MembershipError(
          "dependency_unavailable",
          "Membership data is temporarily unavailable.",
        );
      const member = memberFromRow(rows[0]);
      if (!member.active)
        throw new MembershipError("forbidden", "This membership is inactive.");
      return principalFromMember(member);
    },

    async updateOwnProfile(subject, input) {
      const target = requireSubject(subject, "Member");
      const displayName =
        input.displayName === undefined
          ? null
          : normalizeDisplayName(input.displayName);
      const avatarKey = normalizeAvatarKey(input.avatarKey);
      if (displayName === null && avatarKey === null)
        throw new MembershipError("invalid", "Choose a profile change.");
      const rows = await query<MemberRow>(
        "select * from launchloom_admin.update_profile($1, $2, $3)",
        [target, displayName, avatarKey],
      );
      if (!rows[0])
        throw new MembershipError("not_found", "Member not found.");
      return memberFromRow(rows[0]);
    },

    async changeMember(ownerId, targetId, input) {
      const actor = requireSubject(ownerId, "Owner");
      const target = requireSubject(targetId, "Member");
      if (input.role !== undefined && input.role !== "owner" && input.role !== "admin")
        throw new MembershipError("invalid", "Choose a valid role.");
      if (input.active !== undefined && typeof input.active !== "boolean")
        throw new MembershipError("invalid", "Choose an active state.");
      if (input.role === undefined && input.active === undefined)
        throw new MembershipError("invalid", "Choose a membership change.");
      const rows = await query<MemberRow>(
        "select * from launchloom_admin.change_member($1, $2, $3, $4)",
        [actor, target, input.role ?? null, input.active ?? null],
      );
      if (!rows[0])
        throw new MembershipError(
          "dependency_unavailable",
          "Membership data is temporarily unavailable.",
        );
      return memberFromRow(rows[0]);
    },
  };
}

export function membershipStoreFromEnv(env: {
  ADMIN_DATABASE_URL?: string;
}): MembershipStore {
  const connectionString = env.ADMIN_DATABASE_URL?.trim();
  if (!connectionString)
    throw new MembershipError(
      "dependency_unavailable",
      "Membership storage is not configured.",
    );
  return createMembershipStore(databaseSql(connectionString));
}
