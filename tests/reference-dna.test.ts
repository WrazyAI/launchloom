import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildInspirationPack } from "../scripts/inspiration-registry.mjs";
import {
  applyMeasuredReferenceAnalysis,
  enrichInspirationPack,
} from "../scripts/analyze-reference-dna.mjs";
import {
  buildReferenceDna,
  inferCompositionTopology,
  normalizeSectionSequence,
  validateReferenceDna,
} from "../scripts/reference-dna.mjs";

const registry = JSON.parse(
  fs.readFileSync("data/inspiration-registry.json", "utf8"),
);
const core = JSON.parse(
  fs.readFileSync("data/reference-library/core-collection.json", "utf8"),
);
const coreIds = new Set(
  core.niches.flatMap((niche: any) => niche.referenceIds),
);
const productionRegistry = {
  ...registry,
  records: registry.records.filter((record: any) => coreIds.has(record.id)),
};

function validReferenceAnalysis() {
  return {
    annotatedDescription:
      "Measured the hierarchy, imagery, and spacing from the paired screenshots.",
    heroGeometry: {
      mode: "image-led",
      alignment: "asymmetric",
      viewport: "adapted desktop composition",
    },
    navigationGeometry: {
      mode: "compact",
      placement: "top edge",
      mobile: "collapsed menu",
    },
    typography: {
      display: "editorial serif",
      body: "neutral sans",
      scale: "oversized to compact",
    },
    palette: {
      surfaces: ["warm ivory"],
      ink: "deep green",
      accents: ["ochre"],
      contrastIntent: "high contrast",
    },
    imageTreatment: {
      mode: "full bleed",
      crop: "wide crop",
      focalPoint: "center-right",
    },
    sectionSequence: ["hero", "services", "studio story", "contact"],
    servicePresentation: {
      pattern: "editorial rows",
      interaction: "static links",
    },
    ctaPlacement: {
      primary: "hero",
      secondary: "footer",
      early: "visible in first viewport",
    },
    motion: {
      primitive: "subtle reveal",
      library: "CSS",
      reducedMotion: "disable reveal",
    },
    mobileRecomposition: {
      strategy: "single column",
      rules: ["stack media", "keep CTA above the fold"],
    },
    prohibitedPatterns: [
      "generic card wall",
      "split hero",
      "repeated accordion",
    ],
    requiredSignatureElements: [
      {
        id: "oversized-title",
        selector: "h1",
        description: "large editorial title",
      },
      {
        id: "archive-rows",
        selector: "[data-section='archive']",
        description: "thin ruled archive rows",
      },
    ],
    acceptanceChecks: [
      "retain title scale",
      "keep the archive",
      "use the screenshot crop",
      "preserve mobile order",
    ],
    measurements: {
      headlineWidthRatio: 0.7,
      headlineHeightRatio: 0.2,
      heroImageOccupancyRatio: 0.6,
      contentColumnWidthRatio: 0.5,
      navTopRatio: 0.03,
      navSideInsetRatio: 0.04,
      ctaTopRatio: 0.7,
      dominantSectionHeightRatios: [0.8, 0.7, 0.9],
      imageAspectRatios: [1.5],
      overlapRelationships: [],
      surfaceTransitions: ["ivory to dark green"],
      mobile: {
        headlineWidthRatio: 0.9,
        imageOccupancyRatio: 0.5,
        ctaTopRatio: 1.1,
        contentInsetRatio: 0.05,
      },
    },
  };
}

