import { glob, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("agent follow-up model policy", () => {
  it("keeps follow-up inference on OpenCode Go", async () => {
    const files = [];
    for await (const file of glob("worker/src/**/*.ts")) files.push(file);
    for (const file of files) {
      const source = await readFile(file, "utf8");
      expect(source).not.toContain("openrouter.ai");
      expect(source).not.toContain("OPENROUTER_API_KEY");
    }
    expect(
      await readFile("worker/src/agent-follow-ups/classify.ts", "utf8"),
    ).toContain('model: "gpt-6-luna"');
  });

  it("keeps the capability off by default", async () => {
    const workflow = await readFile(
      ".github/workflows/deploy-platform.yml",
      "utf8",
    );
    expect(workflow).toContain(
      "AGENT_FOLLOW_UPS_ENABLED: ${{ vars.AGENT_FOLLOW_UPS_ENABLED || 'false' }}",
    );
  });
});
