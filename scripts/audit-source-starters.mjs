import { listReferenceTemplateEntries } from "./reference-template.mjs";
import { resolveSourceStarter } from "./source-first-authoring.mjs";

const entries = listReferenceTemplateEntries();
const report = entries.map(({ id, dossierPath }) => {
  const source = resolveSourceStarter({
    id,
    referenceDossier: { id, path: dossierPath },
  });
  return {
    id,
    mode: source.mode,
    reason: source.reason,
    templateDigest: "templateDigest" in source ? source.templateDigest : null,
  };
});
console.log(
  JSON.stringify(
    {
      dossiers: report.length,
      sourceFirst: report.filter((entry) => entry.mode === "source-first")
        .length,
      referenceAuthoring: report.filter(
        (entry) => entry.mode === "reference-authoring",
      ).length,
      entries: report,
    },
    null,
    2,
  ),
);
