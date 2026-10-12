import fs from "node:fs/promises";
import { expect, it } from "vitest";
import { parse } from "yaml";

it("supports a preview-only workflow-dispatch canary without a production-branch deploy", async () => {
  const workflow = await fs.readFile(
    ".github/workflows/generate-client.yml",
    "utf8",
  );

  expect(workflow).toContain("preview_only:");
  expect(workflow).toContain(
    "PREVIEW_ONLY: ${{ github.event_name == 'workflow_dispatch' && inputs.preview_only || false }}",
  );
  const setupProjectStart = workflow.indexOf(
    "- name: Create private repository and Cloudflare Pages project",
  );
  const setupProjectEnd = workflow.indexOf(
    "- name: Build private review branch",
    setupProjectStart,
  );
  const setupProject = workflow.slice(setupProjectStart, setupProjectEnd);
  const placeholderGuard = setupProject.indexOf(
    'if [ "$PREVIEW_ONLY" != "true" ]; then',
  );
  const placeholderDeploy = setupProject.indexOf(
    'npx wrangler pages deploy "$GITHUB_WORKSPACE/templates/preview-placeholder"',
  );
  expect(placeholderGuard).toBeGreaterThanOrEqual(0);
  expect(placeholderDeploy).toBeGreaterThan(placeholderGuard);
  expect(workflow).toContain('FINAL_BUILD_SHA=$(git rev-parse HEAD)');
  expect(workflow).toContain(
    '--branch review-initial --commit-hash "$FINAL_BUILD_SHA"',
  );
  expect(workflow).toContain("CREATIVE_EXPERIENCE_MODE");
  expect(workflow).toContain("id: authoring");
  expect(workflow).toContain("steps.authoring.outcome == 'failure'");
  expect(workflow).toContain('EVIDENCE_SOURCE="$RUNNER_TEMP/reusable-authored-candidates"');
  expect(workflow).toContain('echo "evidence_branch=review/initial" >> "$GITHUB_OUTPUT"');
});

it("selects branch-preview canaries against latest main history without recording test runs", async () => {
  const workflow = await fs.readFile(
    ".github/workflows/generate-client.yml",
    "utf8",
  );
  const reserveStart = workflow.indexOf("- name: Reserve inspiration routes");
  const reserveEnd = workflow.indexOf(
    "- name: Analyze reserved inspiration and freeze creative session",
    reserveStart,
  );
  const reserveBlock = workflow.slice(reserveStart, reserveEnd);
  const previewRecordStart = workflow.indexOf(
    "- name: Record launch signature for rotation",
  );
  const previewRecordBlock = workflow.slice(previewRecordStart);

  expect(reserveStart).toBeGreaterThanOrEqual(0);
  expect(reserveBlock).toContain(
    "github.event_name == 'workflow_dispatch' && inputs.preview_only",
  );
  expect(reserveBlock).toContain('HISTORY_DIR="$RUNNER_TEMP/launchloom-history-main"');
  expect(reserveBlock).toContain("LAUNCHLOOM_READ_ONLY_HISTORY");
  expect(reserveBlock.indexOf('if [ "$LAUNCHLOOM_READ_ONLY_HISTORY" = "true" ]; then')).toBeGreaterThanOrEqual(0);
  expect(reserveBlock.indexOf('if [ "$LAUNCHLOOM_READ_ONLY_HISTORY" = "true" ]; then')).toBeLessThan(
    reserveBlock.indexOf('node "$GITHUB_WORKSPACE/scripts/record-launch.mjs"'),
  );
  expect(previewRecordBlock).toContain(
    "if: github.event_name == 'repository_dispatch' || github.ref == 'refs/heads/main'",
  );
});

it("commits exact successful QA call counts only to the private client evidence path", async () => {
 const source=await fs.readFile(".github/workflows/generate-client.yml","utf8");
 const step=source.split("- name: Render and repair creative candidates in the production shell")[1].split("- name: Prepare private creative-recovery report")[0];
 const receipt=step.indexOf('test -f .launchloom/creative-repair/qa-provider-calls.json');
 expect(receipt).toBeGreaterThan(step.indexOf('if [ "$QA_REPAIR_EXPERIMENT" = "true" ]; then',step.indexOf('cp .launchloom/creative-repair/final')));
 expect(step).toContain('git add .launchloom/creative-repair/qa-provider-calls.json');
 expect(receipt).toBeLessThan(step.indexOf('git commit -m "Render and repair creative experience candidates"'));
 expect(source).not.toContain('uses: actions/upload-artifact');
});

it("initializes private QA receipts before authoring can fail and commit old evidence", async () => {
 const source=await fs.readFile(".github/workflows/generate-client.yml","utf8");
 const init=source.indexOf('await initializeQaRepairReceipt(".launchloom/creative-repair")');
 expect(init).toBeGreaterThan(0);
 expect(source.slice(source.lastIndexOf('if [ "$QA_REPAIR_EXPERIMENT"',init),init)).toContain('= "true"');
 expect(init).toBeLessThan(source.indexOf('git commit -m "Create client site configuration"'));
 expect(init).toBeLessThan(source.indexOf('- name: Generate or reuse contextual imagery'));
});

it("blocks synthetic demo configs before client provisioning and lead-token creation", async () => {
 const source=await fs.readFile(".github/workflows/generate-client.yml","utf8");
 const workflow=parse(source);
 const steps=workflow.jobs.generate.steps;
 const guardIndex=steps.findIndex((step:any)=>step.name==="Reject synthetic demos from the production intake path");
 const provisionIndex=steps.findIndex((step:any)=>step.name==="Create private repository and Cloudflare Pages project");
 const tokenIndex=steps.findIndex((step:any)=>step.name==="Build private review branch");
 expect(guardIndex).toBeGreaterThanOrEqual(0);
 expect(guardIndex).toBeLessThan(provisionIndex);
 expect(guardIndex).toBeLessThan(tokenIndex);
 expect(steps[guardIndex].run).toContain("assert-client-generation-mode.mjs");
});

it("deploys failed diagnostic content only to the private preview after the Access probe passes", async () => {
 const source=await fs.readFile(".github/workflows/generate-client.yml","utf8");
 const workflow=parse(source);
 const steps=workflow.jobs.generate.steps;
 const diagnostic=steps.find((step:any)=>step.name==="Build and deploy noindex diagnostic preview");
 expect(diagnostic).toBeTruthy();
 const script=String(diagnostic.run);
 expect(script).toContain("deploy-private-diagnostic-preview.mjs");
 expect(script).not.toContain("steps.client.outputs.project");
 expect(diagnostic.env).toMatchObject({
   CLOUDFLARE_ACCESS_CLIENT_ID: "${{ secrets.CLOUDFLARE_ACCESS_CLIENT_ID }}",
   CLOUDFLARE_ACCESS_CLIENT_SECRET: "${{ secrets.CLOUDFLARE_ACCESS_CLIENT_SECRET }}",
 });
});
