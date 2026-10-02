import { describe, expect, it } from "vitest";
import { compileCanonicalSiteBrief } from "../scripts/compile-canonical-site-brief.mjs";
import {
  normalise,
  prepareGenerationIntake,
} from "../scripts/generate-site-config.mjs";
import { normalizeClientIntake } from "../src/lib/client-intake-v2.mjs";
import { seoResearchReadiness } from "../templates/client-site/src/lib/seo-readiness.mjs";

const intake = {
  intakeVersion: "2",
  submissionId: "submission-fact-fixture-001",
  businessName: "Fixture Plumbing",
  contactName: "Fixture Owner",
  email: "owner@example.test",
  phone: "555-0100",
  leadEmail: "leads@example.test",
  address: "71 Private Lane, Tacoma, WA",
  placeId: "private-place-id",
  googleMapsUrl: "https://maps.google.com/?q=71+Private+Lane",
  services: "Drain cleaning",
  primaryCity: "Tacoma, WA",
  serviceAreas: "Tacoma, WA",
  serviceRadius: "10",
  industry: "home-services",
  confirmAccuracy: "yes",
  primaryCta: "Request a quote",
};

describe("confirmed business facts and public address boundaries", () => {
  it("classifies supplied facts and deferrable unknowns without inventing values", () => {
    const brief = compileCanonicalSiteBrief({
      intake: { ...intake, hours: "UNKNOWN", yearEstablished: "UNKNOWN" },
    });
    expect(brief.version).toBe(2);
    expect(brief.factBrief).toMatchObject({ version: 1, launchReady: true });
    expect(
      brief.factBrief.facts.find((fact) => fact.key === "businessName"),
    ).toMatchObject({
      state: "confirmed",
      source: "client_supplied",
      publicDisplay: true,
      value: intake.businessName,
    });
    expect(
      brief.factBrief.facts.find((fact) => fact.key === "hours"),
    ).toMatchObject({ state: "missing-deferrable", value: "" });
    expect(
      brief.factBrief.facts.find((fact) => fact.key === "yearEstablished")
        ?.value,
    ).toBe("");
  });

  it("blocks public contact/service data that no longer matches a ready fact contract", () => {
    const config = normalise({}, compileCanonicalSiteBrief({ intake }));
    expect(
      seoResearchReadiness({
        ...config,
        seoResearch: undefined,
        business: { ...config.business, phone: "" },
      }),
    ).toMatchObject({ allowed: false, code: "business_facts_required" });
    expect(
      seoResearchReadiness({ ...config, seoResearch: undefined, services: [] }),
    ).toMatchObject({ allowed: false, code: "business_facts_required" });
  });

  it("does not trust an old ready summary after raw facts change", () => {
    const prior = prepareGenerationIntake(
      compileCanonicalSiteBrief({ intake }),
    );
    const changed = normalise(
      {},
      { ...prior, excludedServices: ["Drain cleaning"] },
    );
    expect(changed.factReadiness.launchReady).toBe(false);
    expect(
      seoResearchReadiness({ ...changed, seoResearch: undefined }),
    ).toMatchObject({ allowed: false, code: "business_facts_required" });
  });

  it("retains conflicting service facts as blockers rather than choosing a claim", () => {
    const brief = compileCanonicalSiteBrief({
      intake: { ...intake, excludedServices: "Drain cleaning" },
    });
    expect(brief.factBrief.launchReady).toBe(false);
    expect(
      brief.factBrief.facts.find((fact) => fact.key === "services"),
    ).toMatchObject({ state: "contradictory", value: ["Drain cleaning"] });
    const config = normalise({}, brief);
    expect(
      seoResearchReadiness({ ...config, seoResearch: undefined }),
    ).toMatchObject({ allowed: false, code: "business_facts_required" });
  });

  it("keeps private operational facts in the brief and out of generation/public config", () => {
    const brief = compileCanonicalSiteBrief({
      intake: { ...intake, addressVisibility: "private" },
    });
    expect(brief.businessTruth.address).toBe(intake.address);
    expect(brief.address).toBe("");
    const modelBrief = prepareGenerationIntake(brief);
    expect(JSON.stringify(modelBrief)).not.toContain(intake.address);
    expect(JSON.stringify(modelBrief)).not.toContain(intake.placeId);
    expect(JSON.stringify(modelBrief)).not.toContain(intake.googleMapsUrl);
    const config = normalise(
      { business: { address: intake.address, placeId: intake.placeId } },
      brief,
    );
    expect(config.business).toMatchObject({
      address: "",
      addressVisibility: "private",
      placeId: "",
      googleMapsUrl: "",
    });
    expect(JSON.stringify(config)).not.toContain(intake.address);
    expect(config.factReadiness).toMatchObject({
      version: 1,
      launchReady: true,
    });
  });

  it("does not reintroduce private locations through research snippets", () => {
    const modelBrief = prepareGenerationIntake({
      ...intake,
      addressVisibility: "private",
      seoResearch: {
        version: 2,
        evidence: [{ snippet: intake.address }],
        externalSearchEvidence: [{ snippet: intake.address }],
      },
    });
    expect(JSON.stringify(modelBrief)).not.toContain(intake.address);
  });

  it("redacts a private address repeated in notes or a model-authored field", () => {
    const raw = {
      ...intake,
      addressVisibility: "private",
      brandNotes: `Do not display ${intake.address}.`,
    };
    expect(JSON.stringify(prepareGenerationIntake(raw))).not.toContain(
      intake.address,
    );
    const candidate = {
      business: {
        description: `Visit ${intake.address} to ask about drain cleaning.`,
      },
    };
    expect(JSON.stringify(normalise(candidate, raw))).not.toContain(
      intake.address,
    );
  });

  it("permits an omitted v2 street address and preserves a safe public summary", () => {
    expect(
      normalizeClientIntake({
        ...intake,
        address: "",
        addressVisibility: "private",
      }).address,
    ).toBe("");
    const brief = compileCanonicalSiteBrief({
      intake: { ...intake, addressVisibility: "private" },
    });
    const serialized = JSON.stringify(
      normalise({}, prepareGenerationIntake(brief)),
    );
    expect(serialized).not.toContain(intake.address);
    expect(serialized).not.toContain('"factBrief"');
  });

  it("preserves explicitly public and legacy addresses", () => {
    for (const addressVisibility of [undefined, "public"]) {
      const brief = compileCanonicalSiteBrief({
        intake: { ...intake, addressVisibility },
      });
      expect(brief.address).toBe(intake.address);
      expect(normalise({}, brief).business.address).toBe(intake.address);
    }
  });

  it("does not turn UNKNOWN into a public address or a fabricated fact", () => {
    const brief = compileCanonicalSiteBrief({
      intake: { ...intake, address: "UNKNOWN", placeId: "", googleMapsUrl: "" },
    });
    expect(brief.address).toBe("");
    expect(brief.factBrief.launchReady).toBe(true);
    expect(normalise({}, brief).business.address).toBe("");
  });

  it("keeps requested directions plus a private location contradictory and blocks publication", () => {
    const brief = compileCanonicalSiteBrief({
      intake: {
        ...intake,
        addressVisibility: "private",
        primaryCta: "Get directions",
      },
    });
    expect(brief.factBrief.launchReady).toBe(false);
    expect(
      brief.factBrief.facts.find((fact) => fact.key === "primaryCta")?.state,
    ).toBe("contradictory");
    expect(normalise({}, brief).business.primaryCta).toBe("Contact us");
  });

  it("normalizes the persisted research language consistently", () => {
    expect(
      normalizeClientIntake({ ...intake, researchLanguageCode: "ES" })
        .researchLanguageCode,
    ).toBe("es");
    expect(
      normalizeClientIntake({ ...intake, researchLanguageCode: "invalid" })
        .researchLanguageCode,
    ).toBe("en");
  });

  it("validates visibility and carries private consent through normalized intake", () => {
    expect(
      normalizeClientIntake({ ...intake, addressVisibility: "private" }),
    ).toMatchObject({ addressVisibility: "private", address: intake.address });
    expect(() =>
      normalizeClientIntake({ ...intake, addressVisibility: "invalid" }),
    ).toThrow(/address visibility/i);
  });

  it("keeps missing contact facts launch-blocking while retaining preview data", () => {
    const brief = compileCanonicalSiteBrief({
      intake: { ...intake, phone: "UNKNOWN" },
    });
    expect(
      brief.factBrief.facts.find((fact) => fact.key === "phone"),
    ).toMatchObject({ state: "launch-blocking", value: "" });
    expect(brief.phone).toBe("");
    expect(normalise({}, brief).factReadiness.launchReady).toBe(false);
  });
});
