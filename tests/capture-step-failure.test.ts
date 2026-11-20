import { describe, expect, it } from "vitest";
import {
  extractFailureEvidence,
  failureCodeFor,
} from "../scripts/capture-step-failure.mjs";

describe("bounded failure evidence", () => {
  it("keeps only error-shaped lines from noisy step output", () => {
    const evidence = extractFailureEvidence(
      [
        "> build",
        "+ node scripts/build.mjs",
        "Compiling 42 pages",
        "\u001b[31mError: Cloudflare project lookup failed with HTTP 404\u001b[0m",
        "token=super-secret-value",
        "Contact owner@example.test or /home/runner/work/private/config.json",
        "Error: Cloudflare project lookup failed with HTTP 404",
        "Some unrelated progress line",
        'echo "::error title=old::required secret is missing"',
        '+ test -n "$SECRET"',
      ].join("\n"),
      1,
    );
    expect(evidence.code).toBe("HTTP_404");
    expect(evidence.detail).toContain("HTTP 404");
    expect(evidence.detail).not.toMatch(
      /super-secret|owner@example|home\/runner/u,
    );
    expect(evidence.detail.split("\n")).toHaveLength(1);
    expect(evidence.detail).not.toContain("required secret");
  });

  it("strips GitHub CLI log prefixes and shell source before selecting evidence", () => {
    const evidence = extractFailureEvidence(
      [
        'generate\tUNKNOWN STEP\t2026-11-20T17:43:39.1005074Z \u001b[36;1m --failure-next-step "Inspect the run"',
        "generate\tBuild and direct-upload public preview\t2026-11-20T17:43:39.2000000Z \u001b[31mError: preview upload failed with HTTP 502\u001b[0m",
        "generate\tUNKNOWN STEP\t2026-11-20T17:43:39.3000000Z ERROR: unrelated summary",
        '- locator resolved to <input required="" type="email" name="email">',
      ].join("\n"),
      1,
    );
    expect(evidence.code).toBe("HTTP_502");
    expect(evidence.detail).toContain("HTTP 502");
    expect(evidence.detail).not.toMatch(
      /UNKNOWN STEP|2026-|failure-next-step|\u001b/u,
    );
  });

  it("derives stable codes for common failures", () => {
    expect(failureCodeFor("request timed out", 1)).toBe("TIMEOUT");
    expect(failureCodeFor("permission denied", 1)).toBe("DENIED");
    expect(failureCodeFor("required secret is missing", 1)).toBe(
      "MISSING_INPUT",
    );
    expect(failureCodeFor("file not found", 1)).toBe("NOT_FOUND");
    expect(failureCodeFor("unknown crash", 7)).toBe("EXIT_7");
  });

  it("bounds a huge multiline failure and never echoes arbitrary output", () => {
    const evidence = extractFailureEvidence(
      Array.from({ length: 500 }, (_, index) =>
        index % 5 === 0
          ? `Error ${index}: upload failed with HTTP 502 https://private.test/${"x".repeat(2000)}`
          : `step ${index} ok`,
      ).join("\n"),
      1,
    );
    expect(evidence.detail.length).toBeLessThanOrEqual(600);
    expect(evidence.detail.split("\n").length).toBeLessThanOrEqual(4);
    expect(evidence.detail).not.toContain("private.test");
  });
});
