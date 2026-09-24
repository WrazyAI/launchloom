import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  countRecentCreativeFamilyUses,
  launchRecordFrom,
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
      referenceIds: ["nightjar-cinematic-salon"],
      signature: "signature-a",
    },
    {
      referenceIds: ["kokoro-spatial-editorial"],
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
    expect(history).toEqual({ version: 1, updatedAt: null, launches: [] });
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

  it("records inspiration attempts before a creative candidate exists", () => {
    const record = launchRecordFrom({
      config: {
        business: { name: "Early Attempt" },
        design: { recipe: "local-trades", experience: {} },
      },
      inspiration,
      launchedAt: "2026-09-18T20:00:00.000Z",
      stage: "attempt",
    });
    expect(record.stage).toBe("attempt");
    expect(record.referenceIds).toEqual([
      "kokoro-spatial-editorial",
      "nightjar-cinematic-salon",
    ]);
    expect(record.layoutFingerprint).toBe("");
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
              fingerprint: "bold-utility|standard|utility-pill|editorial-dialogue",
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
