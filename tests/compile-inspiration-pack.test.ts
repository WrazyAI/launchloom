import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildInspirationPack } from "../scripts/inspiration-registry.mjs";
import { launchRecordFrom } from "../scripts/launch-history.mjs";

const registry = JSON.parse(fs.readFileSync(path.resolve("data/inspiration-registry.json"), "utf8"));
const roots: string[] = [];

describe("inspiration compilation history", () => {
  it("scores positive visual direction without promoting negated patterns or factual disclaimers", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "inspiration-style-signals-"));
    roots.push(root);
    const config = {
      business: { name: "Fieldnotes Veterinary Studio" },
      businessKind: "veterinary",
      style: { visualDirection: "Editorial field notes with plum and citrus accents." },
    };
    const intake = {
      stylePreference: [
        "INTERNAL FICTIONAL CANARY ONLY. This business and all facts are fictional.",
        "No verified street address, emergency availability, credentials, reviews, prices, guarantees, response times, named staff, or patient outcomes.",
        "Design direction: an independent animal-care studio with art-directed veterinary field notes, calm but expressive plum, chalk, and citrus accents, close-cropped pet portraits, and clear care navigation.",
        "Use an unexpected image-and-type composition and one purposeful interactive care guide.",
        "Avoid generic split hero, rounded card grids, blue medical stock photography, and copied brand assets, but keep vermilion annotations and paper-cutout imagery.",
        "Use not only warm tones but electric lime and graphite for contrast.",
      ].join(" "),
    };
    const configPath = path.join(root, "config.json");
    const intakePath = path.join(root, "intake.json");
    const historyPath = path.join(root, "history.json");
    const outputPath = path.join(root, "pack.json");
    fs.writeFileSync(configPath, JSON.stringify(config));
    fs.writeFileSync(intakePath, JSON.stringify(intake));
    fs.writeFileSync(historyPath, JSON.stringify({ version: 1, launches: [] }));

    execFileSync(
      "node",
      ["scripts/compile-inspiration-pack.mjs", "--config", configPath, "--intake", intakePath, "--history", historyPath, "--out", outputPath],
      { cwd: path.resolve("."), env: { ...process.env, LAUNCHLOOM_INTAKE_ID: "style-signal-regression" } },
    );
    const pack = JSON.parse(fs.readFileSync(outputPath, "utf8"));

    expect(pack.request.styleTerms).toEqual(expect.arrayContaining(["plum", "citrus"]));
    expect(pack.request.styleTerms).toEqual(
      expect.arrayContaining(["vermilion", "annotations", "paper", "cutout", "electric", "lime", "graphite"]),
    );
    expect(pack.request.styleTerms).not.toEqual(
      expect.arrayContaining(["fictional", "verified", "credentials", "prices", "generic", "split", "hero"]),
    );
    expect(pack.request.selectionHistory.fitPoolCount).toBeGreaterThanOrEqual(9);
    expect(pack.request.selectionHistory.fitReferenceCoverage).toBe(6);
    expect(pack.request.selectionHistory.fitMaximumReferenceShare).toBeLessThan(1);
    expect(new Set(pack.routes.map((route: any) => route.familyId)).size).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it("scopes mixed no-kind legacy signatures without leaking global families", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "inspiration-no-kind-history-"));
    roots.push(root);
    const seed = "no-kind-legacy-compiler";
    const config = { business: { name: "Northside Care" }, businessKind: "home-care", design: {} };
    const original = buildInspirationPack({ seed, industry: "home-care", styleTerms: [] }, registry);
    const dental = buildInspirationPack({ seed, industry: "dental", styleTerms: [] }, registry);
    const ownSignatures = original.routes.map((route: any) => route.signature).sort();
    const otherSignatures = dental.routes.map((route: any) => route.signature);
    const configPath = path.join(root, "config.json");
    const historyPath = path.join(root, "history.json");
    const outputPath = path.join(root, "pack.json");
    fs.writeFileSync(configPath, JSON.stringify(config));
    fs.writeFileSync(historyPath, JSON.stringify({ version: 1, launches: [
      {
        id: "mixed-legacy",
        referenceIds: [],
        routeSignatures: [...ownSignatures, ...otherSignatures],
        routeFamilyIds: ["guided-conversation", "cinematic-stage"],
        creativeFamilyId: "guided-conversation",
      },
      { id: "other-dental", referenceIds: [], routeSignatures: otherSignatures, routeFamilyIds: ["guided-conversation"] },
    ] }));

    execFileSync("node", ["scripts/compile-inspiration-pack.mjs", "--config", configPath, "--history", historyPath, "--out", outputPath], {
      cwd: path.resolve("."),
      env: { ...process.env, LAUNCHLOOM_INTAKE_ID: seed },
    });
    const next = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    expect(next.request.recentRouteSignatures).toEqual(ownSignatures);
    expect(next.request.recentRouteSignatures).not.toEqual(expect.arrayContaining(otherSignatures));
    expect(next.request.recentFamilyIds).toEqual([]);
    expect(next.request.recentReferenceSets).toEqual([]);
    expect(next.request.selectionHistory.rationale).toMatch(/matched route signatures.*influenced/iu);
    expect(next.referenceLibrary.recordIds.sort()).not.toEqual(original.routes.map((route: any) => route.referenceDossier.id).sort());
  }, 30_000);

  it("uses matching-niche signature-only legacy history through the compiler", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "inspiration-legacy-history-"));
    roots.push(root);
    const seed = "legacy-compiler-history";
    const config = { business: { name: "Northside Care" }, businessKind: "home-care", design: {} };
    const original = buildInspirationPack({ seed, industry: "home-care", styleTerms: [] }, registry);
    const dental = buildInspirationPack({ seed, industry: "dental", styleTerms: [] }, registry);
    const configPath = path.join(root, "config.json");
    const historyPath = path.join(root, "history.json");
    const outputPath = path.join(root, "pack.json");
    fs.writeFileSync(configPath, JSON.stringify(config));
    fs.writeFileSync(historyPath, JSON.stringify({ version: 1, launches: [
      { id: "older-home-care", businessKind: "home-care", referenceIds: [], routeSignatures: original.routes.map((route: any) => route.signature) },
      { id: "other-dental", businessKind: "dental", referenceIds: [], routeSignatures: dental.routes.map((route: any) => route.signature) },
    ] }));

    execFileSync("node", ["scripts/compile-inspiration-pack.mjs", "--config", configPath, "--history", historyPath, "--out", outputPath], {
      cwd: path.resolve("."),
      env: { ...process.env, LAUNCHLOOM_INTAKE_ID: seed },
    });
    const next = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    expect(next.request.recentRouteSignatures).toEqual(original.routes.map((route: any) => route.signature).sort());
    expect(next.request.recentRouteSignatures).not.toEqual(expect.arrayContaining(dental.routes.map((route: any) => route.signature)));
    expect(next.referenceLibrary.recordIds.sort()).not.toEqual(original.routes.map((route: any) => route.referenceDossier.id).sort());
  }, 30_000);

  it("feeds persisted selected trios from the matching niche into the next pack", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "inspiration-compile-history-"));
    roots.push(root);
    const seed = "persisted-history-regression";
    const config = { business: { name: "Northside Care" }, businessKind: "home-care", design: {} };
    const initial = buildInspirationPack({ seed, industry: "home-care", styleTerms: [] }, registry);
    const dental = buildInspirationPack({ seed, industry: "dental", styleTerms: [] }, registry);
    const homeRecord = launchRecordFrom({ config, inspiration: initial, stage: "attempt", recordKey: "care", launchedAt: "2026-09-28T00:00:00.000Z" });
    const alternate = buildInspirationPack({ seed, industry: "home-care", styleTerms: [], recentLaunches: [homeRecord] }, registry);
    const laterHomeRecord = launchRecordFrom({ config, inspiration: alternate, stage: "attempt", recordKey: "care-2", launchedAt: "2026-09-28T00:00:30.000Z" });
    const dentalRecord = launchRecordFrom({
      config: { ...config, businessKind: "dental", business: { name: "Central Dental" } },
      inspiration: dental,
      stage: "attempt",
      recordKey: "dental",
      launchedAt: "2026-09-28T00:01:00.000Z",
    });
    const configPath = path.join(root, "config.json");
    const historyPath = path.join(root, "history.json");
    const outputPath = path.join(root, "pack.json");
    fs.writeFileSync(configPath, JSON.stringify(config));
    fs.writeFileSync(historyPath, JSON.stringify({ version: 1, launches: [homeRecord, laterHomeRecord, dentalRecord] }));

    execFileSync("node", ["scripts/compile-inspiration-pack.mjs", "--config", configPath, "--history", historyPath, "--out", outputPath], {
      cwd: path.resolve("."),
      env: { ...process.env, LAUNCHLOOM_INTAKE_ID: seed },
    });
    const next = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    expect(next.request.recentReferenceSets).toEqual([homeRecord.referenceIds, laterHomeRecord.referenceIds]);
    expect(next.request.recentFamilyIds).toEqual(
      [...new Set([...homeRecord.routeFamilyIds, ...laterHomeRecord.routeFamilyIds])].sort(),
    );
    expect(next.request.recentRouteSignatures).not.toEqual(expect.arrayContaining(dentalRecord.routeSignatures));
    expect(next.request.selectionHistory.repeatedRecentTrio).toBe(false);
    expect(next.referenceLibrary.recordIds).not.toEqual(homeRecord.referenceIds);
    expect(next.referenceLibrary.recordIds).toEqual(next.request.selectedReferenceIds);
  }, 30_000);
});

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
