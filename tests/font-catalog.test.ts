import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import {
  FONT_FAMILIES,
  FONT_FAMILY_IDS,
  RECOMMENDED_PAIRINGS,
  fontFaceCss,
  fontFamilyById,
  fontFilesFor,
  fontStackFor,
  resolveFontPairing,
} from "../scripts/font-catalog.mjs";

describe("client font catalog", () => {
  it("keeps unique, complete families with local stacks", () => {
    expect(FONT_FAMILIES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(FONT_FAMILY_IDS).size).toBe(FONT_FAMILY_IDS.length);
    for (const family of FONT_FAMILIES) {
      expect(family.id).toMatch(/^[a-z0-9-]+$/u);
      expect(family.stack).toContain(`"${family.name}"`);
      expect(family.stack).toMatch(/serif|sans-serif|monospace/u);
      expect(family.weights).toContain(400);
      expect(family.weights).toContain(700);
      expect(family.googleAxes.length).toBeGreaterThan(0);
      for (const hint of family.pairingHints)
        expect(fontFamilyById(hint)).not.toBeNull();
    }
  });

  it("resolves stacks and falls back for unknown ids", () => {
    expect(fontStackFor("inter")).toContain('"Inter"');
    expect(fontStackFor("missing-id")).toContain('"Inter"');
    expect(fontStackFor("missing-id", "Georgia, serif")).toBe("Georgia, serif");
  });

  it("lists local woff2 files including body italic when supported", () => {
    const sourceSerif = fontFilesFor(fontFamilyById("source-serif")!);
    expect(sourceSerif.map((file) => [file.weight, file.style])).toEqual([
      [400, "normal"],
      [700, "normal"],
      [400, "italic"],
    ]);
    const manrope = fontFilesFor(fontFamilyById("manrope")!);
    expect(manrope.some((file) => file.style === "italic")).toBe(false);
    for (const file of sourceSerif)
      expect(file.path).toMatch(/^\/fonts\/source-serif\/[\w-]+\.woff2$/u);
  });

  it("renders @font-face rules for every vendored file", () => {
    const css = fontFaceCss();
    for (const family of FONT_FAMILIES)
      for (const file of fontFilesFor(family))
        expect(css).toContain(`url("${file.path}") format("woff2")`);
    expect(css).toContain('font-display:swap');
  });

  it("resolves explicit, partial, and absent client pairings", () => {
    expect(
      resolveFontPairing({ headingFont: "fraunces", bodyFont: "inter" }),
    ).toMatchObject({ heading: "fraunces", body: "inter" });
    const headingOnly = resolveFontPairing({ headingFont: "fraunces" });
    expect(headingOnly.heading).toBe("fraunces");
    expect(headingOnly.body).toBe("inter");
    const bodyOnly = resolveFontPairing({ bodyFont: "karla" });
    expect(bodyOnly.body).toBe("karla");
    expect(bodyOnly.heading).toBe("fraunces");
    expect(resolveFontPairing({ headingFont: "not-a-font" })).toMatchObject({
      heading: null,
      body: null,
      headingStack: "",
    });
    expect(resolveFontPairing({})).toMatchObject({ heading: null, body: null });
  });

  it("keeps recommended pairings pointing at catalog families", () => {
    expect(RECOMMENDED_PAIRINGS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(RECOMMENDED_PAIRINGS.map((pair) => pair.id)).size).toBe(
      RECOMMENDED_PAIRINGS.length,
    );
    for (const pair of RECOMMENDED_PAIRINGS) {
      expect(fontFamilyById(pair.heading)).not.toBeNull();
      expect(fontFamilyById(pair.body)).not.toBeNull();
      expect(pair.label.length).toBeGreaterThan(0);
    }
  });

  it("ships every catalog woff2 file in both public directories", async () => {
    const targets = ["public/fonts", "templates/client-site/public/fonts"];
    for (const family of FONT_FAMILIES)
      for (const file of fontFilesFor(family))
        for (const target of targets) {
          const location = path.join(
            target,
            family.id,
            path.basename(file.path),
          );
          await expect(fs.access(location)).resolves.toBeUndefined();
        }
  });
});
