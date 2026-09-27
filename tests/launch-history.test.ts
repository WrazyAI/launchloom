import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  launchRecordFrom,
  readLaunchHistory,
  referenceSelectionContext,
  recentLayoutFingerprints,
  recordLaunch,
} from "../scripts/launch-history.mjs";

const config = {
  business: { name: "Pulse Athletic Club" },
  design: {
    recipe: "care-editorial",
    experience: {
      packId: "bold-utility",
      variantId: "portrait",
      fingerprint: "bold-utility|portrait|utility-pill|guided-portrait",
    },
  },
};

const inspiration = {
  request: { industry: "fitness" },
  routes: [
    { referenceIds: ["nightjar-cinematic-salon"], signature: "signature-a" },
    { referenceIds: ["spicer-gym-timetable-first"], signature: "signature-b" },
    { referenceIds: ["html5up-fitness-big-picture"], signature: "signature-a" },
  ],
};

async function temporaryHistory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "launch-history-"));
  return path.join(directory, "recent-launch-signatures.json");
}

describe("launch history", () => {
  it("returns empty defaults for a missing history file", async () => {
    const history = await readLaunchHistory(await temporaryHistory());
    expect(history).toEqual({ version: 1, updatedAt: null, launches: [] });
  });

  it("builds a launch record from the client config and inspiration pack", () => {
    const record = launchRecordFrom({
      config,
      inspiration,
      launchedAt: "2026-09-18T20:00:00.000Z",
    });
    expect(record).toMatchObject({
      id: "20260918200000000-pulse-athletic-club",
      stage: "preview",
      businessName: "Pulse Athletic Club",
      businessKind: "fitness",
      recipe: "care-editorial",
      packId: "bold-utility",
      variantId: "portrait",
      layoutFingerprint: "bold-utility|portrait|utility-pill|guided-portrait",
    });
    expect(record.referenceIds).toEqual([
      "html5up-fitness-big-picture",
      "nightjar-cinematic-salon",
      "spicer-gym-timetable-first",
    ]);
    expect(record.routeSignatures).toEqual(["signature-a", "signature-b"]);
  });

  it("requires a pack id and layout fingerprint", () => {
    expect(() =>
      launchRecordFrom({
        config: { business: { name: "Empty" } },
        inspiration: undefined,
      }),
    ).toThrow(/pack id and layout fingerprint/);
  });

  it("marks production records when a stage is supplied", () => {
    const record = launchRecordFrom({
      config,
      inspiration,
      launchedAt: "2026-09-18T20:00:00.000Z",
      stage: "production",
    });
    expect(record.stage).toBe("production");
  });

  it("records the unique generation attempt and reproducible inspiration seed", () => {
    const record = launchRecordFrom({
      config,
      inspiration: {
        ...inspiration,
        request: {
          ...inspiration.request,
          generationId: "github-run-8801-attempt-2",
          seed: "github-run-8801-attempt-2",
        },
      },
      launchedAt: "2026-09-18T20:00:00.000Z",
    });

    expect(record).toMatchObject({
      generationId: "github-run-8801-attempt-2",
      inspirationSeed: "github-run-8801-attempt-2",
    });
  });

  it("retains separate generations, dedupes exact retries, and caps history", async () => {
    const historyPath = await temporaryHistory();
    const firstRecord = launchRecordFrom({
      config,
      inspiration,
      launchedAt: "2026-09-18T20:00:00.000Z",
    });
    await recordLaunch(firstRecord, historyPath);
    const updated = await recordLaunch(
      launchRecordFrom({
        config: {
          ...config,
          design: {
            ...config.design,
            experience: {
              ...config.design.experience,
              variantId: "standard",
              fingerprint: "bold-utility|standard|utility-pill|editorial-dialogue",
            },
          },
        },
        inspiration,
        launchedAt: "2026-09-18T21:00:00.000Z",
      }),
      historyPath,
    );
    expect(updated.launches).toHaveLength(2);
    expect(updated.launches[1].variantId).toBe("standard");
    expect(updated.launches[1].referenceIds).toEqual(firstRecord.referenceIds);
    expect((await recordLaunch(updated.launches[1], historyPath)).launches).toHaveLength(2);
    expect(updated.updatedAt).not.toBeNull();

    for (let index = 0; index < 60; index += 1) {
      const configForIndex = {
        ...config,
        business: { name: `Business ${index}` },
      };
      await recordLaunch(
        launchRecordFrom({
          config: configForIndex,
          inspiration,
          launchedAt: `2026-09-${String((index % 28) + 1).padStart(2, "0")}T20:00:00.000Z`,
        }),
        historyPath,
      );
    }
    const capped = await readLaunchHistory(historyPath);
    expect(capped.launches.length).toBeLessThanOrEqual(30);
    expect(recentLayoutFingerprints(capped)).toContain(
      "bold-utility|portrait|utility-pill|guided-portrait",
    );
  });

  it("builds niche-specific recency and exposure context from recent launches", () => {
    const context = referenceSelectionContext(
      {
        launches: [
          { businessKind: "fitness", referenceIds: ["a", "b", "c"], routeSignatures: ["s1"] },
          { businessKind: "legal-services", referenceIds: ["l1", "l2", "l3"], routeSignatures: ["legal"] },
          { businessKind: "fitness", referenceIds: ["b", "c", "d"], routeSignatures: ["s2"] },
        ],
      },
      "fitness",
    );

    expect(context).toEqual({
      recentReferenceIds: ["b", "c", "d"],
      recentReferenceSets: [["a", "b", "c"], ["b", "c", "d"]],
      recentRouteSignatures: ["s1", "s2"],
      referenceExposure: { a: 1, b: 2, c: 2, d: 1 },
    });
  });

  it("retains twelve exact trios for consecutive niche rotation", () => {
    const launches = Array.from({ length: 13 }, (_, index) => ({
      businessKind: "fitness",
      referenceIds: [`reference-${index}-a`, `reference-${index}-b`, `reference-${index}-c`],
      routeSignatures: [`signature-${index}`],
    }));

    const context = referenceSelectionContext({ launches }, "fitness");

    expect(context.recentReferenceSets).toHaveLength(12);
    expect(context.recentReferenceSets[0]).toEqual(launches[1].referenceIds);
    expect(context.recentReferenceSets.at(-1)).toEqual(launches[12].referenceIds);
    expect(context.recentRouteSignatures).toEqual([
      "signature-10", "signature-11", "signature-12", "signature-8", "signature-9",
    ]);
  });

  it("does not let roofing history suppress the broader home-services reference pool", () => {
    const history = {
      launches: [
        { businessKind: "roofing", referenceIds: ["roof-1", "roof-2", "roof-3"], routeSignatures: ["roof-layout"] },
        { businessKind: "home-services", referenceIds: ["home-1", "home-2", "home-3"], routeSignatures: ["home-layout"] },
      ],
    };

    expect(referenceSelectionContext(history, "roofing")).toMatchObject({
      recentReferenceIds: ["roof-1", "roof-2", "roof-3"],
      recentRouteSignatures: ["roof-layout"],
      referenceExposure: { "roof-1": 1, "roof-2": 1, "roof-3": 1 },
    });
    expect(referenceSelectionContext(history, "home-services")).toMatchObject({
      recentReferenceIds: ["home-1", "home-2", "home-3"],
      recentRouteSignatures: ["home-layout"],
      referenceExposure: { "home-1": 1, "home-2": 1, "home-3": 1 },
    });
  });

  it("keeps thirty launches per niche so mixed traffic cannot starve a niche's exposure window", async () => {
    const historyPath = await temporaryHistory();
    const kinds = ["fitness", "legal-services", "roofing"];
    for (let index = 0; index < 90; index += 1) {
      const businessKind = kinds[index % kinds.length];
      const launchConfig = {
        ...config,
        business: { name: `Business ${index}` },
      };
      const launchInspiration = {
        request: { industry: businessKind, seed: `generation-${index}` },
        routes: [{
          referenceIds: [`${businessKind}-reference-${index}`],
          signature: `${businessKind}-signature-${index}`,
        }],
      };
      await recordLaunch(
        launchRecordFrom({
          config: launchConfig,
          inspiration: launchInspiration,
          launchedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        }),
        historyPath,
      );
    }

    const history = await readLaunchHistory(historyPath);
    for (const kind of kinds)
      expect(history.launches.filter((launch: any) => launch.businessKind === kind), kind).toHaveLength(30);
    expect(referenceSelectionContext(history, "fitness").referenceExposure).toHaveProperty("fitness-reference-0");
    expect(Object.keys(referenceSelectionContext(history, "fitness").referenceExposure)).toHaveLength(30);
  });
});
