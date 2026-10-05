import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fictionalPipelineDemoNotice } from "./synthetic-demo-notice.mjs";

/** @param {string} body @param {{enabled?: boolean, previewOnly?: boolean, reuseCandidates?: boolean, recipient?: string, reusedCandidate?: {config: any, brief: any} | null}} options */
export function prepareInternalQaIntake(
  body,
  {
    enabled = false,
    previewOnly = false,
    reuseCandidates = false,
    recipient = "",
    reusedCandidate = null,
  } = {},
) {
  if (!enabled) return body;
  if (!previewOnly)
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
  if (reuseCandidates) {
    const config = reusedCandidate?.config,
      brief = reusedCandidate?.brief;
    if (
      config?.demoNotice !== "Fictional pipeline demo" ||
      brief?.demoNotice !== "Fictional pipeline demo" ||
      config?.business?.name !== intake.businessName ||
      brief?.businessTruth?.name !== intake.businessName ||
      brief?.submissionId !== intake.submissionId ||
      ![
        config?.business?.email,
        config?.business?.leadEmail,
        brief?.businessTruth?.previewEmail,
        brief?.businessTruth?.leadEmail,
      ].every((value) => value === email)
    )
      throw new Error(
        "Frozen fictional QA identity and saved recipient must match; recovery never retargets an existing site.",
      );
  }
  const updated = { ...intake, email, leadEmail: email };
  return body.replace(
    blocks[0][0],
    "```json\n" + JSON.stringify(updated, null, 2) + "\n```",
  );
}

/** Experiments cannot run on a real client or an unproven candidate reuse. */
export function assertQaRepairExperiment(experiment, options = {}) {
  if (!experiment) return;
  if (!options.enabled || !options.previewOnly || !options.reuseCandidates)
    throw new Error("QA repair experiment requires verified preview-only frozen QA reuse.");
  const { config, brief } = options.reusedCandidate || {};
  if (config?.demoNotice !== "Fictional pipeline demo" || brief?.demoNotice !== "Fictional pipeline demo" ||
      config?.business?.name !== brief?.businessTruth?.name || !String(brief?.submissionId || "").startsWith("demo-") ||
      ![config?.business?.email, config?.business?.leadEmail, brief?.businessTruth?.previewEmail, brief?.businessTruth?.leadEmail]
        .every(value => value === options.recipient))
    throw new Error("QA repair experiment frozen identity and recipient are not verified.");
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const source = process.argv[2];
  if (!source) throw new Error("Provide the private intake source path.");
  const original = await fs.readFile(source, "utf8");
  const reuseCandidates = process.env.REUSE_AUTHORED_CANDIDATES === "true";
  let reusedCandidate = null;
  if (
    process.env.INTERNAL_QA_DELIVERY === "true" &&
    reuseCandidates &&
    process.argv[3]
  ) {
    const directory = path.resolve(process.argv[3]);
    reusedCandidate = {
      config: JSON.parse(
        await fs.readFile(path.join(directory, "src/site.config.json"), "utf8"),
      ),
      brief: JSON.parse(
        await fs.readFile(
          path.join(directory, ".launchloom/canonical-site-brief.json"),
          "utf8",
        ),
      ),
    };
  }
  assertQaRepairExperiment(process.env.QA_REPAIR_EXPERIMENT === "true", {
    enabled: process.env.INTERNAL_QA_DELIVERY === "true",
    previewOnly: process.env.PREVIEW_ONLY === "true", reuseCandidates, reusedCandidate,
    recipient: (process.env.LAUNCHLOOM_INTERNAL_QA_RECIPIENT || "").trim().toLowerCase(),
  });
  const updated = prepareInternalQaIntake(original, {
    enabled: process.env.INTERNAL_QA_DELIVERY === "true",
    previewOnly: process.env.PREVIEW_ONLY === "true",
    reuseCandidates,
    reusedCandidate,
    recipient: process.env.LAUNCHLOOM_INTERNAL_QA_RECIPIENT || "",
  });
  if (updated !== original)
    await fs.writeFile(source, updated, { mode: 0o600 });
  console.log(`internal_qa_intake_routed=${updated !== original}`);
}
