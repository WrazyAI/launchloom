import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  evaluateRenderedDiversity,
  evaluateRenderedReferenceFidelity,
} from "../scripts/rendered-reference-fidelity.mjs";

const roots: string[] = [];
const originalKey = process.env.OPENROUTER_API_KEY;

afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function evidence() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-ref-"));
  roots.push(root);
  const files = {
    referenceDesktop: path.join(root, "reference-desktop.png"),
    referenceMobile: path.join(root, "reference-mobile.png"),
    candidateDesktop: path.join(root, "candidate-desktop.png"),
    candidateCompact: path.join(root, "candidate-compact.png"),
    candidateMobile: path.join(root, "candidate-mobile.png"),
    secondDesktop: path.join(root, "second-desktop.png"),
    secondMobile: path.join(root, "second-mobile.png"),
  };
  await Promise.all(
    Object.values(files).map((file) =>
      fs.writeFile(file, Buffer.from("pixel-evidence")),
    ),
  );
  return files;
}

function dna(files: Awaited<ReturnType<typeof evidence>>) {
  return {
    version: 2,
    familyId: "kokoro-editorial-architecture",
    referenceName: "Kokoro editorial architecture",
    source: "reference-only",
    rights: "reference-only",
    evidence: {
      desktopScreenshot: { path: files.referenceDesktop, available: true },
      mobileScreenshot: { path: files.referenceMobile, available: true },
      annotatedDescription:
        "Oversized editorial type, image chapters, archive rhythm.",
    },
    heroGeometry: { mode: "typographic-monument" },
    navigationGeometry: { mode: "quiet-corner-links" },
    typography: { display: "editorial-serif" },
    palette: { surfaces: ["near-black"] },
    imageTreatment: { mode: "architectural-tableaux" },
    sectionSequence: [
      "hero",
      "image-chapter",
      "magazine-archive",
      "closing-scene",
    ],
    servicePresentation: { pattern: "magazine-archive-ledger" },
    ctaPlacement: { early: "after-hero-image" },
    motion: { primitive: "masked-image-reveal" },
    mobileRecomposition: { strategy: "single-column-editorial-chapters" },
    prohibitedPatterns: ["generic-split-hero", "card-wall"],
    requiredSignatureElements: [
      {
        id: "editorial-monument",
        selector: "[data-reference-signature=editorial-monument]",
      },
    ],
    acceptanceChecks: ["preserve oversized type", "preserve archive rhythm"],
    complete: true,
    incompleteReasons: [],
  };
}

