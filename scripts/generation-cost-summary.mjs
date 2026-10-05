import fs from "node:fs/promises";
import path from "node:path";

const round = (value) => Math.round(Number(value || 0) * 1_000_000) / 1_000_000;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readJson(file) {
  if (!file) return null;
  return fs
    .readFile(path.resolve(file), "utf8")
    .then((value) => JSON.parse(value))
    .catch(() => null);
}

async function listJsonFiles(directory, predicate) {
  if (!directory) return [];
  const root = path.resolve(directory);
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isFile() && predicate(entry.name)) files.push(full);
    else if (entry.isDirectory()) {
      const nested = await listJsonFiles(full, predicate);
      files.push(...nested);
    }
  }
  return files.sort();
}

function usageCost(record) {
  const cost = finiteNumber(record?.usage?.cost);
  return cost !== null && cost >= 0 ? cost : null;
}

function sumUsage(records) {
  let cost = 0;
  let priced = 0;
  let unpriced = 0;
  for (const record of records) {
    const value = usageCost(record);
    if (value === null) unpriced += 1;
    else {
      cost += value;
      priced += 1;
    }
  }
  return { cost: round(cost), priced, unpriced };
}

/**
 * Normalize the cost evidence a generation run already produces into one
 * bounded summary plus ledger-ready cost events.
 *
 * Every stage reports whether its amount is provider-reported (`actual`), a
 * configured estimate (`estimated`), or unavailable (`unreported`). A stage
 * with no activity is omitted instead of reported as a fake zero.
 */
