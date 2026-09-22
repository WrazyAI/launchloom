import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  createReferenceViewportEvidence,
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
    roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
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
    candidateDesktopFullPage: path.join(root, "candidate-desktop-fullpage.png"),
    secondDesktop: path.join(root, "second-desktop.png"),
    secondMobile: path.join(root, "second-mobile.png"),
  };
  const screenshots = [
    [files.referenceDesktop, 1401, 2102, { r: 18, g: 24, b: 21 }],
    [files.referenceMobile, 390, 1688, { r: 18, g: 24, b: 21 }],
    [files.candidateDesktop, 1536, 864, { r: 18, g: 24, b: 21 }],
    [files.candidateCompact, 1366, 768, { r: 18, g: 24, b: 21 }],
    [files.candidateMobile, 390, 844, { r: 18, g: 24, b: 21 }],
    [files.candidateDesktopFullPage, 1536, 2600, { r: 18, g: 24, b: 21 }],
    [files.secondDesktop, 1536, 864, { r: 40, g: 24, b: 21 }],
    [files.secondMobile, 390, 844, { r: 40, g: 24, b: 21 }],
  ] as const;
  await Promise.all(screenshots.map(([file, width, height, background]) =>
    sharp({ create: { width, height, channels: 3, background } }).png().toFile(file),
  ));
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
      annotatedDescription: "Oversized editorial type, image chapters, archive rhythm.",
    },
    heroGeometry: { mode: "typographic-monument" },
    navigationGeometry: { mode: "quiet-corner-links" },
    typography: { display: "editorial-serif" },
    palette: { surfaces: ["near-black"] },
    imageTreatment: { mode: "architectural-tableaux" },
    sectionSequence: ["hero", "image-chapter", "magazine-archive", "closing-scene"],
    servicePresentation: { pattern: "magazine-archive-ledger" },
    ctaPlacement: { early: "after-hero-image" },
    motion: { primitive: "masked-image-reveal" },
    mobileRecomposition: { strategy: "single-column-editorial-chapters" },
    prohibitedPatterns: ["generic-split-hero", "card-wall"],
    requiredSignatureElements: [
      { id: "editorial-monument", selector: "[data-reference-signature=editorial-monument]" },
    ],
    acceptanceChecks: ["preserve oversized type", "preserve archive rhythm"],
    complete: true,
    incompleteReasons: [],
  };
}

