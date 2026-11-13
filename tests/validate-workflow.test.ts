import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("main validation workflow", () => {
  it("runs the application suite on the nightly schedule", async () => {
    const source = await fs.readFile(".github/workflows/validate.yml", "utf8");
    // A scheduled run must exercise the unit suite and type check. The old
    // condition excluded `schedule`, so nightly success only proved the
    // rendered route fixtures ran while unit regressions stayed invisible.
    expect(source).toMatch(
      /\n  validate:\n    needs: classify\n    if: needs\.classify\.outputs\.runtime == 'true'/u,
    );
    expect(source).not.toContain("github.event_name != 'schedule'");
  });

  it("still marks scheduled and manual runs as full validation", async () => {
    const source = await fs.readFile(".github/workflows/validate.yml", "utf8");
    expect(source).toContain('if [ "$GITHUB_EVENT_NAME" = "schedule" ]');
    expect(source).toContain('echo "runtime=true" >> "$GITHUB_OUTPUT"');
    expect(source).toContain('echo "routes=true" >> "$GITHUB_OUTPUT"');
  });
});