export function summarizeGenerationCosts(input = {}, options = {}) {
  const stages = [];

  const seo = input.seoResearch;
  if (seo && typeof seo === "object") {
    const measured = finiteNumber(seo.cost?.usd) || 0;
    const fallback = finiteNumber(seo.fallbackSearch?.costUsd) || 0;
    const complete =
      seo.cost?.complete !== false &&
      seo.fallbackSearch?.costComplete !== false;
    stages.push({
      stage: "seo_research",
      provider: seo.fallbackSearch?.status && seo.fallbackSearch.status !== "unavailable"
        ? "dataforseo+fallback"
        : "dataforseo",
      model: null,
      costUsd: round(measured + fallback),
      costKind: "actual",
      complete,
      detail: {
        mode: seo.mode || null,
        tasks: Number(seo.cost?.tasks) || 0,
        unreportedTasks: Number(seo.cost?.unreportedTasks) || 0,
        stageCosts: Array.isArray(seo.cost?.stageCosts) ? seo.cost.stageCosts.slice(0, 12) : [],
        fallbackStatus: seo.fallbackSearch?.status || null,
        fallbackQueries: Number(seo.fallbackSearch?.queriesAttempted) || 0,
        publishReady: seo.publishReady === true,
        validatedQueries: Array.isArray(seo.validatedQueries)
          ? seo.validatedQueries.length
          : 0,
      },
    });
  }

  if (input.siteConfigUsage || input.referenceDnaUsage) {
    for (const [stage, file] of [
      ["site_config", input.siteConfigUsage],
      ["reference_dna", input.referenceDnaUsage],
    ]) {
      if (!file) continue;
      const records = Array.isArray(file.records) ? file.records : [];
      if (!records.length) continue;
      const summed = sumUsage(records);
      stages.push({
        stage,
        provider: "openrouter",
        model: records.find((record) => record.model)?.model || null,
        costUsd: summed.priced ? summed.cost : null,
        costKind: summed.priced ? "actual" : "unreported",
        complete: summed.unpriced === 0,
        detail: {
          calls: records.length,
          pricedCalls: summed.priced,
          unpricedCalls: summed.unpriced,
          promptTokens: records.reduce(
            (total, record) => total + (finiteNumber(record?.usage?.prompt_tokens) || 0),
            0,
          ),
          completionTokens: records.reduce(
            (total, record) => total + (finiteNumber(record?.usage?.completion_tokens) || 0),
            0,
          ),
        },
      });
    }
  }

  const preflight = input.preflight;
  if (preflight?.usage) {
    const usage = preflight.usage;
    const cost = finiteNumber(usage.costUsd);
    const estimated = usage.costSource === "estimated";
    stages.push({
      stage: "reasoning_preflight",
      provider: "typesafe",
      model: preflight.model || preflight.selector?.model || null,
      costUsd: cost !== null && cost >= 0 ? round(cost) : null,
      costKind: cost === null || cost < 0 ? "unreported" : estimated ? "estimated" : "actual",
      complete: cost !== null && cost >= 0,
      detail: {
        mode: preflight.mode || null,
        reasoningEffort: preflight.reasoningEffort || null,
        inputTokens: Number(usage.inputTokens) || 0,
        outputTokens: Number(usage.outputTokens) || 0,
      },
    });
  }

  const assets = input.generatedAssets;
  if (assets && typeof assets === "object") {
    const placements = Array.isArray(assets.placements) ? assets.placements : [];
    const images = placements.length;
    if (images > 0) {
      const unitPrice = options.falImageUsdPerImage ?? null;
      const cost = unitPrice !== null && unitPrice > 0 ? round(images * unitPrice) : null;
      stages.push({
        stage: "images",
        provider: assets.provider || "fal.ai",
        model: assets.model || null,
        costUsd: cost,
        costKind: cost === null ? "unreported" : "estimated",
        complete: cost !== null,
        detail: {
          images,
          skipped: Array.isArray(assets.skipped) ? assets.skipped.length : 0,
          unitPriceUsd: cost === null ? null : unitPrice,
        },
      });
    }
  }

  const creative = input.creativeRun;
  if (creative && typeof creative === "object") {
    const cacheCost = finiteNumber(creative.cacheSummary?.cost);
    const usageRecords = Array.isArray(creative.usage) ? creative.usage : [];
    const summed = sumUsage(usageRecords.map((record) => ({ usage: record.usage || record })));
    const cost = cacheCost !== null && cacheCost > 0 ? cacheCost : summed.priced ? summed.cost : null;
    stages.push({
      stage: "authoring",
      provider: "openrouter",
      model: creative.model || null,
      costUsd: cost === null ? null : round(cost),
      costKind: cost === null ? "unreported" : "actual",
      complete: cost !== null,
      detail: {
        status: creative.status || null,
        candidates: Array.isArray(creative.candidates) ? creative.candidates.length : 0,
        responses: Number(creative.cacheSummary?.responseCount) || summed.priced + summed.unpriced,
        cacheHitPercent: Number(creative.cacheSummary?.cacheHitPercent) || 0,
      },
    });
  }

  const repair = input.repair;
  if (repair && typeof repair === "object") {
    const records = [];
    const sources = [];
    for (const record of Array.isArray(repair.usage) ? repair.usage : [])
      records.push({ usage: record.usage || record });
    for (const file of Array.isArray(repair.visualGateFiles) ? repair.visualGateFiles : []) {
      if (!file || !file.report) continue;
      const usage = file.report.usage || null;
      const cacheCost = finiteNumber(file.report.cache?.cost);
      if (usage || cacheCost !== null) {
        records.push({
          usage,
          cost: cacheCost,
          source: file.name || "visual-gate",
        });
        sources.push(file.name || "visual-gate");
      }
    }
    let cost = 0;
    let priced = 0;
    let unpriced = 0;
    for (const record of records) {
      const value =
        finiteNumber(record.cost) ?? finiteNumber(record?.usage?.cost);
      if (value === null || value < 0) unpriced += 1;
      else {
        cost += value;
        priced += 1;
      }
    }
    if (records.length) {
      stages.push({
        stage: "repair_qa",
        provider: "openrouter",
        model: input.repairModel || null,
        costUsd: priced ? round(cost) : null,
        costKind: priced ? "actual" : "unreported",
        complete: unpriced === 0,
        detail: {
          calls: records.length,
          pricedCalls: priced,
          unpricedCalls: unpriced,
          sources: sources.slice(0, 12),
          rounds: Number(input.repair.rounds) || 0,
        },
      });
    }
  }

  if (input.runner) {
    const minutes = finiteNumber(input.runner.minutes);
    const price = finiteNumber(input.runner.usdPerMinute);
    if (minutes !== null && minutes > 0) {
      const cost = price !== null && price > 0 ? round(minutes * price) : null;
      stages.push({
        stage: "runner",
        provider: "github-actions",
        model: null,
        costUsd: cost,
        costKind: cost === null ? "unreported" : "estimated",
        complete: cost !== null,
        detail: { minutes: round(minutes), unitPriceUsd: cost === null ? null : price },
      });
    }
  }

  const totalUsd = stages.reduce((total, stage) => total + (stage.costUsd || 0), 0);
  const actualUsd = stages
    .filter((stage) => stage.costKind === "actual")
    .reduce((total, stage) => total + (stage.costUsd || 0), 0);
  const estimatedUsd = stages
    .filter((stage) => stage.costKind === "estimated")
    .reduce((total, stage) => total + (stage.costUsd || 0), 0);
  const events = stages.map((stage) => ({
    eventKey: `cost:${stage.stage}`,
    stage: stage.stage,
    status: stage.complete ? "recorded" : "recorded-incomplete",
    provider: stage.provider,
    model: stage.model,
    costUsd: stage.costUsd,
    costKind: stage.costKind,
    detail: {
      ...stage.detail,
      complete: stage.complete,
      notes:
        stage.costKind === "unreported"
          ? "The provider did not report a per-run price; configure the matching rate to show an estimate."
          : stage.costKind === "estimated"
            ? "Estimated from a configured provider rate."
            : undefined,
    },
  }));
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    stages,
    events,
    totalUsd: round(totalUsd),
    actualUsd: round(actualUsd),
    estimatedUsd: round(estimatedUsd),
    incomplete: stages.some((stage) => !stage.complete),
  };
}