function response(value: unknown) {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }],
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
    candidateDesktopFullPage: "candidate-desktop-fullpage.png",
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
  });

  function evaluate(fetchImpl: typeof fetch) {
    return evaluateRenderedReferenceFidelity({
      referenceDna: dna(files),
      candidateScreenshots: {
        desktop: files.candidateDesktop,
        compact: files.candidateCompact,
        mobile: files.candidateMobile,
      },
      prepareReferenceViewportEvidence: async () => ({
        desktopFullPage: files.referenceDesktop,
        desktopOpening: files.referenceDesktop,
        mobileFullPage: files.referenceMobile,
        mobileOpening: files.referenceMobile,
      }),
      imagePartImpl: async (file: string) => ({ type: "text", text: `mock image ${file}` }),
      fetchImpl,
    });
  }

  function failure(status: number, message = "Provider unavailable") {
    return new Response(JSON.stringify({ error: { message } }), { status });
  }

  it.each([408, 429, 500, 502, 503, 599])("retries HTTP %i after a short backoff", async (status) => {
    const fetchImpl = vi.fn<typeof fetch>()
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
    const signals = fetchImpl.mock.calls.map(([, options]) => options?.signal);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[1]).not.toBe(signals[0]);
    expect(signals.every((signal) => signal && !signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops after three attempts and preserves the final HTTP error", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
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

  it.each([400, 401, 403, 404, 409, 422, 499])("does not retry HTTP %i", async (status) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(failure(status));
    await expect(evaluate(fetchImpl)).rejects.toThrow(
      `Rendered reference judge failed (${status}): Provider unavailable`,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops immediately on a non-retryable response after a transient failure", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
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
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Service unavailable", { status: 503 }))
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

  it.each([200, 503])("preserves body read errors for HTTP %i without retrying", async (status) => {
    const error = new TypeError("Body stream failed");
    const result = failure(status);
    vi.spyOn(result, "json").mockRejectedValue(error);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(result);
    await expect(evaluate(fetchImpl)).rejects.toBe(error);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

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
    [{ choices: [{ message: { content: "invalid" } }] }, "returned invalid JSON"],
    [{ choices: [{ finish_reason: "length", message: { content: "{}" } }] }, "was truncated"],
  ])("does not retry invalid model output: %j", async (payload, message) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(payload)),
    );
    await expect(evaluate(fetchImpl)).rejects.toThrow(`Rendered reference judge ${message}`);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["headers", "success body", "error body"])("keeps the 180-second timeout active through %s", async (phase) => {
    let signal: AbortSignal | undefined;
    const error = new DOMException("Request aborted", "AbortError");
    const fetchImpl = vi.fn<typeof fetch>(async (_url, options) => {
      signal = options?.signal as AbortSignal;
      const aborted = new Promise<never>((_resolve, reject) => {
        signal!.addEventListener("abort", () => reject(error), { once: true });
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
  });

  it("also retries diversity requests through the shared request helper", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(failure(429))
      .mockResolvedValueOnce(response({
        overallDistinctiveness: 90,
        genericFallbackDetected: false,
        pairs: [{ left: "a", right: "b", distance: 90, reason: "Distinct layouts." }],
        summary: "Distinct candidates.",
      }));
    const pending = evaluateRenderedDiversity({
      candidates: [
        { candidateId: "a", desktop: files.candidateDesktop, mobile: files.candidateMobile },
        { candidateId: "b", desktop: files.secondDesktop, mobile: files.secondMobile },
      ],
      imagePartImpl: async (file: string) => ({ type: "text", text: `mock image ${file}` }),
      fetchImpl,
    });
    await vi.advanceTimersByTimeAsync(500);
    expect((await pending).pass).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("rendered reference fidelity", () => {
  it("derives top-of-page reference crops at the compared viewport aspect ratios", async () => {
    const files = await evidence();
    const desktop = await sharp(files.referenceDesktop)
      .composite([{
        input: await sharp({
          create: { width: 1401, height: 1300, channels: 3, background: { r: 20, g: 40, b: 220 } },
        }).png().toBuffer(),
        left: 0,
        top: 802,
      }])
      .png()
      .toBuffer();
    await fs.writeFile(files.referenceDesktop, desktop);

    const prepared = await createReferenceViewportEvidence(
      dna(files),
      path.dirname(files.referenceDesktop),
    );
    const desktopMetadata = await sharp(prepared.desktopOpening).metadata();
    const mobileMetadata = await sharp(prepared.mobileOpening).metadata();
    const desktopSample = await sharp(prepared.desktopOpening).extract({ left: 10, top: 10, width: 1, height: 1 }).raw().toBuffer();
    const sourceBelowFold = await sharp(files.referenceDesktop).extract({ left: 10, top: 1000, width: 1, height: 1 }).raw().toBuffer();

    expect(desktopMetadata).toMatchObject({ width: 1200, height: 675 });
    expect(mobileMetadata).toMatchObject({ width: 390, height: 844 });
    expect(desktopSample[2]).toBeLessThan(50);
    expect(sourceBelowFold[2]).toBeGreaterThan(sourceBelowFold[0]);
    expect(prepared.desktopFullPage).toBe(files.referenceDesktop);
  });

  it("passes only from pixel-level reference scores, not DOM markers", async () => {
    process.env.OPENROUTER_API_KEY = "test";
    const files = await evidence();
    let requestBody: any;
    const result = await evaluateRenderedReferenceFidelity({
      referenceDna: dna(files),
      candidateScreenshots: {
        desktop: files.candidateDesktop,
        compact: files.candidateCompact,
        mobile: files.candidateMobile,
        desktopFullPage: files.candidateDesktopFullPage,
      },
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(String(options?.body || "{}"));
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
    expect(result.score).toBe(89);
    const content = requestBody.messages[1].content;
    const labels = content.filter((part: any) => part.type === "text").map((part: any) => part.text);
    expect(labels).toContain("Reference desktop opening viewport:");
    expect(labels).toContain("Reference desktop full-page overview:");
    expect(labels).toContain("Candidate desktop viewport 1536x864:");
    expect(labels).toContain("Candidate compact desktop viewport 1366x768:");
    expect(labels).toContain("Candidate mobile viewport 390x844:");
    expect(labels).toContain("Candidate desktop full-page overview:");
    expect(content.filter((part: any) => part.type === "image_url")).toHaveLength(8);
    expect(requestBody.messages[0].content).toContain("compare the candidate viewport screenshot to the reference opening crop");
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
              evidence: "The candidate collapses into a familiar centered hero and card stack.",
              repair: "Restore the reference's image-led chapters and archive rhythm.",
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
        { candidateId: "candidate-a", desktop: files.candidateDesktop, mobile: files.candidateMobile },
        { candidateId: "candidate-b", desktop: files.secondDesktop, mobile: files.secondMobile },
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
              reason: "Both use the same centered opening and stacked card rhythm.",
            },
          ],
          summary: "The candidates are visually too similar.",
        }),
    });
    expect(result.pass).toBe(false);
    expect(result.minimumPairDistance).toBe(58);
  });
});
