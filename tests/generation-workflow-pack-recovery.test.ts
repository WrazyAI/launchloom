import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("pack preview SEO fallback", () => {
  it("does not run a hard SEO gate before the diagnostic fallback", async () => {
    const workflow = await fs.readFile(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    const start = workflow.indexOf(
      'if [ "$GENERATION_RENDERER" = "pack" ]; then',
    );
    const end = workflow.indexOf(
      "test -f .launchloom/creative-bakeoff.json",
      start,
    );
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const pack = workflow.slice(start, end);
    expect(pack).toContain("if run_seo_gate; then");
    expect(pack).toContain(
      'deploy_review_preview review-diagnostic "Diagnostic LaunchLoom pack preview"',
    );
    expect(
      pack.match(
        /node "\$GITHUB_WORKSPACE\/scripts\/seo-release-gate\.mjs"/gu,
      ) || [],
    ).toHaveLength(0);
  });
});