/** Read the on-disk artifacts a generation or revision run leaves behind. */
export async function readGenerationCostInputs(paths = {}) {
  const input = {};
  input.seoResearch = await readJson(paths.seo);
  input.siteConfigUsage = await readJson(paths.siteConfigUsage);
  input.referenceDnaUsage = await readJson(paths.referenceDnaUsage);
  input.preflight = await readJson(paths.preflight);
  input.generatedAssets = await readJson(paths.assets);
  input.creativeRun = await readJson(paths.creativeRun);
  if (paths.repairDir || paths.revisionDir) {
    const usageRecords = [];
    const visualGateFiles = [];
    let rounds = 0;
    let repairModel = null;
    for (const directory of [paths.repairDir, paths.revisionDir].filter(Boolean)) {
      const root = path.resolve(directory);
      const usage = await readJson(path.join(root, "repair-usage.json"));
      if (Array.isArray(usage?.records)) usageRecords.push(...usage.records);
      if (usage?.model) repairModel = usage.model;
      const summary = await readJson(path.join(root, "summary.json"));
      if (summary?.repairCycles)
        rounds += Object.values(summary.repairCycles).length;
      const candidates = await listJsonFiles(
        root,
        (name) => /^visual-gate.*\.json$/u.test(name),
      );
      for (const file of candidates) {
        const report = await readJson(file);
        if (report) visualGateFiles.push({ name: path.relative(root, file), report });
      }
    }
    if (usageRecords.length || visualGateFiles.length)
      input.repair = { usage: usageRecords, visualGateFiles, rounds };
    input.repairModel = repairModel;
  }
  return input;
}

function argsFrom(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    result[value.replace(/^--/u, "")] = values[index + 1]?.startsWith("--")
      ? "true"
      : values[index + 1];
    if (values[index + 1]?.startsWith("--")) continue;
    index += 1;
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = argsFrom(process.argv.slice(2));
  const output = args.output || args.out;
  if (!output) throw new Error("--output is required.");
  const falPrice = finiteNumber(
    args["fal-image-usd"] ?? process.env.FAL_IMAGE_USD_PER_IMAGE,
  );
  const runnerMinutes = finiteNumber(args["runner-minutes"]);
  const runnerPrice = finiteNumber(
    args["runner-usd-per-minute"] ?? process.env.RUNNER_USD_PER_MINUTE,
  );
  const input = await readGenerationCostInputs({
    seo: args.seo,
    siteConfigUsage: args["site-config-usage"],
    referenceDnaUsage: args["reference-dna-usage"],
    preflight: args.preflight,
    assets: args.assets,
    creativeRun: args["creative-run"],
    repairDir: args["repair-dir"],
    revisionDir: args["revision-dir"],
  });
  if (runnerMinutes !== null)
    input.runner = { minutes: runnerMinutes, usdPerMinute: runnerPrice };
  const summary = summarizeGenerationCosts(input, {
    falImageUsdPerImage: falPrice !== null && falPrice > 0 ? falPrice : null,
  });
  await fs.writeFile(path.resolve(output), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(
    `generation_cost_total=${summary.totalUsd} actual=${summary.actualUsd} estimated=${summary.estimatedUsd} incomplete=${summary.incomplete} stages=${summary.stages.length}`,
  );
}
