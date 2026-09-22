import { describe, expect, it, vi } from "vitest";
import {
  buildReasoningPreflightState,
  createReasoningPreflight,
  decideReasoningEffort,
  normalizeReasoningJudgments,
  REASONING_PREFLIGHT_QUESTIONS,
  REASONING_POLICY_VERSION,
} from "../scripts/reasoning-preflight-lib.mjs";

function pack() {
  return {
    routes: [
      {
        id: "route-01",
        label: "Editorial route",
        familyId: "editorial",
        heroGeometry: "asymmetric",
        navigation: "quiet",
        servicePresentation: "archive",
        sectionRhythm: "hero,archive,contact",
        typographyCategory: "editorial",
        imageStrategy: "large editorial crops",
        motionOpportunity: "masked reveals",
        prohibitedPatterns: ["generic-split-hero"],
        referenceDna: {
          familyId: "editorial",
          referenceName: "Editorial architecture",
          heroGeometry: { mode: "typographic-monument" },
          navigationGeometry: { mode: "quiet-corner-links" },
          servicePresentation: { pattern: "magazine-archive-ledger" },
          sectionSequence: ["hero", "image-chapter", "contact"],
          typography: {
            display: "high-contrast-editorial-serif",
            scale: "oversized-display",
          },
          imageTreatment: { mode: "architectural-tableaux" },
          mobileRecomposition: {
            strategy: "single-column editorial chapters",
          },
          motion: { primitive: "masked-image-reveal" },
          requiredSignatureElements: [
            { id: "editorial-monument" },
            { id: "magazine-archive" },
          ],
          prohibitedPatterns: ["generic-split-hero", "card-wall"],
          acceptanceChecks: [
            "hero is a centered typographic monument",
            "archive rows are not generic cards",
          ],
          evidence: {
            desktopScreenshot: {
              path: "/tmp/private/reference-desktop.png",
              absolutePath: "/Users/dev/reference-desktop.png",
            },
            mobileScreenshot: {
              path: "/tmp/private/reference-mobile.png",
            },
          },
        },
      },
    ],
  };
}

function scoreAnswer(
  score = 1,
  confidence = 0.9,
  probabilities: Record<string, number> = {
    "0": 0.05,
    "1": 0.85,
    "2": 0.08,
    "3": 0.02,
  },
) {
  return {
    type: "score",
    score,
    confidence,
    probabilities,
    legend: {
      "0": "level 0",
      "1": "level 1",
      "2": "level 2",
      "3": "level 3",
    },
  };
}

function answers(overrides: Record<string, any> = {}) {
  return Object.fromEntries(
    Object.keys(REASONING_PREFLIGHT_QUESTIONS).map((id) => [
      id,
      overrides[id] || scoreAnswer(),
    ]),
  );
}

function responsePayload(overrides: Record<string, any> = {}) {
  return {
    model: "jev-1.13.0",
    request_id: "req_test",
    answers: answers(overrides),
    usage: { input_tokens: 500, output_tokens: 50 },
  };
}

