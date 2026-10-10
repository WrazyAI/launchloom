import { describe, expect, it } from "vitest";
import { resolvePipelineTestPolicy, parsePipelineTestArgs } from "../scripts/pipeline-test-policy.mjs";
import * as generationPolicy from "../scripts/pipeline-test-policy.mjs";
import { pipelineTestBannerMessage } from "../templates/client-site/src/lib/pipeline-test-preview.mjs";

describe("focused pipeline execution policy", () => {
  it("allows a no-issue access-only manual workflow without entering generation profiles", () => {
    expect(generationPolicy.resolveWorkflowTestDispatch).toBeTypeOf("function");
    expect(
      generationPolicy.resolveWorkflowTestDispatch({
        profile: "access-only",
        eventName: "workflow_dispatch",
        issue: "",
      }),
    ).toEqual({ profile: "access-only", requiresIntakeIssue: false });
    expect(() =>
      generationPolicy.resolveWorkflowTestDispatch({
        profile: "access-only",
        eventName: "repository_dispatch",
        issue: "",
      }),
    ).toThrow(/manual/i);
    expect(() =>
      generationPolicy.resolveWorkflowTestDispatch({
        profile: "seo-only",
        eventName: "workflow_dispatch",
        issue: "",
      }),
    ).toThrow(/issue/i);
  });
  it("rejects synthetic demo provenance from the default production generation mode", () => {
    expect(generationPolicy.assertGenerationMode).toBeTypeOf("function");
    expect(() => generationPolicy.assertGenerationMode(
      { demoNotice: "Fictional pipeline demo" },
      { profile: "full" },
    )).toThrow(/test-only.*full-preview/i);
    expect(generationPolicy.assertGenerationMode(
      { demoNotice: "Fictional pipeline demo" },
      { profile: "full-preview" },
    )).toMatchObject({ profile: "full-preview", testOnly: true });
  });
  it.each([
    ["seo-only", "Creative evaluation and visual promotion skipped"],
    ["creative-only", "SEO research skipped"],
    ["full-preview", "SEO and creative lanes ran"],
  ])("shares the rendered lane message for %s", (profile, message) => {
    expect(pipelineTestBannerMessage(profile)).toBe(message);
  });
  it("keeps ordinary intake on the full three-candidate gated pipeline", () => {
    expect(resolvePipelineTestPolicy({ eventName: "repository_dispatch" })).toMatchObject({ profile: "full", testOnly: false, candidateCount: 3, runSeoResearch: true, runCreativeChecks: true, repairCycles: 3 });
  });
  it("SEO-only uses at most one candidate and no aesthetic repairs", () => {
    expect(resolvePipelineTestPolicy({ profile: "seo-only" })).toMatchObject({ testOnly: true, candidateCount: 1, runSeoResearch: true, runCreativeChecks: false, repairCycles: 0 });
  });
  it("creative-only keeps authoring but disables external SEO research", () => {
    expect(resolvePipelineTestPolicy({ profile: "creative-only" })).toMatchObject({ testOnly: true, candidateCount: 3, runSeoResearch: false, runCreativeChecks: true, repairCycles: 3 });
  });
  it("full-preview runs both lanes while remaining test-only", () => {
    expect(resolvePipelineTestPolicy({ profile: "full-preview" })).toMatchObject({
      profile: "full-preview",
      testOnly: true,
      candidateCount: 3,
      runSeoResearch: true,
      runCreativeChecks: true,
      repairCycles: 3,
    });
  });
  it("requires manual dispatch for the combined test-only preview", () => {
    expect(() => resolvePipelineTestPolicy({ profile: "full-preview", eventName: "repository_dispatch" })).toThrow(/manual/i);
  });
  it("rejects profile injection in automatic client intakes", () => {
    expect(() => resolvePipelineTestPolicy({ profile: "seo-only", eventName: "repository_dispatch" })).toThrow(/manual/i);
  });
  it("maps valueless skip aliases without swallowing the next option", () => {
    expect(parsePipelineTestArgs(["--skip-creative-author-checks", "--issue", "93"])).toMatchObject({ profile: "seo-only", issue: "93" });
    expect(parsePipelineTestArgs(["--skip-seo-addon", "--issue", "93"])).toMatchObject({ profile: "creative-only", issue: "93" });
  });
  it("rejects contradictory flags and explicit profile conflicts", () => {
    expect(() => parsePipelineTestArgs(["--skip-seo-addon", "--skip-creative-author-checks"])).toThrow(/conflict/i);
    expect(() => parsePipelineTestArgs(["--test-profile", "creative-only", "--skip-creative-author-checks"])).toThrow(/conflict/i);
    expect(() => resolvePipelineTestPolicy({ profile: "typo" })).toThrow(/profile/i);
  });
  it("does not interpret string false as an enabled bypass", () => {
    expect(resolvePipelineTestPolicy({ skipSeoAddon: "false" }).profile).toBe("full");
  });
});
