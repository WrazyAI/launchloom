import { describe, expect, it } from "vitest";
import {
  applyOperation,
  deterministicOperations,
  expectedArtifacts,
  removeEmDashes,
  verifyRevision,
} from "../scripts/revision-engine.mjs";

const config = (): any => ({
  business: { name: "Daley Hope", placeId: "" },
  style: { primaryColor: "#205d51" },
  copy: { heroKicker: "Clear care" },
  differentiators: ["Experienced support", "Personal care plans"],
  services: [{ name: "Home care" }],
});

describe("revision operations", () => {
  it("adds a verified proof fallback instead of fabricating testimonials", () => {
    const draft = config();
    const operations = deterministicOperations(
      "Can you add a testimonials section?",
      draft,
    );
    expect(operations).toEqual([
      expect.objectContaining({
        kind: "set_social_proof",
        source: "verified_differentiators",
      }),
    ]);
    expect(applyOperation(draft, operations[0])).toBe(true);
    expect(draft.socialProof.points).toEqual([
      "Experienced support",
      "Personal care plans",
    ]);
    expect(JSON.stringify(draft)).not.toMatch(/testimonial|"quote"/i);
  });

  it("uses Google reviews only with a retained Place ID", () => {
    const draft = config();
    draft.business.placeId = "ChIJ-example";
    const [operation] = deterministicOperations("Add customer reviews", draft);
    expect(operation).toMatchObject({
      kind: "set_social_proof",
      source: "google_reviews",
    });
  });

  it("turns a color request into a bounded accessible palette revision", () => {
    const draft = config();
    const [operation] = deterministicOperations(
      "I do not like the colors on the site.",
      draft,
    );
    expect(operation).toMatchObject({ kind: "set_color_palette" });
    expect(applyOperation(draft, operation)).toBe(true);
    expect(draft.style).toMatchObject({
      primaryColor: "#28566b",
      surfaceColor: "#f7faf9",
    });
  });

  it("requires the expected rendered artifact before a revision can send", () => {
    const draft = config();
    const [operation] = deterministicOperations("Add testimonials", draft);
    applyOperation(draft, operation);
    const report = {
      operations: [operation],
      expectedArtifacts: expectedArtifacts([operation]),
      requestedSocialProof: true,
    };
    expect(verifyRevision(draft, report, "<main></main>").ok).toBe(false);
    expect(
      verifyRevision(draft, report, '<section id="social-proof"></section>'),
    ).toEqual({ ok: true, failures: [] });
  });

  it("does not permit an operation to alter protected business facts", () => {
    const draft = config();
    expect(
      applyOperation(draft, {
        kind: "set_business",
        field: "name",
        value: "Changed",
      }),
    ).toBe(false);
    expect(draft.business.name).toBe("Daley Hope");
  });

  it("removes em dashes from rendered configuration content", () => {
    const draft = removeEmDashes({
      copy: { heroKicker: "Clear care — at home" },
      services: ["Support — when needed"],
    });
    expect(JSON.stringify(draft)).not.toContain("—");
    expect(draft.copy.heroKicker).toBe("Clear care - at home");
  });
});