describe("adaptive reasoning preflight", () => {
  it("builds compact Reference-DNA state without screenshot paths or business PII", () => {
    const state = buildReasoningPreflightState(pack());
    const serialized = JSON.stringify(state);
    expect(state.routeCount).toBe(1);
    expect(state.routes[0]).toMatchObject({
      routeId: "route-01",
      familyId: "editorial",
      heroGeometry: "typographic-monument",
      mobileRecomposition: "single-column editorial chapters",
      signatureCount: 2,
      prohibitedPatternCount: 2,
    });
    expect(serialized).not.toContain("/tmp/private");
    expect(serialized).not.toContain("/Users/dev");
    expect(serialized).not.toContain("desktopScreenshot");
    expect(serialized).not.toContain("phone");
    expect(serialized).not.toContain("email");
  });

  it("keeps Jev questions atomic and batched as five ordered Scores", () => {
    expect(Object.keys(REASONING_PREFLIGHT_QUESTIONS)).toEqual([
      "referenceTranslation",
      "compositionNovelty",
      "responsiveRecomposition",
      "interactionCoupling",
      "constraintCoupling",
    ]);
    for (const question of Object.values(REASONING_PREFLIGHT_QUESTIONS)) {
      expect(question.type).toBe("score");
      expect(question.criteria).toHaveLength(4);
      expect(question.instructions.length).toBeGreaterThan(20);
    }
  });

  it("routes ordinary high-confidence designs to xhigh", () => {
    const judgments = normalizeReasoningJudgments(answers());
    const decision = decideReasoningEffort(judgments);
    expect(decision.recommendedEffort).toBe("xhigh");
    expect(decision.reasonCodes).toEqual([
      expect.stringMatching(/^xhigh-composite:/u),
    ]);
  });

  it("accepts sparse Jev score distributions by treating omitted levels as zero", () => {
    const judgments = normalizeReasoningJudgments(
      answers({
        compositionNovelty: scoreAnswer(2.7, 0.92, {
          "2": 0.3,
          "3": 0.7,
        }),
      }),
    );
    expect(judgments.compositionNovelty.probabilities).toEqual({
      "0": 0,
      "1": 0,
      "2": 0.3,
      "3": 0.7,
    });
    expect(decideReasoningEffort(judgments).recommendedEffort).toBe("max");
  });

  it("routes a strong experimental-composition signal to max", () => {
    const judgments = normalizeReasoningJudgments(
      answers({
        compositionNovelty: scoreAnswer(2.7, 0.92, {
          "0": 0,
          "1": 0.03,
          "2": 0.27,
          "3": 0.7,
        }),
      }),
    );
    const decision = decideReasoningEffort(judgments);
    expect(decision.recommendedEffort).toBe("max");
    expect(decision.reasonCodes).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^hard-max:compositionNovelty:/u),
      ]),
    );
  });

  it("biases low-confidence routing to max", () => {
    const judgments = normalizeReasoningJudgments(
      answers({
        constraintCoupling: scoreAnswer(1, 0.4),
      }),
    );
    const decision = decideReasoningEffort(judgments);
    expect(decision.recommendedEffort).toBe("max");
    expect(decision.reasonCodes).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^uncertain-max:/u),
      ]),
    );
  });

  it("runs one pinned Jev request and keeps shadow execution on xhigh", async () => {
    const fetchImpl = vi.fn(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body || "{}"));
      expect(body.model).toBe("jev-1.13.0");
      expect(Object.keys(body.questions)).toHaveLength(5);
      const serialized = JSON.stringify(body.state);
      expect(serialized).not.toContain("/tmp/private");
      expect(serialized).not.toContain("/Users/dev");
      return new Response(
        JSON.stringify(
          responsePayload({
            compositionNovelty: scoreAnswer(2.7, 0.92, {
              "0": 0,
              "1": 0.03,
              "2": 0.27,
              "3": 0.7,
            }),
          }),
        ),
        { status: 200 },
      );
    });

    const result = await createReasoningPreflight({
      inspirationPack: pack(),
      mode: "shadow",
      sessionKey: "intake-42",
      apiKey: "typesafe-test-key",
      fetchImpl: fetchImpl as any,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.reasoningPolicyVersion).toBe(REASONING_POLICY_VERSION);
    expect(result.recommendedEffort).toBe("max");
    expect(result.reasoningEffort).toBe("xhigh");
    expect(result.decision.shadowOverride).toBe(true);
    expect(result.selector.fallbackUsed).toBe(false);
    expect(result.selector.usage).toMatchObject({
      inputTokens: 500,
      outputTokens: 50,
      estimatedCostUsd: 0.000021,
    });
  });

  it("enforce mode freezes the Jev recommendation for the session", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify(
          responsePayload({
            referenceTranslation: scoreAnswer(2.8, 0.96, {
              "0": 0,
              "1": 0.02,
              "2": 0.18,
              "3": 0.8,
            }),
          }),
        ),
        { status: 200 },
      ),
    );

    const first = await createReasoningPreflight({
      inspirationPack: pack(),
      mode: "enforce",
      sessionKey: "intake-42",
      apiKey: "typesafe-test-key",
      fetchImpl: fetchImpl as any,
    });
    const second = await createReasoningPreflight({
      inspirationPack: pack(),
      mode: "enforce",
      sessionKey: "intake-42",
      apiKey: "typesafe-test-key",
      fetchImpl: fetchImpl as any,
    });

    expect(first.reasoningEffort).toBe("max");
    expect(first.recommendedEffort).toBe("max");
    expect(first.sessionId).toBe(second.sessionId);
    expect(first.sessionId).toMatch(/^launchloom:creative:[a-f0-9]{40}$/u);
  });

  it("falls back safely when Jev is unavailable", async () => {
    const failingFetch = vi.fn(async () => {
      throw new Error("network down");
    });

    const shadow = await createReasoningPreflight({
      inspirationPack: pack(),
      mode: "shadow",
      sessionKey: "intake-42",
      apiKey: "typesafe-test-key",
      fetchImpl: failingFetch as any,
    });
    expect(shadow.selector.fallbackUsed).toBe(true);
    expect(shadow.recommendedEffort).toBe("max");
    expect(shadow.reasoningEffort).toBe("xhigh");

    const enforced = await createReasoningPreflight({
      inspirationPack: pack(),
      mode: "enforce",
      sessionKey: "intake-42",
      apiKey: "typesafe-test-key",
      fetchImpl: failingFetch as any,
    });
    expect(enforced.selector.fallbackUsed).toBe(true);
    expect(enforced.recommendedEffort).toBe("max");
    expect(enforced.reasoningEffort).toBe("max");
    expect(enforced.decision.reasonCodes).toEqual(["selector-fallback:max"]);
  });

  it("treats malformed Jev score distributions as selector failure", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify(
          responsePayload({
            interactionCoupling: scoreAnswer(1, 0.9, {
              "0": 0.2,
              "1": 0.2,
              "2": 0.2,
              "3": 0.2,
            }),
          }),
        ),
        { status: 200 },
      ),
    );

    const result = await createReasoningPreflight({
      inspirationPack: pack(),
      mode: "enforce",
      sessionKey: "intake-42",
      apiKey: "typesafe-test-key",
      fetchImpl: fetchImpl as any,
    });
    expect(result.selector.fallbackUsed).toBe(true);
    expect(result.reasoningEffort).toBe("max");
  });
});
