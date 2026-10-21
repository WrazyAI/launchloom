#!/usr/bin/env node
/**
 * Bounded, operator-run enrollment invitation for one verified allowlisted
 * admin email. Dry run is the default. A confirmed run writes the copy-once
 * link to a new mode-0600 file and never prints the token, hash or database URL.
 * This script sends no mail and creates no other account.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const SUBJECT_PATTERN = /^[A-Za-z0-9._:@-]{1,200}$/u;
const TTL_MS = 72 * 60 * 60 * 1000;

export class InviteError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "InviteError";
    this.code = code;
  }
}

const USAGE = `Usage:
  node scripts/invite-admin.mjs --owner-subject <owner-subject> --email <verified-email> --out <private-file> --origin <https-origin> [--confirm] [--database-url-file <path>]

Dry run is the default (--dry-run is accepted explicitly). --confirm creates one
72-hour, one-use enrollment and writes the copy-once URL to a new mode-0600 file.
It refuses to overwrite an existing file. The database URL is read from
ADMIN_DATABASE_URL first, then --database-url-file. The origin is read from
--origin first, then ADMIN_PUBLIC_ORIGIN; it must be an HTTPS origin (localhost
HTTP is allowed only for local development). No token, hash or URL is printed to
stdout. No email is sent.`;

function normalizeOrigin(value) {
  const text = String(value || "").trim().replace(/\/$/u, "");
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new InviteError(
      "missing_origin",
      "Set --origin or ADMIN_PUBLIC_ORIGIN to the admin workspace origin.",
    );
  }
  const local =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (!local && url.protocol !== "https:")
    throw new InviteError("missing_origin", "The admin origin must use HTTPS.");
  if (
    url.origin !== text ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new InviteError(
      "missing_origin",
      "The admin origin must be a bare HTTPS origin without a path.",
    );
  return url.origin;
}

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--"))
    throw new InviteError("invalid_argument", `${flag} requires a value.`);
  return value;
}

export function parseInviteArgs(argv = []) {
  const parsed = {
    ownerSubject: "",
    email: "",
    out: "",
    confirm: false,
    dryRun: false,
    databaseUrlFile: "",
    origin: "",
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--confirm") {
      parsed.confirm = true;
      continue;
    }
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg === "--owner-subject") {
      parsed.ownerSubject = takeValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--email") {
      parsed.email = takeValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--out") {
      parsed.out = takeValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--database-url-file") {
      parsed.databaseUrlFile = takeValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--origin") {
      parsed.origin = takeValue(argv, index, arg);
      index += 1;
      continue;
    }
    throw new InviteError("invalid_argument", `Unknown argument: ${arg}`);
  }
  if (parsed.help) return parsed;
  if (parsed.confirm && parsed.dryRun)
    throw new InviteError(
      "invalid_argument",
      "--confirm and --dry-run cannot be combined.",
    );

  const ownerSubject = parsed.ownerSubject.trim();
  const email = parsed.email.trim().toLowerCase();
  const out = parsed.out.trim();
  if (!SUBJECT_PATTERN.test(ownerSubject))
    throw new InviteError(
      "invalid_owner",
      "--owner-subject must be an active owner's provider subject.",
    );
  if (!email || email.length > 240 || !EMAIL_PATTERN.test(email))
    throw new InviteError("invalid_email", "--email must be a verified email address.");
  if (parsed.confirm && !out)
    throw new InviteError(
      "missing_out",
      "--out is required with --confirm so the copy-once link is not printed.",
    );
  return { ...parsed, ownerSubject, email, out };
}

async function connect(args, env, sql) {
  if (sql) return sql;
  let connectionString = String(env.ADMIN_DATABASE_URL || "").trim();
  if (!connectionString) {
    if (!args.databaseUrlFile)
      throw new InviteError(
        "missing_database_url",
        "Set ADMIN_DATABASE_URL or pass --database-url-file.",
      );
    try {
      connectionString = (await readFile(args.databaseUrlFile, "utf8")).trim();
    } catch {
      throw new InviteError(
        "missing_database_url",
        "The database URL file could not be read.",
      );
    }
  }
  if (!connectionString)
    throw new InviteError("missing_database_url", "The database URL is empty.");
  return neon(connectionString);
}

export async function runInvite({
  argv = [],
  env = process.env,
  sql: suppliedSql,
  stdout = (line) => process.stdout.write(`${line}\n`),
} = {}) {
  const args = parseInviteArgs(argv);
  if (args.help) {
    stdout(USAGE);
    return 0;
  }
  const origin = normalizeOrigin(args.origin || env.ADMIN_PUBLIC_ORIGIN);
  const sql = await connect(args, env, suppliedSql);
  const owners = await sql.query(
    `select subject from launchloom_admin.members
     where subject = $1 and active and role = 'owner'`,
    [args.ownerSubject],
  );
  if (!owners?.[0])
    throw new InviteError(
      "owner_not_found",
      "The requested actor is not an active owner.",
    );

  stdout("LaunchLoom admin enrollment invitation");
  stdout(`Mode: ${args.confirm ? "apply" : "dry run"}`);
  stdout(`Owner: ${args.ownerSubject}`);
  stdout(`Invitee: ${args.email}`);
  stdout(`Origin: ${origin}`);
  stdout(`Output file: ${args.out || "(not set)"}`);
  if (!args.confirm) {
    stdout("No token generated and no changes written.");
    return 0;
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + TTL_MS);
  const url = `${origin}/admin/login#enroll=${encodeURIComponent(token)}`;
  try {
    await writeFile(args.out, `${url}\n`, { mode: 0o600, flag: "wx" });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST")
      throw new InviteError(
        "output_exists",
        "The output file already exists; choose a new private path.",
      );
    throw new InviteError("output_failed", "The copy-once link could not be written.");
  }

  try {
    const rows = await sql.query(
      "select launchloom_admin.create_enrollment($1, $2, $3, $4) as id",
      [args.email, tokenHash, args.ownerSubject, expiresAt.toISOString()],
    );
    if (!rows?.[0]?.id)
      throw new Error("enrollment missing");
    stdout(`Enrollment created: ${rows[0].id}`);
    stdout(`Expires: ${expiresAt.toISOString()}`);
    stdout(`Copy-once link written to ${args.out} (mode 0600; not printed).`);
    return 0;
  } catch (error) {
    await unlink(args.out).catch(() => {});
    const message = error instanceof Error ? error.message : "";
    if (/\bforbidden\b/u.test(message))
      throw new InviteError("forbidden", "The owner is no longer authorized.");
    throw new InviteError("invite_failed", "The enrollment could not be created.");
  }
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    process.exitCode = await runInvite({ argv: process.argv.slice(2) });
  } catch (error) {
    process.stderr.write(
      `${error instanceof InviteError ? error.message : "Invitation failed."}\n`,
    );
    process.exitCode = 1;
  }
}
