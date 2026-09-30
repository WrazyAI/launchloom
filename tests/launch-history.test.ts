import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  countRecentCreativeFamilyUses,
  launchRecordFrom,
  launchesForBusinessKind,
  launchesForSiteConfig,
  readLaunchHistory,
  recentCreativeFamilyIds,
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
      familyId: "market-collage",
      referenceFamilyId: "a1-collage-composition",
    },
  },
};

const inspiration = {
  routes: [
    {
      referenceIds: ["nightjar-cinematic-salon", "nightjar-cinematic-salon"],
      heroArchetype: "image-overlay",
      familyId: "cinematic-stage",
      referenceFamilyId: "a1-cinematic-3d",
      signature: "signature-a",
    },
    {
      referenceIds: ["kokoro-spatial-editorial"],
      heroArchetype: "text-led-editorial",
      familyId: "editorial-monument",
      referenceFamilyId: "a1-kinetic-founder",
      signature: "signature-b",
    },
    { referenceId: null, signature: "signature-a" },
  ],
};

async function temporaryHistory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "launch-history-"));
  return path.join(directory, "recent-launch-signatures.json");
}

describe("launch history", () => {
  it("returns empty defaults for a missing history file", async () => {
    const history = await readLaunchHistory(await temporaryHistory());
    expect(history).toEqual({
      version: 2,
      updatedAt: null,
      launches: [],
      launchesByBusinessKind: {},
    });
  });

  it("builds a launch record from the client config and inspiration pack", () => {
    const record = launchRecordFrom({
      config,
      inspiration,
      launchedAt: "2026-09-18T20:00:00.000Z",
    });
    expect(record).toMatchObject({
      id: "2026-09-18-pulse-athletic-club",
      stage: "preview",
      businessName: "Pulse Athletic Club",
      recipe: "care-editorial",
      packId: "bold-utility",
      variantId: "portrait",
      layoutFingerprint: "bold-utility|portrait|utility-pill|guided-portrait",
    });
    expect(record.referenceIds).toEqual([
      "kokoro-spatial-editorial",
      "nightjar-cinematic-salon",
    ]);
    expect(record.heroArchetypes).toEqual([
      "image-overlay",
      "text-led-editorial",
    ]);
    expect(record.routeSignatures).toEqual(["signature-a", "signature-b"]);
  });

  it("canonicalizes and retrieves history through equivalent niche aliases", async () => {
    const historyPath = await temporaryHistory();
    const record = launchRecordFrom({
      config: {
        business: { name: "North Loop Garage" },
        businessKind: "mechanic",
        design: {
          recipe: "local-trades",
          experience: { packId: "repair-editorial", fingerprint: "repair-v1" },
        },
      },
      inspiration,
      launchedAt: "2026-09-30T10:00:00.000Z",
    });

    expect(record.businessKind).toBe("auto-repair");
    const history = await recordLaunch(record, historyPath);
    expect(launchesForBusinessKind(history, "mechanic")).toEqual([
      expect.objectContaining({ id: record.id, businessKind: "auto-repair" }),
    ]);
    expect(launchesForBusinessKind(history, "auto-repair")).toEqual(
      launchesForBusinessKind(history, "mechanic"),
    );
  });

  it("reads legacy alias keys from a raw version-two history object", () => {
    const history = {
      version: 2,
      launches: [],
      launchesByBusinessKind: {
        mechanic: [
          { id: "mechanic-run", businessKind: "mechanic", referenceIds: ["repair-a"] },
        ],
      },
    };

    expect(launchesForBusinessKind(history, "auto-repair")).toEqual([
      expect.objectContaining({
        id: "mechanic-run",
        businessKind: "auto-repair",
      }),
    ]);
  });

  it("keeps bounded rotation history separate by business niche", async () => {
    const historyPath = await temporaryHistory();
    const veterinary = launchRecordFrom({
      config: {
        business: { name: "Northside Veterinary" },
        businessKind: "veterinary",
        design: { recipe: "care-editorial", experience: {} },
      },
      inspiration: { routes: [{ referenceIds: ["vet-a", "vet-b", "vet-c"] }] },
      stage: "attempt",
      recordKey: "vet-1",
      launchedAt: "2026-09-01T00:00:00.000Z",
    });
    await recordLaunch(veterinary, historyPath);

    for (let index = 0; index < 53; index += 1) {
      const hvac = launchRecordFrom({
        config: {
          business: { name: `HVAC ${index}` },
          businessKind: "hvac",
          design: { recipe: "local-trades", experience: {} },
        },
        inspiration: { routes: [{ referenceIds: [`hvac-${index}`] }] },
        stage: "attempt",
        recordKey: `hvac-${index}`,
        launchedAt: `2026-09-${String(2 + Math.floor(index / 24)).padStart(2, "0")}T${String(index % 24).padStart(2, "0")}:00:00.000Z`,
      });
      await recordLaunch(hvac, historyPath);
    }

    const history = await readLaunchHistory(historyPath);
    expect(launchesForBusinessKind(history, "hvac", 50)).toHaveLength(50);
    expect(launchesForBusinessKind(history, "veterinary")).toEqual([
      expect.objectContaining({ id: veterinary.id }),
    ]);
    const serializedConfig = JSON.stringify({ businessKind: "hvac" });
    expect(launchesForSiteConfig(history, serializedConfig, 2)).toEqual(
      launchesForBusinessKind(history, "hvac", 2),
    );
  });

  it("migrates v1 launch rows into alias-aware niche history", async () => {
    const historyPath = await temporaryHistory();
    await fs.writeFile(
      historyPath,
      JSON.stringify({
        version: 1,
        updatedAt: "2026-09-30T00:00:00.000Z",
        launches: [
          { id: "mechanic-1", businessKind: "mechanic" },
          { id: "repair-2", businessKind: "auto-repair" },
          { id: "hvac-1", businessKind: "hvac" },
        ],
      }),
    );
    const history = await readLaunchHistory(historyPath);

    expect(launchesForBusinessKind(history, "auto-repair")).toEqual([
      expect.objectContaining({ id: "mechanic-1", businessKind: "auto-repair" }),
      expect.objectContaining({ id: "repair-2", businessKind: "auto-repair" }),
    ]);
    expect(launchesForBusinessKind(history, "hvac")).toEqual([
      expect.objectContaining({ id: "hvac-1" }),
    ]);
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

  it("records inspiration attempts before a creative candidate exists", () => {
    const record = launchRecordFrom({
      config: {
        business: { name: "Early Attempt" },
        design: { recipe: "local-trades", experience: {} },
      },
      inspiration,
      launchedAt: "2026-09-18T20:00:00.000Z",
      stage: "attempt",
      recordKey: "59",
    });
    expect(record.stage).toBe("attempt");
    expect(record.id).toBe("2026-09-18-early-attempt-attempt-59");
    expect(record.referenceIds).toEqual([
      "kokoro-spatial-editorial",
      "nightjar-cinematic-salon",
    ]);
    expect(record.routeFamilyIds).toEqual([
      "a1-cinematic-3d",
      "a1-kinetic-founder",
      "cinematic-stage",
      "editorial-monument",
    ]);
    expect(recentCreativeFamilyIds({ launches: [record] })).toEqual(
      expect.arrayContaining([
        "cinematic-stage",
        "a1-cinematic-3d",
        "editorial-monument",
        "a1-kinetic-founder",
      ]),
    );
    expect(record.layoutFingerprint).toBe("");
  });

  it("replaces the matching reservation with its successful preview history row", async () => {
    const historyPath = await temporaryHistory();
    const reservationKey = "intake-42-run-123-attempt-1";
    const attempt = launchRecordFrom({
      config: {
        business: { name: "Northside Care" },
        businessKind: "home-care",
        design: { recipe: "care-editorial", experience: {} },
      },
      inspiration,
      launchedAt: "2026-09-30T08:00:00.000Z",
      stage: "attempt",
      recordKey: reservationKey,
    });
    await recordLaunch(attempt, historyPath);

    const preview = launchRecordFrom({
      config: {
        ...config,
        businessKind: "home-care",
        business: { name: "Northside Care" },
      },
      inspiration,
      launchedAt: "2026-09-30T08:15:00.000Z",
      stage: "preview",
      recordKey: reservationKey,
    });
    const updated = await recordLaunch(preview, historyPath);

    expect(updated.launches).toHaveLength(1);
    expect(updated.launches[0]).toMatchObject({
      id: preview.id,
      stage: "preview",
      reservationKey,
    });
  });

  it("persists the selected dossier IDs and business kind for later selection", () => {
    const record = launchRecordFrom({
      config: {
        business: { name: "Northside Care" },
        businessKind: "home-care",
        design: {},
      },
      inspiration: {
        routes: [
          { referenceDossier: { id: "care-a" } },
          { referenceDossier: { id: "care-b" } },
          { referenceDossier: { id: "care-c" } },
        ],
      },
      stage: "attempt",
      recordKey: "123",
      launchedAt: "2026-09-28T00:00:00.000Z",
    });
    expect(record.businessKind).toBe("home-care");
    expect(record.referenceIds).toEqual(["care-a", "care-b", "care-c"]);
  });

  it("counts a duplicated creative/reference family only once per launch", () => {
    expect(
      recentCreativeFamilyIds({
        launches: [
          {
            creativeFamilyId: "market-collage",
            referenceFamilyId: "market-collage",
          },
          {
            creativeFamilyId: "market-collage",
            referenceFamilyId: "market-collage",
          },
        ],
      }),
    ).toEqual(["market-collage", "market-collage"]);
  });

  it("counts one launch once when both creative and reference families match", () => {
    expect(
      countRecentCreativeFamilyUses(
        {
          launches: [
            {
              creativeFamilyId: "market-collage",
              referenceFamilyId: "a1-collage-composition",
            },
            {
              creativeFamilyId: "editorial-monument",
              referenceFamilyId: "a1-uncommon-founder-atlas",
            },
          ],
        },
        ["market-collage", "a1-collage-composition"],
      ),
    ).toBe(1);
  });

  it("records, dedupes, and caps launches", async () => {
    const historyPath = await temporaryHistory();
    await recordLaunch(
      launchRecordFrom({
        config,
        inspiration,
        launchedAt: "2026-09-18T20:00:00.000Z",
      }),
      historyPath,
    );
    const updated = await recordLaunch(
      launchRecordFrom({
        config: {
          ...config,
          design: {
            ...config.design,
            experience: {
              ...config.design.experience,
              variantId: "standard",
              fingerprint:
                "bold-utility|standard|utility-pill|editorial-dialogue",
            },
          },
        },
        inspiration,
        launchedAt: "2026-09-18T21:00:00.000Z",
      }),
      historyPath,
    );
    expect(updated.launches).toHaveLength(1);
    expect(updated.launches[0].variantId).toBe("standard");
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
    expect(capped.launches.length).toBeLessThanOrEqual(50);
    expect(recentLayoutFingerprints(capped)).toContain(
      "bold-utility|portrait|utility-pill|guided-portrait",
    );
    expect(recentCreativeFamilyIds(capped)).toEqual(
      expect.arrayContaining(["market-collage", "a1-collage-composition"]),
    );
  });
});
