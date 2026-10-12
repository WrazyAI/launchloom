import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { refineDesignPrompt } from "../scripts/refine-reference-design-prompts.mjs";
import {
  assertReferenceDossierPack,
  loadReferenceDossier,
  referenceDossierPromptBlock,
} from "../scripts/reference-dossier.mjs";
import { buildInspirationPack } from "../scripts/inspiration-registry.mjs";
import { buildArchiveDesignPrompt } from "../scripts/materialize-a1-archive-dossiers.mjs";

const library = "data/reference-library/dossiers";
const manifestFor = (id: string) =>
  JSON.parse(fs.readFileSync(path.join(library, id, "manifest.json"), "utf8"));

describe("reference design prompt refinements", () => {
  it("preserves observations and is idempotent without copying the upstream skill", () => {
    const original =
      "# Visual hierarchy\n\nA deliberately hand-authored observation.\n";
    const manifest = manifestFor("web-architecture-studio-peake");
    const refined = refineDesignPrompt(original, manifest);
    expect(refined.startsWith(original)).toBe(true);
    expect(refineDesignPrompt(refined, manifest)).toBe(refined);
    expect(refined).toContain("media-overlay / copy-over-media");
    expect(refined).toContain("bottom-anchored-serif-image-title");
    expect(refined).not.toContain("This client has already rejected proposals");
    expect(refined).toContain("not a new screenshot measurement");
    const suffix =
      "\n\n## Curator follow-up\nKeep this note after the managed brief.\n";
    expect(refineDesignPrompt(refined + suffix, manifest)).toBe(
      refined + suffix,
    );
  });

  it("fails before exceeding the loader budget or accepting broken boundaries", () => {
    const manifest = manifestFor("web-architecture-studio-peake");
    expect(() => refineDesignPrompt("x".repeat(18_000), manifest)).toThrow(
      /budget/,
    );
    expect(() =>
      refineDesignPrompt("<!-- launchloom:design-guidance:start -->", manifest),
    ).toThrow(/boundaries/);
    expect(() =>
      refineDesignPrompt(
        "<!-- launchloom:design-guidance:end --><!-- launchloom:design-guidance:start -->",
        manifest,
      ),
    ).toThrow(/boundaries/);
    const once = refineDesignPrompt("Original notes", manifest);
    expect(() => refineDesignPrompt(once + once, manifest)).toThrow(
      /boundaries/,
    );
  });

  it("keeps archive refinements on the materializer's regeneration path", () => {
    const manifest = manifestFor("attested-future-fitness");
    const prompt = buildArchiveDesignPrompt(
      {
        name: manifest.referenceName,
        familyId: manifest.familyId,
        sourceUrl: manifest.source.url,
        discoveryUrl: "https://example.com/discovery",
        prompt: {
          visual: "Preserved opening observation.",
          sequence: "Preserved page order.",
          responsive: "Preserved mobile observation.",
          signatures: "Preserved signatures.",
          prohibited: "Never copy source identity.",
        },
      },
      manifest,
    );
    expect(prompt).toContain("Preserved opening observation.");
    expect(prompt).toContain("## Agent implementation brief");
    expect(prompt).toContain("Archive-only");
    expect(refineDesignPrompt(prompt, manifest)).toBe(prompt);
  });

  it("distinguishes mobile topology and does not invent topology for an archive", () => {
    const manifest = manifestFor("web-architecture-studio-peake");
    manifest.referenceDna.compositionTopology.mobileHero = "editorial-stack";
    manifest.referenceDna.compositionTopology.mobileMediaRelation =
      "vertical-copy-media-stack";
    const refined = refineDesignPrompt("Original notes", manifest);
    expect(refined).toContain("desktop: media-overlay / copy-over-media");
    expect(refined).toContain(
      "mobile: editorial-stack / vertical-copy-media-stack",
    );
    const archive = refineDesignPrompt(
      "Original archive notes",
      manifestFor("attested-future-fitness"),
    );
    expect(archive).toContain("Archive-only");
    expect(archive).toContain("no normalized opening topology is recorded");
    expect(archive).not.toContain("desktop: split-media");
  });

  it("loads every refined dossier, retains original required headings and propagates the exact block", () => {
    const entries = fs
      .readdirSync(library)
      .filter((id) => fs.statSync(path.join(library, id)).isDirectory());
    expect(entries).toHaveLength(131);
    let production = 0;
    for (const id of entries) {
      const dossier = loadReferenceDossier(`${library}/${id}`);
      if (dossier.productionEligible) production += 1;
      expect(dossier.designPrompt, id).toContain(
        "## Agent implementation brief",
      );
      expect(dossier.designPrompt, id).toContain(
        "### Plan, build and critique",
      );
      expect(dossier.designPrompt, id).toContain(dossier.familyId);
      expect(dossier.designPrompt.length, id).toBeLessThanOrEqual(18_000);
      expect(referenceDossierPromptBlock(dossier), id).toContain(
        dossier.designPrompt,
      );
      expect(
        refineDesignPrompt(`${dossier.designPrompt}\n`, manifestFor(id)),
        id,
      ).toBe(`${dossier.designPrompt}\n`);
    }
    expect(production).toBe(96);
  });

  it("binds refinements in a freshly selected pack and rejects old prompt bindings", () => {
    const registry = JSON.parse(
      fs.readFileSync("data/inspiration-registry.json", "utf8"),
    );
    const pack = buildInspirationPack(
      { seed: "dossier-design-guidance", industry: "auto-repair" },
      registry,
      { repositoryRoot: process.cwd(), requireDossiers: true },
    );
    expect(assertReferenceDossierPack(pack)).toBe(pack);
    expect(pack.routes).toHaveLength(3);
    for (const route of pack.routes) {
      if (!route.referenceDossier) throw new Error("Missing bound dossier");
      expect(route.referenceDossier.designPrompt).toContain(
        "## Agent implementation brief",
      );
      expect(route.referenceDossier.designPrompt).toContain(
        route.referenceDossier.familyId,
      );
    }
    const old = structuredClone(pack);
    const oldDossier = old.routes[0].referenceDossier;
    if (!oldDossier) throw new Error("Missing bound dossier");
    oldDossier.designPrompt =
      oldDossier.designPrompt
        .split("<!-- launchloom:design-guidance:start -->")[0]
        .trim();
    expect(() => assertReferenceDossierPack(old)).toThrow(
      /design prompt differs/,
    );
  });
});
