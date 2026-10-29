#!/usr/bin/env node
/**
 * Public launch-history sanitizer.
 *
 * New-mode generation writes a rotation record to the public LaunchLoom history
 * file. The record needs pack/route identity but not the client's business name.
 * Legacy mode passes the original config unchanged.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLIC_LAUNCH_BUSINESS_NAME = "LaunchLoom client";

export function sanitizePublicLaunchConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new Error("Launch config must be an object.");
  // Only the generic label is needed for the public rotation record. Drop every
  // other business field so the temporary config cannot carry contact data.
  return { ...config, business: { name: PUBLIC_LAUNCH_BUSINESS_NAME } };
}

export async function writeSanitizedPublicLaunchConfig(input, output) {
  const config = JSON.parse(await fs.readFile(path.resolve(input), "utf8"));
  await fs.writeFile(
    path.resolve(output),
    JSON.stringify(sanitizePublicLaunchConfig(config)),
    { mode: 0o600 },
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error("Usage: public-launch-config.mjs <input.json> <output.json>");
    process.exitCode = 2;
  } else {
    await writeSanitizedPublicLaunchConfig(input, output);
  }
}
