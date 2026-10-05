import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fictionalPipelineDemoNotice } from "./synthetic-demo-notice.mjs";

export function prepareInternalQaIntake(
  body,
  {
    enabled = false,
    previewOnly = false,
    reuseCandidates = false,
    recipient = "",
  } = {},
) {
  if (!enabled) return body;
  if (!previewOnly || reuseCandidates)
    throw new Error(
      "Internal QA routing requires a fresh preview-only canary.",
    );
  const email = recipient.trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/u.test(email)
  )
    throw new Error("Internal QA requires one valid recipient.");
  const blocks = [...body.matchAll(/```json\s*([\s\S]*?)```/giu)];
  if (blocks.length !== 1)
    throw new Error("Internal QA requires one intake JSON block.");
  const intake = JSON.parse(blocks[0][1]);
  if (fictionalPipelineDemoNotice(intake) !== "Fictional pipeline demo")
    throw new Error(
      "Internal QA routing is restricted to an explicitly fictional intake.",
    );
  const updated = { ...intake, email, leadEmail: email };
  return body.replace(
    blocks[0][0],
    "```json\n" + JSON.stringify(updated, null, 2) + "\n```",
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const source = process.argv[2];
  if (!source) throw new Error("Provide the private intake source path.");
  const original = await fs.readFile(source, "utf8");
  const updated = prepareInternalQaIntake(original, {
    enabled: process.env.INTERNAL_QA_DELIVERY === "true",
    previewOnly: process.env.PREVIEW_ONLY === "true",
    reuseCandidates: process.env.REUSE_AUTHORED_CANDIDATES === "true",
    recipient: process.env.LAUNCHLOOM_INTERNAL_QA_RECIPIENT || "",
  });
  if (updated !== original)
    await fs.writeFile(source, updated, { mode: 0o600 });
  console.log(`internal_qa_intake_routed=${updated !== original}`);
}
