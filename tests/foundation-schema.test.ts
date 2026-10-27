import { describe, expect, it } from "vitest";
import {
  buildFoundationManifest,
  computeFoundationFingerprint,
  validateFoundationManifest,
} from "../scripts/foundation-schema.mjs";

const digest = "a".repeat(64);

function validInput(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "spicer-landscaping-season-wheel",
    dossierId: "spicer-landscaping-season-wheel",
    sourceDigest: digest,
    entrypoint: "source/index.html",
    sourceClass: "licensed",
    license: {
      name: "CC BY 4.0",
      url: "https://www.spicerdesigns.com",
      credit: "Template adapted from Spicer Designs",
    },
    sections: [
      {
        id: "hero",
        sourceSelector: "header",
        order: 1,
        role: "hero",
        required: true,
      },
      {
        id: "services",
        sourceSelector: "#work",
        order: 2,
        role: "services",
        required: true,
      },
    ],
    slots: [
      {
        id: "hero.heading",
        selector: "header h1",
        kind: "text",
        contentPath: "hero.heading",
        required: true,
      },
      {
        id: "hero.image",
        selector: "header img",
        kind: "image",
        contentPath: "hero.image",
        required: false,
      },
    ],
    assets: [
      {
        source: "hero.webp",
        target: "assets/hero.webp",
        role: "reference-only",
        required: false,
      },
    ],
    interactions: [
      {
        id: "season-selector",
        source: "button[aria-pressed]",
        primitive: "native-buttons",
        reducedMotion: "static",
      },
    ],
    preservedMechanics: ["section-order", "css-system"],
    prohibitedSourceMaterial: ["brand", "copy", "prices"],
    compatibility: "renderable",
    blockers: [],
    ...overrides,
  };
}

describe("foundation manifest schema", () => {
  it("builds, fingerprints, and freezes a valid manifest", () => {
    const manifest = buildFoundationManifest(validInput());
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.id).toBe("spicer-landscaping-season-wheel");
    expect(manifest.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.sections)).toBe(true);
    expect(Object.isFrozen(manifest.sections[0])).toBe(true);
    expect(() => validateFoundationManifest(manifest)).not.toThrow();
  });

  it("computes a stable fingerprint that changes with section order", () => {
    const first = validInput();
    const second = validInput();
    const reordered = validInput({
      sections: [...validInput().sections].reverse().map((section, index) => ({
        ...section,
        order: index + 1,
      })),
    });
    expect(computeFoundationFingerprint(first)).toBe(
      computeFoundationFingerprint(second),
    );
    expect(computeFoundationFingerprint(first)).not.toBe(
      computeFoundationFingerprint(reordered),
    );
  });

  it("rejects a missing or malformed source digest", () => {
    expect(() =>
      buildFoundationManifest(validInput({ sourceDigest: "" })),
    ).toThrow(/sourceDigest/u);
    expect(() =>
      buildFoundationManifest(validInput({ sourceDigest: "not-a-digest" })),
    ).toThrow(/sourceDigest/u);
  });

  it("rejects an unknown slot kind", () => {
    expect(() =>
      buildFoundationManifest(
        validInput({
          slots: [
            {
              id: "hero.heading",
              selector: "header h1",
              kind: "magic",
              contentPath: "hero.heading",
              required: true,
            },
          ],
        }),
      ),
    ).toThrow(/kind/u);
  });

  it("rejects a renderable foundation with an unbound required slot", () => {
    expect(() =>
      buildFoundationManifest(
        validInput({
          slots: [
            {
              id: "hero.heading",
              selector: "header h1",
              kind: "text",
              required: true,
            },
          ],
        }),
      ),
    ).toThrow(/contentPath/u);
  });

  it("rejects a renderable foundation with blockers", () => {
    expect(() =>
      buildFoundationManifest(
        validInput({
          blockers: [{ code: "remote-image", message: "Remote image found." }],
        }),
      ),
    ).toThrow(/renderable/u);
  });

  it("rejects duplicate section ids and non-contiguous order", () => {
    expect(() =>
      buildFoundationManifest(
        validInput({
          sections: [
            {
              id: "hero",
              sourceSelector: "header",
              order: 1,
              role: "hero",
              required: true,
            },
            {
              id: "hero",
              sourceSelector: "#work",
              order: 2,
              role: "services",
              required: true,
            },
          ],
        }),
      ),
    ).toThrow(/duplicate section id/u);
    expect(() =>
      buildFoundationManifest(
        validInput({
          sections: [
            {
              id: "hero",
              sourceSelector: "header",
              order: 2,
              role: "hero",
              required: true,
            },
          ],
        }),
      ),
    ).toThrow(/order/u);
  });

  it("rejects remote and escaping asset targets", () => {
    expect(() =>
      buildFoundationManifest(
        validInput({
          assets: [
            {
              source: "https://example.test/hero.jpg",
              target: "assets/hero.jpg",
              role: "reference-only",
              required: false,
            },
          ],
        }),
      ),
    ).toThrow(/remote/u);
    expect(() =>
      buildFoundationManifest(
        validInput({
          assets: [
            {
              source: "hero.webp",
              target: "../hero.webp",
              role: "reference-only",
              required: false,
            },
          ],
        }),
      ),
    ).toThrow(/relative/u);
  });

  it("requires a blocker for blocked and needs-adaptation states", () => {
    for (const compatibility of ["blocked", "needs-adaptation"]) {
      expect(() =>
        buildFoundationManifest(validInput({ compatibility, blockers: [] })),
      ).toThrow(/blocker/u);
    }
  });

  it("rejects an unknown compatibility state", () => {
    expect(() =>
      buildFoundationManifest(validInput({ compatibility: "maybe" })),
    ).toThrow(/compatibility/u);
  });
});
