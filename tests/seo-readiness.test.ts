import { describe, expect, it } from "vitest";
import { seoResearchReadiness } from "../worker/src/seo-readiness";

describe("SEO publication readiness", () => {
  it("allows researched and legacy sites but blocks degraded new previews", () => {
    expect(seoResearchReadiness({}).allowed).toBe(true);
    expect(
      seoResearchReadiness({ seoResearch: { mode: "researched" } }),
    ).toEqual({ allowed: true, mode: "researched" });
    expect(
      seoResearchReadiness({ seoResearch: { mode: "context-only" } }),
    ).toMatchObject({
      allowed: false,
      mode: "context-only",
      code: "seo_research_required",
    });
  });
});
