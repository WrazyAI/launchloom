import fs from "node:fs/promises";
import path from "node:path";
import {
  defaultHistoryPath,
  launchRecordFrom,
  recordLaunch,
} from "./launch-history.mjs";

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2)
    result[values[index].replace(/^--/u, "")] = values[index + 1];
  return result;
}

async function readJson(file) {
  if (!file) return undefined;
  try {
    return JSON.parse(await fs.readFile(path.resolve(file), "utf8"));
  } catch {
    return undefined;
  }
}

const args = parseArgs(process.argv.slice(2));
if (!args.config) throw new Error("--config is required.");
const config = await readJson(args.config);
if (!config) throw new Error(`Could not read config at ${args.config}.`);
const inspiration = await readJson(args.inspiration);
const historyPath = path.resolve(args.history || defaultHistoryPath());
const entry = launchRecordFrom({
  config,
  inspiration,
  launchedAt: args["launched-at"] || new Date().toISOString(),
});
const history = await recordLaunch(entry, historyPath);
console.log(`launch_recorded=${entry.id}`);
console.log(`launch_pack=${entry.packId}:${entry.variantId}`);
console.log(`launch_history=${historyPath} total=${history.launches.length}`);
