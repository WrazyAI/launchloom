import fs from "node:fs/promises";
import path from "node:path";
import { constants } from 'node:fs';
import { exactGenerationCosts } from './exact-generation-costs.mjs';
import { addDecimals } from './exact-money.mjs';
import {
  dedupeRepairGateEvidence,
  isGateEvidenceName,
} from './repair-cost-evidence.mjs';
import { usageRecordCost } from './usage-cost.mjs';

const round = (value) => Math.round(Number(value || 0) * 1_000_000) / 1_000_000;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** A missing or null amount is unknown evidence, never a priced zero. */
function optionalCost(value) {
  return value === null || value === undefined ? null : finiteNumber(value);
}

async function readJson(file, options = {}) {
  if (!file) return null;
  try {
    let value;
    if (options.bounded) {
      const handle = await fs.open(path.resolve(file), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = await handle.stat();
        options.budget.bytes += stat.size;
        if (!stat.isFile() || stat.size > 2_000_000 || options.budget.bytes > 8_000_000) throw Error('Artifact bounds exceeded.');
        // Explicit byte bound also covers a file growing between stat and read.
        const bytes = Buffer.alloc(Math.min(stat.size + 1, 2_000_001));
        const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
        if (bytesRead > stat.size) throw Error('Artifact changed during read.');
        value = bytes.subarray(0, bytesRead).toString('utf8');
      } finally { await handle.close(); }
    } else value = await fs.readFile(path.resolve(file), 'utf8');
    const parsed = JSON.parse(value, options.exactDecimals || options.bounded ? (_key, item, context) => {
      if (options.bounded && (++options.budget.nodes > 50000 || (Array.isArray(item) && item.length > 512))) throw Error('Artifact structure bounds exceeded.');
      return options.exactDecimals && typeof item === 'number' ? context.source : item;
    } : undefined);
    if (options.bounded && ['records', 'usage', 'placements', 'skipped'].some(key => Array.isArray(parsed?.[key]) && parsed[key].length > 512)) throw Error('Artifact records exceed bounds.');
    return parsed;
  } catch (error) {
    if (!options.bounded || error.code === 'ENOENT') return null;
    if (options.partial) { options.budget.incomplete = true; return null; }
    throw Error('Cost artifact unavailable.');
  }
}

async function listJsonFiles(directory, predicate, options = {}, depth = 0) {
  if (!directory) return [];
  const root = path.resolve(directory);
  if (options.bounded) {
    const stat = await fs.lstat(root).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!stat) return [];
    if (!stat.isDirectory() || stat.isSymbolicLink() || depth > 4) throw Error('Artifact directory bounds exceeded.');
  }
  let entries;
  if (options.bounded) {
    entries = [];
    const directory = await fs.opendir(root);
    try {
      for await (const entry of directory) {
        if (++options.budget.entries > 512 || entries.length >= 256) throw Error('Artifact directory bounds exceeded.');
        entries.push(entry);
      }
    } finally { await directory.close().catch(() => {}); }
  } else entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const files = [];
  if (options.bounded && entries.length > 256) throw Error('Artifact directory bounds exceeded.');
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (options.bounded && entry.isSymbolicLink()) throw Error('Symlink artifact refused.');
    if (entry.isFile() && predicate(entry.name)) {
      if (options.bounded && ++options.budget.files > 64) throw Error('Artifact file bounds exceeded.');
      files.push(full);
    }
    else if (entry.isDirectory()) {
      const nested = await listJsonFiles(full, predicate, options, depth + 1);
      files.push(...nested);
    }
  }
  return files.sort();
}

