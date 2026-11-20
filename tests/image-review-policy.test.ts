import { describe, expect, it } from "vitest";
import {
  IMAGE_REVIEW_POLICY_VERSION,
  assetReviewReasonCodes,
  buildReviewInstructions,
  imageRetryPrompt,
  normalizeReviewChecks,
  reviewPolicyFor,
  reviewSchema,
  reviewSessionKey,
} from "../scripts/image-review-policy.mjs";

const approvedChecks = {
  isStandaloneImage: true,
  containsWebsiteOrInterface: false,
  containsProminentText: false,
  containsLogoOrWatermark: false,
  containsPeople: false,
  peopleAreIncidental: false,
  matchesIntendedScene: true,
};

describe("generated-image review policy", () => {
  it("forbids people for regulated or staffed services and allows only incidental people for lifestyle kinds", () => {
    expect(reviewPolicyFor({ businessKind: "dental", placement: "hero" }).peopleMode).toBe("forbid");
    expect(reviewPolicyFor({ businessKind: "home-care", placement: "hero" }).peopleMode).toBe("forbid");
    expect(reviewPolicyFor({ businessKind: "restaurant", placement: "secondary" }).peopleMode).toBe("incidental");
    expect(reviewPolicyFor({ businessKind: "architecture", placement: "hero" }).peopleMode).toBe("incidental");
    expect(reviewPolicyFor({ businessKind: "hospitality", placement: "hero" }).peopleMode).toBe("incidental");
  });

  it("rejects a distant person under a forbid policy but allows an ambient figure under an incidental policy", () => {
    const forbid = reviewPolicyFor({ businessKind: "dental", placement: "hero" });
    const incidental = reviewPolicyFor({ businessKind: "hospitality", placement: "hero" });
    const people = { ...approvedChecks, containsPeople: true, peopleAreIncidental: true };
    expect(assetReviewReasonCodes(people, forbid)).toContain("people_or_faces");
    expect(assetReviewReasonCodes(people, incidental)).not.toContain("people_or_faces");
  });

  it("rejects a close, identifiable person even under an incidental policy", () => {
    const incidental = reviewPolicyFor({ businessKind: "restaurant", placement: "hero" });
    const posed = { ...approvedChecks, containsPeople: true, peopleAreIncidental: false };
    expect(assetReviewReasonCodes(posed, incidental)).toEqual(["people_or_faces"]);
  });

  it("does not treat incidental small lettering as a rejection, only prominent text", () => {
    const policy = reviewPolicyFor({ businessKind: "restaurant", placement: "hero" });
    expect(assetReviewReasonCodes({ ...approvedChecks, containsProminentText: true }, policy)).toContain("visible_text");
    expect(assetReviewReasonCodes(approvedChecks, policy)).toEqual([]);
  });

  it("rejects a standalone image that does not match the supplied scene", () => {
    const policy = reviewPolicyFor({ businessKind: "architecture", placement: "hero" });
    expect(
      assetReviewReasonCodes({ ...approvedChecks, matchesIntendedScene: false }, policy),
    ).toEqual(["irrelevant_subject"]);
  });

  it("accepts version-one review fields so cached verdicts stay readable", () => {
    const checks = normalizeReviewChecks({
      isStandaloneImage: true,
      containsWebsiteOrInterface: false,
      containsVisibleTextOrTextLikeMarks: false,
      containsLogoOrWatermark: false,
      containsPeople: false,
      isRelevantToBusiness: true,
    });
    expect(checks).toMatchObject({
      containsProminentText: false,
      matchesIntendedScene: true,
      peopleAreIncidental: false,
    });
    expect(reviewSchema().schema.required).toContain("matchesIntendedScene");
  });

  it("builds scene-grounded instructions that state the niche and placement", () => {
    const policy = reviewPolicyFor({ businessKind: "architecture", placement: "hero" });
    const instructions = buildReviewInstructions({
      placement: "hero",
      businessKind: "architecture",
      services: ["Custom home design", "Renovation planning"],
      familyId: "guided-conversation",
      scene: "A quiet architectural interior with daylight and timber, no people.",
      policy,
    });
    expect(instructions).toContain("hero");
    expect(instructions).toContain("architecture");
    expect(instructions).toContain("A quiet architectural interior");
    expect(instructions).toContain("ambient");
    expect(instructions).not.toMatch(/^Approve only one standalone image/mu);
  });

  it("turns each rejection reason into a specific retry instruction", () => {
    const policy = reviewPolicyFor({ businessKind: "dental", placement: "hero" });
    const prompt = imageRetryPrompt(
      "Create a calm clinical detail.",
      ["people_or_faces", "visible_text"],
      policy,
      1500,
    );
    expect(prompt).toContain("calm clinical detail");
    expect(prompt).toContain("No people");
    expect(prompt).toContain("prominent lettering");
    expect(prompt.length).toBeLessThanOrEqual(1500);
  });

  it("separates review sessions by policy and scene so an old verdict cannot be reused", () => {
    const base = { model: "deepseek/deepseek-v4.1-flash", policyVersion: IMAGE_REVIEW_POLICY_VERSION };
    const first = reviewSessionKey({ ...base, scene: "Scene A" });
    expect(first).toBe(reviewSessionKey({ ...base, scene: "Scene A" }));
    expect(first).not.toBe(reviewSessionKey({ ...base, scene: "Scene B" }));
    expect(first).not.toBe(reviewSessionKey({ ...base, policyVersion: "visual-review-v1", scene: "Scene A" }));
  });
});
