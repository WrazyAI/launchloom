import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("agent follow-up revision workflow", () => {
  it("runs a request branch from the pinned base without email or publication", async () => {
    const workflow = await readFile(
      ".github/workflows/process-agent-follow-up.yml",
      "utf8",
    );
    expect(workflow).toContain("process-agent-follow-up");
    expect(workflow).toContain('checkout --detach "$BASE_SHA"');
    expect(workflow).toContain('FEEDBACK_TEXT="$(cat "$RUNNER_TEMP/agent-feedback.txt")"');
    expect(workflow).toContain("agent-revision/${REVISION_REQUEST_ID}");
    expect(workflow).toContain("REVISION_PREVIEW_URL");
    expect(workflow).not.toContain("send-preview-email.mjs");    expect(workflow).not.toContain("create-review-link.mjs");
    expect(workflow).not.toContain("publications");
  });

  it("sends the verified preview result when completing", async () => {
    const client = await readFile("scripts/revision-queue-client.mjs", "utf8");
    expect(client).toContain("REVISION_PREVIEW_DEPLOYMENT_ID");
    expect(client).toContain("REVISION_RESULT_BASE_SHA");
    expect(client).toContain("result:");
  });
});
