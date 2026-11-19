import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  buildInspirationPack,
  prioritizeAuthoredAnchor,
} from "../scripts/inspiration-registry.mjs";
import {
  launchRecordFrom,
  compareDeliveredDesigns,
} from "../scripts/launch-history.mjs";

const anchors = [
  { id: "alpha", name: "Alpha Studio", heroArchetype: "image-overlay" },
  { id: "beta", name: "Beta Studio", heroArchetype: "split-media-copy" },
  { id: "gamma", name: "Gamma Studio", heroArchetype: "text-led-editorial" },
];
const request = {
  seed: "same-business",
  industry: "architecture",
  authoringCandidateCount: 1,
};
describe("the reference actually authored", () => {
  it("balances a reserved authored route through the real registry and history integration", () => {
    const registry = JSON.parse(
      fs.readFileSync("data/inspiration-registry.json", "utf8"),
    );
    const request = {
      seed: "same-retry",
      industry: "home-care",
      authoringCandidateCount: 1,
    };
    const first = buildInspirationPack(request, registry);
    const config = {
      businessKind: "home-care",
      business: { name: "Synthetic integration studio" },
    };
    const reservation = launchRecordFrom({
      config,
      inspiration: first,
      stage: "attempt",
    });
    expect(reservation.reservedReferenceIds).toEqual([
      first.routes[0].referenceDossier.id,
    ]);
    const next = buildInspirationPack(
      { ...request, recentLaunches: [reservation] },
      registry,
    );
    expect(next.routes[0].referenceDossier.id).not.toBe(
      first.routes[0].referenceDossier.id,
    );
    expect(next.request.authoringCandidateCount).toBe(1);
    expect(next.request.authoringReferenceIds).toEqual([
      next.routes[0].referenceDossier.id,
    ]);
    expect(next.routes).toHaveLength(3);
  });

  it("avoids a reserved first slot without counting unused shortlist siblings", () => {
    const first = prioritizeAuthoredAnchor(anchors, request);
    const next = prioritizeAuthoredAnchor(anchors, request, [
      {
        referenceIds: anchors.map((a) => a.id),
        authoredReferenceIds: [first[0].id],
        authoredHeroArchetypes: [first[0].heroArchetype],
      },
    ]);
    expect(next[0].id).not.toBe(first[0].id);
    expect(next.map((a: { id: string }) => a.id).sort()).toEqual(
      anchors.map((a) => a.id).sort(),
    );
  });
  it("is deterministic and does not pin alphabetical order across seeds", () => {
    expect(prioritizeAuthoredAnchor(anchors, request)).toEqual(
      prioritizeAuthoredAnchor(anchors, request),
    );
    expect(
      new Set(
        Array.from(
          { length: 24 },
          (_, n) =>
            prioritizeAuthoredAnchor(anchors, {
              ...request,
              seed: `business-${n}`,
            })[0].id,
        ),
      ).size,
    ).toBe(3);
  });
  it("preserves multi-candidate order and explicit reference intent", () => {
    expect(
      prioritizeAuthoredAnchor(anchors, {
        ...request,
        authoringCandidateCount: 3,
      }),
    ).toBe(anchors);
    expect(
      prioritizeAuthoredAnchor(
        anchors,
        { ...request, styleText: "Use Beta Studio" },
        [{ authoredReferenceIds: ["beta"] }],
      )[0].id,
    ).toBe("beta");
  });
  it("records one planned reference for single authorship and the actual selected route on delivery", () => {
    const routes = anchors.map((a, n) => ({
      ...a,
      id: `route-${n}`,
      referenceDossier: { id: a.id },
      referenceIds: [a.id],
    }));
    const inspiration = {
      request: { industry: "architecture", authoringCandidateCount: 1 },
      routes,
    };
    const config = {
      businessKind: "architecture",
      business: { name: "Synthetic studio" },
      design: { experience: { packId: "creative", fingerprint: "fp" } },
    };
    const reserved = launchRecordFrom({
      config,
      inspiration,
      stage: "attempt",
    });
    expect(reserved.reservedReferenceIds).toEqual(["alpha"]);
    expect(reserved.referenceIds).toEqual(["alpha"]);
    expect(reserved.authoredReferenceIds).toBeUndefined();
    expect(reserved.proposedReferenceIds).toEqual(["alpha", "beta", "gamma"]);
    const delivered = launchRecordFrom({
      config: {
        ...config,
        design: {
          experience: {
            ...config.design.experience,
            renderer: "creative-candidate",
            routeId: "route-2",
          },
        },
      },
      inspiration,
      stage: "preview",
    });
    expect(delivered.authoredReferenceIds).toEqual(["gamma"]);
  });
  it("compares only same-kind deliveries and never claims measured visual diversity", () => {
    const design = {
      businessKind: "architecture",
      layoutFingerprint: "fp",
      usedDossierId: "alpha",
    };
    const history = {
      launches: [
        {
          id: "legacy",
          stage: "preview",
          layoutFingerprint: "fp",
          authoredReferenceIds: ["alpha"],
        },
        {
          id: "a",
          stage: "attempt",
          businessKind: "architecture",
          layoutFingerprint: "fp",
          authoredReferenceIds: ["alpha"],
        },
        {
          id: "b",
          stage: "preview",
          businessKind: "home-care",
          layoutFingerprint: "fp",
          authoredReferenceIds: ["alpha"],
        },
        {
          id: "c",
          stage: "preview",
          businessKind: "architecture",
          layoutFingerprint: "fp",
          referenceIds: ["alpha"],
        },
        {
          id: "d",
          stage: "production",
          businessKind: "architecture",
          layoutFingerprint: "other",
          authoredReferenceIds: ["alpha"],
        },
      ],
    };
    expect(compareDeliveredDesigns(design, history)).toMatchObject({
      comparedCount: 2,
      repeatedFingerprintCount: 1,
      repeatedAuthoredReferenceCount: 1,
      visualDiversity: "not-measured",
    });
  });
});
