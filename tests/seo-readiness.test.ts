import { describe, expect, it } from "vitest";
import {
  isAffirmativeConfirmation,
  seoResearchReadiness,
} from "../worker/src/seo-readiness";

describe("SEO publication readiness", () => {
  it("allows researched and legacy sites but blocks degraded new previews", () => {
    expect(seoResearchReadiness({}).allowed).toBe(true);
    expect(
      seoResearchReadiness({
        seoResearch: { mode: "researched", publishReady: true },
      }),
    ).toEqual({ allowed: true, mode: "researched" });
    expect(
      seoResearchReadiness({
        seoResearch: { mode: "researched", publishReady: false },
      }).allowed,
    ).toBe(false);
    expect(
      seoResearchReadiness({ seoResearch: { mode: "context-only" } }),
    ).toMatchObject({
      allowed: false,
      mode: "context-only",
      code: "seo_research_required",
    });
  });

  it("accepts only explicit confirmation values", () => {
    expect(isAffirmativeConfirmation(true)).toBe(true);
    expect(isAffirmativeConfirmation("yes")).toBe(true);
    expect(isAffirmativeConfirmation("on")).toBe(true);
    expect(isAffirmativeConfirmation("false")).toBe(false);
    expect(isAffirmativeConfirmation(false)).toBe(false);
  });
});