function response(value: unknown) {
  return new Response(
    JSON.stringify({
      choices: [
        { finish_reason: "stop", message: { content: JSON.stringify(value) } },
      ],
      provider: "test",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

const passingScores = {
  heroGeometry: 92,
  typography: 90,
  spatialRhythm: 88,
  imagery: 86,
  servicePresentation: 90,
  navigation: 84,
  ctaPlacement: 86,
  mobileRecomposition: 88,
  interactionEvidence: 76,
};

describe("rendered reference request retries", () => {
  const files = {
    referenceDesktop: "reference-desktop.png",
    referenceMobile: "reference-mobile.png",
    candidateDesktop: "candidate-desktop.png",
    candidateCompact: "candidate-compact.png",
    candidateMobile: "candidate-mobile.png",
    secondDesktop: "second-desktop.png",
    secondMobile: "second-mobile.png",
  };
  const audit = {
    verdict: "pass",
    overallScore: 89,
    scores: passingScores,
    findings: [],
    summary: "The candidate preserves the reference mechanics.",
  };

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test";
    vi.useFakeTimers();
    vi.spyOn(fs, "access").mockResolvedValue(undefined);
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("pixel-evidence"));
  });

  function evaluate(fetchImpl: typeof fetch) {
    return evaluateRenderedReferenceFidelity({
      referenceDna: dna(files),
      candidateScreenshots: {
        desktop: files.candidateDesktop,
        compact: files.candidateCompact,
        mobile: files.candidateMobile,
      },
      fetchImpl,
    });
  }

  function failure(status: number, message = "Provider unavailable") {
    return new Response(JSON.stringify({ error: { message } }), { status });
  }

  it.each([408, 429, 500, 502, 503, 599])(
    "retries HTTP %i after a short backoff",
    async (status) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(failure(status))
        .mockResolvedValueOnce(response(audit));
      const pending = evaluate(fetchImpl);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(499);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect((await pending).pass).toBe(true);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      const signals = fetchImpl.mock.calls.map(
        ([, options]) => options?.signal,
      );
      expect(signals[0]).toBeInstanceOf(AbortSignal);
      expect(signals[1]).not.toBe(signals[0]);
      expect(signals.every((signal) => signal && !signal.aborted)).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("stops after three attempts and preserves the final HTTP error", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(failure(503, "First failure"))
      .mockResolvedValueOnce(failure(429, "Second failure"))
      .mockResolvedValueOnce(failure(502, "Final provider failure"));
    const rejected = expect(evaluate(fetchImpl)).rejects.toThrow(
      "Rendered reference judge failed (502): Final provider failure",
    );
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([400, 401, 403, 404, 409, 422, 499])(
    "does not retry HTTP %i",
    async (status) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(failure(status));
      await expect(evaluate(fetchImpl)).rejects.toThrow(
        `Rendered reference judge failed (${status}): Provider unavailable`,
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("stops immediately on a non-retryable response after a transient failure", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(failure(503))
      .mockResolvedValueOnce(failure(401, "Invalid key"));
    const rejected = expect(evaluate(fetchImpl)).rejects.toThrow(
      "Rendered reference judge failed (401): Invalid key",
    );
    await vi.advanceTimersByTimeAsync(500);
    await rejected;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries non-JSON transient HTTP responses", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("Service unavailable", { status: 503 }),
      )
      .mockResolvedValueOnce(response(audit));
    const pending = evaluate(fetchImpl);
    await vi.advanceTimersByTimeAsync(500);
    expect((await pending).pass).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves network errors without retrying", async () => {
    const error = new TypeError("Connection reset");
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(error);
    await expect(evaluate(fetchImpl)).rejects.toBe(error);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([200, 503])(
    "preserves body read errors for HTTP %i without retrying",
    async (status) => {
      const error = new TypeError("Body stream failed");
      const result = failure(status);
      vi.spyOn(result, "json").mockRejectedValue(error);
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(result);
      await expect(evaluate(fetchImpl)).rejects.toBe(error);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("preserves malformed response JSON without retrying", async () => {
    const error = new SyntaxError("Malformed provider response");
    const result = response(audit);
    vi.spyOn(result, "json").mockRejectedValue(error);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(result);
    await expect(evaluate(fetchImpl)).rejects.toBe(error);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [{ choices: [] }, "returned no content"],
    [
      { choices: [{ message: { content: "invalid" } }] },
      "returned invalid JSON",
    ],
    [
      { choices: [{ finish_reason: "length", message: { content: "{}" } }] },
      "was truncated",
    ],
  ])("does not retry invalid model output: %j", async (payload, message) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(payload)));
    await expect(evaluate(fetchImpl)).rejects.toThrow(
      `Rendered reference judge ${message}`,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["headers", "success body", "error body"])(
    "keeps the 180-second timeout active through %s",
    async (phase) => {
      let signal: AbortSignal | undefined;
      const error = new DOMException("Request aborted", "AbortError");
      const fetchImpl = vi.fn<typeof fetch>(async (_url, options) => {
        signal = options?.signal as AbortSignal;
        const aborted = new Promise<never>((_resolve, reject) => {
          signal!.addEventListener("abort", () => reject(error), {
            once: true,
          });
        });
        if (phase === "headers") return aborted;
        const result = failure(phase === "success body" ? 200 : 503);
        vi.spyOn(result, "json").mockReturnValue(aborted);
        return result;
      });
      const rejected = expect(evaluate(fetchImpl)).rejects.toBe(error);
      await vi.advanceTimersByTimeAsync(179_999);
      expect(signal?.aborted).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await rejected;
      expect(signal?.aborted).toBe(true);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("also retries diversity requests through the shared request helper", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(failure(429))
      .mockResolvedValueOnce(
        response({
          overallDistinctiveness: 90,
          genericFallbackDetected: false,
          pairs: [
            {
              left: "a",
              right: "b",
              distance: 90,
              reason: "Distinct layouts.",
            },
          ],
          summary: "Distinct candidates.",
        }),
      );
    const pending = evaluateRenderedDiversity({
      candidates: [
        {
          candidateId: "a",
          desktop: files.candidateDesktop,
          mobile: files.candidateMobile,
        },
        {
          candidateId: "b",
          desktop: files.secondDesktop,
          mobile: files.secondMobile,
        },
      ],
      fetchImpl,
    });
    await vi.advanceTimersByTimeAsync(500);
    expect((await pending).pass).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("rendered reference fidelity", () => {
  it("specifies the same 0-to-100 percentage scale in judge instructions and schema", async () => {
    process.env.OPENROUTER_API_KEY = "test";
    const files = await evidence();
    let requestBody: any;
    await evaluateRenderedReferenceFidelity({
      referenceDna: dna(files),
      candidateScreenshots: {
        desktop: files.candidateDesktop,
        compact: files.candidateCompact,
        mobile: files.candidateMobile,
      },
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(String(options?.body || "{}"));
        return response({
          verdict: "pass",
          overallScore: 89,
          scores: passingScores,
          findings: [],
          summary: "Pass.",
        });
      },
    });

    expect(requestBody.messages[0].content).toMatch(/0\s*(?:to|-)\s*100/iu);
    expect(requestBody.messages[0].content).toContain(
      "Do not use a 0-to-10 scale",
    );
    expect(
      requestBody.response_format.json_schema.schema.properties.scores
        .properties.ctaPlacement.description,
    ).toMatch(/0\s*(?:to|-)\s*100/iu);
  });

  it("identifies the true viewport and page overview as different visual evidence", async () => {
    process.env.OPENROUTER_API_KEY = "test";
    const files = await evidence();
    const requests: any[] = [];
    await evaluateRenderedReferenceFidelity({
      referenceDna: dna(files),
      candidateScreenshots: {
        desktop: files.candidateDesktop,
        compact: files.candidateCompact,
        mobile: files.candidateMobile,
        fullDesktop: files.secondDesktop,
      },
      renderedGeometry: { desktop: { heroBottom: 480, viewportHeight: 864 } },
      fetchImpl: async (_url, options) => {
        requests.push(JSON.parse(String(options?.body || "{}")));
        return response({
          verdict: "pass",
          overallScore: 89,
          scores: passingScores,
          findings: [],
          summary: "Pass.",
        });
      },
    });
    const textBlocks = requests[0].messages[1].content
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text)
      .join("\n");
    expect(textBlocks).toContain("Candidate desktop first viewport 1536x864");
    expect(textBlocks).toContain("Candidate desktop page overview");
    expect(textBlocks).toContain("480");
    expect(textBlocks).toContain("864");
    expect(textBlocks).toContain(
      "capture height is not the browser viewport height",
    );
  });

  it("compares reference measurement ratios against actual browser-measured candidate bounds", async () => {
    process.env.OPENROUTER_API_KEY = "test";
    const files = await evidence();
    let requestBody: any;
    await evaluateRenderedReferenceFidelity({
      referenceDna: {
        ...dna(files),
        measurements: {
          headlineWidthRatio: 0.82,
          heroImageOccupancyRatio: 0.25,
          mobile: { headlineWidthRatio: 0.94, imageOccupancyRatio: 0.88 },
        },
      },
      candidateScreenshots: {
        desktop: files.candidateDesktop,
        compact: files.candidateCompact,
        mobile: files.candidateMobile,
      },
      renderedGeometry: {
        desktop: {
          viewportWidth: 1536,
          viewportHeight: 864,
          headline: { widthRatio: 0.51 },
          openingImage: { widthRatio: 0.24, centerOffsetRatio: 0.01 },
        },
        mobile: {
          viewportWidth: 390,
          viewportHeight: 844,
          headline: { widthRatio: 0.92 },
          openingImage: { widthRatio: 0.88, centerOffsetRatio: 0 },
        },
      },
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(String(options?.body || "{}"));
        return response({
          verdict: "pass",
          overallScore: 89,
          scores: passingScores,
          findings: [],
          summary: "Pass.",
        });
      },
    });
    const textBlocks = requestBody.messages[1].content
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text)
      .join("\n");
    expect(textBlocks).toContain(
      "Measured reference-to-candidate geometry ratios",
    );
    expect(textBlocks).toContain('"headlineWidthRatio": 0.82');
    expect(textBlocks).toContain('"openingImage":{"widthRatio":0.88');
    expect(textBlocks).toContain('"centerOffsetRatio":0');
    expect(textBlocks).toContain(
      "Do not infer pixel dimensions from resized images when measured ratios are supplied.",
    );
  });

  it("keeps candidate geometry and overview measurements after the reusable reference prefix", async () => {
    process.env.OPENROUTER_API_KEY = "test";
    const files = await evidence();
    const root = path.dirname(files.referenceDesktop);
    const overviewA = path.join(root, "candidate-overview-a.png");
    const overviewB = path.join(root, "candidate-overview-b.png");
    const writeOverview = (file: string, height: number) =>
      sharp({
        create: {
          width: 1536,
          height,
          channels: 3,
          background: { r: 30, g: 40, b: 50 },
        },
      })
        .png()
        .toFile(file);
    await Promise.all([
      writeOverview(overviewA, 2400),
      writeOverview(overviewB, 3000),
    ]);
    const requests: any[] = [];
    const run = (
      fullDesktop: string,
      renderedGeometry: Record<string, unknown>,
    ) =>
      evaluateRenderedReferenceFidelity({
        referenceDna: dna(files),
        candidateScreenshots: {
          desktop: files.candidateDesktop,
          compact: files.candidateCompact,
          mobile: files.candidateMobile,
          fullDesktop,
        },
        renderedGeometry,
        fetchImpl: async (_url, options) => {
          requests.push(JSON.parse(String(options?.body || "{}")));
          return response({
            verdict: "pass",
            overallScore: 89,
            scores: passingScores,
            findings: [],
            summary: "Pass.",
          });
        },
      });

    await run(overviewA, { desktop: { heroBottom: 480, viewportHeight: 864 } });
    await run(overviewB, { desktop: { heroBottom: 520, viewportHeight: 864 } });

    const reusablePrefix = (request: any) => {
      const content = request.messages[1].content;
      const breakpoint = content.findIndex(
        (part: any) => part.prompt_cache_breakpoint?.mode === "explicit",
      );
      expect(breakpoint).toBeGreaterThanOrEqual(0);
      return content.slice(0, breakpoint + 1);
    };
    expect(requests).toHaveLength(2);
    expect(reusablePrefix(requests[0])).toEqual(reusablePrefix(requests[1]));

    const afterBreakpoint = (request: any) => {
      const content = request.messages[1].content;
      const breakpoint = content.findIndex(
        (part: any) => part.prompt_cache_breakpoint?.mode === "explicit",
      );
      return content
        .slice(breakpoint + 1)
        .filter((part: any) => part.type === "text")
        .map((part: any) => part.text)
        .join("\n");
    };
    expect(afterBreakpoint(requests[0])).toContain('"heroBottom":480');
    expect(afterBreakpoint(requests[0])).toContain("1536x2400");
    expect(afterBreakpoint(requests[1])).toContain('"heroBottom":520');
    expect(afterBreakpoint(requests[1])).toContain("1536x3000");
  });

  it("sends like-for-like high-detail viewport crops and low-detail page overviews", async () => {
    process.env.OPENROUTER_API_KEY = "test";
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-viewport-judge-"),
    );
    roots.push(root);
    const files = {
      referenceDesktop: path.join(root, "reference-desktop.png"),
      referenceMobile: path.join(root, "reference-mobile.png"),
      candidateDesktop: path.join(root, "candidate-desktop.png"),
      candidateCompact: path.join(root, "candidate-compact.png"),
      candidateMobile: path.join(root, "candidate-mobile.png"),
      fullDesktop: path.join(root, "candidate-full-desktop.png"),
      secondDesktop: path.join(root, "second-desktop.png"),
      secondMobile: path.join(root, "second-mobile.png"),
    };
    const writeImage = (file: string, width: number, height: number) =>
      sharp({
        create: {
          width,
          height,
          channels: 3,
          background: { r: 30, g: 40, b: 50 },
        },
      })
        .png()
        .toFile(file);
    await Promise.all([
      writeImage(files.referenceDesktop, 1440, 2400),
      writeImage(files.referenceMobile, 390, 3000),
      writeImage(files.candidateDesktop, 1536, 864),
      writeImage(files.candidateCompact, 1366, 768),
      writeImage(files.candidateMobile, 390, 844),
      writeImage(files.fullDesktop, 1536, 3000),
    ]);
    const reference: any = dna(files);
    reference.evidence.desktopScreenshot.viewport = {
      width: 1440,
      height: 900,
    };
    reference.evidence.mobileScreenshot.viewport = { width: 390, height: 844 };
    let requestBody: any;

    await evaluateRenderedReferenceFidelity({
      referenceDna: reference,
      candidateScreenshots: {
        desktop: files.candidateDesktop,
        compact: files.candidateCompact,
        mobile: files.candidateMobile,
        fullDesktop: files.fullDesktop,
      },
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(String(options?.body || "{}"));
        return response({
          verdict: "pass",
          overallScore: 89,
          scores: passingScores,
          findings: [],
          summary: "Pass.",
        });
      },
    });

    const media = requestBody.messages[1].content.filter(
      (part: any) => part.type === "image_url",
    );
    const metadataAt = async (index: number) =>
      sharp(
        Buffer.from(media[index].image_url.url.split(",")[1], "base64"),
      ).metadata();
    expect(media.map((part: any) => part.image_url.detail)).toEqual([
      "low",
      "high",
      "high",
      "high",
      "high",
      "high",
      "low",
    ]);
    await expect(metadataAt(0)).resolves.toMatchObject({
      width: 1080,
      height: 1800,
    });
    await expect(metadataAt(1)).resolves.toMatchObject({
      width: 1200,
      height: 750,
    });
    await expect(metadataAt(2)).resolves.toMatchObject({
      width: 390,
      height: 844,
    });
    await expect(metadataAt(3)).resolves.toMatchObject({
      width: 1200,
      height: 675,
    });
    await expect(metadataAt(6)).resolves.toMatchObject({
      width: 922,
      height: 1800,
    });
  });

  it("passes only from pixel-level reference scores, not DOM markers", async () => {
    process.env.OPENROUTER_API_KEY = "test";
    const files = await evidence();
    const result = await evaluateRenderedReferenceFidelity({
      referenceDna: dna(files),
      candidateScreenshots: {
        desktop: files.candidateDesktop,
        compact: files.candidateCompact,
        mobile: files.candidateMobile,
      },
      fetchImpl: async () =>
        response({
          verdict: "pass",
          overallScore: 89,
          scores: passingScores,
          findings: [],
          summary: "The candidate preserves the reference mechanics.",
        }),
    });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(89);
  });

  it("keeps volatile analysis timestamps out of reusable reference cache prefixes", async () => {
    process.env.OPENROUTER_API_KEY = "test";
    const files = await evidence();
    const requests: any[] = [];
    const reference = {
      ...dna(files),
      analyzedAt: "2026-09-21T20:00:00.000Z",
      generatedAt: "2026-09-21T20:01:00.000Z",
      updatedAt: "2026-09-21T20:02:00.000Z",
    };
    const result = await evaluateRenderedReferenceFidelity({
      referenceDna: reference,
      candidateScreenshots: {
        desktop: files.candidateDesktop,
        compact: files.candidateCompact,
        mobile: files.candidateMobile,
      },
      fetchImpl: async (_url, options) => {
        requests.push(JSON.parse(String(options?.body || "{}")));
        return response({
          verdict: "pass",
          overallScore: 89,
          scores: passingScores,
          findings: [],
          summary: "The candidate preserves the reference mechanics.",
        });
      },
    });

    expect(result.pass).toBe(true);
    expect(requests).toHaveLength(1);
    const serialized = JSON.stringify(requests[0]);
    expect(serialized).not.toContain("analyzedAt");
    expect(serialized).not.toContain("generatedAt");
    expect(serialized).not.toContain("updatedAt");
    expect(requests[0].prompt_cache_key).toMatch(/^ll:rendered-reference:/u);
  });

  it("blocks a generic candidate even when it is technically clean", async () => {
    process.env.OPENROUTER_API_KEY = "test";
    const files = await evidence();
    const result = await evaluateRenderedReferenceFidelity({
      referenceDna: dna(files),
      candidateScreenshots: {
        desktop: files.candidateDesktop,
        compact: files.candidateCompact,
        mobile: files.candidateMobile,
      },
      fetchImpl: async () =>
        response({
          verdict: "revise",
          overallScore: 68,
          scores: { ...passingScores, heroGeometry: 60, spatialRhythm: 61 },
          findings: [
            {
              severity: "major",
              category: "generic-grammar",
              viewport: "all",
              evidence:
                "The candidate collapses into a familiar centered hero and card stack.",
              repair:
                "Restore the reference's image-led chapters and archive rhythm.",
            },
          ],
          summary: "Technically valid but visually generic.",
        }),
    });
    expect(result.pass).toBe(false);
    expect(result.audit.findings[0].category).toBe("generic-grammar");
  });

  it("uses screenshot distance rather than route metadata for diversity", async () => {
    process.env.OPENROUTER_API_KEY = "test";
    const files = await evidence();
    const result = await evaluateRenderedDiversity({
      candidates: [
        {
          candidateId: "candidate-a",
          desktop: files.candidateDesktop,
          mobile: files.candidateMobile,
        },
        {
          candidateId: "candidate-b",
          desktop: files.secondDesktop,
          mobile: files.secondMobile,
        },
      ],
      fetchImpl: async () =>
        response({
          overallDistinctiveness: 64,
          genericFallbackDetected: true,
          pairs: [
            {
              left: "candidate-a",
              right: "candidate-b",
              distance: 58,
              reason:
                "Both use the same centered opening and stacked card rhythm.",
            },
          ],
          summary: "The candidates are visually too similar.",
        }),
    });
    expect(result.pass).toBe(false);
    expect(result.minimumPairDistance).toBe(58);
  });
});
