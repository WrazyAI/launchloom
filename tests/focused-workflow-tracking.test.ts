import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { liveGenerationId } from "../scripts/run-rendered-creative-repair.mjs";

const workflow = fs.readFileSync(
  path.resolve(".github/workflows/test-generation.yml"),
  "utf8",
);

describe("focused workflow generation tracking", () => {
  it("supplies the API URL and focused attempt identity", () => {
    expect(workflow).toMatch(
      /LAUNCHLOOM_API_URL:\s*\$\{\{\s*vars\.LAUNCHLOOM_API_URL\s*\|\|\s*'https:\/\/api\.launchloom\.wrazyos\.com'\s*\}\}/u,
    );
    expect(workflow).toMatch(
      /TRACK_PROFILE:\s*\$\{\{\s*inputs\.test_profile\s*\}\}/u,
    );
    expect(workflow).toMatch(/TRACK_ISSUE:\s*\$\{\{\s*inputs\.issue\s*\}\}/u);
    expect(workflow).toMatch(
      /TRACK_ATTEMPT:\s*github:\$\{\{\s*github\.run_id\s*\}\}:\$\{\{\s*github\.run_attempt\s*\}\}/u,
    );
    expect(workflow).toMatch(
      /TRACK_ACTOR:\s*\$\{\{\s*github\.triggering_actor\s*\}\}/u,
    );
  });

  it("uses the production image provider defaults in focused previews", () => {
    expect(workflow).toContain(
      "IMAGE_PROVIDER: ${{ vars.IMAGE_PROVIDER || 'workers-ai' }}",
    );
    expect(workflow).toContain(
      "WORKERS_AI_IMAGE_MODEL: ${{ vars.WORKERS_AI_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell' }}",
    );
    expect(workflow).toContain(
      "CLOUDFLARE_WORKERS_AI_TOKEN: ${{ secrets.CLOUDFLARE_WORKERS_AI_TOKEN }}",
    );
  });

  it("uses the production image provider and Workers AI credentials", () => {
    expect(workflow).toMatch(
      /IMAGE_PROVIDER:\s*\$\{\{\s*vars\.IMAGE_PROVIDER\s*\|\|\s*'workers-ai'\s*\}\}/u,
    );
    expect(workflow).toContain(
      "CLOUDFLARE_WORKERS_AI_TOKEN: ${{ secrets.CLOUDFLARE_WORKERS_AI_TOKEN }}",
    );
    expect(workflow).toMatch(
      /WORKERS_AI_IMAGE_MODEL:\s*\$\{\{\s*vars\.WORKERS_AI_IMAGE_MODEL\s*\|\|\s*'@cf\/black-forest-labs\/flux-1-schnell'\s*\}\}/u,
    );
  });

  it("resolves the focused live thumbnail to the exact run attempt", () => {
    expect(
      liveGenerationId({
        TRACK_PROFILE: "creative-only",
        GITHUB_RUN_ID: "41478356973",
        GITHUB_RUN_ATTEMPT: "1",
      }),
    ).toBe("github:41478356973:1");
  });
});
