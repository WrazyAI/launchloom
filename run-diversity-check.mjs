import fs from "node:fs";
import { evaluateRenderedDiversity } from "./scripts/rendered-reference-fidelity.mjs";
const env = { ...process.env };
for (const line of fs.readFileSync("/home/maigreeks/projects/launchloom/.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!env[m[1]]) env[m[1]] = v;
}
process.env.OPENCODE_GO_API_KEY = env.OPENCODE_GO_API_KEY;
process.env.CREATIVE_EXPERIENCE_PROVIDER = "opencode-go";
const base = "/tmp/opencode/qa-185-fresh/.launchloom/creative-repair/round-00/screenshots";
const result = await evaluateRenderedDiversity({
  candidates: [
    { candidateId: "candidate-a", desktop: `${base}/candidate-a-desktop-viewport.png`, mobile: `${base}/candidate-a-mobile-viewport.png` },
    { candidateId: "candidate-b", desktop: `${base}/candidate-b-desktop-viewport.png`, mobile: `${base}/candidate-b-mobile-viewport.png` },
  ],
});
console.log(JSON.stringify({ pass: result.pass, score: result.score, minimumPairDistance: result.minimumPairDistance, provider: result.provider, attempts: result.attempts, audit: result.audit }, null, 2));
