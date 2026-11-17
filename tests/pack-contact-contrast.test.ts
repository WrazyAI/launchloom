import fs from "node:fs";
import { describe, expect, it } from "vitest";

const packs = fs.readFileSync(
  "templates/client-site/src/styles/experience-packs.css",
  "utf8",
);
const site = fs.readFileSync(
  "templates/client-site/src/styles/site.css",
  "utf8",
);

/**
 * The rendered acceptance gate rejected two real launches with a blanket
 * `[class*="__contact"] a { color: var(--on-brand-surface) }` rule. That forced
 * white links onto light paper bands (#f5f4f0), measuring 1.1:1. These tests
 * pin the fix so the rule cannot be widened again.
 */
describe("pack contact link contrast", () => {
  it("does not force the brand-surface text colour onto every contact band", () => {
    expect(packs).not.toContain('[class*="__contact"] a');
  });

  it("scopes the brand-surface text colour to the pack that uses that surface", () => {
    expect(packs).toMatch(
      /\.xp-guide__contact a,\s*\n\.xp-guide__contact a:visited \{\s*\n\s*color: var\(--on-brand-surface, #ffffff\);/u,
    );
  });

  it("lets light-paper packs keep their own ink link colours", () => {
    expect(packs).toMatch(
      /\.xp-results__contact a:visited \{\s*\n\s*color: var\(--results-signal\);/u,
    );
    expect(packs).toMatch(
      /\.xp-ledger__contact a:visited \{\s*\n\s*color: var\(--ledger-navy\);/u,
    );
    expect(packs).toMatch(
      /\.xp-service__contact a:visited \{\s*\n\s*color: var\(--service-dark\);/u,
    );
  });

  it("gives each contact band a focus ring in its own link colour", () => {
    for (const pack of [
      "guide",
      "folio",
      "stage",
      "ledger",
      "results",
      "service",
    ])
      expect(packs).toContain(`.xp-${pack}__contact a:focus-visible {`);
  });

  it("gives every stage control a brass focus ring on the dark stage", () => {
    const rule =
      packs.match(
        /\.xp-stage :where\(a, button, summary, input, select, textarea\):focus-visible \{([\s\S]*?)\}/u,
      )?.[1] || "";
    expect(rule).toContain("outline: 2px solid var(--stage-brass-text)");
  });

  it("backs the stage header focus plate with the stage forest", () => {
    const rule =
      packs.match(/\.xp-stage header a:focus-visible \{([\s\S]*?)\}/u)?.[1] ||
      "";
    expect(rule).toContain("background-color: var(--stage-forest-deep)");
    expect(rule).toContain("box-shadow: 0 0 0 6px var(--stage-forest-deep)");
  });

  it("keeps the stage lead form focus ring dark on its white surface", () => {
    const rule =
      packs.match(
        /\.xp-stage\s+\.lead-form\s+:where\([^)]*\):focus-visible \{([\s\S]*?)\}/u,
      )?.[1] || "";
    expect(rule).toContain("outline-color: var(--ink");
  });
});

describe("faq disclosure marker contrast", () => {
  it("uses the text-safe brand ink role rather than the fill colour", () => {
    const rule =
      site.match(/\.faq-list summary span \{([\s\S]*?)\}/u)?.[1] || "";
    expect(rule).toContain("var(--brand-ink, var(--ink, #14201d))");
    expect(rule).not.toMatch(/color:\s*var\(--brand\);/u);
  });
});

describe("quick answers launcher focus ring", () => {
  it("pairs the ring with the brand surface, not the primary fill", () => {
    const rule =
      site.match(
        /\.quick-answers__launcher:focus-visible \{([\s\S]*?)\}/u,
      )?.[1] || "";
    // --on-brand is the text colour for the primary fill and can be black,
    // which measured 1.569 against the dark brand surface behind the launcher.
    expect(rule).toContain("var(--on-brand-surface");
    expect(rule).not.toMatch(/outline:\s*3px solid var\(--on-brand,/u);
  });
});
