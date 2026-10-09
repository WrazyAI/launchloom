import { describe, expect, it } from "vitest";
import { auditUnsupportedBusinessClaims } from "../scripts/business-copy-claims.mjs";

describe("auditUnsupportedBusinessClaims", () => {
  it("does not treat the positive claim after 'not only' as negated", () => {
    expect(
      auditUnsupportedBusinessClaims(
        { copy: { heroBody: "Not only are our licensed technicians available today." } },
      ),
    ).toEqual(["availability", "credentials"]);
  });

  it("limits cautious-question handling to the clause that asks the question", () => {
    expect(
      auditUnsupportedBusinessClaims(
        {
          copy: {
            heroBody:
              "Ask whether licensed technicians are available today, but our certified team is available today.",
          },
        },
      ),
    ).toEqual(["availability", "credentials"]);
  });

  it("audits claims inside FAQ questions as well as answers", () => {
    expect(
      auditUnsupportedBusinessClaims({
        conversion: {
          faqs: [
            {
              question: "Why do our licensed technicians earn five-star reviews?",
              answer: "Ask us what to expect before booking.",
            },
          ],
        },
      }),
    ).toEqual(["credentials", "ratings"]);
  });

  it("flags unquantified medical outcome claims", () => {
    expect(
      auditUnsupportedBusinessClaims({
        copy: { heroBody: "Our home-care visits reduce fall risk." },
      }),
    ).toContain("outcomes");
  });

  it("flags a named staff member and role without intake evidence", () => {
    expect(
      auditUnsupportedBusinessClaims({
        copy: { heroBody: "Meet Maya, your care coordinator." },
      }),
    ).toContain("staff");
  });

  it("does not extend a price fact to a different service", () => {
    expect(
      auditUnsupportedBusinessClaims(
        { copy: { heroBody: "Every repair starts at $99." } },
        { offer: "$99 drain inspection" },
      ),
    ).toContain("pricing");
  });

  it("does not treat a city-only address as evidence of a visitable shop", () => {
    expect(
      auditUnsupportedBusinessClaims(
        { copy: { heroBody: "Visit our repair shop in Portland." } },
        { address: "Portland, OR", addressVisibility: "public" },
      ),
    ).toContain("physical location");
  });

  it("accepts a year-established claim from structured year evidence", () => {
    expect(
      auditUnsupportedBusinessClaims(
        { copy: { heroBody: "Established in 1998." } },
        { yearEstablished: "1998" },
      ),
    ).not.toContain("experience");
  });

  it("audits route-page copy for unsupported business claims too", () => {
    expect(
      auditUnsupportedBusinessClaims({
        pageContent: {
          "service:care": {
            introduction: { text: "Our licensed care team reduces fall risk." },
          },
        },
      }),
    ).toEqual(["credentials", "outcomes"]);
  });

  it("accepts a price and availability claim only when both match supplied evidence", () => {
    const claim = "Same-day brake repairs start at $99.";
    expect(
      auditUnsupportedBusinessClaims(
        { pageContent: { "service:brakes": { introduction: { text: claim } } } },
        { availability: claim, pricing: claim },
      ),
    ).toEqual([]);
  });

  it("does not treat a negated credential as evidence for its positive counterpart", () => {
    expect(
      auditUnsupportedBusinessClaims(
        { copy: { heroBody: "Our licensed technicians handle each repair." } },
        { credentials: ["Unlicensed technicians"] },
      ),
    ).toContain("credentials");
  });

  it("requires an exact monetary amount instead of a numeric prefix", () => {
    expect(
      auditUnsupportedBusinessClaims(
        { copy: { heroBody: "Brake inspection starts at $99." } },
        { pricing: "Brake inspection starts at $999." },
      ),
    ).toContain("pricing");
  });

  it("does not extend a limited warranty into a lifetime guarantee", () => {
    expect(
      auditUnsupportedBusinessClaims(
        { copy: { heroBody: "Every repair is guaranteed for life." } },
        { warranty: "Every repair is guaranteed for 12 months." },
      ),
    ).toContain("guarantees");
  });
});
