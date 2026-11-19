import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { parseHTML } from "linkedom";
import { canonicalBusinessKind } from "./business-kind.mjs";

const renderers = new Set(["creative", "pack", "foundation"]);
const previewKinds = new Set(["reviewable", "diagnostic"]);
const fallbackReasons = new Set([
  "creative-reference-shortage",
  "creative-authoring-or-render-failure",
]);
const id = (value) =>
  typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,119}$/u.test(value)
    ? value
    : null;
const fingerprint = (value) =>
  typeof value === "string" && /^[a-z0-9][a-z0-9|:/_-]{0,1023}$/iu.test(value)
    ? value
    : null;

async function main() {
  const [
    dir,
    requestedRenderer,
    renderedRenderer,
    preview,
    fallbackReason,
    readback,
  ] = process.argv.slice(2);
  if (
    !dir ||
    !renderers.has(requestedRenderer) ||
    !renderers.has(renderedRenderer) ||
    !previewKinds.has(preview)
  )
    throw new Error("Invalid preview design receipt arguments.");
  const read = (file) => fs.readFile(path.join(dir, file), "utf8");
  const [html, inspiration, collection] = await Promise.all([
    read("dist/index.html"),
    read(".launchloom/inspiration-pack.json").then(JSON.parse),
    fs
      .readFile(
        new URL(
          "../data/reference-library/core-collection.json",
          import.meta.url,
        ),
        "utf8",
      )
      .then(JSON.parse),
  ]);
  if (readback !== "protected-build") {
    const servedDigest = (await fs.readFile(readback, "utf8")).trim();
    if (servedDigest !== createHash("sha256").update(html).digest("hex"))
      throw new Error("Preview did not serve the uploaded homepage.");
  } else if (preview !== "diagnostic" || renderedRenderer !== "creative") {
    throw new Error(
      "Protected-build evidence is only valid for creative diagnostics.",
    );
  }
  const { document } = parseHTML(html);
  const proposedDossierIds = (inspiration.referenceLibrary?.recordIds || [])
    .map(id)
    .filter(Boolean)
    .slice(0, 3);
  const selectionStatus = inspiration.referenceLibrary?.status;
  const businessKind = canonicalBusinessKind(inspiration.request?.industry);
  const receipt = {
    version: 1,
    requestedRenderer,
    renderedRenderer,
    preview,
    businessKind: collection.niches.some(
      (niche) => niche.businessKind === businessKind,
    )
      ? businessKind
      : null,
    evidence:
      readback === "protected-build"
        ? "protected-build"
        : "live-homepage-match",
    referenceSelection: ["selected", "skipped", "reference-shortage"].includes(
      selectionStatus,
    )
      ? selectionStatus
      : proposedDossierIds.length
        ? "selected"
        : "unknown",
    proposedDossierIds,
    usedDossierId: null,
    candidateId: null,
    packId: null,
    layoutFingerprint: null,
    fallbackReason: fallbackReasons.has(fallbackReason) ? fallbackReason : null,
  };
  if (renderedRenderer === "creative") {
    const host = document.querySelector('[data-creative-host="true"]');
    const candidateId = id(host?.getAttribute("data-creative-candidate"));
    const recovery =
      readback === "protected-build"
        ? await read(".launchloom/creative-recovery.json").then(JSON.parse)
        : null;
    if (
      recovery &&
      (!recovery.diagnosticPreviewEligible ||
        !/^round-\d+$/u.test(recovery.round) ||
        host?.getAttribute("data-creative-diagnostic") !== "true")
    )
      throw new Error("Invalid protected creative diagnostic evidence.");
    const bakeoff = await read(
      recovery
        ? `.launchloom/creative-repair/${recovery.round}/creative-bakeoff.json`
        : ".launchloom/creative-bakeoff.json",
    ).then(JSON.parse);
    const candidate = bakeoff.candidates.find(
      (item) => item.candidateId === candidateId,
    );
    if (
      !candidateId ||
      (recovery?.candidateId ?? bakeoff.selectedCandidateId) !== candidateId ||
      !candidate
    )
      throw new Error(
        "Rendered creative candidate does not match the selected candidate.",
      );
    const usedDossierId = id(candidate.referenceDossierId);
    if (!usedDossierId || !proposedDossierIds.includes(usedDossierId))
      throw new Error(
        "Rendered creative candidate has no binding to a selected dossier.",
      );
    receipt.candidateId = candidateId;
    receipt.usedDossierId = usedDossierId;
    receipt.layoutFingerprint = fingerprint(candidate.fingerprint);
  } else {
    const selector = "[data-layout-fingerprint][data-experience-pack]";
    const host = document.querySelector(
      renderedRenderer === "foundation"
        ? `${selector}[data-foundation-dossier]`
        : selector,
    );
    receipt.packId = id(host?.getAttribute("data-experience-pack"));
    if (renderedRenderer === "foundation")
      receipt.usedDossierId = id(host?.getAttribute("data-foundation-dossier"));
    receipt.layoutFingerprint = fingerprint(
      host?.getAttribute("data-layout-fingerprint"),
    );
    if (!receipt.packId)
      throw new Error("Rendered pack or foundation marker is missing.");
  }
  if (!receipt.layoutFingerprint)
    throw new Error("Rendered design fingerprint is missing.");
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((error) => {
  // No paths, input values, or client content go in the Actions log.
  if (error.code || error instanceof SyntaxError || error instanceof TypeError)
    console.error("Preview design evidence could not be read.");
  else console.error(error.message);
  process.exitCode = 1;
});
