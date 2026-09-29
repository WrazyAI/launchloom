import fs from "node:fs/promises";
import { expect, it } from "vitest";

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
  expect(workflow).toContain(
    '--branch review-initial --commit-hash "$(git rev-parse HEAD)"',
  );
  expect(workflow).toContain("CREATIVE_EXPERIENCE_MODE");
});
