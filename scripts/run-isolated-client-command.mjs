import fs from "node:fs/promises";
import path from "node:path";
import { runClientProcess } from "./client-build-environment.mjs";

const separator = process.argv.indexOf("--");
if (separator < 0) throw new Error("Provide client arguments after `--`.");

const options = { writable: [], env: {} };
const rawOptions = process.argv.slice(2, separator);
for (let index = 0; index < rawOptions.length; index += 1) {
  const item = rawOptions[index];
  if (!item.startsWith("--"))
    throw new Error(`Invalid client-command option: ${item}`);
  const separatorIndex = item.indexOf("=");
  const key = item
    .slice(2, separatorIndex < 0 ? undefined : separatorIndex)
    .replace(/^--/u, "");
  const value =
    separatorIndex < 0 ? rawOptions[++index] : item.slice(separatorIndex + 1);
  if (typeof value !== "string")
    throw new Error(`Missing value for client-command option: ${key}`);
  if (key === "writable") options.writable.push(value);
  else if (key.startsWith("env.")) options.env[key.slice(4)] = value;
  else if (key === "cwd") options.cwd = value;
  else if (key === "diagnostic-output") options.diagnosticOutput = value;
  else throw new Error(`Unknown client-command option: ${key}`);
}

const [command, ...args] = process.argv.slice(separator + 1);
if (!options.cwd || !command || !options.writable.length)
  throw new Error("Client command requires --cwd, --writable, and a command.");
try {
  await runClientProcess({
    command,
    args,
    cwd: options.cwd,
    writablePaths: options.writable,
    envOverrides: options.env,
  });
} catch (error) {
  const diagnostic = error?.clientProcessDiagnostic;
  if (options.diagnosticOutput && diagnostic) {
    const receiptPath = path.resolve(options.diagnosticOutput);
    await fs.mkdir(path.dirname(receiptPath), { recursive: true, mode: 0o700 });
    await fs.writeFile(
      receiptPath,
      `${JSON.stringify({ version: 1, command: diagnostic }, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
  }
  throw error;
}
