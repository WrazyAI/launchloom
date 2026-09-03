import fs from "node:fs/promises";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 === 0 ? [...pairs, [value.replace(/^--/, ""), all[index + 1]]] : pairs, []));
const path = args.file;
if (!path) throw new Error("--file is required.");
const config = JSON.parse(await fs.readFile(path, "utf8"));
const assets = args.assets ? JSON.parse(args.assets) : undefined;
if (assets && typeof assets === "object") {
  config.assets = assets;
  if (typeof assets.photoOne === "string") config.images.hero = assets.photoOne;
  if (typeof assets.photoTwo === "string") config.images.secondary = assets.photoTwo;
}
if (args.api && args.leadToken) config.lead = { apiUrl: args.api.replace(/\/$/, ""), token: args.leadToken };
await fs.writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