function completedGoResponse() {
  return new Response(
    JSON.stringify({
      id: "resp_go_reference",
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: JSON.stringify(validReferenceAnalysis()),
            },
          ],
        },
      ],
      usage: {
        input_tokens: 1200,
        output_tokens: 800,
        input_tokens_details: { cached_tokens: 0 },
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("Reference DNA", () => {
  it("collapses prose variants with the same screenshot-reviewed split topology", () => {
    const dnaFor = (id: string) => {
      const record = productionRegistry.records.find(
        (item: any) => item.id === id,
      );
      if (!record) throw new Error(`Missing production reference ${id}.`);
      return JSON.parse(
        fs.readFileSync(path.join(record.dossierPath, "manifest.json"), "utf8"),
      ).referenceDna;
    };

    const splitReferences = [
      "web-veterinary-modern-animal",
      "web-veterinary-veg-emergency",
      "web-veterinary-lap-of-love",
      "web-veterinary-perry-paws-mobile",
    ];
    expect(
      new Set(
        splitReferences.map((id) => inferCompositionTopology(dnaFor(id)).hero),
      ),
    ).toEqual(new Set(["split-media"]));
    expect(
      inferCompositionTopology(dnaFor("web-veterinary-schwarzman-amc")).hero,
    ).toBe("media-overlay");
    expect(
      inferCompositionTopology(dnaFor("web-veterinary-cat-clinic-edinburgh"))
        .hero,
    ).toBe("type-led-statement");
  });

  it("keeps registry evidence in tracked repository paths", () => {
    for (const record of productionRegistry.records) {
      expect(record.screenshotPath).toBeTruthy();
      expect(record.screenshotPath).not.toMatch(/^artifacts\//u);
      expect(fs.existsSync(path.resolve(record.screenshotPath))).toBe(true);
      if (record.mobileScreenshotPath) {
        expect(record.mobileScreenshotPath).not.toMatch(/^artifacts\//u);
        expect(fs.existsSync(path.resolve(record.mobileScreenshotPath))).toBe(
          true,
        );
      }
    }
  });

  it("compiles complete evidence-backed contracts for routes", () => {
    const pack = buildInspirationPack(
      {
        seed: "dna-test",
        industry: "home-services",
        styleTerms: [],
        recentReferenceIds: [],
        recentRouteSignatures: [],
      },
      productionRegistry,
    );
    const dna = pack.routes[0].referenceDna;
    expect(dna.familyId).toBeTruthy();
    expect(dna.evidence.desktopScreenshot.available).toBe(true);
    expect(dna.sectionSequence.length).toBeGreaterThan(4);
    expect(dna.requiredSignatureElements.length).toBeGreaterThan(1);
    expect(validateReferenceDna(dna)).toBe(dna);
  });

  it("adds measured pixels without rewriting curated section, service, or motion intent", () => {
    const pack = buildInspirationPack(
      {
        seed: "dna-contract-preservation",
        industry: "architecture",
        styleTerms: [],
        recentReferenceIds: [],
        recentRouteSignatures: [],
      },
      productionRegistry,
    );
    const route = pack.routes[0];
    if (!route) throw new Error("The architecture reference pack is empty.");
    const original = route.referenceDna;
    const measured = applyMeasuredReferenceAnalysis(route, {
      annotatedDescription: "Measured from desktop and mobile screenshots.",
      measurements: {
        headlineWidthRatio: 0.72,
        headlineHeightRatio: 0.18,
        heroImageOccupancyRatio: 0.68,
        contentColumnWidthRatio: 0.71,
        navTopRatio: 0.03,
        navSideInsetRatio: 0.04,
        ctaTopRatio: 0.68,
        dominantSectionHeightRatios: [0.7, 0.6, 0.8],
        imageAspectRatios: [1.5],
        overlapRelationships: [],
        surfaceTransitions: ["image to dark footer"],
        mobile: {
          headlineWidthRatio: 0.9,
          imageOccupancyRatio: 0.55,
          ctaTopRatio: 1.1,
          contentInsetRatio: 0.06,
        },
      },
      captureDimensions: {
        desktop: { width: 1440, height: 4000 },
        mobile: { width: 390, height: 6000 },
      },
    }).referenceDna;

    expect(measured.sectionSequence).toEqual(original.sectionSequence);
    expect(measured.servicePresentation).toEqual(original.servicePresentation);
    expect(measured.ctaPlacement).toEqual(original.ctaPlacement);
    expect(measured.motion).toEqual(original.motion);
    expect(measured.requiredSignatureElements).toEqual(
      original.requiredSignatureElements,
    );
    expect(measured.measurements.headlineWidthRatio).toBe(0.72);
    expect(measured.evidence.pixelAnalysisSummary).toContain("Measured from");
    expect(measured.evidence.annotatedDescription).toBe(
      original.evidence.annotatedDescription,
    );
  });

  it("bypasses the exact-response cache once when a reference analyzer response is invalid JSON", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
    const validAnalysis = {
      annotatedDescription:
        "Measured the hierarchy, imagery, and spacing from the paired screenshots.",
      heroGeometry: {
        mode: "image-led",
        alignment: "asymmetric",
        viewport: "adapted desktop composition",
      },
      navigationGeometry: {
        mode: "compact",
        placement: "top edge",
        mobile: "collapsed menu",
      },
      typography: {
        display: "editorial serif",
        body: "neutral sans",
        scale: "oversized to compact",
      },
      palette: {
        surfaces: ["warm ivory"],
        ink: "deep green",
        accents: ["ochre"],
        contrastIntent: "high contrast",
      },
      imageTreatment: {
        mode: "full bleed",
        crop: "wide crop",
        focalPoint: "center-right",
      },
      sectionSequence: ["hero", "services", "studio story", "contact"],
      servicePresentation: {
        pattern: "editorial rows",
        interaction: "static links",
      },
      ctaPlacement: {
        primary: "hero",
        secondary: "footer",
        early: "visible in first viewport",
      },
      motion: {
        primitive: "subtle reveal",
        library: "CSS",
        reducedMotion: "disable reveal",
      },
      mobileRecomposition: {
        strategy: "single column",
        rules: ["stack media", "keep CTA above the fold"],
      },
      prohibitedPatterns: [
        "generic card wall",
        "split hero",
        "repeated accordion",
      ],
      requiredSignatureElements: [
        {
          id: "oversized-title",
          selector: "h1",
          description: "large editorial title",
        },
        {
          id: "archive-rows",
          selector: "[data-section='archive']",
          description: "thin ruled archive rows",
        },
      ],
      acceptanceChecks: [
        "retain title scale",
        "keep the archive",
        "use the screenshot crop",
        "preserve mobile order",
      ],
      measurements: {
        headlineWidthRatio: 0.7,
        headlineHeightRatio: 0.2,
        heroImageOccupancyRatio: 0.6,
        contentColumnWidthRatio: 0.5,
        navTopRatio: 0.03,
        navSideInsetRatio: 0.04,
        ctaTopRatio: 0.7,
        dominantSectionHeightRatios: [0.8, 0.7, 0.9],
        imageAspectRatios: [1.5],
        overlapRelationships: [],
        surfaceTransitions: ["ivory to dark green"],
        mobile: {
          headlineWidthRatio: 0.9,
          imageOccupancyRatio: 0.5,
          ctaTopRatio: 1.1,
          contentInsetRatio: 0.05,
        },
      },
    };
    const requestCalls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      requestCalls.push({ url, init });
      const attempt = requestCalls.length;
      const content =
        attempt === 1
          ? "{ malformed analyzer response"
          : JSON.stringify(validAnalysis);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content }, finish_reason: "stop" }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });
    const pack = buildInspirationPack(
      {
        seed: "reference-analyzer-retry",
        industry: "legal-services",
        styleTerms: [],
        recentReferenceIds: [],
        recentRouteSignatures: [],
      },
      productionRegistry,
    );

    try {
      const enriched = await enrichInspirationPack(pack, {
        fetchImpl: fetchImpl as typeof fetch,
      });
      expect(enriched.routes).toHaveLength(3);
      expect(fetchImpl).toHaveBeenCalledTimes(4);
      const cacheHeaders = requestCalls.map(({ init }) =>
        new Headers(init?.headers).get("X-OpenRouter-Cache"),
      );
      expect(cacheHeaders).toEqual(["true", null, "true", "true"]);
    } finally {
      vi.unstubAllEnvs();
    }
  }, 15_000);

  it("runs the reference analyzer on OpenCode Go when the provider selects it", async () => {
    vi.resetModules();
    vi.stubEnv("CREATIVE_EXPERIENCE_PROVIDER", "opencode-go");
    vi.stubEnv("OPENCODE_GO_API_KEY", "test-go-key");
    const goAnalysis = {
      annotatedDescription:
        "Measured the hierarchy, imagery, and spacing from the paired screenshots.",
      heroGeometry: {
        mode: "image-led",
        alignment: "asymmetric",
        viewport: "adapted desktop composition",
      },
      navigationGeometry: {
        mode: "compact",
        placement: "top edge",
        mobile: "collapsed menu",
      },
      typography: {
        display: "editorial serif",
        body: "neutral sans",
        scale: "oversized to compact",
      },
      palette: {
        surfaces: ["warm ivory"],
        ink: "deep green",
        accents: ["ochre"],
        contrastIntent: "high contrast",
      },
      imageTreatment: {
        mode: "full bleed",
        crop: "wide crop",
        focalPoint: "center-right",
      },
      sectionSequence: ["hero", "services", "studio story", "contact"],
      servicePresentation: {
        pattern: "editorial rows",
        interaction: "static links",
      },
      ctaPlacement: {
        primary: "hero",
        secondary: "footer",
        early: "visible in first viewport",
      },
      motion: {
        primitive: "subtle reveal",
        library: "CSS",
        reducedMotion: "disable reveal",
      },
      mobileRecomposition: {
        strategy: "single column",
        rules: ["stack media", "keep CTA above the fold"],
      },
      prohibitedPatterns: [
        "generic card wall",
        "split hero",
        "repeated accordion",
      ],
      requiredSignatureElements: [
        {
          id: "oversized-title",
          selector: "h1",
          description: "large editorial title",
        },
        {
          id: "archive-rows",
          selector: "[data-section='archive']",
          description: "thin ruled archive rows",
        },
      ],
      acceptanceChecks: [
        "retain title scale",
        "keep the archive",
        "use the screenshot crop",
        "preserve mobile order",
      ],
      measurements: {
        headlineWidthRatio: 0.7,
        headlineHeightRatio: 0.2,
        heroImageOccupancyRatio: 0.6,
        contentColumnWidthRatio: 0.5,
        navTopRatio: 0.03,
        navSideInsetRatio: 0.04,
        ctaTopRatio: 0.7,
        dominantSectionHeightRatios: [0.8, 0.7, 0.9],
        imageAspectRatios: [1.5],
        overlapRelationships: [],
        surfaceTransitions: ["ivory to dark green"],
        mobile: {
          headlineWidthRatio: 0.9,
          imageOccupancyRatio: 0.5,
          ctaTopRatio: 1.1,
          contentInsetRatio: 0.05,
        },
      },
    };
    const requestCalls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      requestCalls.push({ url, init });
      return new Response(
        JSON.stringify({
          id: "resp_go_1",
          status: "completed",
          output: [
            {
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                { type: "output_text", text: JSON.stringify(goAnalysis) },
              ],
            },
          ],
          usage: {
            input_tokens: 1200,
            output_tokens: 800,
            input_tokens_details: { cached_tokens: 0 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const pack = buildInspirationPack(
      {
        seed: "reference-analyzer-go",
        industry: "legal-services",
        styleTerms: [],
        recentReferenceIds: [],
        recentRouteSignatures: [],
      },
      productionRegistry,
    );
    try {
      const { enrichInspirationPack: enrichGo } =
        await import("../scripts/analyze-reference-dna.mjs");
      const enriched = await enrichGo(pack, {
        fetchImpl: fetchImpl as typeof fetch,
      });
      expect(enriched.routes.length).toBeGreaterThan(0);
      expect(fetchImpl).toHaveBeenCalled();
      expect(
        requestCalls.every(({ url }) =>
          url.includes("opencode.ai/inference/go"),
        ),
      ).toBe(true);
      const headers = new Headers(requestCalls[0].init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer test-go-key");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  }, 20_000);

  it("retries a transient Go provider error before analyzing the reference", async () => {
    vi.resetModules();
    vi.stubEnv("CREATIVE_EXPERIENCE_PROVIDER", "opencode-go");
    vi.stubEnv("OPENCODE_GO_API_KEY", "test-go-key");
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1)
        return new Response(
          JSON.stringify({ error: { message: "upstream" } }),
          {
            status: 503,
            headers: { "content-type": "application/json" },
          },
        );
      return completedGoResponse();
    });
    const pack = buildInspirationPack(
      {
        seed: "reference-analyzer-go-retry",
        industry: "legal-services",
        styleTerms: [],
        recentReferenceIds: [],
        recentRouteSignatures: [],
      },
      productionRegistry,
    );
    try {
      const { enrichInspirationPack: enrichGo } =
        await import("../scripts/analyze-reference-dna.mjs");
      const enriched = await enrichGo(pack, {
        fetchImpl: fetchImpl as typeof fetch,
        sleep,
      });
      // route-01 retries once, then routes 02 and 03 complete first time.
      expect(calls).toBe(4);
      expect(enriched.routes).toHaveLength(3);
      expect(sleep).toHaveBeenCalledTimes(1);
      expect(sleep).toHaveBeenCalledWith(4_000);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  }, 20_000);

  it("reports the Go provider status and code when transient errors keep failing", async () => {
    vi.resetModules();
    vi.stubEnv("CREATIVE_EXPERIENCE_PROVIDER", "opencode-go");
    vi.stubEnv("OPENCODE_GO_API_KEY", "test-go-key");
    const warnings: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation((line) => {
      warnings.push(String(line));
    });
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { message: "upstream" } }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    });
    const pack = buildInspirationPack(
      {
        seed: "reference-analyzer-go-exhausted",
        industry: "legal-services",
        styleTerms: [],
        recentReferenceIds: [],
        recentRouteSignatures: [],
      },
      productionRegistry,
    );
    try {
      const { enrichInspirationPack: enrichGo } =
        await import("../scripts/analyze-reference-dna.mjs");
      await expect(
        enrichGo(pack, {
          fetchImpl: fetchImpl as typeof fetch,
          sleep: async () => {},
        }),
      ).rejects.toThrow(
        /Reference analyzer did not produce valid JSON after evidence and model fallbacks \(finish_reason=error\/upstream http_status=503/u,
      );
      // Initial attempts, the uncached retry, desktop-only evidence, and the
      // fallback analyst model: four bounded transport rounds.
      expect(calls).toBe(16);
      expect(
        warnings.some((line) =>
          /reference_dna_retry route=route-\d+ finish_reason=error\/upstream http_status=503 .*cache=bypassed/u.test(
            line,
          ),
        ),
      ).toBe(true);
      expect(
        warnings.some((line) =>
          /reference_dna_fallback route=route-\d+ evidence=desktop-only/u.test(
            line,
          ),
        ),
      ).toBe(true);
      expect(
        warnings.some((line) =>
          /reference_dna_fallback route=route-\d+ model=z-ai\/glm-5\.3-flash/u.test(
            line,
          ),
        ),
      ).toBe(true);
      expect(
        warnings.some((line) =>
          /reference_dna_opencode_go_retry .*code=upstream .*attempt=1\/4/u.test(
            line,
          ),
        ),
      ).toBe(true);
    } finally {
      warn.mockRestore();
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  }, 20_000);

  it("recovers with desktop-only evidence after a persistent Go provider fault", async () => {
    vi.resetModules();
    vi.stubEnv("CREATIVE_EXPERIENCE_PROVIDER", "opencode-go");
    vi.stubEnv("OPENCODE_GO_API_KEY", "test-go-key");
    const warnings: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation((line) => {
      warnings.push(String(line));
    });
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls <= 8)
        return new Response(
          JSON.stringify({
            error: { message: "server error", type: "server_error" },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      return completedGoResponse();
    });
    const pack = buildInspirationPack(
      {
        seed: "reference-analyzer-go-desktop-fallback",
        industry: "legal-services",
        styleTerms: [],
        recentReferenceIds: [],
        recentRouteSignatures: [],
      },
      productionRegistry,
    );
    try {
      const { enrichInspirationPack: enrichGo } =
        await import("../scripts/analyze-reference-dna.mjs");
      await enrichGo(pack, {
        fetchImpl: fetchImpl as typeof fetch,
        sleep: async () => {},
      });
      // Route 1: four failed attempts, four failed uncached attempts, then the
      // desktop-only retry succeeds; routes 2 and 3 analyze on their first try.
      expect(calls).toBe(11);
      expect(
        warnings.some((line) =>
          /reference_dna_fallback route=route-01 evidence=desktop-only/u.test(
            line,
          ),
        ),
      ).toBe(true);
      expect(
        warnings.some((line) =>
          /reference_dna_fallback route=route-01 model=/u.test(line),
        ),
      ).toBe(false);
    } finally {
      warn.mockRestore();
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  }, 20_000);

  it("reports a quota failure without burning bounded retries", async () => {
    vi.resetModules();
    vi.stubEnv("CREATIVE_EXPERIENCE_PROVIDER", "opencode-go");
    vi.stubEnv("OPENCODE_GO_API_KEY", "test-go-key");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ error: { code: "quota_exhausted" } }),
        {
          status: 402,
          headers: { "content-type": "application/json" },
        },
      );
    });
    const pack = buildInspirationPack(
      {
        seed: "reference-analyzer-go-quota",
        industry: "legal-services",
        styleTerms: [],
        recentReferenceIds: [],
        recentRouteSignatures: [],
      },
      productionRegistry,
    );
    try {
      const { enrichInspirationPack: enrichGo } =
        await import("../scripts/analyze-reference-dna.mjs");
      await expect(
        enrichGo(pack, {
          fetchImpl: fetchImpl as typeof fetch,
          sleep: async () => {},
        }),
      ).rejects.toThrow(/finish_reason=error\/quota, http 402/u);
      // Non-transient provider codes fail on the first response; the analyzer
      // still performs exactly one uncached retry for the invalid-JSON contract.
      expect(calls).toBe(2);
    } finally {
      warn.mockRestore();
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  }, 20_000);

  it("fails closed after one uncached retry still returns invalid JSON", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
    const requestCalls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      requestCalls.push({ url, init });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: "{ still malformed" },
              finish_reason: "stop",
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });
    const pack = buildInspirationPack(
      {
        seed: "reference-analyzer-retry-still-fails",
        industry: "legal-services",
        styleTerms: [],
        recentReferenceIds: [],
        recentRouteSignatures: [],
      },
      productionRegistry,
    );

    try {
      await expect(
        enrichInspirationPack(pack, { fetchImpl: fetchImpl as typeof fetch }),
      ).rejects.toThrow(
        "Reference analyzer returned invalid JSON after one uncached retry",
      );
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      const cacheHeaders = requestCalls.map(({ init }) =>
        new Headers(init?.headers).get("X-OpenRouter-Cache"),
      );
      expect(cacheHeaders).toEqual(["true", null]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("fails closed when the required desktop screenshot is missing", () => {
    const dna = buildReferenceDna({
      id: "missing-evidence",
      source: "test",
      rights: "reference-only",
      screenshotPath: "does-not-exist.png",
      heroGeometry: "typographic-monument",
    });
    expect(dna.complete).toBe(false);
    expect(() => validateReferenceDna(dna, { requireEvidence: true })).toThrow(
      /desktop reference screenshot/iu,
    );
  });

  it("does not allow an incomplete registry to compile a creative pack", () => {
    const homeServicesIds = new Set(
      core.niches.find((niche: any) => niche.businessKind === "home-services")
        .referenceIds,
    );
    const records = productionRegistry.records
      .filter((record: any) => homeServicesIds.has(record.id))
      .slice(0, 2);
    expect(() =>
      buildInspirationPack(
        {
          seed: "missing-pack",
          industry: "home-services",
          styleTerms: [],
          recentReferenceIds: [],
          recentRouteSignatures: [],
        },
        { version: 1, records },
      ),
    ).toThrow(/business-matched dossiers/iu);
  });

  it("normalizes analyzer prose into enforceable family section IDs", () => {
    expect(
      normalizeSectionSequence(
        [
          "hero monument with oversized serif title",
          "wide horizontal image collage / triptych",
          "full-width article ledger rows",
          "full-bleed cinematic architectural image",
        ],
        "kokoro-editorial-architecture",
      ),
    ).toEqual(["hero", "image-mosaic", "magazine-archive", "closing-scene"]);
  });

  it("selects only cleared restaurant dossiers for food and market cues", () => {
    const pack = buildInspirationPack(
      {
        seed: "neighborhood-collage-test",
        industry: "food",
        styleTerms: ["neighborhood", "collage", "market", "shelf"],
        recentReferenceIds: [],
        recentRouteSignatures: [],
      },
      productionRegistry,
    );
    const restaurantIds = new Set(
      core.niches.find((niche: any) => niche.businessKind === "restaurant")
        .referenceIds,
    );
    expect(pack.routes).toHaveLength(3);
    expect(
      pack.routes.every((route: any) =>
        restaurantIds.has(route.referenceIds[0]),
      ),
    ).toBe(true);
    expect(
      pack.routes.every(
        (route: any) => route.referenceDna.evidence.desktopScreenshot.available,
      ),
    ).toBe(true);
  });
});
