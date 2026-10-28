import { decimal, addDecimals, multiplyDecimals } from "./exact-money.mjs";

/** Parallel exact-money sidecar; legacy numeric/six-place display fields remain.
 * Never add or round monetary values using JavaScript Number arithmetic here.
 */
export function exactGenerationCosts(input = {}, options = {}) {
  const costs = new Map();
  function record(stage, values, complete = true, kind = "actual") {
    const parsed = values.map(decimal);
    const known = parsed.filter((value) => value !== null);
    costs.set(stage, {
      amountUsd: known.length ? addDecimals(known) : null,
      costKind: known.length ? kind : "unreported",
      coverageComplete:
        complete &&
        parsed.length > 0 &&
        parsed.every((value) => value !== null),
    });
  }
  function usage(stage, records) {
    if (records.length)
      record(
        stage,
        records.map((entry) => entry?.usage?.cost ?? entry?.cost),
      );
  }
  const seo = input.seoResearch;
  if (seo && typeof seo === "object") {
    const values = [seo.cost?.usd];
    if (
      seo.fallbackSearch &&
      !["unavailable", "not-needed"].includes(seo.fallbackSearch.status)
    )
      values.push(seo.fallbackSearch.costUsd);
    const planner = seo.intentPlanning;
    if (
      planner?.attempted === true ||
      ["model", "partial"].includes(planner?.status)
    )
      values.push(planner?.usage?.costUsd);
    record(
      "seo_research",
      values,
      seo.cost?.complete !== false &&
        seo.fallbackSearch?.costComplete !== false &&
        !(Number(seo.cost?.unreportedTasks) > 0),
    );
  }
  for (const [stage, source] of [
    ["site_config", input.siteConfigUsage],
    ["reference_dna", input.referenceDnaUsage],
  ])
    usage(stage, Array.isArray(source?.records) ? source.records : []);
  if (input.preflight?.usage)
    record(
      "reasoning_preflight",
      [input.preflight.usage.costUsd],
      true,
      input.preflight.usage.costSource === "estimated" ? "estimated" : "actual",
    );
  const assets = input.generatedAssets;
  if (assets && typeof assets === "object") {
    const placements = Array.isArray(assets.placements)
      ? assets.placements
      : [];
    const count =
      assets.generationRequests === undefined
        ? placements.length
        : Number(assets.generationRequests);
    if (count > 0) {
      const price = decimal(options.falImageUsdPerImage);
      const amount =
        Number.isSafeInteger(count) && price !== null && price !== "0"
          ? multiplyDecimals(String(count), price)
          : null;
      record("images", [amount], amount !== null, "estimated");
    }
    usage("image_review", [
      ...placements
        .filter((entry) => entry.reused !== true)
        .map((entry) => entry.imageReview)
        .filter(Boolean),
      ...(Array.isArray(assets.skipped) ? assets.skipped : []).flatMap(
        (entry) =>
          Array.isArray(entry.imageReviews) ? entry.imageReviews : [],
      ),
    ]);
  }
  const creative = input.creativeRun;
  if (creative && typeof creative === "object") {
    const records = Array.isArray(creative.usage) ? creative.usage : [];
    // Per-call records take precedence over a possibly rounded cache aggregate.
    if (records.length) usage("authoring", records);
    else record("authoring", [creative.cacheSummary?.cost]);
  }
  const repair = input.repair;
  if (repair && typeof repair === "object") {
    const values = (Array.isArray(repair.usage) ? repair.usage : []).map(
      (entry) => entry?.usage?.cost ?? entry?.cost,
    );
    for (const file of Array.isArray(repair.visualGateFiles)
      ? repair.visualGateFiles
      : []) {
      if (
        file?.report &&
        (file.report.usage || file.report.cache?.cost !== undefined)
      )
        values.push(file.report.usage?.cost ?? file.report.cache?.cost);
    }
    if (values.length) record("repair_qa", values);
  }
  const runner = input.runner;
  if (runner && Number(runner.minutes) > 0) {
    const minutes = decimal(runner.minutes);
    const price = decimal(runner.usdPerMinute);
    const amount =
      minutes !== null && price !== null && price !== "0"
        ? multiplyDecimals(minutes, price)
        : null;
    record("runner", [amount], amount !== null, "estimated");
  }
  return costs;
}
