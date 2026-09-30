import fs from "node:fs/promises";
import { expect, it } from "vitest";

function runScripts(source: string) {
  const lines = source.split("\n");
  const scripts: string[] = [];
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^(\s*)run:\s*(.*)$/u);
    if (!match) continue;
    if (match[2] && match[2] !== "|") {
      scripts.push(match[2]);
      continue;
    }
    const indent = match[1].length;
    const body: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      const next = lines[cursor];
      if (next.trim() && next.match(/^\s*/u)![0].length <= indent) break;
      body.push(next);
    }
    scripts.push(body.join("\n"));
  }
  return scripts.join("\n");
}

for (const workflow of [
  "process-feedback.yml",
  "process-client-feedback.yml",
]) {
  it(`${workflow} commits and pushes only after every revision quality gate passes`, async () => {
    const source = await fs.readFile(`.github/workflows/${workflow}`, "utf8");
    const preflight = source.indexOf("revision-scope.mjs preflight");
    const applyFeedback = source.indexOf("node scripts/apply-feedback.mjs");
    expect(preflight).toBeGreaterThanOrEqual(0);
    expect(applyFeedback).toBeGreaterThan(preflight);
    const deployStep = source.indexOf("- name: Build and direct-upload");
    expect(deployStep).toBeGreaterThanOrEqual(0);
    const deploy = source.slice(deployStep);
    const finalVisualGate = deploy.indexOf("--mode verify");
    const emDashGate = deploy.indexOf('"—" dist');
    const commit = deploy.indexOf("git commit -m");
    const push = deploy.indexOf("git push origin");
    const pagesDeploy = deploy.indexOf("npx wrangler pages deploy");
    expect(finalVisualGate).toBeGreaterThanOrEqual(0);
    expect(emDashGate).toBeGreaterThan(finalVisualGate);
    expect(commit).toBeGreaterThan(emDashGate);
    expect(push).toBeGreaterThan(commit);
    expect(pagesDeploy).toBeGreaterThan(push);
    expect(deploy.slice(commit, push)).toContain(
      "LaunchLoom-Revision-Request: $REVISION_REQUEST_ID",
    );
    expect(deploy.slice(commit, push)).toContain("LaunchLoom-Revision-Scope:");
    expect(source).toContain("revision-checkpoint.mjs");
    expect(source).toMatch(
      /steps\.(?:branch|revision)\.outputs\.replay == 'true'/u,
    );
    expect(source).not.toMatch(/git add src public/);
    expect(source).not.toMatch(/--out \.launchloom\/human-revision/);
    expect(runScripts(source)).not.toMatch(
      /\$\{\{\s*steps\.[a-z_]+\.outputs\./iu,
    );
  });

  it(`${workflow} notifies the developer when safe-write preflight blocks feedback`, async () => {
    const source = await fs.readFile(`.github/workflows/${workflow}`, "utf8");
    expect(source).toContain("id: preflight");
    expect(source).toContain("steps.preflight.outcome == 'failure'");
  });
}

it("the client marker commit and push use an empty scope before base capture", async () => {
  const source = await fs.readFile(
    ".github/workflows/process-client-feedback.yml",
    "utf8",
  );
  const create = source.indexOf('revision-scope.mjs" create-empty');
  const guard = source.indexOf('revision-scope.mjs" validate', create);
  const commit = source.indexOf("git commit --allow-empty", guard);
  const pushGuard = source.indexOf('revision-scope.mjs" validate', commit);
  const push = source.indexOf("git push --set-upstream", pushGuard);
  const base = source.indexOf("client-base-sha", push);
  expect(
    [create, guard, commit, pushGuard, push, base].every((value) => value >= 0),
  ).toBe(true);
  expect(create).toBeLessThan(guard);
  expect(guard).toBeLessThan(commit);
  expect(commit).toBeLessThan(pushGuard);
  expect(pushGuard).toBeLessThan(push);
  expect(push).toBeLessThan(base);
});

it("uses the intake feedback issue id instead of a nonexistent revision-step output", async () => {
  const source = await fs.readFile(
    ".github/workflows/process-client-feedback.yml",
    "utf8",
  );
  expect(source).not.toContain("steps.revision.outputs.feedback_issue");
  const reviewDelivery = source.slice(
    source.indexOf("- name: Send the revised preview to the developer"),
  );
  expect(reviewDelivery).toContain('--feedback-issue "$FEEDBACK_ISSUE"');
});
