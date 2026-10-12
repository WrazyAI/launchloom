import { describe, expect, it } from "vitest";
import { inferBusinessFocusTerms } from "../scripts/business-focus.mjs";

describe("business focus inference", () => {
  it("does not treat a bare leak mention as confirmed plumbing work", () => {
    expect(
      inferBusinessFocusTerms({
        businessName: "Leak Detection Roofing",
        businessKind: "home-services",
        industry: "home-services",
        services: ["Roof replacement"],
      }),
    ).toEqual(["roofing"]);
  });
});
