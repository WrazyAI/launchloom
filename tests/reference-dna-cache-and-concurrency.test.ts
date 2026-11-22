import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInspirationPack } from "../scripts/inspiration-registry.mjs";

const productionRegistry = JSON.parse(
  fs.readFileSync("data/inspiration-registry.json", "utf8"),
);

const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  await Promise.all(
    tempDirs.splice(0).map((dir) => fsp.rm(dir, { recursive: true, force: true })),
  );
});

function completedGoResponse(analysis: Record<string, unknown>) {
  return new Response(
    JSON.stringify({
      id: "resp_go_test",
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: JSON.stringify(analysis) }],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

const validAnalysis = {
  annotatedDescription: "Structured reference layout measurements.",
  heroGeometry: {
    mode: "split-editorial",
    alignment: "left",
    viewport: "1536x864 balanced fold",
  },
  navigationGeometry: {
    mode: "single-row",
    placement: "top",
    mobile: "drawer",
  },
  typography: {
    display: "editorial-serif",
    body: "clean-sans",
    scale: "1.25",
  },
  palette: {
    surfaces: ["#f7f5f0", "#ffffff"],
    ink: "#161616",
    accents: ["#2a4b3c"],
    contrastIntent: "high-contrast-editorial",
  },
  imageTreatment: {
    mode: "framed",
    crop: "4:3",
    focalPoint: "center",
  },
  sectionSequence: ["hero", "services", "process", "contact"],
  servicePresentation: {
    pattern: "numbered-rows",
    interaction: "static",
  },
  ctaPlacement: {
    primary: "hero-left",
    secondary: "header-right",
    early: "above-fold",
  },
  motion: {
    primitive: "subtle-reveal",
    library: "css",
    reducedMotion: "disabled",
  },
  mobileRecomposition: {
    strategy: "vertical-stack",
    rules: ["stack-hero-media", "collapse-nav"],
  },
  prohibitedPatterns: ["neon-glow", "floating-chat", "generic-cards"],
  requiredSignatureElements: [
    { id: "sig-1", selector: ".hero-rule", description: "Editorial hairline" },
    { id: "sig-2", selector: ".service-ledger", description: "Numbered rows" },
  ],
  acceptanceChecks: [
    "hero-fits-fold",
    "nav-single-row",
    "contrast-aa",
    "no-overflow",
  ],
  measurements: {
    headlineWidthRatio: 0.48,
    headlineHeightRatio: 0.22,
    heroImageOccupancyRatio: 0.44,
    contentColumnWidthRatio: 0.82,
    navTopRatio: 0.03,
    navSideInsetRatio: 0.05,
    ctaTopRatio: 0.62,
    dominantSectionHeightRatios: [0.3, 0.25, 0.25, 0.2],
    imageAspectRatios: [1.33, 1.5],
    overlapRelationships: ["none"],
    surfaceTransitions: ["light-to-white"],
    mobile: {
      headlineWidthRatio: 0.88,
      imageOccupancyRatio: 0.4,
      ctaTopRatio: 0.72,
      contentInsetRatio: 0.05,
    },
  },
};

describe("analyze-reference-dna concurrency and disk cache", () => {
  it("analyzes routes in parallel when concurrency > 1 while preserving route order", async () => {
    vi.resetModules();
    vi.stubEnv("CREATIVE_EXPERIENCE_PROVIDER", "opencode-go");
    vi.stubEnv("OPENCODE_GO_API_KEY", "test-go-key");
    const { enrichInspirationPack } = await import(
      "../scripts/analyze-reference-dna.mjs"
    );
    const pack = buildInspirationPack(
      {
        seed: "reference-dna-parallel-order",
        industry: "legal-services",
        styleTerms: [],
        recentReferenceIds: [],
        recentRouteSignatures: [],
      },
      productionRegistry,
    );
    expect(pack.routes).toHaveLength(3);

    let inFlight = 0;
    let maxInFlight = 0;
    let callIndex = 0;
    let releaseAll: (() => void) | null = null;
    const allEntered = new Promise<void>((resolve) => {
      releaseAll = resolve;
    });
    const fetchImpl = vi.fn(async () => {
      const myIndex = callIndex++;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (inFlight === 3) releaseAll?.();
      // Hold all 3 requests until all 3 workers enter fetchImpl simultaneously
      await Promise.race([
        allEntered,
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
      // Reverse completion timing so route-03 finishes before route-01
      await new Promise((resolve) => setTimeout(resolve, (3 - myIndex) * 20));
      inFlight -= 1;
      return completedGoResponse({
        ...validAnalysis,
        annotatedDescription: `Route analysis #${myIndex}`,
      });
    });

    const enriched = await enrichInspirationPack(pack, {
      fetchImpl: fetchImpl as typeof fetch,
      concurrency: 3,
    });

    expect(maxInFlight).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(enriched.routes.map((route: any) => route.id)).toEqual(
      pack.routes.map((route: any) => route.id),
    );
    expect(
      enriched.routes.map(
        (route: any) => route.referenceDna.evidence.pixelAnalysisSummary,
      ),
    ).toHaveLength(3);
    expect(
      new Set(
        enriched.routes.map(
          (route: any) => route.referenceDna.evidence.pixelAnalysisSummary,
        ),
      ).size,
    ).toBe(3);
  });

  it("caches validated analyses by content digest and invalidates when inputs change", async () => {
    vi.resetModules();
    vi.stubEnv("CREATIVE_EXPERIENCE_PROVIDER", "opencode-go");
    vi.stubEnv("OPENCODE_GO_API_KEY", "test-go-key");
    const { enrichInspirationPack } = await import(
      "../scripts/analyze-reference-dna.mjs"
    );
    const cacheDir = await fsp.mkdtemp(
      path.join(os.tmpdir(), "launchloom-ref-dna-cache-"),
    );
    tempDirs.push(cacheDir);

    const pack = buildInspirationPack(
      {
        seed: "reference-dna-disk-cache",
        industry: "legal-services",
        styleTerms: [],
        recentReferenceIds: [],
        recentRouteSignatures: [],
      },
      productionRegistry,
    );

    const fetchImpl = vi.fn(async () => completedGoResponse(validAnalysis));

    const firstStats = { hits: 0, writes: 0 };
    const first = await enrichInspirationPack(pack, {
      fetchImpl: fetchImpl as typeof fetch,
      concurrency: 3,
      cacheDir,
      cacheStats: firstStats,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(firstStats).toEqual({ hits: 0, writes: 3 });
    expect(first.routes).toHaveLength(3);

    // Second run with identical pack hits disk cache for all 3 routes (0 API calls)
    const secondStats = { hits: 0, writes: 0 };
    const second = await enrichInspirationPack(pack, {
      fetchImpl: fetchImpl as typeof fetch,
      concurrency: 3,
      cacheDir,
      cacheStats: secondStats,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(secondStats).toEqual({ hits: 3, writes: 0 });
    expect(
      second.routes.every((r: any) => r.referenceDna.analyzedFromEvidence),
    ).toBe(true);

    // Mutate one route's routeHints -> only that 1 route misses cache
    const mutatedPack = {
      ...pack,
      routes: pack.routes.map((route: any, idx: number) =>
        idx === 1
          ? {
              ...route,
              motionOpportunity: `${route.motionOpportunity || ""} updated`,
            }
          : route,
      ),
    };
    const thirdStats = { hits: 0, writes: 0 };
    await enrichInspirationPack(mutatedPack, {
      fetchImpl: fetchImpl as typeof fetch,
      concurrency: 3,
      cacheDir,
      cacheStats: thirdStats,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(thirdStats).toEqual({ hits: 2, writes: 1 });
  });
});
