import { describe, expect, it } from "vitest";
import { resolveEffectiveRenderer } from "../scripts/resolve-effective-renderer.mjs";

describe("effective renderer policy", () => {
  it("keeps creative when production references are available", () => {
    expect(
      resolveEffectiveRenderer({
        requested: "creative",
        profile: "full",
        creativeReferencesAvailable: true,
        packId: "editorial-ledger",
      }),
    ).toMatchObject({
      effective: "creative",
      degraded: false,
      reason: "creative-references-available",
    });
  });

  it("falls back to the configured pack when creative references are short", () => {
    expect(
      resolveEffectiveRenderer({
        requested: "creative",
        profile: "full",
        creativeReferencesAvailable: false,
        packId: "editorial-ledger",
        packVariant: "standard",
      }),
    ).toMatchObject({
      effective: "pack",
      degraded: true,
      reason: "creative-reference-shortage",
      packId: "editorial-ledger",
      packVariant: "standard",
    });
  });

  it("falls back to foundation when no pack is available", () => {
    expect(
      resolveEffectiveRenderer({
        requested: "creative",
        profile: "full-preview",
        creativeReferencesAvailable: false,
        foundationId: "anchor-foundation",
      }),
    ).toMatchObject({
      effective: "foundation",
      degraded: true,
      reason: "creative-reference-shortage",
      foundationId: "anchor-foundation",
    });
  });

  it("fails closed when no renderer can build", () => {
    expect(
      resolveEffectiveRenderer({
        requested: "creative",
        profile: "full",
        creativeReferencesAvailable: false,
      }),
    ).toMatchObject({
      effective: null,
      degraded: true,
      reason: "no-renderer",
    });
  });

  it("falls back from an unavailable pack to foundation", () => {
    expect(
      resolveEffectiveRenderer({
        requested: "pack",
        profile: "full",
        packId: "",
        foundationId: "anchor-foundation",
      }),
    ).toMatchObject({
      effective: "foundation",
      reason: "pack-unavailable",
    });
  });

  it("does not fall back for focused profiles", () => {
    expect(
      resolveEffectiveRenderer({
        requested: "creative",
        profile: "creative-only",
        creativeReferencesAvailable: false,
        packId: "editorial-ledger",
        foundationId: "anchor-foundation",
      }),
    ).toMatchObject({
      effective: null,
      reason: "focused-profile-needs-references",
    });
  });

  it("rejects unknown renderers and missing required identifiers", () => {
    expect(
      resolveEffectiveRenderer({ requested: "legacy", profile: "full" }),
    ).toMatchObject({ effective: null, reason: "unknown-renderer" });
    expect(
      resolveEffectiveRenderer({
        requested: "foundation",
        profile: "full",
      }),
    ).toMatchObject({ effective: null, reason: "foundation-unavailable" });
  });
});
