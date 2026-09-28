import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  defaultRepairCandidate,
  collectAvailableScreenshots,
  runRenderedCreativeRepair,
  runVisualGateProcess,
  writeCandidate,
} from "../scripts/run-rendered-creative-repair.mjs";
import { validateProductionCandidateFiles } from "../scripts/production-experience-author.mjs";
import { buildReferenceDna } from "../scripts/reference-dna.mjs";

const roots: string[] = [];
const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;

afterEach(async () => {
  if (originalOpenRouterKey === undefined)
    delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
  vi.unstubAllGlobals();
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function fixture(candidateIds = ["candidate-a", "candidate-b"]) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "launchloom-rendered-repair-"),
  );
  roots.push(root);
  const candidates = path.join(root, "candidates");
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(
    path.join(root, "src/site.config.json"),
    JSON.stringify({ design: { experience: {} } }),
  );
  for (const candidateId of candidateIds) {
    const directory = path.join(candidates, candidateId);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, "metadata.json"),
      JSON.stringify({
        candidateId,
        referenceDna: { familyId: candidateId },
        creativeRepairScope: {
          version: 1,
          sectionIds: ["hero"],
          allowMotion: false,
        },
      }),
    );
    await fs.writeFile(
      path.join(directory, "Experience.jsx"),
      "export default () => null;\n",
    );
    await fs.writeFile(path.join(directory, "styles.css"), "body{}\n");
    await fs.writeFile(
      path.join(directory, "motion.js"),
      "export function mountExperienceMotion(){ return () => {}; }\n",
    );
  }
  return { root, candidates };
}

async function setHumanScopeRequest(candidateDir: string, requestText: string) {
  const metadataPath = path.join(candidateDir, "metadata.json");
  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  metadata.creativeRepairScope.requestText = requestText;
  await fs.writeFile(metadataPath, JSON.stringify(metadata));
}

async function bindCandidateSession(
  candidatesDir: string,
  creativeSession: Record<string, any>,
) {
  for (const entry of await fs.readdir(candidatesDir, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const metadataPath = path.join(candidatesDir, entry.name, "metadata.json");
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    metadata.reasoning = {
      effort: creativeSession.reasoningEffort,
      recommendedEffort: creativeSession.recommendedEffort,
      mode: creativeSession.mode,
      sessionId: creativeSession.sessionId,
      policyVersion: creativeSession.reasoningPolicyVersion,
      selectorModelVersion: creativeSession.selectorModelVersion,
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata));
  }
}

function candidate(
  candidateId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    candidateId,
    directory: candidateId,
    valid: true,
    eligible: true,
    visualScore: 92,
    distinctivenessScore: 91,
    referenceFidelity: { pass: true, score: 92 },
    renderedReferenceFidelity: {
      pass: true,
      audit: { findings: [] },
    },
    failures: [],
    ...overrides,
  };
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    selectedCandidateId: "candidate-a",
    fallback: false,
    promotionReady: true,
    visualDiversity: { pass: true, pairs: [] },
    candidates: [candidate("candidate-a"), candidate("candidate-b")],
    ...overrides,
  };
}

async function writeBakeoffEvidence(options: any, value: any) {
  await fs.mkdir(options.screenshotsDir, { recursive: true });
  for (const item of value.candidates || []) {
    for (const viewport of ["desktop", "compact", "mobile"])
      await fs.writeFile(
        path.join(
          options.screenshotsDir,
          `${item.candidateId}-${viewport}.png`,
        ),
        "pixels",
      );
  }
  await fs.mkdir(path.dirname(options.reportPath), { recursive: true });
  await fs.writeFile(options.reportPath, JSON.stringify(value));
  return value;
}

async function visualGate(options: any, verdict: "pass" | "revise") {
  const value = {
    version: 1,
    mode: "verify",
    blockers:
      verdict === "pass" ? [] : [{ severity: "major", category: "hierarchy" }],
    audit: {
      verdict,
      findings:
        verdict === "pass"
          ? []
          : [
              {
                severity: "major",
                category: "hierarchy",
                viewport: "desktop",
                evidence: "Hero geometry drifted from the assigned reference.",
                recommendation: "Restore the image/type relationship.",
              },
            ],
    },
  };
  await fs.mkdir(path.dirname(options.reportPath), { recursive: true });
  await fs.writeFile(options.reportPath, JSON.stringify(value));
  return value;
}

