import fs from "node:fs";
import { describe, expect, it } from "vitest";

const packs = fs.readFileSync(
  "templates/client-site/src/styles/experience-packs.css",
  "utf8",
);
const site = fs.readFileSync("templates/client-site/src/styles/site.css", "utf8");

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
    for (const pack of ["guide", "folio", "stage", "ledger", "results", "service"])
      expect(packs).toContain(`.xp-${pack}__contact a:focus-visible {`);
  });
});

describe("faq disclosure marker contrast", () => {
  it("uses the text-safe brand ink role rather than the fill colour", () => {
    const rule = site.match(/\.faq-list summary span \{([\s\S]*?)\}/u)?.[1] || "";
    expect(rule).toContain("var(--brand-ink, var(--ink, #14201d))");
    expect(rule).not.toMatch(/color:\s*var\(--brand\);/u);
  });
});
