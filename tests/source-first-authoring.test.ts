import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertModelPromptTextBudget } from "../scripts/author-prompt-budget.mjs";
import {
  applySourceEdits,
  adaptStaticDocument,
  resolveSourceStarter,
  sourceAdaptationPrompt,
  sourceFirstGenerator,
  isolateSourceStyles,
  assertSourceAdaptationEvidence,
} from "../scripts/source-first-authoring.mjs";

describe("source-first dossier adaptation", () => {
  it("keeps source-first stage contexts bounded near every 80k file ceiling", () => {
    const experience = `<main className="source-grid">${"x".repeat(79_800)}</main>`;
    const styles = `.source-grid{color:black}/*${"x".repeat(79_800)}*/`;
    const starter = {
      mode: "source-first",
      dossierId: "fixture",
      templateDigest: "a".repeat(64),
      baseline: { experience, styles, changes: [] },
    };
    for (const stage of [
      "contract",
      "experience",
      "service",
      "location",
      "service-index",
      "styles",
      "motion",
    ]) {
      const prompt = sourceAdaptationPrompt({
        stage,
        sourceStarter: starter,
        experienceSource: experience,
        servicePageSource: experience,
        locationPageSource: experience,
        servicesIndexSource: experience,
      });
      const conventionalMarkupCount =
        (
          { service: 1, location: 2, "service-index": 3, motion: 1 } as Record<
            string,
            number
          >
        )[stage] || 0;
      expect(() =>
        assertModelPromptTextBudget([
          {
            type: "text",
            text:
              "r".repeat(40_000) +
              experience.repeat(conventionalMarkupCount) +
              prompt,
          },
        ]),
      ).not.toThrow();
      if (["service", "location", "service-index", "motion"].includes(stage)) {
        expect(prompt).not.toContain(experience);
        expect(prompt).not.toContain(styles);
      }
      if (stage === "styles") expect(prompt.split(experience)).toHaveLength(2);
    }
  });
  it("maps compound document roots to the single candidate root", () => {
    const css = isolateSourceStyles(
      "html body .nav{color:red} html > body{margin:0} :root body .hero{display:grid} .other{color:blue} @keyframes rise{from{opacity:0}to{opacity:1}}",
      "fixture",
    );
    expect(css).toContain('[data-source-baseline="fixture"] .nav');
    expect(css).toContain('[data-source-baseline="fixture"]{margin:0}');
    expect(css).toContain('[data-source-baseline="fixture"] .hero');
    expect(css).not.toContain(
      '[data-source-baseline="fixture"] [data-source-baseline="fixture"]',
    );
    expect(css).toContain("from{opacity:0}");
  });
  it("mechanically retains HTML structure and CSS instead of asking for reconstruction", () => {
    const baseline = adaptStaticDocument(
      '<html><body><main class="ledger"><h1>Sample</h1><section class="ruled" style="padding: 2rem"><p>Original</p></section></main></body></html>',
      ".ledger{display:grid}",
      "fixture",
    );
    expect(baseline.experience).toContain('className="ledger"');
    expect(baseline.experience).toContain(
      'className="ruled ll-source-inline-0"',
    );
    expect(baseline.experience).toContain("Original");
    expect(baseline.styles).toContain(".ledger{display:grid}");
    expect(baseline.styles).toContain("padding: 2rem");
    expect(baseline.experience).not.toContain("style=");
  });

  it("rejects executable or embedded document source instead of silently dropping behavior", () => {
    for (const html of [
      "<script>alert(1)</script>",
      '<button onclick="run()">Go</button>',
      '<iframe src="x"></iframe>',
    ])
      expect(() => adaptStaticDocument(html, "", "fixture")).toThrow(
        /unsupported/i,
      );
  });

  it("applies exact bounded patches and records their basis", () => {
    const baseline = "<main>Sample</main>";
    const result = applySourceEdits(
      baseline,
      JSON.stringify({
        edits: [{ find: "Sample", replace: "{content.brand.name}" }],
      }),
    );
    expect(result.source).toBe("<main>{content.brand.name}</main>");
    expect(result.receipt.baseDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.receipt.edits).toHaveLength(1);
    expect(baseline).toBe("<main>Sample</main>");
  });

  it("rejects ambiguous, oversized, overlapping, malformed, and full-file responses", () => {
    for (const [base, value] of [
      ["xx", { edits: [{ find: "x", replace: "y" }] }],
      ["abc", { edits: [{ find: "a", replace: "x".repeat(6001) }] }],
      [
        "abc",
        {
          edits: [
            { find: "ab", replace: "x" },
            { find: "bc", replace: "y" },
          ],
        },
      ],
      ["abc", { edits: [{ find: "", replace: "rewrite" }] }],
      ["abc", { edits: [], extra: true }],
      ["abc", { edits: [{ find: "abc", replace: "entire replacement" }] }],
    ] as const)
      expect(() => applySourceEdits(base, JSON.stringify(value))).toThrow();
    expect(() =>
      applySourceEdits("abc", "export default function NewSite() {}"),
    ).toThrow();
  });

  it("qualifies the retained Spicer source without mutating it", () => {
    const file =
      "data/reference-library/dossiers/spicer-law-firm-results-ledger/template/source/index.html";
    const original = readFileSync(file, "utf8");
    const starter = resolveSourceStarter({
      referenceDossier: {
        path: "data/reference-library/dossiers/spicer-law-firm-results-ledger",
        id: "spicer-law-firm-results-ledger",
      },
    });
    expect(starter.mode).toBe("source-first");
    if (!("baseline" in starter))
      throw new Error("Expected source-first starter");
    expect(starter.baseline.experience).toContain('className="');
    expect(starter.creditId).toBe("spicer-law-firm-results-ledger");
    expect(readFileSync(file, "utf8")).toBe(original);
    const prompt = sourceAdaptationPrompt({
      stage: "experience",
      sourceStarter: starter,
    });
    expect(prompt).toContain("edits");
    expect(prompt).toContain(starter.baseline.experience);
    expect(prompt).toContain("LeadForm");
  });

  it("falls back before authoring for no source, incomplete captures, or unsupported dependencies", () => {
    expect(resolveSourceStarter({}).reason).toBe("no-dossier-source");
    const capture = resolveSourceStarter({
      referenceDossier: {
        path: "data/reference-library/dossiers/web-home-care-kome-care",
        id: "web-home-care-kome-care",
      },
    });
    expect(capture.mode).toBe("reference-authoring");
    expect(capture.reason).toBe("sanitized-capture-not-runnable");
    const original = resolveSourceStarter({
      referenceDossier: {
        path: "data/reference-library/dossiers/html5up-dental-dimension",
        id: "html5up-dental-dimension",
      },
    });
    expect(original.mode).toBe("reference-authoring");
    expect(original.reason).toBeTruthy();
  });

  it("does not downgrade corrupt source into normal authoring", () => {
    expect(() =>
      resolveSourceStarter({
        referenceDossier: { path: "../../outside", id: "outside" },
      }),
    ).toThrow();
  });

  it("keeps source edits in the actual generator protocol across retries", async () => {
    const starter = {
      mode: "source-first",
      baseline: {
        experience: "<main>Sample</main>",
        styles: ".ledger{color:black}",
      },
    };
    const receipts: any[] = [];
    const seen: any[] = [];
    const generator = sourceFirstGenerator(
      async (request: any) => {
        seen.push(request);
        return {
          content: JSON.stringify({
            edits: [
              {
                find: seen.length === 1 ? "Sample" : "content.brand.name",
                replace:
                  seen.length === 1
                    ? "{content.brand.name}"
                    : "content.hero.heading",
              },
            ],
          }),
        };
      },
      starter,
      receipts,
    );
    expect((await generator({ stage: "experience" })).content).toBe(
      "<main>{content.brand.name}</main>",
    );
    expect(
      (await generator({ stage: "experience", validationError: "Bind hero" }))
        .content,
    ).toBe("<main>{content.hero.heading}</main>");
    expect(seen[1].sourceEditBase).toBe("<main>{content.brand.name}</main>");
    expect(receipts).toHaveLength(2);
    expect(starter.baseline.experience).toBe("<main>Sample</main>");
  });

  it("rejects full-file replacement in source mode, without a generation fallback", async () => {
    let calls = 0;
    const generator = sourceFirstGenerator(
      async () => {
        calls++;
        return { content: "export default function Rewrite() {}" };
      },
      { mode: "source-first", baseline: { experience: "original" } },
    );
    await expect(generator({ stage: "experience" })).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it("retains embedded head styles and safely serializes attributes", () => {
    const result = adaptStaticDocument(
      '<html><head><style>.ruled{border:1px solid}</style></head><body><div style="padding:2rem" class="ruled">Example</div></body></html>',
      "",
      "fixture",
    );
    expect(result.styles).toContain(".ruled{border:1px solid}");
    expect(result.experience).toContain('className="ruled ll-source-inline-0"');
  });
  it("does not retain donor claims in generated CSS text", () => {
    const result = adaptStaticDocument(
      "<body><p>Sample</p></body>",
      '.proof::before{content:"618 verified reviews"}.shape::after{content:""}',
      "fixture",
    );
    expect(result.styles).not.toContain("618 verified reviews");
    expect(result.styles).toContain('.shape::after{content:""}');
  });
  it("requires the immutable source binding and root marker at promotion", () => {
    const baseline = resolveSourceStarter({
      referenceDossier: {
        path: "data/reference-library/dossiers/spicer-law-firm-results-ledger",
        id: "spicer-law-firm-results-ledger",
      },
    });
    if (!("baseline" in baseline)) throw new Error("Expected qualified source");
    const strategy = {
      mode: baseline.mode,
      dossierId: baseline.dossierId,
      templateDigest: baseline.templateDigest,
      creditId: baseline.creditId,
      baselineDigests: baseline.baselineDigests,
    };
    expect(() =>
      assertSourceAdaptationEvidence(
        strategy,
        baseline,
        baseline.baseline.experience,
      ),
    ).not.toThrow();
    expect(() =>
      assertSourceAdaptationEvidence(
        { ...strategy, templateDigest: "b".repeat(64) },
        baseline,
        baseline.baseline.experience,
      ),
    ).toThrow(/immutable baseline/);
    expect(() =>
      assertSourceAdaptationEvidence(
        strategy,
        baseline,
        baseline.baseline.experience.replace(
          'data-source-baseline="spicer-law-firm-results-ledger"',
          "",
        ),
      ),
    ).toThrow(/root marker/);
    expect(() =>
      assertSourceAdaptationEvidence(
        { mode: "reference-authoring" },
        baseline,
        baseline.baseline.experience,
      ),
    ).toThrow(/matching strategy/);
  });
});