describe("rendered creative repair orchestration", () => {
  it("asks Luna to correct a rejected repair before excluding the candidate", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-validation-repair-"),
    );
    roots.push(root);
    const candidateDir = path.join(root, "candidate-a");
    await fs.mkdir(candidateDir, { recursive: true });
    const content = {
      hero: {
        heading: "Rooms shaped around daily life",
        primaryLabel: "Start a design conversation",
      },
      services: [
        {
          name: "Residential interiors",
          description: "Measured interior schemes.",
        },
      ],
      faqs: [
        {
          question: "How does it work?",
          answer: "We begin with a conversation.",
        },
      ],
      process: ["Listen to the brief", "Shape the direction"],
    };
    const processSection = `<section data-required-section="conversion">{content.process.map((step) => <p key={step}>{step}</p>)}</section>`;
    const validExperience = `import { LeadForm } from "@launchloom/runtime";
export default function Experience({ content, runtime }) {
  return <main>
    <nav><a href="#services">Services</a><a href="#faqs">FAQs</a><a href="#contact">Contact</a></nav>
    <section id="hero" data-hero><h1 className="opening-title">{content.hero.heading}</h1><a data-early-conversion href="#contact">{content.hero.primaryLabel}</a></section>
    <section id="services">{content.services.map((service) => <p key={service.name}>{service.name} {service.description}</p>)}</section>
    <section id="faqs">{content.faqs.map((faq) => <p key={faq.question}>{faq.question} {faq.answer}</p>)}</section>
    ${processSection}
    <section id="contact"><LeadForm content={content} runtime={runtime} /></section>
  </main>;
}`;
    const invalidExperience = validExperience.replace(processSection, "");
    const repairedExperience = validExperience.replace(
      'className="opening-title"',
      'className="opening-title revised"',
    );
    const initialFiles = {
      experience: validExperience,
      styles: "main { color: #222; }",
      motion:
        "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }",
    };
    await Promise.all([
      fs.writeFile(
        path.join(candidateDir, "Experience.jsx"),
        initialFiles.experience,
      ),
      fs.writeFile(path.join(candidateDir, "styles.css"), initialFiles.styles),
      fs.writeFile(path.join(candidateDir, "motion.js"), initialFiles.motion),
    ]);
    await fs.writeFile(
      path.join(candidateDir, "metadata.json"),
      JSON.stringify({
        candidateId: "candidate-a",
        routeId: "route-01",
        referenceDna: {
          familyId: "test-family",
          servicePresentation: { pattern: "Quiet vertical service index" },
          ctaPlacement: { early: "Before services begin" },
        },
      }),
    );
    await fs.writeFile(
      path.join(candidateDir, "content-manifest.json"),
      JSON.stringify({ values: content, tokens: [] }),
    );

    const attempts: Array<{ validationError?: string }> = [];
    const result = await defaultRepairCandidate({
      candidateDir,
      findings: ["Increase the scale of the opening portrait."],
      screenshots: [],
      model: "openai/gpt-6-luna",
      requestRepairImpl: async (request: any) => {
        attempts.push({ validationError: request.validationError });
        return {
          experience:
            attempts.length === 1 ? invalidExperience : repairedExperience,
          styles: initialFiles.styles,
          motion: initialFiles.motion,
        };
      },
      validateCandidateImpl: ({ files, route, content: values }: any) =>
        validateProductionCandidateFiles({
          files,
          route: { id: route.id },
          content: values,
        }),
    });

    expect(attempts).toHaveLength(2);
    expect(attempts[0].validationError).toBe("");
    expect(attempts[1].validationError).toMatch(
      /conversion section bound to content\.process/iu,
    );
    expect(result.experience).toContain(processSection);
    expect(result.experience).toContain('className="opening-title revised"');
    expect(result.experience).toContain(
      'data-service-presentation="quiet-vertical-service-index"',
    );
    expect(result.experience).toContain(
      'data-cta-placement="before-services-begin"',
    );
  });

  it("keeps preview available when one candidate repair violates its sealed-content contract", async () => {
    const { root, candidates } = await fixture([
      "candidate-a",
      "candidate-b",
      "candidate-c",
    ]);
    const rejectedCandidateSource = await fs.readFile(
      path.join(candidates, "candidate-c", "Experience.jsx"),
      "utf8",
    );
    const firstPass = ["candidate-a", "candidate-b", "candidate-c"].map(
      (candidateId) =>
        candidate(candidateId, {
          valid: false,
          eligible: false,
          referenceFidelity: { pass: false, score: 30 },
          renderedReferenceFidelity: { pass: false, audit: { findings: [] } },
          failures: ["Rendered candidate needs repair."],
        }),
    );
    const bakeoffExclusions: string[][] = [];
    const repairCalls: string[] = [];
    const promotions: string[] = [];
    let bakeoffCalls = 0;

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "preview",
      maxCycles: 1,
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        bakeoffExclusions.push(options.excludedCandidateIds || []);
        return writeBakeoffEvidence(
          options,
          bakeoffCalls === 1
            ? report({ selectedCandidateId: null, candidates: firstPass })
            : report({
                selectedCandidateId: "candidate-b",
                candidates: [
                  candidate("candidate-a"),
                  candidate("candidate-b"),
                ],
              }),
        );
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      repairCandidateImpl: async ({ candidateId }: any) => {
        repairCalls.push(candidateId);
        if (candidateId === "candidate-c") {
          const error = new Error(
            "Reference-safe source validation failed: Required sealed token content.hero.image does not flow into output.",
          );
          Object.assign(error, { code: "CREATIVE_REPAIR_OUTPUT_REJECTED" });
          throw error;
        }
      },
      promoteImpl: async ({ candidateDir }: any) => {
        promotions.push(path.basename(candidateDir));
        return { candidateId: "candidate-b" };
      },
    });

    expect(result.status).toBe("passed");
    expect(result.selectedCandidateId).toBe("candidate-b");
    expect(bakeoffCalls).toBe(2);
    expect(repairCalls).toEqual(["candidate-a", "candidate-b", "candidate-c"]);
    expect(bakeoffExclusions[1]).toEqual(["candidate-c"]);
    expect(promotions).toEqual(["candidate-b"]);
    expect(result.rejectedCandidates["candidate-c"]).toMatch(
      /content\.hero\.image/iu,
    );
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(
            root,
            "evidence",
            "round-00",
            "repairs",
            "candidate-c.json",
          ),
          "utf8",
        ),
      ),
    ).toMatchObject({ status: "rejected", candidateId: "candidate-c" });
    expect(
      await fs.readFile(
        path.join(candidates, "candidate-c", "Experience.jsx"),
        "utf8",
      ),
    ).toBe(rejectedCandidateSource);
  });

  it("rejects a repaired FAQList with missing sealed content and selects a passing sibling", async () => {
    const { root, candidates } = await fixture(["candidate-a", "candidate-b"]);
    const bakeoffExclusions: string[][] = [];
    const repairCalls: string[] = [];
    const promotions: string[] = [];
    let bakeoffCalls = 0;
    let visualCalls = 0;

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "preview",
      maxCycles: 1,
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        bakeoffExclusions.push(options.excludedCandidateIds || []);
        return writeBakeoffEvidence(
          options,
          bakeoffCalls === 1
            ? report({ selectedCandidateId: "candidate-a" })
            : report({
                selectedCandidateId: "candidate-b",
                candidates: [candidate("candidate-b")],
              }),
        );
      },
      runVisualGateImpl: (options: any) => {
        visualCalls += 1;
        return visualGate(options, visualCalls === 1 ? "revise" : "pass");
      },
      repairCandidateImpl: async ({ candidateId }: any) => {
        repairCalls.push(candidateId);
        const malformedRepair = {
          experience: `import { FAQList, LeadForm } from "@launchloom/runtime";
export default function Experience({ content, runtime }) {
  return <main>
    <nav><a href="#services">Services</a><a href="#faqs">FAQs</a><a href="#contact">Contact</a></nav>
    <section data-hero><h1>{content.hero.heading}</h1><a data-early-conversion href="#contact">{content.hero.primaryLabel}</a></section>
    <section id="services">{content.services.map((service) => <p key={service.name}>{service.name} {service.description}</p>)}</section>
    <section id="faqs"><p>{content.faqs.length}</p><FAQList /></section>
    <section id="contact"><LeadForm content={content} runtime={runtime} /></section>
  </main>;
}`,
          styles: "[data-hero] { color: inherit; }",
          motion:
            "export function mountExperienceMotion() { return () => {}; }",
        };
        let validationError: Error | undefined;
        try {
          validateProductionCandidateFiles({
            files: malformedRepair,
            route: { id: candidateId },
          });
        } catch (error) {
          validationError = error as Error;
        }
        expect(validationError?.message).toMatch(
          /FAQList.*must receive sealed content.*content=\{content\}/iu,
        );
        const error = new Error(
          `Creative repair output rejected by source validation: ${validationError?.message}`,
        );
        Object.assign(error, { code: "CREATIVE_REPAIR_OUTPUT_REJECTED" });
        throw error;
      },
      promoteImpl: async ({ candidateDir }: any) => {
        promotions.push(path.basename(candidateDir));
        return { candidateId: "candidate-b" };
      },
    });

    expect(result.status).toBe("passed");
    expect(result.selectedCandidateId).toBe("candidate-b");
    expect(bakeoffCalls).toBe(2);
    expect(visualCalls).toBe(2);
    expect(repairCalls).toEqual(["candidate-a"]);
    expect(bakeoffExclusions[1]).toEqual(["candidate-a"]);
    expect(result.rejectedCandidates["candidate-a"]).toMatch(
      /FAQList.*content=\{content\}/iu,
    );
    expect(promotions).toEqual(["candidate-b"]);
  });

  it("preserves candidate rejection reasons when every preview candidate is excluded", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    let bakeoffCalls = 0;
    const rejection = new Error(
      "Creative repair output rejected by source validation: FAQList must receive sealed content through content={content}.",
    );
    Object.assign(rejection, { code: "CREATIVE_REPAIR_OUTPUT_REJECTED" });

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        mode: "preview",
        maxCycles: 1,
        runBakeoffImpl: async (options: any) => {
          bakeoffCalls += 1;
          if (bakeoffCalls > 1)
            throw new Error(
              "No creative candidates remain after exclusions: candidate-a.",
            );
          return writeBakeoffEvidence(
            options,
            report({
              selectedCandidateId: null,
              candidates: [
                candidate("candidate-a", {
                  valid: false,
                  eligible: false,
                  failures: ["Rendered candidate needs repair."],
                }),
              ],
            }),
          );
        },
        repairCandidateImpl: async () => {
          throw rejection;
        },
      }),
    ).rejects.toThrow(/candidate-a.*FAQList.*content=\{content\}/iu);

    expect(bakeoffCalls).toBe(2);
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(
            root,
            "evidence",
            "round-00",
            "repairs",
            "candidate-a.json",
          ),
          "utf8",
        ),
      ),
    ).toMatchObject({
      status: "rejected",
      error: expect.stringMatching(/FAQList.*content=\{content\}/iu),
    });
  });

  it("bounds preview rounds using the available candidate count", async () => {
    const candidateIds = [
      "candidate-1",
      "candidate-2",
      "candidate-3",
      "candidate-4",
      "candidate-5",
    ];
    const { root, candidates } = await fixture(candidateIds);
    const exclusionsByRound: string[][] = [];
    const promotions: string[] = [];

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "preview",
      maxCycles: 1,
      runBakeoffImpl: async (options: any) => {
        const excluded = options.excludedCandidateIds || [];
        exclusionsByRound.push(excluded);
        const available = candidateIds.filter((id) => !excluded.includes(id));
        return writeBakeoffEvidence(
          options,
          report({
            selectedCandidateId: available[0],
            candidates: available.map((id) => candidate(id)),
          }),
        );
      },
      runVisualGateImpl: (options: any) =>
        visualGate(
          options,
          options.candidateId === "candidate-5" ? "pass" : "revise",
        ),
      repairCandidateImpl: async () => {
        const error = new Error(
          "Creative repair output rejected by source validation: Required sealed token content.hero.image does not flow into output.",
        );
        Object.assign(error, { code: "CREATIVE_REPAIR_OUTPUT_REJECTED" });
        throw error;
      },
      promoteImpl: async ({ candidateDir }: any) => {
        promotions.push(path.basename(candidateDir));
        return { candidateId: "candidate-5" };
      },
    });

    expect(result.status).toBe("passed");
    expect(result.selectedCandidateId).toBe("candidate-5");
    expect(exclusionsByRound).toEqual([
      [],
      ["candidate-1"],
      ["candidate-1", "candidate-2"],
      ["candidate-1", "candidate-2", "candidate-3"],
      ["candidate-1", "candidate-2", "candidate-3", "candidate-4"],
    ]);
    expect(promotions).toEqual(["candidate-5"]);
  });

  it("fails closed on the same validator rejection in promotion mode", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    const bakeoffOptions: any[] = [];
    const promotions: string[] = [];
    const rejection = new Error(
      "Creative repair output rejected by source validation: Required sealed token content.hero.image does not flow into output.",
    );
    Object.assign(rejection, { code: "CREATIVE_REPAIR_OUTPUT_REJECTED" });

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        mode: "promote",
        maxCycles: 1,
        runBakeoffImpl: async (options: any) => {
          bakeoffOptions.push(options);
          return writeBakeoffEvidence(
            options,
            report({
              selectedCandidateId: null,
              candidates: [
                candidate("candidate-a", {
                  valid: false,
                  eligible: false,
                  failures: ["Rendered candidate needs repair."],
                }),
              ],
            }),
          );
        },
        repairCandidateImpl: async () => {
          throw rejection;
        },
        promoteImpl: async ({ candidateDir }: any) => {
          promotions.push(path.basename(candidateDir));
          return { candidateId: "candidate-a" };
        },
      }),
    ).rejects.toThrow(/content\.hero\.image/iu);

    expect(bakeoffOptions).toHaveLength(1);
    expect(bakeoffOptions[0].excludedCandidateIds).toEqual([]);
    expect(promotions).toEqual([]);
  });

  it("does not isolate a rejected repair when applying human feedback", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    await setHumanScopeRequest(
      path.join(candidates, "candidate-a"),
      "Keep the supplied hero image visible.",
    );
    const rejection = new Error(
      "Creative repair output rejected by source validation: Required sealed token content.hero.image does not flow into output.",
    );
    Object.assign(rejection, { code: "CREATIVE_REPAIR_OUTPUT_REJECTED" });

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        mode: "preview",
        maxCycles: 1,
        requestedFindings: ["Keep the supplied hero image visible."],
        runBakeoffImpl: async (options: any) =>
          writeBakeoffEvidence(
            options,
            report({
              selectedCandidateId: null,
              candidates: [
                candidate("candidate-a", {
                  valid: false,
                  eligible: false,
                  failures: ["Rendered candidate needs repair."],
                }),
              ],
            }),
          ),
        repairCandidateImpl: async () => {
          throw rejection;
        },
      }),
    ).rejects.toThrow(/content\.hero\.image/iu);
  });

  it("preserves the prepared section scope across a human repair and visual-gate retry", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    const candidateDir = path.join(candidates, "candidate-a");
    const metadataPath = path.join(candidateDir, "metadata.json");
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    const declaredScope = {
      version: 1,
      sectionIds: ["hero"],
      allowMotion: false,
      requestText: "Revise the hero section.",
    };
    metadata.creativeRepairScope = declaredScope;
    await fs.writeFile(metadataPath, JSON.stringify(metadata));

    const repairScopes: unknown[] = [];
    let visualGateCalls = 0;
    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "preview",
      maxCycles: 2,
      requestedFindings: ["Revise the hero section."],
      runBakeoffImpl: async (options: any) =>
        writeBakeoffEvidence(
          options,
          report({ candidates: [candidate("candidate-a")] }),
        ),
      runVisualGateImpl: (options: any) => {
        visualGateCalls += 1;
        return visualGate(options, visualGateCalls === 1 ? "revise" : "pass");
      },
      runHumanGateImpl: async () => ({
        audit: { verdict: "pass", findings: [] },
      }),
      repairCandidateImpl: async ({ creativeRepairScope }: any) => {
        repairScopes.push(creativeRepairScope);
      },
      promoteImpl: async ({ candidateDir: promotedDir }: any) => ({
        candidateId: path.basename(promotedDir),
      }),
    });

    expect(result.status).toBe("passed");
    expect(visualGateCalls).toBe(2);
    expect(repairScopes).toEqual([declaredScope, declaredScope]);
  });

  it("rejects human repair scopes without the matching request text", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    const repairCandidateImpl = vi.fn(async () => undefined);

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        mode: "preview",
        maxCycles: 1,
        requestedFindings: ["Revise the hero section."],
        runBakeoffImpl: async (options: any) =>
          writeBakeoffEvidence(
            options,
            report({ candidates: [candidate("candidate-a")] }),
          ),
        repairCandidateImpl,
        runVisualGateImpl: async (options: any) => visualGate(options, "pass"),
        runHumanGateImpl: async () => ({
          audit: { verdict: "pass", findings: [] },
        }),
        promoteImpl: async () => ({ candidateId: "candidate-a" }),
      }),
    ).rejects.toThrow(
      /scope for candidate-a does not match the current feedback/iu,
    );

    expect(repairCandidateImpl).not.toHaveBeenCalled();
  });

  it("restores split-heading hero markers and reviewed image alt text in the full repair flow", async () => {
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    const { root, candidates } = await fixture(["candidate-a"]);
    const registry = JSON.parse(
      readFileSync(
        new URL("../data/inspiration-registry.json", import.meta.url),
        "utf8",
      ),
    );
    const referenceDna = buildReferenceDna(registry.records[1], {
      requireEvidence: true,
    });
    const content = {
      brand: {
        name: "Test Studio",
        logo: "",
        phone: "(555) 555-0100",
        email: "hello@example.com",
        address: "",
        serviceAreas: [],
      },
      hero: {
        kicker: "A considered service",
        heading: "Thoughtful work, made personal",
        body: "A clear first conversation about what you need.",
        primaryLabel: "Start a conversation",
        image: `data:image/webp;charset=utf-8;base64,${"A".repeat(410_000)}`,
        secondaryImage: "/images/ornament.webp",
      },
      services: [
        {
          name: "Consultation",
          description: "A focused first step.",
          slug: "consultation",
        },
      ],
      faqs: [
        {
          question: "What happens first?",
          answer: "We start with a conversation.",
        },
      ],
    };
    const initialExperience = `import { LeadForm } from "@launchloom/runtime";
export default function Experience({ content, runtime }) {
  const headlineWords = content.hero.heading.trim().split(/\\s+/);
  return <main data-mobile-recomposition="single-column-editorial-chapters" data-motion-primitive="masked-image-reveal">
    <nav data-navigation-geometry="quiet-corner-links"><a href="#services">Services</a><a href="#faqs">FAQs</a><a href="#contact">Contact</a><a className="nav-cta" href="#contact">{content.hero.primaryLabel}</a></nav>
    <section data-reference-section="hero" data-hero data-hero-geometry="typographic-monument" data-reference-signature="editorial-monument"><h1>{headlineWords.join(" ")}</h1><img src={content.hero.image} alt="Still-life image for the studio" /><a className="hero-cta" href="#contact" data-early-conversion>{content.hero.primaryLabel}</a></section>
    <section data-reference-section="image-chapter"></section>
    <section data-reference-section="editorial-intro"></section>
    <section data-reference-section="image-mosaic"></section>
    <section id='services' data-reference-section="magazine-archive" data-service-presentation="magazine-archive-ledger" data-reference-signature="magazine-archive">{content.services}</section>
    <section data-reference-section="closing-scene" data-reference-signature="closing-scene"></section>
    <section id='faqs'>{content.faqs}</section>
    <section id='contact'><LeadForm content={content} runtime={runtime} /></section>
  </main>;
}`;
    const repairedExperience = initialExperience
      .replace(" data-hero", "")
      .replace(" data-early-conversion", "")
      .replace(' data-service-presentation="magazine-archive-ledger"', "")
      .replace(
        '<section data-reference-section="image-chapter"></section>',
        '<section data-reference-section="image-chapter"><section className="service-note"><p>A note about the services chapter.</p><img src={ content.hero.image } alt="" /><img src={content.hero.image} alt="" /><img src={content.hero.tertiaryImage || content.hero.image} alt="" /><img src={content.hero.secondaryImage} alt="" aria-hidden="true" /></section></section>',
      );
    const candidateDir = path.join(candidates, "candidate-a");
    const metadataPath = path.join(candidateDir, "metadata.json");
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    metadata.routeId = "route-02";
    metadata.referenceDna = referenceDna;
    await fs.writeFile(metadataPath, JSON.stringify(metadata));
    await fs.writeFile(
      path.join(candidateDir, "content-manifest.json"),
      JSON.stringify({
        tokens: [
          { token: "content.hero.heading" },
          { token: "content.services" },
          { token: "content.faqs" },
        ],
        values: content,
      }),
    );
    await fs.writeFile(
      path.join(candidateDir, "Experience.jsx"),
      initialExperience,
    );

    const repairBundle = {
      experience: repairedExperience,
      styles:
        ":root { --ll-creative-ink: #fff; } @media (max-width: 700px) { main { display: block; } }",
      motion:
        "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }",
    };
    let repairPrompt = "";
    const fetchMock = vi.fn(
      async (_input: unknown, init?: { body?: unknown }) => {
        repairPrompt = String(init?.body || "");
        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: { content: JSON.stringify(repairBundle) },
              },
            ],
            usage: { completion_tokens: 32 },
          }),
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    let visualGateCalls = 0;

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      model: "test/model",
      maxCycles: 1,
      runBakeoffImpl: async (options: any) =>
        writeBakeoffEvidence(
          options,
          report({ candidates: [candidate("candidate-a")] }),
        ),
      runVisualGateImpl: async (options: any) => {
        visualGateCalls += 1;
        return visualGate(options, visualGateCalls === 1 ? "revise" : "pass");
      },
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    expect(result.status).toBe("passed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(repairPrompt).toContain("ALT-TEXT CONTRACT");
    const requestBody = JSON.parse(repairPrompt);
    const repairText = requestBody.messages
      .flatMap((message: any) =>
        Array.isArray(message.content) ? message.content : [],
      )
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text)
      .join("\n");
    expect(repairText).toContain(
      'Use alt="" only when the image is purely decorative or its relevant information is fully conveyed by adjacent text',
    );
    expect(repairText).not.toContain("data:image/");
    expect(repairText).toContain("[sealed client image asset]");
    const persistedContentManifest = JSON.parse(
      await fs.readFile(
        path.join(candidateDir, "content-manifest.json"),
        "utf8",
      ),
    );
    expect(persistedContentManifest.values.hero.image).toBe(content.hero.image);
    expect(visualGateCalls).toBe(2);
    const repaired = await fs.readFile(
      path.join(candidateDir, "Experience.jsx"),
      "utf8",
    );
    expect(repaired).toContain(
      '<section id="services" data-reference-section="magazine-archive"',
    );
    expect(repaired).toContain(
      '<a className="nav-cta" href="#contact">{content.hero.primaryLabel}</a>',
    );
    expect(repaired).toContain(
      '<a className="hero-cta" href="#contact" data-early-conversion data-cta-placement="after-opening-scene">{content.hero.primaryLabel}</a>',
    );
    expect(repaired).toMatch(
      /<section(?=[^>]*data-reference-section="hero")(?=[^>]*\bdata-hero(?:\s|>))[^>]*><h1>\{headlineWords\.join\(" "\)\}/u,
    );
    expect(repaired).toContain(
      '<section className="service-note"><p>A note about the services chapter.</p>',
    );
    expect(
      repaired.match(/alt="Still-life image for the studio"/gu),
    ).toHaveLength(4);
    const expectedServicePresentation = referenceDna.servicePresentation.pattern
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "");
    const expectedEarlyPlacement = referenceDna.ctaPlacement.early
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "");
    expect(repaired).toContain(
      `data-service-presentation="${expectedServicePresentation}"`,
    );
    expect(repaired).toContain(
      `data-cta-placement="${expectedEarlyPlacement}"`,
    );
    expect(repaired).toContain(
      'src={content.hero.secondaryImage} alt="" aria-hidden="true"',
    );
  });

  it("repairs the selected source only after a rendered visual failure and rerenders before passing", async () => {
    const { root, candidates } = await fixture();
    let bakeoffCalls = 0;
    let gateCalls = 0;
    const repairs: string[] = [];
    const promotions: any[] = [];

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        return writeBakeoffEvidence(options, report());
      },
      runVisualGateImpl: async (options: any) => {
        gateCalls += 1;
        return visualGate(options, gateCalls === 1 ? "revise" : "pass");
      },
      repairCandidateImpl: async ({ candidateId }: any) => {
        repairs.push(candidateId);
      },
      promoteImpl: async (options: any) => {
        await fs.access(
          path.join(root, "evidence", "final", "creative-bakeoff.json"),
        );
        await fs.access(
          path.join(root, "evidence", "final", "visual-gate.json"),
        );
        await fs.access(path.join(root, "evidence", "summary.json"));
        promotions.push(options);
        return { candidateId: "candidate-a" };
      },
    });

    expect(result.status).toBe("passed");
    expect(bakeoffCalls).toBe(2);
    expect(gateCalls).toBe(2);
    expect(repairs).toEqual(["candidate-a"]);
    expect(result.repairCycles).toEqual({ "candidate-a": 1 });
    expect(promotions).toHaveLength(1);
    expect(promotions[0].selectionMode).toBe("creative-preview");
    expect(
      JSON.parse(
        await fs.readFile(path.join(root, "evidence", "summary.json"), "utf8"),
      ).status,
    ).toBe("passed");
  });

  it("threads one frozen creative session through repairs and summary evidence", async () => {
    const { root, candidates } = await fixture();
    let gateCalls = 0;
    const seenSessions: any[] = [];
    const creativeSession = {
      version: 1,
      mode: "enforce",
      reasoningPolicyVersion: "adaptive-reasoning-v1",
      judgmentSchemaVersion: "design-complexity-v1",
      selectorModelVersion: "jev-1.13.0",
      creativeModel: "openai/gpt-6-luna",
      sessionId: "launchloom:creative:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      reasoningEffort: "max",
      recommendedEffort: "max",
    };
    await bindCandidateSession(candidates, creativeSession);

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      creativeSession,
      runBakeoffImpl: async (options: any) =>
        writeBakeoffEvidence(options, report()),
      runVisualGateImpl: async (options: any) => {
        gateCalls += 1;
        return visualGate(options, gateCalls === 1 ? "revise" : "pass");
      },
      repairCandidateImpl: async ({ creativeSession: seen }: any) => {
        seenSessions.push(seen);
      },
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    expect(result.status).toBe("passed");
    expect(seenSessions).toEqual([creativeSession]);
    const summary = JSON.parse(
      await fs.readFile(path.join(root, "evidence", "summary.json"), "utf8"),
    );
    expect(summary.creativeSession).toMatchObject({
      sessionId: creativeSession.sessionId,
      reasoningEffort: "max",
      recommendedEffort: "max",
      mode: "enforce",
      reasoningPolicyVersion: "adaptive-reasoning-v1",
      selectorModelVersion: "jev-1.13.0",
    });
  });

  it("fails closed when an adaptively authored candidate loses its session artifact", async () => {
    const { root, candidates } = await fixture();
    const creativeSession = {
      version: 1,
      mode: "shadow",
      reasoningPolicyVersion: "adaptive-reasoning-v1",
      judgmentSchemaVersion: "design-complexity-v1",
      selectorModelVersion: "jev-1.13.0",
      creativeModel: "openai/gpt-6-luna",
      sessionId: "launchloom:creative:cccccccccccccccccccccccccccccccccccccccc",
      reasoningEffort: "xhigh",
      recommendedEffort: "max",
    };
    await bindCandidateSession(candidates, creativeSession);

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        runBakeoffImpl: async (options: any) =>
          writeBakeoffEvidence(options, report()),
        runVisualGateImpl: (options: any) => visualGate(options, "pass"),
        promoteImpl: async () => ({ candidateId: "candidate-a" }),
      }),
    ).rejects.toThrow(/authored with adaptive reasoning session/iu);
  });

  it("fails closed on incomplete adaptive reasoning metadata", async () => {
    const { root, candidates } = await fixture();
    const metadataPath = path.join(candidates, "candidate-a", "metadata.json");
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    metadata.reasoning = {
      effort: "xhigh",
      policyVersion: "adaptive-reasoning-v1",
      selectorModelVersion: "jev-1.13.0",
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata));

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        runBakeoffImpl: async (options: any) =>
          writeBakeoffEvidence(options, report()),
        runVisualGateImpl: (options: any) => visualGate(options, "pass"),
        promoteImpl: async () => ({ candidateId: "candidate-a" }),
      }),
    ).rejects.toThrow(/incomplete adaptive reasoning metadata/iu);
  });

  it("fails closed when candidate reasoning metadata disagrees with the frozen session", async () => {
    const { root, candidates } = await fixture();
    const creativeSession = {
      version: 1,
      mode: "enforce",
      reasoningPolicyVersion: "adaptive-reasoning-v1",
      judgmentSchemaVersion: "design-complexity-v1",
      selectorModelVersion: "jev-1.13.0",
      creativeModel: "openai/gpt-6-luna",
      sessionId: "launchloom:creative:dddddddddddddddddddddddddddddddddddddddd",
      reasoningEffort: "max",
      recommendedEffort: "max",
    };
    await bindCandidateSession(candidates, {
      ...creativeSession,
      reasoningEffort: "xhigh",
    });

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        creativeSession,
        runBakeoffImpl: async (options: any) =>
          writeBakeoffEvidence(options, report()),
        runVisualGateImpl: (options: any) => visualGate(options, "pass"),
        promoteImpl: async () => ({ candidateId: "candidate-a" }),
      }),
    ).rejects.toThrow(/reasoning binding does not match/iu);
  });

  it("records a failed promotion instead of claiming the run passed", async () => {
    const { root, candidates } = await fixture();

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        runBakeoffImpl: async (options: any) =>
          writeBakeoffEvidence(options, report()),
        runVisualGateImpl: (options: any) => visualGate(options, "pass"),
        promoteImpl: async () => {
          throw new Error("promotion filesystem failure");
        },
      }),
    ).rejects.toThrow("promotion filesystem failure");

    const summary = JSON.parse(
      await fs.readFile(path.join(root, "evidence", "summary.json"), "utf8"),
    );
    expect(summary.status).toBe("promotion-failed");
    expect(summary.promotionError).toContain("promotion filesystem failure");
  });

  it("uses rendered diversity findings to repair both v2 candidates before production promotion", async () => {
    const { root, candidates } = await fixture();
    let bakeoffCalls = 0;
    const repairs: string[] = [];
    const promotions: any[] = [];

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "promote",
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        return writeBakeoffEvidence(
          options,
          bakeoffCalls === 1
            ? report({
                promotionReady: false,
                visualDiversity: {
                  pass: false,
                  pairs: [
                    {
                      left: "candidate-a",
                      right: "candidate-b",
                      distance: 48,
                      pass: false,
                      reason: "Both render as the same centered split hero.",
                    },
                  ],
                },
              })
            : report(),
        );
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      repairCandidateImpl: async ({ candidateId }: any) => {
        repairs.push(candidateId);
      },
      promoteImpl: async (options: any) => {
        promotions.push(options);
        return { candidateId: "candidate-a" };
      },
    });

    expect(result.status).toBe("passed");
    expect(bakeoffCalls).toBe(2);
    expect(new Set(repairs)).toEqual(new Set(["candidate-a", "candidate-b"]));
    expect(promotions).toHaveLength(1);
    expect(promotions[0].selectionMode).toBe("creative-bakeoff");
    expect(result.promotionReady).toBe(true);
  });

  it("repairs the selected candidate when promotion is blocked without diversity pairs", async () => {
    const { root, candidates } = await fixture();
    let bakeoffCalls = 0;
    const repairs: string[] = [];

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "promote",
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        return writeBakeoffEvidence(
          options,
          bakeoffCalls === 1
            ? report({
                promotionReady: false,
                visualDiversity: { pass: true, pairs: [] },
              })
            : report(),
        );
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      repairCandidateImpl: async ({ candidateId }: any) => {
        repairs.push(candidateId);
      },
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    expect(result.status).toBe("passed");
    expect(repairs).toEqual(["candidate-a"]);
  });

  it("repairs each diversity candidate once per rendered round even when multiple pairs fail", async () => {
    const { root, candidates } = await fixture([
      "candidate-a",
      "candidate-b",
      "candidate-c",
    ]);
    let bakeoffCalls = 0;
    const repairs: string[] = [];

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "promote",
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        const candidatesReport = [
          candidate("candidate-a"),
          candidate("candidate-b"),
          candidate("candidate-c"),
        ];
        return writeBakeoffEvidence(
          options,
          bakeoffCalls === 1
            ? report({
                candidates: candidatesReport,
                promotionReady: false,
                visualDiversity: {
                  pass: false,
                  pairs: [
                    {
                      left: "candidate-a",
                      right: "candidate-b",
                      distance: 40,
                      pass: false,
                      reason: "A and B share the same hero grammar.",
                    },
                    {
                      left: "candidate-a",
                      right: "candidate-c",
                      distance: 42,
                      pass: false,
                      reason: "A and C share the same section rhythm.",
                    },
                    {
                      left: "candidate-b",
                      right: "candidate-c",
                      distance: 44,
                      pass: false,
                      reason: "B and C share the same card treatment.",
                    },
                  ],
                },
              })
            : report({ candidates: candidatesReport }),
        );
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      repairCandidateImpl: async ({ candidateId }: any) => {
        repairs.push(candidateId);
      },
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    expect(result.status).toBe("passed");
    expect(bakeoffCalls).toBe(2);
    expect(repairs.sort()).toEqual([
      "candidate-a",
      "candidate-b",
      "candidate-c",
    ]);
    expect(result.repairCycles).toEqual({
      "candidate-a": 1,
      "candidate-b": 1,
      "candidate-c": 1,
    });
  });

  it("rejects programmatic human findings that contain no request text", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    let bakeoffCalls = 0;

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        requestedFindings: [{}],
        runBakeoffImpl: async () => {
          bakeoffCalls += 1;
          return report({ candidates: [candidate("candidate-a")] });
        },
      }),
    ).rejects.toThrow(/Human feedback must contain non-empty request text/iu);

    expect(bakeoffCalls).toBe(0);
  });

  it("forces explicit human feedback through the selected creative source before acceptance", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    await setHumanScopeRequest(
      path.join(candidates, "candidate-a"),
      "Make the hero feel more cinematic and asymmetrical.",
    );
    let bakeoffCalls = 0;
    const repairs: any[] = [];
    let humanGateCalls = 0;

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      requestedFindings: [
        {
          category: "human-review-feedback",
          message: "Make the hero feel more cinematic and asymmetrical.",
        },
      ],
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        const result = await writeBakeoffEvidence(
          options,
          report({ candidates: [candidate("candidate-a")] }),
        );
        if (bakeoffCalls === 1) {
          for (const viewport of ["desktop", "mobile"])
            await fs.writeFile(
              path.join(
                options.screenshotsDir,
                `candidate-a-${viewport}-viewport.png`,
              ),
              "viewport pixels",
            );
        }
        return result;
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      runHumanGateImpl: async ({ feedback }: any) => {
        humanGateCalls += 1;
        expect(feedback).toContain("cinematic");
        return {
          audit: { verdict: "pass", findings: [], summary: "Request met." },
        };
      },
      repairCandidateImpl: async (options: any) => {
        repairs.push(options);
      },
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    expect(result.status).toBe("passed");
    expect(bakeoffCalls).toBe(2);
    expect(repairs).toHaveLength(1);
    expect(
      repairs[0].screenshots.map((file: string) => path.basename(file)),
    ).toEqual([
      "candidate-a-desktop-viewport.png",
      "candidate-a-mobile-viewport.png",
      "candidate-a-desktop.png",
    ]);
    expect(repairs[0].findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "human-review-feedback",
        }),
      ]),
    );
    expect(humanGateCalls).toBe(1);
    expect(result.humanRevisionPass).toBe(true);
  });

  it("reruns Luna when the rendered human request gate still sees a mismatch", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    await setHumanScopeRequest(
      path.join(candidates, "candidate-a"),
      "Move the CTA below the gallery and make it understated.",
    );
    let humanGateCalls = 0;
    let repairCalls = 0;
    let bakeoffCalls = 0;

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      maxCycles: 2,
      requestedFindings: [
        {
          category: "human-review-feedback",
          message: "Move the CTA below the gallery and make it understated.",
        },
      ],
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        return writeBakeoffEvidence(
          options,
          report({ candidates: [candidate("candidate-a")] }),
        );
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      runHumanGateImpl: async () => {
        humanGateCalls += 1;
        return humanGateCalls === 1
          ? {
              audit: {
                verdict: "revise",
                summary: "CTA is still too prominent.",
                findings: [
                  {
                    category: "requirement-mismatch",
                    severity: "major",
                    viewport: "desktop",
                    evidence: "CTA remains above the gallery.",
                    recommendation:
                      "Move it below the gallery and reduce its visual weight.",
                  },
                ],
              },
            }
          : {
              audit: {
                verdict: "pass",
                summary: "Request met.",
                findings: [],
              },
            };
      },
      repairCandidateImpl: async () => {
        repairCalls += 1;
      },
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    expect(result.status).toBe("passed");
    expect(repairCalls).toBe(2);
    expect(bakeoffCalls).toBe(3);
    expect(humanGateCalls).toBe(2);
    expect(result.repairCycles).toEqual({ "candidate-a": 2 });
  });

  it("fails closed after two rendered repair cycles for the same candidate", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    let bakeoffCalls = 0;
    let repairCalls = 0;

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        maxCycles: 2,
        runBakeoffImpl: async (options: any) => {
          bakeoffCalls += 1;
          return writeBakeoffEvidence(
            options,
            report({ candidates: [candidate("candidate-a")] }),
          );
        },
        runVisualGateImpl: (options: any) => visualGate(options, "revise"),
        repairCandidateImpl: async () => {
          repairCalls += 1;
        },
      }),
    ).rejects.toThrow(/still fails rendered visual QA after 2 repair cycles/iu);

    expect(repairCalls).toBe(2);
    expect(bakeoffCalls).toBe(3);
  });

  it("rerenders and rejudges cycle-two repairs before no-selection exhaustion", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    const evidence = path.join(root, "evidence");
    const candidateDir = path.join(candidates, "candidate-a");
    const observedSources: string[] = [];
    let bakeoffCalls = 0;
    let repairCalls = 0;

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: evidence,
        maxCycles: 2,
        runBakeoffImpl: async (options: any) => {
          bakeoffCalls += 1;
          observedSources.push(
            (
              await fs.readFile(
                path.join(candidateDir, "Experience.jsx"),
                "utf8",
              )
            ).trim(),
          );
          return writeBakeoffEvidence(
            options,
            report({
              selectedCandidateId: null,
              promotionReady: false,
              candidates: [
                candidate("candidate-a", {
                  valid: false,
                  eligible: false,
                  referenceFidelity: { pass: false, score: 40 },
                  renderedReferenceFidelity: {
                    pass: false,
                    audit: { findings: [] },
                  },
                  failures: ["Rendered candidate needs repair."],
                }),
              ],
            }),
          );
        },
        repairCandidateImpl: async ({ candidateDir, cycle }: any) => {
          repairCalls += 1;
          await writeCandidate(candidateDir, {
            experience: `export default () => "repaired-cycle-${cycle}";`,
            styles: "body{}",
            motion:
              "export function mountExperienceMotion(){ return () => {}; }",
          });
        },
      }),
    ).rejects.toThrow(
      /No authored creative candidate passed and the 2-cycle repair budget is exhausted/iu,
    );

    expect(repairCalls).toBe(2);
    expect(bakeoffCalls).toBe(3);
    expect(observedSources).toEqual([
      "export default () => null;",
      'export default () => "repaired-cycle-1";',
      'export default () => "repaired-cycle-2";',
    ]);
    const finalRound = path.join(evidence, "round-02");
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(finalRound, "creative-bakeoff.json"),
          "utf8",
        ),
      ).selectedCandidateId,
    ).toBeNull();
    for (const viewport of ["desktop", "compact", "mobile"])
      await expect(
        fs.access(
          path.join(finalRound, "screenshots", `candidate-a-${viewport}.png`),
        ),
      ).resolves.toBeUndefined();
  });

  it("rejects a passing visual-gate report when the process exits nonzero", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-visual-gate-exit-"),
    );
    roots.push(root);
    const siteDir = path.join(root, "site");
    const screenshotsDir = path.join(root, "screenshots");
    const reportPath = path.join(root, "visual-gate.json");
    const scriptPath = path.join(root, "fake-visual-gate.mjs");
    await fs.mkdir(path.join(siteDir, "src"), { recursive: true });
    await fs.mkdir(screenshotsDir, { recursive: true });
    await fs.writeFile(
      path.join(siteDir, "src/site.config.json"),
      JSON.stringify({ design: { experience: {} } }),
    );
    await fs.writeFile(
      scriptPath,
      `import fs from "node:fs";
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 === 0 ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]] : pairs, []));
fs.writeFileSync(args.report, JSON.stringify({ status: "ok", blockers: [], audit: { verdict: "pass", findings: [] } }));
process.exit(1);
`,
    );

    await expect(
      runVisualGateProcess({
        siteDir,
        screenshotsDir,
        reportPath,
        visualGateScript: scriptPath,
      }),
    ).rejects.toThrow(/Creative visual gate could not run/iu);
  });

  it("returns a failed visual-gate decision on nonzero exit for bounded repair", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-visual-gate-findings-"),
    );
    roots.push(root);
    const siteDir = path.join(root, "site");
    const screenshotsDir = path.join(root, "screenshots");
    const reportPath = path.join(root, "visual-gate.json");
    const scriptPath = path.join(root, "failing-visual-gate.mjs");
    await fs.mkdir(path.join(siteDir, "src"), { recursive: true });
    await fs.mkdir(screenshotsDir, { recursive: true });
    await fs.writeFile(
      path.join(siteDir, "src/site.config.json"),
      JSON.stringify({ design: { experience: {} } }),
    );
    await fs.writeFile(
      scriptPath,
      `import fs from "node:fs";
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 === 0 ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]] : pairs, []));
const finding = { category: "content-integrity", severity: "major", viewport: "desktop", evidence: "Footer text is too dark on its dark surface.", recommendation: "Use a high-contrast footer text color." };
fs.writeFileSync(args.report, JSON.stringify({ mode: "verify", blockers: [finding], audit: { verdict: "revise", findings: [finding] } }));
process.exit(1);
`,
    );

    const decision = await runVisualGateProcess({
      siteDir,
      screenshotsDir,
      reportPath,
      visualGateScript: scriptPath,
    });

    expect(decision.processExitCode).toBe(1);
    expect(decision.audit.verdict).toBe("revise");
    expect(decision.blockers[0].recommendation).toBe(
      "Use a high-contrast footer text color.",
    );
  });

  it("restores the original three-file bundle if a staged repair swap fails", async () => {
    const { candidates } = await fixture(["candidate-a"]);
    const candidateDir = path.join(candidates, "candidate-a");
    const originals = Object.fromEntries(
      await Promise.all(
        ["Experience.jsx", "styles.css", "motion.js"].map(async (name) => [
          name,
          await fs.readFile(path.join(candidateDir, name), "utf8"),
        ]),
      ),
    );
    const fsImpl = {
      mkdir: fs.mkdir.bind(fs),
      writeFile: fs.writeFile.bind(fs),
      rm: fs.rm.bind(fs),
      rename: async (source: string, destination: string) => {
        if (
          source.includes(".rendered-repair-stage-") &&
          source.endsWith("styles.css")
        )
          throw new Error("simulated staged swap failure");
        return fs.rename(source, destination);
      },
    };

    await expect(
      writeCandidate(
        candidateDir,
        {
          experience: "export default function Repaired(){ return null; }",
          styles: ".repaired { display: block; }",
          motion: "export function mountExperienceMotion(){ return () => {}; }",
        },
        { fsImpl },
      ),
    ).rejects.toThrow("simulated staged swap failure");

    for (const [name, content] of Object.entries(originals))
      expect(await fs.readFile(path.join(candidateDir, name), "utf8")).toBe(
        content,
      );
    expect(
      (await fs.readdir(candidateDir)).some((name) =>
        name.startsWith(".rendered-repair-"),
      ),
    ).toBe(false);
  });

  it("rejects a stale visual-gate report when the process exits zero without writing a new report", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-stale-visual-gate-"),
    );
    roots.push(root);
    const siteDir = path.join(root, "site");
    const screenshotsDir = path.join(root, "screenshots");
    const reportPath = path.join(root, "visual-gate.json");
    const scriptPath = path.join(root, "silent-visual-gate.mjs");
    await fs.mkdir(path.join(siteDir, "src"), { recursive: true });
    await fs.mkdir(screenshotsDir, { recursive: true });
    await fs.writeFile(
      path.join(siteDir, "src/site.config.json"),
      JSON.stringify({ design: { experience: {} } }),
    );
    await fs.writeFile(
      reportPath,
      JSON.stringify({
        status: "ok",
        blockers: [],
        audit: { verdict: "pass", findings: [] },
      }),
    );
    await fs.writeFile(scriptPath, "process.exit(0);\n");

    await expect(
      runVisualGateProcess({
        siteDir,
        screenshotsDir,
        reportPath,
        visualGateScript: scriptPath,
      }),
    ).rejects.toThrow(/produced no report/iu);
  });

  it("propagates unexpected screenshot access failures but ignores missing optional screenshots", async () => {
    const denied: any = new Error("permission denied");
    denied.code = "EACCES";
    await expect(
      collectAvailableScreenshots(["/tmp/blocked.png"], {
        fsImpl: {
          async access() {
            throw denied;
          },
        },
      }),
    ).rejects.toBe(denied);

    const missing: any = new Error("missing");
    missing.code = "ENOENT";
    await expect(
      collectAvailableScreenshots(["/tmp/missing.png"], {
        fsImpl: {
          async access() {
            throw missing;
          },
        },
      }),
    ).resolves.toEqual([]);
  });

  it("preserves the recovery backup when rollback itself cannot restore an original file", async () => {
    const { candidates } = await fixture(["candidate-a"]);
    const candidateDir = path.join(candidates, "candidate-a");
    const originalExperience = await fs.readFile(
      path.join(candidateDir, "Experience.jsx"),
      "utf8",
    );
    const fsImpl = {
      mkdir: fs.mkdir.bind(fs),
      writeFile: fs.writeFile.bind(fs),
      rm: fs.rm.bind(fs),
      rename: async (source: string, destination: string) => {
        if (
          source.includes(".rendered-repair-stage-") &&
          source.endsWith("styles.css")
        )
          throw new Error("simulated staged swap failure");
        if (
          source.includes(".rendered-repair-backup-") &&
          source.endsWith("Experience.jsx")
        )
          throw new Error("simulated rollback restore failure");
        return fs.rename(source, destination);
      },
    };

    await expect(
      writeCandidate(
        candidateDir,
        {
          experience: "export default function Repaired(){ return null; }",
          styles: ".repaired { display: block; }",
          motion: "export function mountExperienceMotion(){ return () => {}; }",
        },
        { fsImpl },
      ),
    ).rejects.toThrow(/recovery backup preserved at/iu);

    const recoveryDir = (await fs.readdir(candidateDir)).find((name) =>
      name.startsWith(".rendered-repair-backup-"),
    );
    expect(recoveryDir).toBeTruthy();
    expect(
      await fs.readFile(
        path.join(candidateDir, recoveryDir!, "Experience.jsx"),
        "utf8",
      ),
    ).toBe(originalExperience);
  });

  it("never repairs source for a visual-gate infrastructure error", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    let repairCalls = 0;

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        runBakeoffImpl: async (options: any) =>
          writeBakeoffEvidence(
            options,
            report({ candidates: [candidate("candidate-a")] }),
          ),
        runVisualGateImpl: async () => {
          throw new Error("visual judge provider unavailable");
        },
        repairCandidateImpl: async () => {
          repairCalls += 1;
        },
      }),
    ).rejects.toThrow("visual judge provider unavailable");

    expect(repairCalls).toBe(0);
  });

  it.each([
    ["command exit 127", 'Client command "npm" failed: sudo exited with 127'],
    ["sudo spawn ENOENT", 'Client command "npm" failed: spawn sudo ENOENT'],
  ])(
    "does not spend repair calls when the isolated build reports %s",
    async (_failureKind, clientBuildFailure) => {
      const { root, candidates } = await fixture([
        "candidate-a",
        "candidate-b",
      ]);
      let repairCalls = 0;

      await expect(
        runRenderedCreativeRepair({
          siteDir: root,
          candidatesDir: candidates,
          outDir: path.join(root, "evidence"),
          runBakeoffImpl: async (options: any) =>
            writeBakeoffEvidence(
              options,
              report({
                selectedCandidateId: null,
                fallback: true,
                promotionReady: false,
                candidates: [
                  candidate("candidate-a", {
                    valid: false,
                    eligible: false,
                    failures: [clientBuildFailure],
                  }),
                  candidate("candidate-b", {
                    valid: false,
                    eligible: false,
                    failures: [clientBuildFailure],
                  }),
                ],
              }),
            ),
          runVisualGateImpl: async () => visualGate({}, "pass"),
          repairCandidateImpl: async () => {
            repairCalls += 1;
          },
        }),
      ).rejects.toThrow(
        /creative render infrastructure failure.*no model repairs attempted/iu,
      );

      expect(repairCalls).toBe(0);
    },
  );

  it("rejects a bakeoff candidate directory that escapes the candidates root", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        runBakeoffImpl: async (options: any) =>
          writeBakeoffEvidence(
            options,
            report({
              candidates: [
                candidate("candidate-a", { directory: "../outside" }),
              ],
            }),
          ),
        runVisualGateImpl: async () => visualGate({}, "pass"),
        promoteImpl: async () => ({ candidateId: "candidate-a" }),
      }),
    ).rejects.toThrow(/escapes the candidates root/iu);
  });

  it("routes the generation workflow through the rendered repair orchestrator and checks the freshly built DOM", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/generate-client.yml", import.meta.url),
      "utf8",
    );
    expect(workflow).toContain("scripts/run-rendered-creative-repair.mjs");
    expect(workflow).not.toContain("for REPAIR_ROUND in 1 2");
    expect(workflow).not.toContain("for VISUAL_REPAIR_ROUND in 1 2");
    const buildIndex = workflow.indexOf("-- npm run build");
    const hostGuardIndex = workflow.indexOf("data-creative-host=");
    const candidateGuardIndex = workflow.indexOf("data-creative-candidate=");
    expect(buildIndex).toBeGreaterThan(-1);
    expect(hostGuardIndex).toBeGreaterThan(buildIndex);
    expect(candidateGuardIndex).toBeGreaterThan(buildIndex);
  });
});
