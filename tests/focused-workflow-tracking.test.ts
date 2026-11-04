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
