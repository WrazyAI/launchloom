import fs from "node:fs";
import { fileURLToPath } from "node:url";

export function repositoryBootstrapState(remoteRefs) {
  const refs = new Set(
    String(remoteRefs || "")
      .split("\n")
      .map((line) => line.trim().split(/\s+/).at(-1))
      .filter(Boolean),
  );
  if (refs.has("refs/heads/review/initial")) return "review";
  if (refs.has("refs/heads/main")) return "main";
  return "empty";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(repositoryBootstrapState(fs.readFileSync(0, "utf8")));
}
