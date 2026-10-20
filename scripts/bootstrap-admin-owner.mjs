#!/usr/bin/env node
/**
 * Confirmed first-owner bootstrap for the private admin membership schema.
 *
 * Dry run is the default and writes nothing. A real run is explicit, refuses
 * when an active owner already exists, and never prints the database URL or an
 * invitation token. This script is the only supported way to create the first
 * owner; there is no open-first-user bootstrap in the app.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const SUBJECT_PATTERN = /^[A-Za-z0-9._:@-]{1,200}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

export class BootstrapError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BootstrapError";
    this.code = code;
  }
}

const USAGE = `Usage:
  node scripts/bootstrap-admin-owner.mjs --subject <auth-subject> --email <verified-email> --name <name> [--confirm] [--database-url-file <path>]

Dry run is the default. --confirm performs the write and refuses if an active
owner already exists. The database URL is read from ADMIN_DATABASE_URL first,
then --database-url-file. No URL or token is printed.`;

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--"))
    throw new BootstrapError("invalid_argument", `${flag} requires a value.`);
  return value;
}

export function parseBootstrapArgs(argv = []) {
  const parsed = {
    subject: "",
    email: "",
    name: "",
    confirm: false,
    databaseUrlFile: "",
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
    if (arg === "--subject") {
      parsed.subject = takeValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--email") {
      parsed.email = takeValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--name") {
      parsed.name = takeValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--database-url-file") {
      parsed.databaseUrlFile = takeValue(argv, index, arg);
      index += 1;
      continue;
    }
    throw new BootstrapError("invalid_argument", `Unknown argument: ${arg}`);
  }
  if (parsed.help) return parsed;

  const subject = parsed.subject.trim();
  const email = parsed.email.trim().toLowerCase();
  const name = parsed.name.trim();
  if (!SUBJECT_PATTERN.test(subject))
    throw new BootstrapError(
      "invalid_subject",
      "--subject must be the provider auth subject (1-200 safe characters).",
    );
  if (!email || email.length > 240 || !EMAIL_PATTERN.test(email))
    throw new BootstrapError("invalid_email", "--email must be a verified email address.");
  if ([...name].length < 1 || [...name].length > 100 || CONTROL_CHARACTERS.test(name))
    throw new BootstrapError("invalid_name", "--name must be 1-100 characters.");
  return { ...parsed, subject, email, name };
}

async function connect(argv, env, sql) {
  if (sql) return sql;
  let connectionString = String(env.ADMIN_DATABASE_URL || "").trim();
  if (!connectionString) {
    const file = parseBootstrapArgs(argv).databaseUrlFile;
    if (!file)
      throw new BootstrapError(
        "missing_database_url",
        "Set ADMIN_DATABASE_URL or pass --database-url-file.",
      );
    try {
      connectionString = (await readFile(file, "utf8")).trim();
    } catch {
      throw new BootstrapError(
        "missing_database_url",
        "The database URL file could not be read.",
      );
    }
  }
  if (!connectionString)
    throw new BootstrapError("missing_database_url", "The database URL is empty.");
  return neon(connectionString);
}

export async function runBootstrap({
  argv = [],
  env = process.env,
  sql: suppliedSql,
  stdout = (line) => process.stdout.write(`${line}\n`),
} = {}) {
  const args = parseBootstrapArgs(argv);
  if (args.help) {
    stdout(USAGE);
    return 0;
  }
  const sql = await connect(argv, env, suppliedSql);
  const owners = await sql.query(
    "select count(*)::int as count from launchloom_admin.members where active and role = 'owner'",
  );
  const ownerCount = Number(owners?.[0]?.count || 0);

  stdout("LaunchLoom admin owner bootstrap");
  stdout(`Mode: ${args.confirm ? "apply" : "dry run"}`);
  stdout(`Subject: ${args.subject}`);
  stdout(`Email: ${args.email}`);
  stdout(`Name: ${args.name}`);
  stdout(`Active owners: ${ownerCount}`);

  if (ownerCount > 0) {
    stdout(
      args.confirm
        ? "Refused: an active owner already exists. Create an enrollment invitation instead."
        : "A confirmed run would refuse: an active owner already exists.",
    );
    if (!args.confirm) stdout("No changes written.");
    return args.confirm ? 1 : 0;
  }
  if (!args.confirm) {
    stdout("No changes written. Re-run with --confirm to bootstrap this owner.");
    return 0;
  }

  try {
    await sql.query(
      "select * from launchloom_admin.bootstrap_owner($1, $2, $3)",
      [args.subject, args.email, args.name],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    stdout(
      /\bowner_exists\b/u.test(message)
        ? "Refused: an active owner already exists. Create an enrollment invitation instead."
        : "Bootstrap failed. Check the private database role and try again.",
    );
    return 1;
  }
  stdout(`Bootstrapped owner ${args.email} (subject ${args.subject}).`);
  stdout("Audit action: owner_bootstrapped.");
  return 0;
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    process.exitCode = await runBootstrap({ argv: process.argv.slice(2) });
  } catch (error) {
    process.stderr.write(
      `${error instanceof BootstrapError ? error.message : "Bootstrap failed."}\n`,
    );
    process.exitCode = 1;
  }
}