function usageCost(record) {
  // Provider per-call amounts, explicit cost and per-call computed cache cost
  // are all priced evidence; an explicit null is unknown, never a priced zero.
  const cost = optionalCost(usageRecordCost(record));
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
  if (input.collectionIncomplete) stages.push({ stage: 'usage_collection', costUsd: null, costKind: 'unreported', complete: false, detail: {} });

  const seo = input.seoResearch;
  if (seo && typeof seo === "object") {
    const measured = finiteNumber(seo.cost?.usd) || 0;
    const fallback = finiteNumber(seo.fallbackSearch?.costUsd) || 0;
    const intentPlanning = seo.intentPlanning || {};
    const plannerUsage = intentPlanning.usage || {};
    const plannerCost =
      plannerUsage.costUsd === null ||
      plannerUsage.costUsd === undefined ||
      plannerUsage.costUsd === ""
        ? null
        : finiteNumber(plannerUsage.costUsd);
    const plannerAttempted =
      intentPlanning.attempted === true ||
      ["model", "partial"].includes(intentPlanning.status);
    const providers = ["dataforseo"];
    if (
      seo.fallbackSearch?.status &&
      !["unavailable", "not-needed"].includes(seo.fallbackSearch.status)
    )
      providers.push("fallback");
    if (plannerAttempted) providers.push("openrouter");
    const complete =
      seo.cost?.complete !== false &&
      seo.fallbackSearch?.costComplete !== false &&
      (!plannerAttempted || plannerCost !== null);
    stages.push({
      stage: "seo_research",
      provider: providers.join("+"),
      model: plannerAttempted
        ? intentPlanning.model || plannerUsage.model || null
        : null,
      costUsd: round(measured + fallback + (plannerCost || 0)),
      costKind: "actual",
      complete,
      detail: {
        mode: seo.mode || null,
        tasks: Number(seo.cost?.tasks) || 0,
        unreportedTasks: Number(seo.cost?.unreportedTasks) || 0,
        stageCosts: Array.isArray(seo.cost?.stageCosts)
          ? seo.cost.stageCosts.slice(0, 12)
          : [],
        fallbackStatus: seo.fallbackSearch?.status || null,
        fallbackQueries: Number(seo.fallbackSearch?.queriesAttempted) || 0,
        publishReady: seo.publishReady === true,
        queryPlannerStatus: intentPlanning.status || null,
        queryPlannerModel: intentPlanning.model || plannerUsage.model || null,
        queryPlannerCostUsd: plannerCost,
        queryPlannerPromptTokens: Number(plannerUsage.promptTokens) || 0,
        queryPlannerCompletionTokens:
          Number(plannerUsage.completionTokens) || 0,
        queryPlannerCachedTokens: Number(plannerUsage.cachedTokens) || 0,
        queryPlannerCacheStatus: plannerUsage.cacheStatus || null,
        queryPlannerAcceptedPhrases:
          Number(intentPlanning.acceptedPhraseCount) || 0,
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
        provider: records.some(
          (record) => record?.usage?.provider === "opencode-go",
        )
          ? "opencode-go"
          : "openrouter",
        model: records.find((record) => record.model)?.model || null,
        costUsd: summed.priced ? summed.cost : null,
        costKind: summed.priced ? "actual" : "unreported",
        complete: summed.unpriced === 0,
        detail: {
          calls: records.length,
          pricedCalls: summed.priced,
          unpricedCalls: summed.unpriced,
          promptTokens: records.reduce(
            (total, record) =>
              total +
              (finiteNumber(
                record?.usage?.prompt_tokens ?? record?.usage?.inputTokens,
              ) || 0),
            0,
          ),
          completionTokens: records.reduce(
            (total, record) =>
              total +
              (finiteNumber(
                record?.usage?.completion_tokens ?? record?.usage?.outputTokens,
              ) || 0),
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
      costKind:
        cost === null || cost < 0
          ? "unreported"
          : estimated
            ? "estimated"
            : "actual",
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
    const placements = Array.isArray(assets.placements)
      ? assets.placements
      : [];
    const requests = finiteNumber(assets.generationRequests);
    const images =
      requests === null ? placements.length : Math.max(0, requests);
    if (images > 0) {
      const unitPrice = options.falImageUsdPerImage ?? null;
      const cost =
        unitPrice !== null && unitPrice > 0 ? round(images * unitPrice) : null;
      stages.push({
        stage: "images",
        provider: assets.provider || "fal.ai",
        model: assets.model || null,
        costUsd: cost,
        costKind: cost === null ? "unreported" : "estimated",
        complete: cost !== null,
        detail: {
          requests: images,
          acceptedImages: placements.length,
          skipped: Array.isArray(assets.skipped) ? assets.skipped.length : 0,
          unitPriceUsd: cost === null ? null : unitPrice,
        },
      });
    }

    const reviewRecords = [
      ...placements
        .filter((entry) => entry.reused !== true)
        .map((entry) => entry.imageReview)
        .filter(Boolean),
      ...(Array.isArray(assets.skipped) ? assets.skipped : []).flatMap(
        (entry) =>
          Array.isArray(entry.imageReviews) ? entry.imageReviews : [],
      ),
    ];
    if (reviewRecords.length) {
      const summed = sumUsage(reviewRecords);
      const model = reviewRecords.find((record) => record.model)?.model || null;
      stages.push({
        stage: "image_review",
        provider: "openrouter",
        model,
        costUsd: summed.priced ? summed.cost : null,
        costKind: summed.priced ? "actual" : "unreported",
        complete: summed.unpriced === 0,
        detail: {
          calls: reviewRecords.length,
          pricedCalls: summed.priced,
          unpricedCalls: summed.unpriced,
          rejected: reviewRecords.filter(
            (record) => record.status === "rejected",
          ).length,
          unavailable: reviewRecords.filter(
            (record) => record.status === "unavailable",
          ).length,
          promptTokens: reviewRecords.reduce(
            (total, record) =>
              total + (finiteNumber(record.usage?.prompt_tokens) || 0),
            0,
          ),
          completionTokens: reviewRecords.reduce(
            (total, record) =>
              total + (finiteNumber(record.usage?.completion_tokens) || 0),
            0,
          ),
        },
      });
    }
  }

  const creative = input.creativeRun;
  if (creative && typeof creative === "object") {
    const cacheCost = finiteNumber(creative.cacheSummary?.cost);
    const usageRecords = Array.isArray(creative.usage) ? creative.usage : [];
    const summed = sumUsage(usageRecords);
    // Per-call records take precedence over a possibly rounded cache aggregate.
    const cost = usageRecords.length
      ? summed.priced
        ? summed.cost
        : null
      : cacheCost !== null && cacheCost > 0
        ? cacheCost
        : null;
    stages.push({
      stage: "authoring",
      provider: usageRecords.some(
        (record) => record?.provider === "opencode-go",
      )
        ? "opencode-go"
        : "openrouter",
      model: creative.model || null,
      costUsd: cost === null ? null : round(cost),
      costKind: cost === null ? "unreported" : "actual",
      // Per-call records must all report an amount before coverage is complete.
      complete:
        cost !== null && (usageRecords.length ? summed.unpriced === 0 : true),
      detail: {
        status: creative.status || null,
        candidates: Array.isArray(creative.candidates)
          ? creative.candidates.length
          : 0,
        responses:
          Number(creative.cacheSummary?.responseCount) ||
          summed.priced + summed.unpriced,
        cacheHitPercent: Number(creative.cacheSummary?.cacheHitPercent) || 0,
      },
    });
  }

  const repair = input.repair;
  if (repair && typeof repair === "object") {
    const records = [];
    const sources = [];
    // A copied `final/visual-gate.json` restates its round report, so it must
    // not be counted as a second paid gate call.
    const repairEvidence = dedupeRepairGateEvidence(repair.visualGateFiles);
    for (const record of Array.isArray(repair.usage) ? repair.usage : [])
      records.push(record);
    for (const file of repairEvidence.evidence) {
      // Every discovered gate report is an attempted call. A gate whose error
      // path wrote no usage is unknown spend, not absent spend.
      if (!file || !file.report) continue;
      records.push({
        usage: file.report.usage ?? null,
        cache: file.report.cache ?? null,
        source: file.name || "visual-gate",
      });
      sources.push(file.name || "visual-gate");
    }
    let cost = 0;
    let priced = 0;
    let unpriced = 0;
    for (const record of records) {
      // The shared resolver prefers provider usage (cost or costUsd) and then
      // the per-call computed cache cost; unknown stays unknown.
      const value = optionalCost(usageRecordCost(record));
      if (value === null || value < 0) unpriced += 1;
      else {
        cost += value;
        priced += 1;
      }
    }
    if (records.length) {
      const reportedCopies = Number(repair.duplicateReports);
      const ignoredCopies =
        repairEvidence.duplicates.length +
        (Number.isSafeInteger(reportedCopies) && reportedCopies > 0
          ? reportedCopies
          : 0);
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
          ...(ignoredCopies ? { duplicateReports: ignoredCopies } : {}),
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
        detail: {
          minutes: round(minutes),
          unitPriceUsd: cost === null ? null : price,
        },
      });
    }
  }

  const totalUsd = stages.reduce(
    (total, stage) => total + (stage.costUsd || 0),
    0,
  );
  const actualUsd = stages
    .filter((stage) => stage.costKind === "actual")
    .reduce((total, stage) => total + (stage.costUsd || 0), 0);
  const estimatedUsd = stages
    .filter((stage) => stage.costKind === "estimated")
    .reduce((total, stage) => total + (stage.costUsd || 0), 0);
  const exactCosts = exactGenerationCosts(input, options);
  const exactStages = Object.fromEntries(stages.map(stage => [stage.stage, exactCosts.get(stage.stage) ?? { amountUsd: null, costKind: 'unreported', coverageComplete: false }]));
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
    exact: {
      stages: exactStages,
      actualUsd: addDecimals([...exactCosts.values()].filter(cost => cost.costKind === 'actual' && cost.amountUsd !== null).map(cost => cost.amountUsd)),
      estimatedUsd: addDecimals([...exactCosts.values()].filter(cost => cost.costKind === 'estimated' && cost.amountUsd !== null).map(cost => cost.amountUsd)),
      incomplete: Object.values(exactStages).some(cost => !cost.coverageComplete),
    },
  };
}

/** Read the on-disk artifacts a generation or revision run leaves behind. */
export async function readGenerationCostInputs(paths = {}, options = {}) {
  options = { ...options, budget: { bytes: 0, files: 0, entries: 0, nodes: 0, incomplete: false } };
  const input = {};
  input.seoResearch = await readJson(paths.seo, options);
  input.siteConfigUsage = await readJson(paths.siteConfigUsage, options);
  input.referenceDnaUsage = await readJson(paths.referenceDnaUsage, options);
  input.preflight = await readJson(paths.preflight, options);
  input.generatedAssets = await readJson(paths.assets, options);
  input.creativeRun = await readJson(paths.creativeRun, options);
  if (paths.repairDir || paths.revisionDir) {
    const usageRecords = [];
    const visualGateFiles = [];
    const seenRoots = new Set();
    let rounds = 0;
    let repairModel = null;
    for (const directory of [paths.repairDir, paths.revisionDir].filter(
      Boolean,
    )) {
      const root = path.resolve(directory);
      // A repeated root would read the same usage log and summary twice.
      if (seenRoots.has(root)) continue;
      seenRoots.add(root);
      const usage = await readJson(path.join(root, "repair-usage.json"), options);
      if (Array.isArray(usage?.records)) usageRecords.push(...usage.records);
      if (usage?.model) repairModel = usage.model;
      const summary = await readJson(path.join(root, "summary.json"), options);
      if (summary?.repairCycles)
        rounds += Object.values(summary.repairCycles).length;
      let candidates;
      try {
        candidates = await listJsonFiles(root, isGateEvidenceName, options);
      } catch (error) {
        if (!options.partial) throw error;
        options.budget.incomplete = true;
        candidates = [];
      }
      for (const file of candidates) {
        const report = await readJson(file, options);
        if (report)
          visualGateFiles.push({
            name: path.relative(root, file),
            report,
            sourcePath: file,
            root,
          });
      }
    }
    const repairEvidence = dedupeRepairGateEvidence(visualGateFiles);
    if (usageRecords.length || repairEvidence.evidence.length)
      input.repair = {
        usage: usageRecords,
        visualGateFiles: repairEvidence.evidence,
        rounds,
        duplicateReports: repairEvidence.duplicates.length,
      };
    input.repairModel = repairModel;
  }
  input.collectionIncomplete = options.budget.incomplete;
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
  }, args.operations === 'true' ? { exactDecimals: true, bounded: true, partial: args.partial === 'true' } : {});
  if (runnerMinutes !== null)
    input.runner = args.operations === 'true' ? { minutes: args['runner-minutes'], usdPerMinute: args['runner-usd-per-minute'] ?? process.env.RUNNER_USD_PER_MINUTE } : { minutes: runnerMinutes, usdPerMinute: runnerPrice };
  const summary = summarizeGenerationCosts(input, {
    falImageUsdPerImage: args.operations === 'true' ? args['fal-image-usd'] ?? process.env.FAL_IMAGE_USD_PER_IMAGE ?? null : falPrice !== null && falPrice > 0 ? falPrice : null,
  });
  await fs.writeFile(
    path.resolve(output),
    `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 },
  );
  if (args.operations === 'true') console.log(`operations_cost_summary=prepared incomplete=${summary.exact.incomplete}`);
  else console.log(
    `generation_cost_total=${summary.totalUsd} actual=${summary.actualUsd} estimated=${summary.estimatedUsd} incomplete=${summary.incomplete} stages=${summary.stages.length}`,
  );
}
