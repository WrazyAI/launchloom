import fs from "node:fs/promises";
import path from "node:path";
import {
  createReasoningPreflight,
  DEFAULT_PREFLIGHT_MODE,
} from "./reasoning-preflight-lib.mjs";

function cliArgs(argv) {
  return Object.fromEntries(
    argv.slice(2).reduce(
      (pairs, value, index, all) =>
        index % 2 === 0
          ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]]
          : pairs,
      [],
    ),
  );
}

export async function runReasoningPreflight({
  inspirationPath = ".launchloom/inspiration-pack.json",
  outPath = ".launchloom/reasoning-preflight.json",
  mode = process.env.REASONING_PREFLIGHT_MODE || DEFAULT_PREFLIGHT_MODE,
  model = process.env.REASONING_PREFLIGHT_MODEL,
  creativeModel =
    process.env.CREATIVE_EXPERIENCE_MODEL || "openai/gpt-6-luna",
  sessionKey = process.env.LAUNCHLOOM_INTAKE_ID || "",
  apiKey = process.env.TYPESAFE_API_KEY,
  fetchImpl = fetch,
  timeoutMs,
} = {}) {
  const inspirationPack = JSON.parse(
    await fs.readFile(path.resolve(inspirationPath), "utf8"),
  );
  const result = await createReasoningPreflight({
    inspirationPack,
    mode,
    model,
    creativeModel,
    sessionKey,
    apiKey,
    fetchImpl,
    timeoutMs,
  });
  const resolvedOut = path.resolve(outPath);
  await fs.mkdir(path.dirname(resolvedOut), { recursive: true });
  await fs.writeFile(resolvedOut, `${JSON.stringify(result, null, 2)}\n`);
  return { ...result, outPath: resolvedOut };
}

async function main() {
  const args = cliArgs(process.argv);
  const result = await runReasoningPreflight({
    inspirationPath:
      args.inspiration || ".launchloom/inspiration-pack.json",
    outPath: args.out || ".launchloom/reasoning-preflight.json",
    mode:
      args.mode ||
      process.env.REASONING_PREFLIGHT_MODE ||
      DEFAULT_PREFLIGHT_MODE,
    model: args.model || process.env.REASONING_PREFLIGHT_MODEL,
    creativeModel:
      args["creative-model"] ||
      process.env.CREATIVE_EXPERIENCE_MODEL ||
      "openai/gpt-6-luna",
    sessionKey:
      args["session-key"] ||
      process.env.LAUNCHLOOM_INTAKE_ID ||
      process.env.GITHUB_RUN_ID ||
      "local",
    apiKey: process.env.TYPESAFE_API_KEY,
    timeoutMs:
      args["timeout-ms"] ||
      process.env.REASONING_PREFLIGHT_TIMEOUT_MS,
  });
  console.log(
    JSON.stringify({
      reasoningPreflight: result.outPath,
      mode: result.mode,
      reasoningEffort: result.reasoningEffort,
      recommendedEffort: result.recommendedEffort,
      fallbackUsed: result.selector.fallbackUsed,
      selectorModel: result.selectorModelVersion,
      creativeModel: result.creativeModel,
      selectorLatencyMs: result.selector.latencyMs,
      selectorCostUsd:
        result.selector.usage?.costUsd ??
        result.selector.usage?.estimatedCostUsd ??
        null,
      reasonCodes: result.decision.reasonCodes,
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
