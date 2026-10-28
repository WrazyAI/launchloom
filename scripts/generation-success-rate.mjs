#!/usr/bin/env node
// One number that matters: how often each renderer produces a shippable run.
// The run name carries renderer=<id>, so the list API is enough to group runs.
import { execFileSync } from "node:child_process";

export function parseRenderer(title) {
  const match = String(title || "").match(/renderer=([a-z][a-z-]*)/iu);
  return match ? match[1].toLowerCase() : "unknown";
}

export function summariseRuns(runs) {
  const groups = new Map();
  for (const run of runs) {
    const renderer = parseRenderer(run.displayTitle || run.title);
    const entry = groups.get(renderer) || {
      renderer,
      total: 0,
      success: 0,
      failure: 0,
      cancelled: 0,
      other: 0,
    };
    entry.total += 1;
    if (run.conclusion === "success") entry.success += 1;
    else if (run.conclusion === "failure") entry.failure += 1;
    else if (run.conclusion === "cancelled") entry.cancelled += 1;
    else entry.other += 1;
    groups.set(renderer, entry);
  }
  return [...groups.values()]
    .map((entry) => ({
      ...entry,
      successRate: entry.total
        ? Math.round((entry.success / entry.total) * 1000) / 10
        : 0,
    }))
    .sort((a, b) => b.total - a.total || a.renderer.localeCompare(b.renderer));
}

function argument(argv, flag, fallback) {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

function main() {
  const argv = process.argv.slice(2);
  const repo = argument(argv, "--repo", "WrazyAI/launchloom");
  const limit = String(
    Math.max(1, Number(argument(argv, "--limit", "100")) || 100),
  );
  const output = execFileSync(
    "gh",
    [
      "run",
      "list",
      "--repo",
      repo,
      "--workflow",
      "generate-client.yml",
      "--limit",
      limit,
      "--json",
      "displayTitle,conclusion,createdAt",
    ],
    { encoding: "utf8" },
  );
  const runs = JSON.parse(output);
  const summary = summariseRuns(runs);
  if (argv.includes("--json")) {
    console.log(
      JSON.stringify({ repo, limit: Number(limit), summary }, null, 2),
    );
    return;
  }
  console.log(`Generation success rate, last ${runs.length} runs (${repo})`);
  for (const entry of summary) {
    console.log(
      `${entry.renderer.padEnd(12)} ${String(entry.success).padStart(3)}/${String(entry.total).padEnd(3)} ${String(entry.successRate).padStart(5)}%  failed=${entry.failure} cancelled=${entry.cancelled} other=${entry.other}`,
    );
  }
  const total = summary.reduce((sum, entry) => sum + entry.total, 0);
  const success = summary.reduce((sum, entry) => sum + entry.success, 0);
  console.log(
    `overall      ${String(success).padStart(3)}/${String(total).padEnd(3)} ${total ? Math.round((success / total) * 1000) / 10 : 0}%`,
  );
}

if (process.argv[1] === new URL(import.meta.url).pathname) main();
