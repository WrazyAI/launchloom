import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { approve, MAX_MANIFEST } from "./scope.mjs";

try {
  const [file] = process.argv.slice(2);
  if (!file) throw new Error("usage: node approve.mjs <manifest.json>");
  const handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > MAX_MANIFEST) throw new Error("invalid manifest file");
    const bytes = Buffer.alloc(MAX_MANIFEST + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > MAX_MANIFEST) throw new Error("manifest too large");
    const digest = createHash("sha256").update(bytes.subarray(0, bytesRead)).digest("hex");
    const manifest = JSON.parse(bytes.subarray(0, bytesRead).toString("utf8"));
    const scenarios = Object.keys(manifest.scenarios ?? {});
    for (const scenario of scenarios) approve(bytes.subarray(0, bytesRead), digest, scenario);
    console.log(JSON.stringify({ digest, origin: manifest.origin, scenarios }));
  } finally {
    await handle.close();
  }
} catch (error) {
  console.error(`Approval refused: ${error.message}`);
  process.exitCode = 1;
}
