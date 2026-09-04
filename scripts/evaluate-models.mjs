import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { generateSiteConfigWithModel } from "./generate-site-config.mjs";
import {
  applyOperation,
  deterministicOperations,
  modelOperations,
} from "./revision-engine.mjs";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, index, all) =>
        index % 2 === 0
          ? [...pairs, [value.replace(/^--/, ""), all[index + 1]]]
          : pairs,
      [],
    ),
);
const fixturesPath = args.fixtures || "fixtures/model-evaluation.json";
const outputPath = args.out || "artifacts/model-evaluation.json";
const models = ["z-ai/glm-5.3-flash", "z-ai/glm-5.3"];
const fixtures = JSON.parse(await fs.readFile(fixturesPath, "utf8"));
if (!process.env.OPENROUTER_API_KEY)
  throw new Error("OPENROUTER_API_KEY is required for the model evaluation.");

async function candidate(fixture, model) {
  if (fixture.kind === "initial")
    return generateSiteConfigWithModel(fixture.input, model);
  const draft = structuredClone(fixture.config);
  let operations = deterministicOperations(fixture.feedback, draft);
  if (!operations.length)
    operations = await modelOperations(fixture.feedback, draft, model);
  return {
    operations,
    applied: operations.filter((operation) => applyOperation(draft, operation)),
    config: draft,
  };
}

const results = [];
for (const fixture of fixtures) {
  const [first, second] = await Promise.all(
    models.map((model) => candidate(fixture, model)),
  );
  const flip = createHash("sha256").update(fixture.id).digest()[0] % 2 === 1;
  results.push({
    fixture: fixture.id,
    kind: fixture.kind,
    feedback: fixture.feedback || null,
    candidates: flip
      ? [
          { label: "A", value: second },
          { label: "B", value: first },
        ]
      : [
          { label: "A", value: first },
          { label: "B", value: second },
        ],
    modelMap: flip
      ? { A: models[1], B: models[0] }
      : { A: models[0], B: models[1] },
  });
}
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`);
const worksheet = results
  .map(
    (result) =>
      `## ${result.fixture}\n\nScore A and B from 1–5 for request fidelity, truthfulness, conversion usefulness, and visual coherence. Reject any fabricated proof, missed requested operation, or unrelated destructive change.\n\n### Candidate A\n\n\`\`\`json\n${JSON.stringify(result.candidates[0].value, null, 2)}\n\`\`\`\n\n### Candidate B\n\n\`\`\`json\n${JSON.stringify(result.candidates[1].value, null, 2)}\n\`\`\``,
  )
  .join("\n\n");
await fs.writeFile(`${outputPath}.md`, `${worksheet}\n`);
console.log(`model_evaluation_written=${outputPath}`);
