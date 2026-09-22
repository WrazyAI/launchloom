import fs from "node:fs/promises";
import path from "node:path";

export function failureSummary(failure = {}) {
  const { draft, ...summary } = failure;
  return {
    ...summary,
    draftPath: /^candidate-[a-z]+$/u.test(draft?.candidateId || "")
      ? `failed-candidates/${draft.candidateId}`
      : null,
  };
}

export async function writeFailedCandidateDrafts(root, failures = []) {
  for (const failure of failures) {
    const draft = failure?.draft;
    if (!/^candidate-[a-z]+$/u.test(draft?.candidateId || "")) continue;
    const directory = path.join(root, "failed-candidates", draft.candidateId);
    await fs.mkdir(directory, { recursive: true });
    const details = { ...draft };
    delete details.experience;
    delete details.styles;
    delete details.motion;
    await fs.writeFile(
      path.join(directory, "failure.json"),
      `${JSON.stringify({ ...details, failure: failureSummary(failure) }, null, 2)}\n`,
    );
    for (const [name, content] of [
      ["Experience.jsx", draft.experience],
      ["styles.css", draft.styles],
      ["motion.js", draft.motion],
    ]) {
      if (typeof content === "string" && content.trim())
        await fs.writeFile(path.join(directory, name), `${content.trim()}\n`);
    }
  }
}
