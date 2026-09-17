import { describe, expect, it } from "vitest";
import {
  applySafeVisualOperations,
  blockingFindings,
  buildSafeVisualManifest,
  parseVisualAuditChoice,
  parseVisualAuditContent,
  validateVisualAudit,
} from "../scripts/visual-quality-gate-lib.mjs";

const config: any = {
  preset: "premium-wellness",
  industry: "hospitality",
  businessKind: "bakery",
  business: {
    name: "Lumiere",
    email: "private@example.com",
    primaryCta: "Order",
    serviceAreas: ["Charleston"],
    phone: "555",
  },
  services: [
    { name: "Bread", slug: "bread", description: "Slow-fermented bread" },
  ],
  copy: { heroHeading: "Bread made slowly" },
  design: {
    recipe: "general-editorial",
    sections: [
      { id: "opening", type: "hero", variant: "editorial" },
      { id: "services", type: "services", variant: "editorial" },
      { id: "contact", type: "contact", variant: "consultation" },
    ],
  },
  assets: { logo: "https://secret.example/logo?token=secret", photoOne: "x" },
  lead: { token: "lead-secret" },
  review: { token: "review-secret" },
  conversion: {
    aiChat: { enabled: true, token: "chat-secret", apiUrl: "https://api" },
  },
};

describe("GLM visual quality gate", () => {
  it("parses structured JSON with or without a markdown fence", () => {
    const audit = {
      summary: "The page is sound.",
      verdict: "pass",
      findings: [],
      operations: [],
    };
    expect(parseVisualAuditContent(JSON.stringify(audit))).toEqual(audit);
    expect(
      parseVisualAuditContent("```json\n" + JSON.stringify(audit) + "\n```"),
    ).toEqual(audit);
  });

  it("rejects truncated visual audit choices so the caller can retry", () => {
    expect(() =>
      parseVisualAuditChoice({
        finish_reason: "length",
        message: { content: '{"summary":"cut off' },
      }),
    ).toThrow("truncated");
    expect(() =>
      parseVisualAuditChoice({
        finish_reason: "stop",
        message: { content: '{"summary":"cut off' },
      }),
    ).toThrow("incomplete or invalid JSON");
  });

  it("builds a bounded manifest without private delivery fields", () => {
    const serialized = JSON.stringify(buildSafeVisualManifest(config));
    expect(serialized).toContain("Bread made slowly");
    expect(serialized).not.toContain("private@example.com");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("apiUrl");
  });

  it("describes the selected experience renderer instead of stale legacy sections", () => {
    const experienceConfig = structuredClone(config);
    experienceConfig.design.experience = {
      packId: "bold-utility",
      blueprintVersion: 2,
      fingerprint:
        "bold-utility|utility-pill|editorial-dialogue|embedded-qualifier|service-chapters|quiet-ledger|conversation-handoff|humanist-calm|human-context|conversational|restrained|css|0|guided-stack|hero/conversion/services/trust/about/social-proof/faq/location-map/contact",
    };

    const manifest: any = buildSafeVisualManifest(experienceConfig);

    expect(manifest.design.renderer).toMatchObject({
      type: "experience-pack",
      packId: "bold-utility",
      navigation: "utility-pill",
      hero: "editorial-dialogue",
      conversion: "embedded-qualifier",
    });
    expect(manifest.design.requiredSections).toEqual([
      "hero",
      "conversion",
      "services",
      "faq",
      "contact",
    ]);
    expect(manifest.design.sections).toBeUndefined();
    expect(manifest.design.allowedVariants).toEqual({});
  });

  it("keeps versionless pack identifiers on the legacy visual contract", () => {
    const legacyConfig = structuredClone(config);
    legacyConfig.design.experience = { packId: "bold-utility" };

    const manifest: any = buildSafeVisualManifest(legacyConfig);

    expect(manifest.design.renderer.type).toBe("legacy-design-family");
    expect(manifest.design.sections).toHaveLength(3);
    expect(
      applySafeVisualOperations(legacyConfig, [
        {
          kind: "set_section_variant",
          sectionType: "hero",
          variant: "centered",
        },
      ] as any),
    ).toHaveLength(1);
  });

  it("applies only bounded layout operations", () => {
    const next = structuredClone(config);
    const applied = applySafeVisualOperations(next, [
      { kind: "set_copy", field: "heroHeading", value: "Unsafe rewrite" },
      { kind: "set_section_variant", sectionType: "hero", variant: "centered" },
      {
        kind: "set_design_treatment",
        density: "spacious",
        typography: "editorial",
      },
    ] as any);
    expect(applied).toHaveLength(2);
    expect(next.copy.heroHeading).toBe("Bread made slowly");
    expect(next.design.sections[0].variant).toBe("centered");
  });

  it("caps findings and identifies critical blockers", () => {
    const audit = validateVisualAudit({
      summary: "Broken copy",
      verdict: "block",
      findings: Array.from({ length: 10 }, (_, index) => ({
        category: "content-integrity",
        severity: index === 0 ? "critical" : "minor",
        viewport: "both",
        evidence: "A sentence is clipped",
        recommendation: "Repair the source copy",
      })),
      operations: [],
    });
    expect(audit.findings).toHaveLength(8);
    expect(blockingFindings(audit)).toHaveLength(1);
  });
});
