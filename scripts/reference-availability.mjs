#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildInspirationPack } from "./inspiration-registry.mjs";

/**
 * Probe whether the production reference library can supply a creative pack
 * for this business kind. Only the known eligibility-shortage error is treated
 * as a fallback signal; registry corruption or an unsupported kind still fails.
 *
 * @param {{industry: string, registry: Record<string, any>, repositoryRoot?: string, requiredRoutes?: number}} input
 */
export function probeCreativeReferences({
  industry,
  registry,
  repositoryRoot = process.cwd(),
  requiredRoutes = 3,
} = {}) {
  if (typeof industry !== "string" || !industry.trim())
    throw new Error("A business kind is required.");
  if (!registry || typeof registry !== "object")
    throw new Error("A reference registry is required.");
  try {
    const pack = buildInspirationPack(
      { seed: "preflight", industry: industry.trim() },
      registry,
      { repositoryRoot },
    );
    return {
      available: true,
      industry,
      routes: Array.isArray(pack.routes) ? pack.routes.length : 0,
      requiredRoutes,
      reason: null,
    };
  } catch (error) {
    const message = String(error?.message || error);
    const match = /has (\d+) eligible dossier\(s\) matched to/u.exec(message);
    if (!match) throw error;
    return {
      available: false,
      industry,
      eligible: Number(match[1]),
      requiredRoutes,
      reason: "reference-shortage",
      detail: message.slice(0, 300),
    };
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "");
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (!["industry", "registry", "root", "required-routes"].includes(key))
      throw new Error(`Unknown option: ${token}`);
    const value = String(argv[index + 1] || "");
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${token}`);
    args[key] = value;
    index += 1;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.industry) throw new Error("--industry is required.");
  const root = path.resolve(args.root || process.cwd());
  const registryPath = path.resolve(
    args.registry || path.join(root, "data/inspiration-registry.json"),
  );
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const result = probeCreativeReferences({
    industry: args.industry,
    registry,
    repositoryRoot: root,
    requiredRoutes: Number.parseInt(args["required-routes"] || "3", 10) || 3,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
