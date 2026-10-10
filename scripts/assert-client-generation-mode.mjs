import fs from "node:fs/promises";
import { assertGenerationMode } from "./pipeline-test-policy.mjs";
import { fictionalPipelineDemoNotice } from "./synthetic-demo-notice.mjs";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, index, all) =>
        index % 2 === 0
          ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]]
          : pairs,
      [],
    ),
);
const profile = args.profile || "full";
if (Boolean(args.config) === Boolean(args.intake))
  throw new Error("Provide exactly one of --config or --intake.");

let config;
if (args.config) {
  config = JSON.parse(await fs.readFile(args.config, "utf8"));
} else {
  const source = await fs.readFile(args.intake, "utf8");
  const blocks = [...source.matchAll(/```json\s*([\s\S]*?)```/giu)];
  if (blocks.length > 1)
    throw new Error("Intake mode guard found multiple JSON blocks.");
  const intake = blocks[0] ? JSON.parse(blocks[0][1]) : {};
  const demoNotice = fictionalPipelineDemoNotice(intake);
  config = demoNotice ? { demoNotice } : {};
}

const result = assertGenerationMode(config, { profile });
console.log(
  `generation_profile=${result.profile} test_only=${result.testOnly}`,
);
