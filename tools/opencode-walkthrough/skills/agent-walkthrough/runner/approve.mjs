import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, writeFile } from "node:fs/promises";
import { approve, MAX_MANIFEST } from "./scope.mjs";

try {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) throw new Error("usage: node approve.mjs <manifest.json> [--out <approval.json>]");
  let output = `${file}.approval.json`;
  if (rest.length === 2 && rest[0] === "--out") output = rest[1];
  else if (rest.length) throw new Error("usage: node approve.mjs <manifest.json> [--out <approval.json>]");
  const handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > MAX_MANIFEST) throw new Error("invalid manifest file");
    const bytes = Buffer.alloc(MAX_MANIFEST + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > MAX_MANIFEST) throw new Error("manifest too large");
    const input = bytes.subarray(0, bytesRead);
    const digest = createHash("sha256").update(input).digest("hex");
    const manifest = JSON.parse(input.toString("utf8"));
    const scenarios = Object.keys(manifest.scenarios ?? {});
    if (!scenarios.length) throw new Error("at least one scenario is required");
    for (const scenario of scenarios) approve(input, digest, scenario);
    const approval = { digest, manifest, scenarios };
    await writeFile(output, JSON.stringify(approval, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ digest, origin: manifest.origin, scenarios }));
  } finally {
    await handle.close();
  }
} catch (error) {
  console.error(`Approval refused: ${error.message}`);
  process.exitCode = 1;
}
