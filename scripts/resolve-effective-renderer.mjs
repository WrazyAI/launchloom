#!/usr/bin/env node
import { pathToFileURL } from "node:url";

const RENDERERS = new Set(["creative", "pack", "foundation"]);
const FULL_PROFILES = new Set(["full", "full-preview"]);

/**
 * Choose the renderer that can actually build for this run.
 *
 * Creative keeps priority when production references are available. A full
 * profile with a reference shortage degrades to pack, then foundation. Focused
 * profiles never silently switch renderers because their report contract is
 * renderer-specific.
 *
 * @param {{
 *   requested?: string,
 *   profile?: string,
 *   creativeReferencesAvailable?: boolean,
 *   packId?: string,
 *   packVariant?: string,
 *   foundationId?: string,
 * }} [input]
 */
export function resolveEffectiveRenderer({
  requested = "creative",
  profile = "full",
  creativeReferencesAvailable = true,
  packId = "",
  packVariant = "",
  foundationId = "",
} = {}) {
  const base = {
    requested,
    profile,
    effective: null,
    degraded: false,
    reason: "",
    packId: packId || "",
    packVariant: packVariant || "",
    foundationId: foundationId || "",
  };
  if (!RENDERERS.has(requested))
    return { ...base, effective: null, degraded: true, reason: "unknown-renderer" };
  const focused = !FULL_PROFILES.has(profile);

  if (requested === "creative") {
    if (creativeReferencesAvailable)
      return {
        ...base,
        effective: "creative",
        reason: "creative-references-available",
      };
    if (focused)
      return {
        ...base,
        effective: null,
        degraded: true,
        reason: "focused-profile-needs-references",
      };
    if (packId)
      return {
        ...base,
        effective: "pack",
        degraded: true,
        reason: "creative-reference-shortage",
      };
    if (foundationId)
      return {
        ...base,
        effective: "foundation",
        degraded: true,
        reason: "creative-reference-shortage",
      };
    return { ...base, effective: null, degraded: true, reason: "no-renderer" };
  }

  if (requested === "pack") {
    if (packId) return { ...base, effective: "pack", reason: "pack-requested" };
    if (focused)
      return {
        ...base,
        effective: null,
        degraded: true,
        reason: "focused-profile-needs-pack",
      };
    if (foundationId)
      return {
        ...base,
        effective: "foundation",
        degraded: true,
        reason: "pack-unavailable",
      };
    return { ...base, effective: null, degraded: true, reason: "no-renderer" };
  }

  if (foundationId)
    return { ...base, effective: "foundation", reason: "foundation-requested" };
  return {
    ...base,
    effective: null,
    degraded: true,
    reason: "foundation-unavailable",
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "");
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (![
      "requested",
      "profile",
      "creative-references-available",
      "pack",
      "variant",
      "foundation",
    ].includes(key))
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
  const decision = resolveEffectiveRenderer({
    requested: args.requested || "creative",
    profile: args.profile || "full",
    creativeReferencesAvailable:
      args["creative-references-available"] !== "false",
    packId: args.pack || "",
    packVariant: args.variant || "",
    foundationId: args.foundation || "",
  });
  console.log(JSON.stringify(decision, null, 2));
  if (!decision.effective) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
