import { buildRepairSpanCatalog } from "../scripts/creative-repair-spans.mjs";
import * as renderedRepair from "../scripts/run-rendered-creative-repair.mjs";
import * as repairModule from "../scripts/creative-repair-loop.mjs";
import { CLIENT_PALETTE_ROLE_CONTRACT } from "../scripts/creative-authoring-output.mjs";
import { inspect } from "node:util";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { interactionSourceDigest } from "../scripts/rendered-interaction-evidence.mjs";
import {
  applyCreativeRepairEdits,
  applyCreativeVisualSafetyRepairs,
  requestRepair,
  modelBoundRepairFindings,
  resolveReferenceEvidencePath,
  runCreativeRepairLoop,
} from "../scripts/creative-repair-loop.mjs";

const roots: string[] = [];
const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
const repairSectionSequence = ["hero", "services", "faqs", "contact"];

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
});

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

describe("creative repair loop", () => {
  it("carries separately labeled interaction pairs beyond the three static images and rejects stale source", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ll-interaction-repair-prompt-"));
    roots.push(root);
    const screenshot = path.join(root, "evidence.png");
    await fs.writeFile(screenshot, "browser-evidence");
    const files = { experience: "current", styles: "", motion: "" };
    const interactionEvidence = { version: 1, candidateId: "candidate-a", sourceDigest: interactionSourceDigest(files), observations: [{ viewport: "compact", status: "passed", after: { content: "Actual changed preparation guidance" } }], pairs: [{ viewport: "mobile", kind: "tab", before: screenshot, after: screenshot }], failures: [] };
    const requests: any[] = [];
    vi.stubGlobal("fetch", async (_url: string, options: RequestInit) => {
      requests.push(JSON.parse(String(options.body)));
      return Response.json({ choices: [{ message: { content: JSON.stringify({ experience: "fixed", styles: "fixed", motion: "fixed" }) } }] });
    });
    const input = { model: "test/model", candidateId: "candidate-a", referenceDna: { familyId: "service-editorial", referenceName: "Licensed service template", sectionSequence: repairSectionSequence, evidence: { desktopScreenshot: { path: screenshot } } }, files, findings: [], screenshots: [screenshot, screenshot, screenshot], interactionEvidence };
    await requestRepair(input);
    const parts = requests[0].messages[1].content;
    expect(parts.filter((p: any) => p.type === "image_url")).toHaveLength(6);
    expect(parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n")).toContain("Actual changed preparation guidance");
    expect(parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n")).toContain("after activation");
    await expect(requestRepair({ ...input, files: { ...files, styles: "new source" } })).rejects.toThrow(/source identity/);
    expect(requests).toHaveLength(1);
  });

  it("applies only unique, bounded literal edits to candidate files", () => {
    const files = {
      experience:
        '<section data-reference-section="hero"><h1>Old</h1></section>',
      styles: '[data-reference-section="hero"] h1 { font-size: 4rem; }',
      motion: "export function mountExperienceMotion() { return () => {}; }",
    };
    const result = applyCreativeRepairEdits(files, [
      {
        file: "experience",
        find: "<h1>Old</h1>",
        replace: "<h1>New</h1>",
      },
    ]);

    expect(result.experience).toContain("<h1>New</h1>");
    expect(result.styles).toBe(files.styles);
    expect(result.motion).toBe(files.motion);
    expect(() =>
      applyCreativeRepairEdits(
        { ...files, experience: `${files.experience}${files.experience}` },
        [{ file: "experience", find: "<h1>Old</h1>", replace: "<h1>New</h1>" }],
      ),
    ).toThrow(/must match exactly once/iu);
    expect(() =>
      applyCreativeRepairEdits(files, [
        {
          file: "styles",
          find: "font-size: 4rem;",
          replace: `data:image/webp;base64,${"a".repeat(40)}`,
        },
      ]),
    ).toThrow(/inline image data/iu);
  });


  it("applies a unique fragment that only drifted in indentation", () => {
    const files = {
      experience: `<main>
      <section className="practice-index">
        <article>
          <h3>{service.name}</h3>
        </article>
      </section>
    </main>`,
      styles: "",
      motion: "",
    };
    const result = applyCreativeRepairEdits(files, [
      {
        file: "experience",
        find: `<section className="practice-index">
  <article>
    <h3>{service.name}</h3>`,
        replace: `<section className="practice-index">
  <article data-repair-row="true">
    <h3>{service.name}</h3>`,
      },
    ]);

    expect(result.experience).toContain('<article data-repair-row="true">');
    expect(result.experience).toContain("</article>");
  });


  it.each([
    ['.label::before { content: "care now"; }', 'content: "care    now";'],
    ["const label = 'care now';", "const label = 'care    now';"],
    ['const label = `care\n  now`;', 'const label = `care\n    now`;'],
    ['function value() { return\n  selected; }', 'return selected;'],
  ])("rejects semantic whitespace drift in repair fragments: %s", (source, find) => {
    expect(() => applyCreativeRepairEdits({ styles: source }, [
      { file: "styles", find, replace: "replacement" },
    ])).toThrow(/must match exactly once/iu);
  });

  it("still fails closed when the drifted fragment is not unique", () => {
    const files = {
      experience: `<main>
      <p>Same line</p>
    </main>
    <aside>
        <p>Same line</p>
    </aside>`,
      styles: "",
      motion: "",
    };

    expect(() =>
      applyCreativeRepairEdits(files, [
        {
          file: "experience",
          find: "<p>\n        Same line\n      </p>",
          replace: "<p>Replaced</p>",
        },
      ]),
    ).toThrow(/must match exactly once/iu);
  });

  it("applies bounded edits to authored inner pages and keeps scoped human repairs on the homepage files", () => {
    const files = {
      experience: "<main>Experience</main>",
      styles: "main { color: inherit; }",
      motion: "export function mountExperienceMotion() { return () => {}; }",
      servicePage: '<main data-service-page><h1>Service</h1></main>',
    };
    const result = applyCreativeRepairEdits(files, [
      {
        file: "servicePage",
        find: "<h1>Service</h1>",
        replace: "<h1>Service page</h1>",
      },
    ]);
    expect(result.servicePage).toContain("Service page");
    expect(result.experience).toBe(files.experience);

    expect(() =>
      applyCreativeRepairEdits(
        files,
        [
          {
            file: "servicePage",
            find: "<h1>Service</h1>",
            replace: "<h1>Other</h1>",
          },
        ],
        { allowInnerPages: false },
      ),
    ).toThrow(/unsupported candidate file/iu);
  });

  it("requires developer human repairs to return edits for a resolved scope", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-scoped-repair-prompt-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const files = {
      experience:
        '<section data-reference-section="hero"><h1>Old</h1></section>',
      styles: '[data-reference-section="hero"] h1 { font-size: 4rem; }',
      motion: "export function mountExperienceMotion() { return () => {}; }",
    };
    const edits = {
      edits: [
        { file: "experience", find: "<h1>Old</h1>", replace: "<h1>New</h1>" },
      ],
    };
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: { content: JSON.stringify(edits) },
              },
            ],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestRepair({
      model: "test/model",
      referenceDna: {
        familyId: "editorial",
        sectionSequence: repairSectionSequence,
        evidence: { desktopScreenshot: { path: desktop } },
      },
      findings: [
        {
          category: "human-review-feedback",
          message: "Improve the hero layout.",
        },
      ],
      files,
      screenshots: [],
      creativeRepairScope: {
        version: 1,
        sectionIds: ["hero"],
        allowMotion: false,
        requestText: "Improve the hero layout.",
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const prompt = body.messages[1].content
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text)
      .join("\n");
    expect(body.response_format.json_schema.name).toContain("repair_edits");
    expect(body.provider?.require_parameters).not.toBe(true);
    expect(body.temperature).toBe(0.35);
    expect(body.response_format.json_schema.schema.properties.edits.maxItems).toBeUndefined();
    expect(prompt).toContain('"sectionIds": [\n    "hero"');
    expect(prompt).toContain("never complete files");
    expect(prompt).toContain("Improve the hero layout.");
    expect(result).toEqual(edits);
  });

  it("keeps distinct contrast ratios, unresolved causes, and non-contrast findings intact", () => {
    const findings = [
      'contrast fail: / desktop default h1 text "Heading" (2.100; required 4.5); foreground gray, background white;',
      'contrast fail: / mobile focus h1 text "Heading" (2.900; required 4.5); foreground gray, background white;',
      'contrast unresolved: / mobile default h1 text "Heading" (unresolved; required 4.5); image backdrop',
      'contrast unresolved: / future-viewport default h1 text "Heading" (unresolved; required 4.5); unsupported viewport',
      { category: "reference", evidence: "Preserve unique geometry", severity: "major" },
    ];
    const packed = modelBoundRepairFindings(findings);
    expect(packed.slice(0, 3).map((item: any) => item.diagnostic)).toEqual([
      'h1 text "Heading" (2.100; required 4.5); foreground gray, background white;',
      'h1 text "Heading" (2.900; required 4.5); foreground gray, background white;',
      'h1 text "Heading" (unresolved; required 4.5); image backdrop',
    ]);
    expect(packed.slice(3)).toEqual(findings.slice(3));
  });

  it("factors repeated contrast diagnostics without dropping measured route, viewport, or state blockers", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-repair-budget-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const files = {
      experience:
        '<section data-reference-section="hero"><h1>{content.heroTitle}</h1></section>',
      styles: "section { color: inherit; }",
      motion: "export function mountExperienceMotion() { return () => {}; }",
    };
    const selector = `body > ${"div:nth-of-type(1) > ".repeat(18)}h1:nth-of-type(1)`;
    const findings = Array.from(
      { length: 1200 },
      (_, index) =>
        `contrast unresolved: /services/service-${index}/ ${index % 2 ? "mobile" : "desktop"} ${index % 3 ? "default" : "focus"} ${selector} text "Sealed heading" (unresolved; required 4.5); foreground rgb(100, 100, 100), background variable; image backdrop; use a provable local opaque plate or sufficiently strong scrim and rerun`,
    );
    findings.push(
      "major reference mobile: Preserve the assigned image treatment.",
    );
    const original = [...findings];
    let prompt = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options: RequestInit) => {
        const body = JSON.parse(options.body as string);
        prompt = body.messages[1].content
          .filter((part: any) => part.type === "text")
          .map((part: any) => part.text)
          .join("\n");
        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: { content: JSON.stringify(files) },
              },
            ],
          }),
        );
      }),
    );
    await requestRepair({
      model: "test/model",
      referenceDna: {
        familyId: "editorial",
        sectionSequence: repairSectionSequence,
        evidence: { desktopScreenshot: { path: desktop } },
      },
      findings,
      files,
      screenshots: [],
    });
    expect(prompt.length).toBeLessThan(400000);
    expect(prompt).toContain(selector);
    expect(prompt).toContain("required 4.5");
    expect(prompt).toContain("image backdrop");
    expect(prompt).toContain(
      "major reference mobile: Preserve the assigned image treatment.",
    );
    const packed = JSON.parse(
      prompt.split("FINDINGS\n")[1].split("\nContrast objects losslessly")[0],
    );
    const restored = packed.flatMap((finding: any) =>
      typeof finding === "string"
        ? [finding]
        : finding.measurements.map(
            ([route, viewport, state]: string[]) =>
              `contrast ${finding.status}: ${route} ${viewport} ${state} ${finding.diagnostic}`,
          ),
    );
    expect(restored.sort()).toEqual([...original].sort());
    expect(findings).toEqual(original);
    expect(prompt).toContain("SOURCE SAFETY CONTRACT");
    expect(prompt).toContain("SEALED CONTENT BINDING CONTRACT");
  });

  it("fails closed when a human repair has no resolved section scope", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      requestRepair({
        model: "test/model",
        findings: [
          { category: "human-review-feedback", message: "Improve the hero." },
        ],
        files: { experience: "", styles: "", motion: "" },
      }),
    ).rejects.toThrow(/resolved, non-empty section scope/iu);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects complete-file responses for a scoped human repair", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-reject-full-file-repair-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify({
                    experience: "whole replacement",
                    styles: "whole replacement",
                    motion: "whole replacement",
                  }),
                },
              },
            ],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestRepair({
        model: "test/model",
        referenceDna: {
          sectionSequence: repairSectionSequence,
          evidence: { desktopScreenshot: { path: desktop } },
        },
        findings: [
          {
            category: "human-review-feedback",
            message: "Improve the hero layout.",
          },
        ],
        files: { experience: "before", styles: "before", motion: "before" },
        screenshots: [],
        creativeRepairScope: {
          version: 1,
          sectionIds: ["hero"],
          allowMotion: false,
          requestText: "Improve the hero layout.",
        },
      }),
    ).rejects.toThrow(
      /must return bounded literal edits, not complete files/iu,
    );
  });

  it("uses a generous repair completion budget and reports bounded response diagnostics", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-repair-budget-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const files = {
      experience:
        '<section data-reference-section="hero"><h1>Old</h1></section>',
      styles: '[data-reference-section="hero"] h1 { font-size: 4rem; }',
      motion: "export function mountExperienceMotion() { return () => {}; }",
    };
    const repaired = { experience: "fixed", styles: "fixed", motion: "fixed" };
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: { content: JSON.stringify(repaired) },
              },
            ],
            usage: {
              completion_tokens: 3456,
              completion_tokens_details: { reasoning_tokens: 321 },
            },
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const diagnostics: string[] = [];

    await requestRepair({
      model: "test/model",
      referenceDna: {
        sectionSequence: repairSectionSequence,
        evidence: { desktopScreenshot: { path: desktop } },
      },
      findings: [],
      files,
      screenshots: [],
      logger: (line: string) => diagnostics.push(line),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.max_completion_tokens).toBe(48000);
    expect(body).not.toHaveProperty("max_tokens");
    expect(diagnostics.join(" ")).toContain(
      "creative_completion stage=creative-repair finish_reason=stop max_completion_tokens=48000 completion_tokens=3456 reasoning_tokens=321",
    );
    expect(diagnostics.join(" ")).not.toContain('"experience":"fixed"');
  });

  it("retries one affordability-limited repair with provider headroom", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-repair-affordability-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const files = {
      experience:
        '<section data-reference-section="hero"><h1>Old</h1></section>',
      styles: '[data-reference-section="hero"] h1 { font-size: 4rem; }',
      motion: "export function mountExperienceMotion() { return () => {}; }",
    };
    const repaired = { experience: "fixed", styles: "fixed", motion: "fixed" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message:
                "This request requires more credits, or fewer max_tokens. You requested up to 48000 tokens, but can only afford 14652.",
            },
          }),
          { status: 402 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: { content: JSON.stringify(repaired) },
              },
            ],
            usage: {
              completion_tokens: 3456,
              completion_tokens_details: { reasoning_tokens: 321 },
            },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const diagnostics: string[] = [];

    await requestRepair({
      model: "test/model",
      referenceDna: {
        sectionSequence: repairSectionSequence,
        evidence: { desktopScreenshot: { path: desktop } },
      },
      findings: [],
      files,
      screenshots: [],
      logger: (line: string) => diagnostics.push(line),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(firstBody.max_completion_tokens).toBe(48000);
    expect(retryBody.max_completion_tokens).toBe(13628);
    expect(diagnostics.join(" ")).toContain(
      "creative_repair_retry reason=provider-affordability requested_max_completion_tokens=48000 retry_max_completion_tokens=13628",
    );
    expect(diagnostics.join(" ")).toContain(
      "creative_completion stage=creative-repair finish_reason=stop max_completion_tokens=13628 completion_tokens=3456 reasoning_tokens=321",
    );
  });

  it("redacts sealed client image data from repair text before provider transport", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-repair-image-redaction-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const dataUri = `data:image/webp;base64,${"A".repeat(1024)}`;
    const repaired = { experience: "fixed", styles: "fixed", motion: "fixed" };
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: { content: JSON.stringify(repaired) },
              },
            ],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestRepair({
      model: "test/model",
      referenceDna: {
        sectionSequence: repairSectionSequence,
        evidence: { desktopScreenshot: { path: desktop } },
      },
      findings: [
        { category: "palette-adherence", evidence: "Use the client palette." },
      ],
      files: {
        experience: "original JSX",
        styles: "original CSS",
        motion: "original motion",
      },
      screenshots: [],
      contentManifest: {
        values: { brand: { name: "Coastal Brush" }, hero: { image: dataUri } },
        tokens: [],
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const textualPrompt = body.messages[1].content
      .filter((part: { type: string; text?: string }) => part.type === "text")
      .map((part: { text?: string }) => part.text || "")
      .join("\n");
    expect(textualPrompt).not.toContain(dataUri);
    expect(textualPrompt).not.toContain("A".repeat(100));
    expect(textualPrompt).toContain("[sealed client image asset]");
  });

  it("rejects an oversized repair prompt before provider transport", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-repair-prompt-budget-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestRepair({
        model: "test/model",
        referenceDna: {
          sectionSequence: repairSectionSequence,
          evidence: { desktopScreenshot: { path: desktop } },
        },
        findings: [
          { category: "palette-adherence", evidence: "Palette mismatch" },
        ],
        files: {
          experience: "x".repeat(400_001),
          styles: "",
          motion: "",
        },
        screenshots: [],
      }),
    ).rejects.toThrow(/exceeds the 400000 character safety budget/iu);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps required section IDs and reference marker order explicit during repairs", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-repair-reference-checklist-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const repaired = { experience: "fixed", styles: "fixed", motion: "fixed" };
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: { content: JSON.stringify(repaired) },
              },
            ],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestRepair({
      model: "test/model",
      referenceDna: {
        sectionSequence: ["hero", "services", "faqs", "contact"],
        requiredSignatureElements: [
          {
            id: "room-service-selector",
            description:
              "a room-reveal service selector backed by a visible finished-room image",
          },
        ],
        imageTreatment: {
          mode: "finished rooms and paint sample-like color strips",
          crop: "wide room reveal followed by contained material studies",
          focalPoint:
            "keep the finished surface visible beside the service choice",
        },
        servicePresentation: {
          pattern: "vertical service menu that changes the featured room image",
          interaction: "room-reveal tabs with a complete static fallback",
        },
        acceptanceChecks: [
          "The room reveal remains visually dominant beside the service choice.",
        ],
        evidence: { desktopScreenshot: { path: desktop } },
      },
      findings: [],
      files: repaired,
      screenshots: [],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const prompt = body.messages[1].content
      .filter((part: { type: string; text?: string }) => part.type === "text")
      .map((part: { text?: string }) => part.text || "")
      .join("\n");
    expect(prompt).toContain('id="services"');
    expect(prompt).toContain('id="faqs"');
    expect(prompt).toContain('id="contact"');
    expect(prompt).toContain(
      'REQUIRED NAVIGATION LINKS (EVERY ROUTE, INCLUDING WHEN REFERENCE DNA IS NULL): include visible native lowercase <nav> containing literal JSX anchors <a href="#services">Services</a>, <a href="#faqs">FAQs</a>, and <a href="#contact">Contact</a>. Do not remove, replace, or convert these anchors to components or click handlers.',
    );
    expect(prompt).toContain('data-reference-section="hero"');
    expect(prompt).toContain('data-reference-section="services"');
    expect(prompt).toContain('data-reference-section="faqs"');
    expect(prompt).toContain('data-reference-section="contact"');
    expect(prompt).toContain(
      'data-reference-signature="room-service-selector" must visibly realize',
    );
    expect(prompt).toContain(
      "Image treatment: finished rooms and paint sample-like color strips",
    );
    expect(prompt).toContain(
      "The room reveal remains visually dominant beside the service choice.",
    );
    expect(prompt).toContain(
      "<FAQList content={content} />, <ContactLinks content={content} />, <LocationMap content={content} />, and <SocialProof content={content} runtime={runtime} />",
    );
    expect(prompt.indexOf('data-reference-section="hero"')).toBeLessThan(
      prompt.indexOf('data-reference-section="services"'),
    );
    expect(prompt.indexOf('data-reference-section="services"')).toBeLessThan(
      prompt.indexOf('data-reference-section="faqs"'),
    );
    expect(prompt.indexOf('data-reference-section="faqs"')).toBeLessThan(
      prompt.indexOf('data-reference-section="contact"'),
    );
  });

  it("classifies a length-limited repair response instead of reporting generic invalid JSON", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-repair-truncation-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: "length", message: { content: "{" } }],
            usage: {
              completion_tokens: 48000,
              completion_tokens_details: { reasoning_tokens: 47000 },
            },
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestRepair({
        model: "test/model",
        referenceDna: {
          sectionSequence: repairSectionSequence,
          evidence: { desktopScreenshot: { path: desktop } },
        },
        findings: [],
        files: { experience: "old", styles: "old", motion: "old" },
        screenshots: [],
      }),
    ).rejects.toThrow(
      "Creative repair response was truncated (finish_reason=length max_completion_tokens=48000 completion_tokens=48000 reasoning_tokens=47000 content_chars=1).",
    );
  });

  it("repairs large candidates with sequential file replacements inside the frozen reasoning session", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-repair-file-scope-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const sourceFiles = {
      experience: "original JSX",
      styles: `.hero { color: navy; }\n${"x".repeat(21000)}`,
      motion: "original motion",
    };
    const repaired = {
      experience: "complete JSX",
      styles: sourceFiles.styles.replace(
        ".hero { color: navy; }",
        ".hero { color: #064e3b; }",
      ),
      motion: "complete motion",
    };
    const fileResponse = (file: "experience" | "styles" | "motion") => ({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({ file, source: repaired[file] }),
          },
        },
      ],
      usage: {
        completion_tokens: 1400,
        completion_tokens_details: { reasoning_tokens: 900 },
      },
    });
    const responses = [
      {
        error: {
          message:
            "This request requires more credits, or fewer max_tokens. You requested up to 48000 tokens, but can only afford 14652.",
        },
      },
      fileResponse("experience"),
      fileResponse("styles"),
      fileResponse("motion"),
    ];
    const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => {
      const response = responses.shift()!;
      return new Response(JSON.stringify(response), {
        status: "error" in response ? 402 : 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const diagnostics: string[] = [];

    const result = await requestRepair({
      model: "openai/gpt-6-luna",
      referenceDna: {
        familyId: "editorial-architecture",
        referenceName: "Editorial architecture",
        sectionSequence: repairSectionSequence,
        evidence: { desktopScreenshot: { path: desktop } },
      },
      findings: [
        { category: "service-presentation", evidence: "Use image-led service choices." },
        { category: "imagery", evidence: "Carry the assigned image choreography into later chapters." },
        { category: "spatial-rhythm", evidence: "Restore the reference section progression." },
        { category: "interaction-evidence", evidence: "Make the gallery and FAQ interactions visible." },
        { category: "motion-primitive", evidence: "Add the assigned masked image reveal." },
      ],
      files: sourceFiles,
      screenshots: [],
      creativeSession: {
        sessionId:
          "launchloom:creative:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        reasoningEffort: "max",
        recommendedEffort: "max",
        mode: "enforce",
        reasoningPolicyVersion: "adaptive-reasoning-v1",
        selectorModelVersion: "jev-1.13.0",
      },
      logger: (line: string) => diagnostics.push(line),
    });

    expect(result).toEqual(repaired);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const bodies = fetchMock.mock.calls.map((call) =>
      JSON.parse(call[1].body as string),
    );
    expect(bodies.map((body) => body.reasoning.effort)).toEqual([
      "max",
      "max",
      "max",
      "max",
    ]);
    expect(new Set(bodies.map((body) => body.session_id))).toEqual(
      new Set(["launchloom:creative:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]),
    );
    expect(bodies.map((body) => body.response_format.json_schema.name)).toEqual(
      Array(4).fill("launchloom_creative_file_repair"),
    );
    expect(bodies[0].max_completion_tokens).toBe(48000);
    expect(bodies[1].max_completion_tokens).toBe(13628);
    expect(bodies[2].max_completion_tokens).toBe(48000);
    expect(bodies[3].max_completion_tokens).toBe(48000);
    const repairPrompts = bodies.map((body) =>
      body.messages[1].content
        .filter((part: { type: string; text?: string }) => part.type === "text")
        .map((part: { text?: string }) => part.text || "")
        .join("\n"),
    );
    expect(repairPrompts[1]).toContain("TARGET CANDIDATE FILE: experience");
    expect(repairPrompts[2]).toContain("TARGET CANDIDATE FILE: styles");
    expect(repairPrompts[3]).toContain("TARGET CANDIDATE FILE: motion");
    expect(diagnostics.join(" ")).toContain(
      "creative_repair_retry reason=provider-affordability requested_max_completion_tokens=48000 retry_max_completion_tokens=13628",
    );
    expect(diagnostics.join(" ")).not.toContain("from=max to=xhigh");
  });


  it("marks an empty large-repair file replacement as a retryable model-output rejection", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-empty-repair-edits-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content: JSON.stringify({ file: "experience", source: "" }),
                  },
                },
              ],
              usage: { prompt_tokens: 1, completion_tokens: 1 },
            }),
          ),
      ),
    );

    await expect(
      requestRepair({
        model: "test/model",
        referenceDna: {
          sectionSequence: repairSectionSequence,
          evidence: { desktopScreenshot: { path: desktop } },
        },
        findings: ["rendered-reference: hero composition is too generic"],
        files: {
          experience: "old JSX",
          styles: `body { color: navy; }\n${"x".repeat(21_000)}`,
          motion: "old motion",
        },
        screenshots: [],
      }),
    ).rejects.toMatchObject({
      code: "CREATIVE_REPAIR_OUTPUT_REJECTED",
      message: expect.stringContaining("source must be non-empty"),
    });
  });


  it("classifies malformed non-truncated repair JSON with usage diagnostics", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-repair-malformed-json-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [
              { finish_reason: "stop", message: { content: "not json" } },
            ],
            usage: {
              completion_tokens: 810,
              completion_tokens_details: { reasoning_tokens: 200 },
            },
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestRepair({
        model: "test/model",
        referenceDna: {
          sectionSequence: repairSectionSequence,
          evidence: { desktopScreenshot: { path: desktop } },
        },
        findings: [],
        files: { experience: "old", styles: "old", motion: "old" },
        screenshots: [],
      }),
    ).rejects.toThrow(
      "Creative repair response was malformed (finish_reason=stop max_completion_tokens=48000 completion_tokens=810 reasoning_tokens=200 content_chars=8).",
    );
  });

  it("prefers an accessible absolute reference evidence path", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-repair-evidence-"),
    );
    roots.push(root);
    const absolutePath = path.join(root, "reference.png");
    await fs.writeFile(absolutePath, "reference");

    await expect(
      resolveReferenceEvidencePath({
        path: "missing/repository-relative.png",
        absolutePath,
      }),
    ).resolves.toBe(absolutePath);
  });

  it("loads reference screenshots through absolute paths when relative paths are unavailable", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-repair-"));
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    const mobile = path.join(root, "mobile.png");
    await fs.writeFile(desktop, "desktop-evidence");
    await fs.writeFile(mobile, "mobile-evidence");
    const repaired = { experience: "fixed", styles: "fixed", motion: "fixed" };
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(repaired) } }],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(
      await requestRepair({
        model: "test/model",
        referenceDna: {
          sectionSequence: repairSectionSequence,
          evidence: {
            desktopScreenshot: {
              path: path.join(root, "missing-desktop.png"),
              absolutePath: desktop,
            },
            mobileScreenshot: {
              path: path.join(root, "missing-mobile.png"),
              absolutePath: mobile,
            },
          },
        },
        findings: [],
        files: repaired,
        screenshots: [],
      }),
    ).toEqual(repaired);
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const images = body.messages[1].content.filter(
      (part: any) => part.type === "image_url",
    );
    expect(images.map((part: any) => part.image_url.url)).toEqual([
      `data:image/png;base64,${Buffer.from("desktop-evidence").toString("base64")}`,
      `data:image/png;base64,${Buffer.from("mobile-evidence").toString("base64")}`,
    ]);
  });

  it("keeps the client visual brief in rendered repair prompts", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-visual-brief-repair-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const repaired = { experience: "fixed", styles: "fixed", motion: "fixed" };
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(repaired) } }],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestRepair({
      model: "test/model",
      referenceDna: {
        sectionSequence: repairSectionSequence,
        evidence: { desktopScreenshot: { path: desktop } },
      },
      findings: [],
      files: repaired,
      screenshots: [],
      contentManifest: {
        values: { brand: { name: "Coastal Brush" } },
        tokens: [],
        visualBrief: {
          palette: { surfaceColor: "#f5f0e4", primaryColor: "#245a4c" },
          artDirection: "Light tactile craft collage, not a dark house style.",
        },
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const prompt = body.messages[1].content
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text)
      .join("\n");
    expect(prompt).toContain("CLIENT VISUAL BRIEF");
    expect(prompt).toContain("#f5f0e4");
    expect(prompt).toContain("Light tactile craft collage");
    expect(prompt).toContain("CLIENT PALETTE ROLE CONTRACT");
    expect(prompt).toContain("surfaceColor is the dominant page surface");
    expect(prompt).toContain(
      "Do not repair toward a generic LaunchLoom house style",
    );
    expect(prompt).toContain("IMAGE ROLE DIVERSITY CONTRACT");
    expect(prompt).toContain(
      "Do not manufacture a feature pair, gallery, strip, or triptych by cropping the same source repeatedly",
    );
    expect(prompt).toContain("CLIENT-REQUESTED INTERACTION CONTRACT");
    expect(prompt).toContain("data-purposeful-interaction");
  });

  it("labels sibling screenshots as comparison-only evidence in diversity repairs", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-sibling-visual-repair-"),
    );
    roots.push(root);
    const paths = {
      referenceDesktop: path.join(root, "reference-desktop.png"),
      referenceMobile: path.join(root, "reference-mobile.png"),
      currentDesktop: path.join(root, "candidate-a-desktop-viewport.png"),
      currentMobile: path.join(root, "candidate-a-mobile-viewport.png"),
      siblingDesktop: path.join(root, "candidate-b-desktop-viewport.png"),
      siblingMobile: path.join(root, "candidate-b-mobile-viewport.png"),
    };
    for (const [name, file] of Object.entries(paths))
      await fs.writeFile(file, `${name}-pixels`);
    const repaired = { experience: "fixed", styles: "fixed", motion: "fixed" };
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(repaired) } }],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestRepair({
      model: "test/model",
      referenceDna: {
        sectionSequence: repairSectionSequence,
        evidence: {
          desktopScreenshot: { path: paths.referenceDesktop },
          mobileScreenshot: { path: paths.referenceMobile },
        },
      },
      findings: [
        "Rendered diversity failed against candidate-b. Candidate layouts converge on the same split hero.",
      ],
      files: repaired,
      screenshots: [paths.currentDesktop, paths.currentMobile],
      comparisonScreenshots: [
        {
          candidateId: "candidate-b",
          viewport: "desktop",
          path: paths.siblingDesktop,
        },
        {
          candidateId: "candidate-b",
          viewport: "mobile",
          path: paths.siblingMobile,
        },
      ],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const content = body.messages[1].content;
    const prompt = content
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text)
      .join("\n");
    expect(prompt).toContain(
      "Sibling candidate candidate-b desktop first viewport",
    );
    expect(prompt).toContain(
      "Sibling candidate candidate-b mobile first viewport",
    );
    expect(prompt).toContain("Comparison-only visual evidence");
    expect(prompt).toContain("Do not copy its layout or style");
    expect(
      content.filter((part: any) => part.type === "image_url"),
    ).toHaveLength(6);
  });

  it("uses the frozen creative session effort and session id for repairs", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-frozen-repair-session-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const repaired = { experience: "fixed", styles: "fixed", motion: "fixed" };
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(repaired) } }],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestRepair({
      model: "openai/gpt-6-luna",
      referenceDna: {
        familyId: "editorial",
        referenceName: "Editorial reference",
        sectionSequence: repairSectionSequence,
        evidence: { desktopScreenshot: { path: desktop } },
      },
      findings: [],
      files: repaired,
      screenshots: [],
      creativeSession: {
        sessionId:
          "launchloom:creative:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        reasoningEffort: "max",
        recommendedEffort: "max",
        mode: "enforce",
        reasoningPolicyVersion: "adaptive-reasoning-v1",
        selectorModelVersion: "jev-1.13.0",
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.session_id).toBe(
      "launchloom:creative:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(body.reasoning.effort).toBe("max");
    expect(body.prompt_cache_key).toMatch(/^ll:creative-repair-refe:/u);
  });

  it("authorizes requested composition changes only for explicit human review findings", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-human-repair-prompt-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const files = {
      experience:
        '<section data-reference-section="hero"><h1>Old</h1></section>',
      styles: '[data-reference-section="hero"] h1 { font-size: 4rem; }',
      motion: "export function mountExperienceMotion() { return () => {}; }",
    };
    const repaired = {
      edits: [
        { file: "experience", find: "<h1>Old</h1>", replace: "<h1>New</h1>" },
      ],
    };
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(repaired) } }],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestRepair({
      model: "test/model",
      referenceDna: {
        sectionSequence: repairSectionSequence,
        evidence: { desktopScreenshot: { path: desktop } },
      },
      findings: [
        {
          category: "human-review-feedback",
          message: "Move the CTA below the gallery.",
        },
      ],
      files,
      screenshots: [],
      creativeRepairScope: {
        version: 1,
        sectionIds: ["hero"],
        allowMotion: false,
        requestText: "Move the CTA below the gallery.",
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const prompt = body.messages[1].content
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text)
      .join("\n");
    expect(prompt).toContain("Make the smallest safe source edit");
    expect(prompt).toContain('"sectionIds": [\n    "hero"');
    expect(prompt).toContain("Move the CTA below the gallery.");
    expect(prompt).not.toContain(
      "Return complete files required by the response schema",
    );
  });

  it("allows reference-driven repairs to change the composition that failed visual review", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-reference-repair-prompt-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const repaired = { experience: "fixed", styles: "fixed", motion: "fixed" };
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(repaired) } }],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestRepair({
      model: "test/model",
      referenceDna: {
        sectionSequence: repairSectionSequence,
        evidence: { desktopScreenshot: { path: desktop } },
      },
      findings: [
        {
          category: "hero-geometry",
          severity: "major",
          evidence:
            "The opening composition is generic and does not match the assigned image-led reference.",
        },
      ],
      files: repaired,
      screenshots: [],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const prompt = body.messages[1].content
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text)
      .join("\n");
    expect(prompt).toContain("You may change composition, layout, hierarchy");
    expect(prompt).toContain(
      "Do not preserve any composition or design mechanic explicitly identified as failing.",
    );
    expect(prompt).toContain(
      "Preserve verified business facts, sealed content bindings, accessibility",
    );
    expect(prompt).toContain("SOURCE SAFETY CONTRACT");
    expect(prompt).toContain(
      "Do not add style attributes or style props to Experience.jsx",
    );
    expect(prompt).toContain(
      "Use className hooks in JSX and put all visual declarations in styles.css",
    );
    expect(prompt).not.toContain(
      "Preserve its composition and sealed content bindings.",
    );
  });

  it("constrains motion repairs to existing behavior hooks and requires reduced-motion support", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-motion-repair-prompt-contract-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const files = {
      experience: `<main>${"existing visitor copy ".repeat(1_000)}<button>Request care</button></main>`,
      styles: ".care-guide { opacity: 1; }",
      motion:
        "export function mountExperienceMotion(runtime) { return () => {}; }",
    };
    const repairedMotion =
      "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }";
    const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string);
      const requestText = body.messages[1].content
        .filter((part: { type: string; text?: string }) => part.type === "text")
        .map((part: { text?: string }) => part.text || "")
        .join("\n");
      const targetFile = /TARGET CANDIDATE FILE: (experience|styles|motion)/u.exec(
        requestText,
      )?.[1];
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  file: targetFile,
                  source:
                    targetFile === "motion"
                      ? repairedMotion
                      : files[targetFile as keyof typeof files],
                }),
              },
            },
          ],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await requestRepair({
      model: "test/model",
      referenceDna: {
        sectionSequence: repairSectionSequence,
        evidence: { desktopScreenshot: { path: desktop } },
      },
      findings: [
        {
          category: "motion-quality",
          message: "Slow the reveal and keep the still state legible.",
        },
      ],
      files,
      screenshots: [],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const bodies = fetchMock.mock.calls.map((call) =>
      JSON.parse(call[1].body as string),
    );
    const motionPrompt = bodies[0].messages[1].content
      .filter((part: { type: string; text?: string }) => part.type === "text")
      .map((part: { text?: string }) => part.text || "")
      .join("\n");
    expect(motionPrompt).toContain("LARGE-CANDIDATE FILE-SCOPED REPAIR MODE");
    expect(motionPrompt).toContain("TARGET CANDIDATE FILE: motion");
    expect(motionPrompt).toContain("MOTION REPAIR CONTRACT");
    expect(motionPrompt).toContain("Treat motion.js as behavior-only");
    expect(motionPrompt).toContain(
      "Keep CURRENT EXPERIENCE.JSX byte-for-byte unchanged",
    );
    expect(motionPrompt).toContain("runtime?.reducedMotion");
    expect(motionPrompt).toContain(
      'matchMedia("(prefers-reduced-motion: reduce)")',
    );
    expect(motionPrompt).toContain("keep a still equivalent");
    expect(motionPrompt).toContain(
      "Clean up listeners, observers, timelines, and timers",
    );
  });

  it("repairs the JSX signature as well when a motion primitive mismatches its reference", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-reference-motion-repair-scope-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const files = {
      experience: "x".repeat(21_000),
      styles: ".hero { color: navy; }",
      motion:
        "export function mountExperienceMotion(runtime) { return () => {}; }",
    };
    const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string);
      const requestText = body.messages[1].content
        .filter((part: { type: string; text?: string }) => part.type === "text")
        .map((part: { text?: string }) => part.text || "")
        .join("\n");
      const targetFile = /TARGET CANDIDATE FILE: (experience|styles|motion)/u.exec(
        requestText,
      )?.[1];
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  file: targetFile,
                  source: files[targetFile as keyof typeof files],
                }),
              },
            },
          ],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await requestRepair({
      model: "test/model",
      referenceDna: {
        sectionSequence: repairSectionSequence,
        evidence: { desktopScreenshot: { path: desktop } },
      },
      findings: [
        {
          category: "motion-primitive",
          message: "The motion primitive does not match Reference DNA.",
        },
      ],
      files,
      screenshots: [],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const prompts = fetchMock.mock.calls.map((call) => {
      const body = JSON.parse(call[1].body as string);
      return body.messages[1].content
        .filter((part: { type: string; text?: string }) => part.type === "text")
        .map((part: { text?: string }) => part.text || "")
        .join("\n");
    });
    expect(prompts[0]).toContain("TARGET CANDIDATE FILE: experience");
    expect(prompts[1]).toContain("TARGET CANDIDATE FILE: styles");
    expect(prompts[2]).toContain("TARGET CANDIDATE FILE: motion");
  });

  it("treats sealed visitor-facing values as data and forbids hardcoding them in repairs", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-sealed-copy-repair-prompt-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const repaired = { experience: "fixed", styles: "fixed", motion: "fixed" };
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: { content: JSON.stringify(repaired) },
              },
            ],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestRepair({
      model: "test/model",
      referenceDna: {
        sectionSequence: repairSectionSequence,
        evidence: { desktopScreenshot: { path: desktop } },
      },
      findings: [
        { category: "visual", message: "Adjust the appointment action." },
      ],
      files: {
        experience:
          '<a href="#contact">{content.copy.appointmentPreparation}</a>',
        styles: "",
        motion: "",
      },
      screenshots: [],
      contentManifest: {
        values: {
          copy: { appointmentPreparation: "Leave with written notes" },
        },
        tokens: [{ token: "content.copy.appointmentPreparation" }],
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const prompt = body.messages[1].content
      .filter((part: { type: string; text?: string }) => part.type === "text")
      .map((part: { text?: string }) => part.text || "")
      .join("\n");
    expect(prompt).toContain('"Leave with written notes"');
    expect(prompt).toContain("SEALED CONTENT BINDING CONTRACT");
    expect(prompt).toContain(
      "Treat every business-specific string and fact shown in CURRENT SEALED CONTENT SHAPE as sealed data, not source copy.",
    );
    expect(prompt).toContain(
      "Do not copy, paraphrase, or hardcode those values into JSX/HTML",
    );
    expect(prompt).toContain(
      "Preserve existing content-token expressions and render business content through the existing content bindings",
    );
    expect(prompt).toContain("content.copy.appointmentPreparation");
  });

  it("rejects an empty full-file response for a large candidate", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-empty-file-repair-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const files = {
      experience: "x".repeat(21_000),
      styles: ".hero { color: black; }",
      motion: "export function mountExperienceMotion() { return () => {}; }",
    };
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify({ file: "experience", source: "" }),
                },
              },
            ],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestRepair({
        model: "test/model",
        referenceDna: {
          sectionSequence: repairSectionSequence,
          evidence: { desktopScreenshot: { path: desktop } },
        },
        findings: [{ category: "visual", message: "Fix the hero layout." }],
        files,
        screenshots: [],
      }),
    ).rejects.toThrow(/source must be non-empty/iu);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });


  it("keeps reference provenance out of client copy and preserves the contact-bound early action", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-reference-safety-repair-prompt-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const repaired = { experience: "fixed", styles: "fixed", motion: "fixed" };
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(repaired) } }],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestRepair({
      model: "test/model",
      referenceDna: {
        familyId: "service-editorial",
        referenceName: "Licensed service template",
        rights: "licensed",
        sectionSequence: repairSectionSequence,
        evidence: { desktopScreenshot: { path: desktop } },
      },
      referenceDossier: {
        id: "licensed-service-template",
        familyId: "service-editorial",
        referenceName: "Licensed service template",
        source: { rights: "licensed" },
        tags: { business: ["hvac"] },
        designPrompt:
          "A source reference whose exact identity and credit must not become client copy.",
      },
      findings: [
        {
          category: "generic-grammar",
          evidence: "The opening composition is too generic.",
        },
      ],
      files: {
        experience:
          '<a href="#contact" data-early-conversion>{content.hero.primaryLabel}</a>',
        styles: "",
        motion: "",
      },
      screenshots: [],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const prompt = body.messages[1].content
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text)
      .join("\n");
    expect(prompt).toContain("REFERENCE PROVENANCE BOUNDARY");
    expect(prompt).toContain(
      "rights and attribution are research metadata only",
    );
    expect(prompt).toContain("Never render them in visitor-facing copy");
    expect(prompt).toContain("EARLY CONVERSION INVARIANT");
    expect(prompt).toContain("native anchor to #contact");
    expect(prompt).toContain("content.hero.primaryLabel");
    expect(prompt).toContain("data-early-conversion");
    expect(prompt).toContain(
      "Do not replace it with a button, form, or JavaScript-only action",
    );
  });

  it("preserves composition when a repair finding is non-visual", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-copy-repair-prompt-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const repaired = { experience: "fixed", styles: "fixed", motion: "fixed" };
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(repaired) } }],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestRepair({
      model: "test/model",
      referenceDna: {
        sectionSequence: repairSectionSequence,
        evidence: { desktopScreenshot: { path: desktop } },
      },
      findings: [
        {
          category: "copy-integrity",
          evidence: "The phone label contains a typo.",
        },
      ],
      files: repaired,
      screenshots: [],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const prompt = body.messages[1].content
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text)
      .join("\n");
    expect(prompt).toContain(
      "Preserve its composition and sealed content bindings.",
    );
  });

  it.each([
    undefined,
    {},
    { available: true },
    { available: false, path: "desktop.png" },
  ])(
    "fails terminally before requesting a repair for invalid desktop evidence %j",
    async (desktopScreenshot) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const evaluate = vi.fn(async () => ({ pass: true, findings: [] }));
      await expect(
        runCreativeRepairLoop({
          files: { experience: "old", styles: "old", motion: "old" },
          referenceDna: { evidence: { desktopScreenshot } },
          findings: [
            { evidence: "Hero heading is white-on-white on a light panel." },
          ],
          generate: (request: any) =>
            requestRepair({ model: "test/model", ...request }),
          evaluate,
        }),
      ).rejects.toThrow("Creative repair requires desktop reference evidence");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(evaluate).toHaveBeenCalledOnce();
    },
  );

  it.each([undefined, {}, { available: false, path: "missing-mobile.png" }])(
    "keeps mobile reference evidence optional: %j",
    async (mobileScreenshot) => {
      const root = await fs.mkdtemp(
        path.join(os.tmpdir(), "launchloom-repair-"),
      );
      roots.push(root);
      const desktop = path.join(root, "desktop.png");
      await fs.writeFile(desktop, "desktop-evidence");
      const repaired = {
        experience: "fixed",
        styles: "fixed",
        motion: "fixed",
      };
      const fetchMock = vi.fn(
        async (_url: string, _options: RequestInit) =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: JSON.stringify(repaired) } }],
            }),
          ),
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        requestRepair({
          model: "test/model",
          referenceDna: {
            sectionSequence: repairSectionSequence,
            evidence: {
              desktopScreenshot: { path: desktop },
              mobileScreenshot,
            },
          },
          findings: [],
          files: repaired,
          screenshots: [],
        }),
      ).resolves.toEqual(repaired);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(
        body.messages[1].content.filter(
          (part: any) => part.type === "image_url",
        ),
      ).toHaveLength(1);
    },
  );

  it.each([
    ["desktopScreenshot", false],
    ["desktopScreenshot", true],
    ["mobileScreenshot", false],
    ["mobileScreenshot", true],
  ] as const)(
    "fails terminally for unreadable %s (directory: %s) instead of applying safety repairs",
    async (kind, directory) => {
      const root = await fs.mkdtemp(
        path.join(os.tmpdir(), "launchloom-repair-"),
      );
      roots.push(root);
      const desktop = path.join(root, "desktop.png");
      await fs.writeFile(desktop, "desktop-evidence");
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const evaluate = vi.fn(async () => ({ pass: true, findings: [] }));
      await expect(
        runCreativeRepairLoop({
          files: { experience: "old", styles: "old", motion: "old" },
          referenceDna: {
            evidence: {
              desktopScreenshot: { path: desktop },
              [kind]: {
                path: path.join(root, "missing.png"),
                absolutePath: directory
                  ? root
                  : path.join(root, "also-missing.png"),
              },
            },
          },
          findings: [
            { evidence: "Hero heading is white-on-white on a light panel." },
          ],
          generate: (request: any) =>
            requestRepair({ model: "test/model", ...request }),
          evaluate,
        }),
      ).rejects.toThrow(
        "Creative repair cannot load required reference evidence",
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(evaluate).toHaveBeenCalledOnce();
    },
  );

  it("repairs at most two cycles and returns the passing source", async () => {
    let calls = 0;
    const result = await runCreativeRepairLoop({
      files: { experience: "old", styles: "old", motion: "old" },
      referenceDna: { familyId: "test" },
      generate: async ({ cycle }: any) => {
        calls += 1;
        return {
          experience: `fixed-${cycle}`,
          styles: "fixed",
          motion: "fixed",
        };
      },
      evaluate: async (files: any) => ({
        pass: files.experience === "fixed-2",
        findings: files.experience === "fixed-2" ? [] : ["still generic"],
      }),
      maxCycles: 2,
    });
    expect(calls).toBe(2);
    expect(result.pass).toBe(true);
    expect(result.cyclesUsed).toBe(2);
  });

  it("applies a large candidate's model edit set before the generic repair loop evaluates it", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-large-loop-contract-"));
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const files = {
      experience: "<main>Experience</main>",
      styles: `main { color: inherit; }\n/*${"x".repeat(21_000)}*/`,
      motion: "export function mountExperienceMotion() { return () => {}; }",
      servicePage: '<main data-service-page><h1 className="service-old">Service</h1></main>',
    };
    const pageSpan = buildRepairSpanCatalog(files).spans.find(span => span.file === "servicePage")!;
    vi.stubGlobal("fetch", vi.fn(async (_url, options: any) => {
      const body=JSON.parse(options.body); const schema=body.response_format.json_schema.schema.properties.edits;
      expect(body.provider?.require_parameters).not.toBe(true); expect(body.temperature).toBe(0.35); expect(schema.maxItems).toBeUndefined();
      expect(schema.items.properties.replace.maxLength).toBeUndefined();
      return Response.json({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
        edits: [{ spanId: pageSpan.id, replace: pageSpan.find.replace('className="service-old"', 'className="service-new"') }],
      }) } }],
    }); }));
    const referenceDna = {
      familyId: "test-editorial",
      sectionSequence: repairSectionSequence,
      evidence: { desktopScreenshot: { path: desktop } },
    };
    const result = await runCreativeRepairLoop({
      files,
      referenceDna,
      generate: (input: any) => requestRepair({ model: "test/model", ...input, logger: () => {} }),
      evaluate: async (candidate: any) => ({
        pass: candidate.servicePage.includes('className="service-new"'),
        findings: ["service-page heading class needs repair"],
      }),
      maxCycles: 1,
    });
    expect(result.pass).toBe(true);
    expect(result.generationFailures).toBe(0);
    expect(result.authorAttempts).toBe(1);
    expect(result.files.servicePage).toBe(files.servicePage.replace('className="service-old"', 'className="service-new"'));
    for (const key of ["experience", "styles", "motion"] as const)
      expect(result.files[key]).toBe(files[key]);
  });

  it("updates authored inner pages through the repair loop and keeps unchanged pages", async () => {
    const result = await runCreativeRepairLoop({
      files: {
        experience: "old",
        styles: "old",
        motion: "old",
        servicePage: "service-old",
        locationPage: "location-old",
      },
      referenceDna: { familyId: "test" },
      generate: async () => ({
        experience: "fixed",
        styles: "fixed",
        motion: "fixed",
        servicePage: "service-fixed",
        locationPage: "",
      }),
      evaluate: async (files: any) => ({
        pass:
          files.experience === "fixed" &&
          files.servicePage === "service-fixed" &&
          files.locationPage === "location-old",
        findings: ["service-page desktop: heading identity drift"],
      }),
      maxCycles: 1,
    });
    expect(result.pass).toBe(true);
    expect(result.files.servicePage).toBe("service-fixed");
    expect(result.files.locationPage).toBe("location-old");
  });

  it("fails closed after the retry budget", async () => {
    const result = await runCreativeRepairLoop({
      files: { experience: "old", styles: "old", motion: "old" },
      referenceDna: { familyId: "test" },
      generate: async () => ({
        experience: "still-old",
        styles: "still-old",
        motion: "still-old",
      }),
      evaluate: async () => ({ pass: false, findings: ["not fixed"] }),
      maxCycles: 2,
    });
    expect(result.pass).toBe(false);
    expect(result.cyclesUsed).toBe(2);
  });

  it("applies only scoped repairs for measured footer and mobile CTA defects", () => {
    const result = applyCreativeVisualSafetyRepairs(
      {
        experience: "<main></main>",
        styles: ".footer { color: #111; }",
        motion: "",
      },
      [
        {
          category: "content-integrity",
          evidence:
            "Footer brand is unreadable against the dark background and clipped at the top edge.",
        },
        {
          category: "conversion",
          evidence: "Floating CTA pill overlaps footer content on mobile.",
        },
        {
          category: "content-integrity",
          evidence: "Hero heading is white-on-white on a light panel.",
        },
        {
          category: "conversion",
          evidence:
            "On mobile the navigation is hidden and no menu is visible.",
        },
        {
          category: "hierarchy",
          evidence:
            "The services intro is an oversized five-line display heading that dwarfs the service rows.",
        },
      ],
    );
    expect(result.styles).toContain(
      "launchloom-visual-repair: footer-contrast",
    );
    expect(result.styles).toContain(
      "launchloom-visual-repair: conversion-clearance",
    );
    expect(result.styles).toContain(
      "launchloom-visual-repair: hero-host-collision",
    );
    expect(result.styles).toContain(
      "launchloom-visual-repair: mobile-navigation-visibility",
    );
    expect(result.styles).toContain(
      'body:has([data-creative-host="true"]) .quick-answers',
    );
    expect(result.styles).toContain(
      '[data-creative-host="true"] a[data-navigation-geometry="fixed-bottom-conversation-pill"]',
    );
    expect(result.styles).toContain(
      "launchloom-visual-repair: service-intro-hierarchy",
    );
    expect(result.styles).not.toContain("data-experience-pack");
  });

  it("keeps visual findings when the structural evaluator already passes", async () => {
    let repairFindings: unknown[] = [];
    const result = await runCreativeRepairLoop({
      files: {
        experience: "<main></main>",
        styles: ".footer { color: #111; }",
        motion: "",
      },
      findings: [
        {
          category: "content-integrity",
          evidence: "Footer text is unreadable against the dark background.",
        },
      ],
      referenceDna: { familyId: "test" },
      generate: async ({ findings }: any) => {
        repairFindings = findings;
        return {
          experience: "<main></main>",
          styles: ".footer { color: #111; }",
          motion: "",
        };
      },
      evaluate: async () => ({ pass: true, findings: [] }),
      maxCycles: 2,
    });
    expect(repairFindings).toHaveLength(1);
    expect(result.pass).toBe(true);
    expect(result.files.styles).toContain(
      "launchloom-visual-repair: footer-contrast",
    );
  });

  it("fits long unbroken service titles on mobile", () => {
    const result = applyCreativeVisualSafetyRepairs(
      {
        experience: "<main />",
        styles: ".archive-row-name { font-size: 4rem; }",
        motion: "",
      },
      [
        {
          category: "content-integrity",
          severity: "critical",
          viewport: "mobile",
          evidence: "ASTROPHOTOGRAPHY is cut off at the right viewport edge.",
          recommendation: "Allow the long service title to wrap on mobile.",
        },
      ],
    );

    expect(result.styles).toContain("mobile-service-title-fit");
    expect(result.styles).toContain("overflow-wrap: break-word");
    expect(result.styles).toContain("word-break: normal");
    expect(result.styles).toContain(
      '[data-creative-host="true"] .archive-row-name',
    );
  });

  it("uses only deterministic safety repairs when the author returns malformed output", async () => {
    const result = await runCreativeRepairLoop({
      files: {
        experience: "<main></main>",
        styles: ".hero { background: var(--cream); }",
        motion: "",
      },
      findings: [
        {
          category: "content-integrity",
          evidence: "Hero heading is white-on-white on a light panel.",
        },
      ],
      referenceDna: { familyId: "test" },
      generate: async () => {
        throw new Error("OpenRouter returned malformed JSON");
      },
      evaluate: async (files: any) => ({
        pass: files.styles.includes("hero-host-collision"),
        findings: files.styles.includes("hero-host-collision")
          ? []
          : ["hero still collides"],
      }),
      maxCycles: 2,
    });
    expect(result.pass).toBe(true);
    expect(result.cyclesUsed).toBe(1);
    expect(result.authorAttempts).toBe(0);
    expect(result.generationFailures).toBe(1);
    expect(result.cycles[0].generationError).toContain("malformed JSON");
  });

  it("keeps malformed responses bounded without spending successful author attempts", async () => {
    const result = await runCreativeRepairLoop({
      files: { experience: "old", styles: "old", motion: "old" },
      referenceDna: { familyId: "test" },
      generate: async () => [],
      evaluate: async () => ({ pass: false, findings: ["still blocked"] }),
      maxCycles: 2,
    });
    expect(result.pass).toBe(false);
    expect(result.cyclesUsed).toBe(2);
    expect(result.authorAttempts).toBe(0);
    expect(result.generationFailures).toBe(2);
  });
});


describe("repair rejection ownership and privacy", () => {
  it("explicitly prohibits declaring or registering host palette roles", () => {
    expect(CLIENT_PALETTE_ROLE_CONTRACT).toContain("read-only");
    expect(CLIENT_PALETTE_ROLE_CONTRACT).toContain("Never declare, assign, override, or register");
    expect(CLIENT_PALETTE_ROLE_CONTRACT).toContain("--ll-creative-*");
  });

  it.each([
    [{ file: "styles", find: 42, replace: "safe" }, null, "invalid_find_type"],
    [{ file: "styles", find: "", replace: "safe" }, null, "empty_find"],
    [{ file: "styles", find: "x".repeat(6001), replace: "safe" }, null, "find_too_long"],
    [{ file: "styles", find: "safe", replace: 42 }, null, "invalid_replace_type"],
    [{ file: "styles", find: "safe", replace: "x".repeat(6001) }, null, "replace_too_long"],
    [{ file: "styles", find: "safe", replace: "different" }, 0, "find_missing"],
    [{ file: "styles", find: "safe", replace: "different" }, 2, "find_not_unique"],
  ])("classifies rejected fragments without serializing their contents", (edit, occurrences, code) => {
    const summary = (repairModule as any).repairRejectionSummary?.(edit, 0, occurrences);
    expect(summary).toEqual(expect.objectContaining({ editIndex: 1, file: "styles", codes: expect.arrayContaining([code]) }));
    expect(Object.keys(summary)).not.toContain("find");
    expect(Object.keys(summary)).not.toContain("replace");
  });

  it("redacts unsupported file names and retains only safe type/length metrics", () => {
    const summary = (repairModule as any).repairRejectionSummary?.({ file: "private@example.test", find: "PRIVATE_LITERAL", replace: "OTHER_PRIVATE_LITERAL" }, 0, 1);
    expect(summary).toEqual(expect.objectContaining({ file: null, findType: "string", findLength: 15, replaceLength: 21 }));
    expect(JSON.stringify(summary)).not.toMatch(/PRIVATE|private@example/);
  });

  it("retains truncated raw response privately without putting it on the thrown error", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ll-private-rejection-")); roots.push(root);
    const desktop = path.join(root, "desktop.png"); await fs.writeFile(desktop, "evidence");
    const raw = "PRIVATE_REPAIR_SENTINEL" + "x".repeat(300_000);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: raw } }] }))));
    let error: any;
    try { await requestRepair({ model: "test/model", referenceDna: { sectionSequence: repairSectionSequence, evidence: { desktopScreenshot: { path: desktop } } }, files: { experience: "old", styles: "old", motion: "old" }, findings: [], screenshots: [], logger: () => {} }); } catch (value) { error = value; }
    expect(error?.code).toBe("CREATIVE_REPAIR_OUTPUT_REJECTED");
    const evidence = (repairModule as any).privateRepairRejectionEvidence?.(error);
    expect(evidence).toEqual(expect.objectContaining({ totalChars: raw.length, storedChars: 256_000, truncated: true, sha256: createHash("sha256").update(raw).digest("hex") }));
    expect(evidence.payload).toBe(raw.slice(0, 256_000));
    const storedPath = await (renderedRepair as any).persistPrivateRepairRejection?.({ outDir: root, round: 1, candidateId: "candidate-a", attempt: 1, error });
    expect(typeof storedPath).toBe("string");
    expect(JSON.parse(await fs.readFile(storedPath, "utf8"))).toEqual(expect.objectContaining({ payload: raw.slice(0, 256_000), truncated: true }));
    expect(inspect(error)).not.toContain("PRIVATE_REPAIR_SENTINEL");
    expect(JSON.stringify(error)).not.toContain("PRIVATE_REPAIR_SENTINEL");
  });
});

it("does not expose malformed provider output through a parsing cause", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ll-malformed-repair-")); roots.push(root);
  const desktop = path.join(root, "desktop.png"); await fs.writeFile(desktop, "evidence");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "PRIVATE_REPAIR_SENTINEL" } }] }))));
  let error: any; try { await requestRepair({ model: "test/model", referenceDna: { sectionSequence: repairSectionSequence, evidence: { desktopScreenshot: { path: desktop } } }, files: { experience: "old", styles: "old", motion: "old" }, findings: [], screenshots: [], logger: () => {} }); } catch (value) { error = value; }
  expect(inspect(error)).not.toContain("PRIVATE_RE");
  expect((repairModule as any).privateRepairRejectionEvidence?.(error)?.payload).toBe("PRIVATE_REPAIR_SENTINEL");
});


it("automatic span repair binds current sources without model-generated find text", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ll-span-request-")); roots.push(root);
  const desktop = path.join(root, "desktop.png"); await fs.writeFile(desktop, "evidence");
  const files = { experience: "export default () => null;\n", styles: ".hero{color:navy;}\n", motion: "export function mountExperienceMotion(){return ()=>{};}\n" };
  const spanMod = await import("../scripts/creative-repair-spans.mjs");
  const catalog = spanMod.buildRepairSpanCatalog(files); const style = catalog.spans.find(s => s.file === "styles")!;
  const fetchImpl = vi.fn(async (_url: any, options: any) => {
    const body = JSON.parse(options.body); const schema = body.response_format.json_schema;
    expect(schema.name).toBe("launchloom_creative_repair_spans");
    expect(body.provider).toEqual(expect.objectContaining({ require_parameters: true }));
    expect(body.temperature).toBeUndefined();
    expect(schema.schema.properties.edits.minItems).toBe(1);
    expect(schema.schema.properties.edits.maxItems).toBe(3);
    expect(schema.schema.properties.edits.items.properties.replace).toEqual(expect.objectContaining({ pattern: "^[\\s\\S]{1,6000}$" }));
    const pattern=new RegExp(schema.schema.properties.edits.items.properties.replace.pattern,"u");
    expect(pattern.test("x\n".repeat(3000))).toBe(true); expect(pattern.test("")).toBe(false); expect(pattern.test("x".repeat(6001))).toBe(false);
    expect(schema.schema.properties.edits.items.required).toEqual(["spanId", "replace"]);
    expect(schema.schema.properties.edits.items.properties.spanId.enum).toContain(style.id);
    const text = body.messages[1].content.filter((x: any) => x.type === "text").map((x: any) => x.text).join("\n");
    expect(text).toContain(files.experience); expect(text).toContain(files.styles); expect(text).toContain(files.motion);
    expect(text).toContain("TRUSTED SOURCE SPANS"); expect(text).toContain("Do not generate find text");
    expect(text).toContain("REQUEST CHARACTER BUDGET"); expect(text).toContain("utf16-code-units");
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ edits: [{ spanId: style.id, replace: ".hero{color:white;}\n" }] }) } }] });
  });
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("unexpected global provider call"); }));
  const result = await requestRepair({ model: "test/model", referenceDna: { sectionSequence: repairSectionSequence, evidence: { desktopScreenshot: { path: desktop } } }, files, findings: ["contrast: hero"], screenshots: [], automaticSpanRepair: true, fetchImpl, logger: () => {} } as any);
  expect(result).toEqual({ ...files, styles: ".hero{color:white;}\n" }); expect(fetchImpl).toHaveBeenCalledTimes(1);
});


it("an affordability retry cannot exceed the actual-fetch experiment ceiling", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ll-affordability-budget-")); roots.push(root);
  const desktop = path.join(root, "desktop.png"); await fs.writeFile(desktop, "evidence");
  const { createQaRepairCallBudget } = await import("../scripts/creative-repair-experiment.mjs");
  const actual = vi.fn(async () => Response.json({ error: { message: "This request requires more credits, or fewer max_tokens. You requested up to 48000 tokens, but can only afford 14652." } }, { status: 402 }));
  const budget = createQaRepairCallBudget({ fetchImpl: actual });
  await expect(requestRepair({ model: "test/model", referenceDna: { sectionSequence: repairSectionSequence, evidence: { desktopScreenshot: { path: desktop } } }, files: { experience: "old", styles: ".hero{color:navy}", motion: "old" }, findings: ["contrast"], screenshots: [], logger: () => {}, automaticSpanRepair: true, fetchImpl: budget.forCandidate("candidate-a") } as any)).rejects.toMatchObject({ code: "QA_REPAIR_CALL_BUDGET_EXHAUSTED" });
  expect(actual).toHaveBeenCalledTimes(1); expect(budget.snapshot().total).toBe(1);
});

it("keeps provider HTTP-error payload private instead of exposing authored text", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ll-provider-error-")); roots.push(root);
  const desktop = path.join(root, "desktop.png"); await fs.writeFile(desktop, "evidence");
  const payload = { error: { message: "PRIVATE_HTTP_SENTINEL private@example.test", code: "provider-error" } };
  const fetchImpl = vi.fn(async () => Response.json(payload, { status: 400 }));
  let error: any;
  try { await requestRepair({ model: "test/model", referenceDna: { sectionSequence: repairSectionSequence, evidence: { desktopScreenshot: { path: desktop } } }, files: { experience: "old", styles: "old", motion: "old" }, findings: [], screenshots: [], logger: () => {}, fetchImpl } as any); } catch (value) { error = value; }
  expect(error?.message).toBe("OpenRouter creative repair failed (400).");
  expect(inspect(error)).not.toContain("PRIVATE_HTTP_SENTINEL");
  expect(JSON.stringify(error)).not.toContain("private@example.test");
  expect((repairModule as any).privateRepairRejectionEvidence(error)?.payload).toBe(JSON.stringify(payload));
});


it("does not expose an unexpected file name supplied by the provider", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ll-file-error-")); roots.push(root);
  const desktop = path.join(root, "desktop.png"); await fs.writeFile(desktop, "evidence");
  const fetchImpl = vi.fn(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ file: "PRIVATE_FILE_SENTINEL", source: "new" }) } }] }));
  let error: any; try { await requestRepair({ model: "test/model", referenceDna: { sectionSequence: repairSectionSequence, evidence: { desktopScreenshot: { path: desktop } } }, files: { experience: "old", styles: "/*" + "x".repeat(21000) + "*/", motion: "old" }, findings: ["contrast needs correction"], screenshots: [], logger: () => {}, fetchImpl } as any); } catch (value) { error = value; }
  expect(error?.code).toBe("CREATIVE_REPAIR_OUTPUT_REJECTED");
  expect(inspect(error)).not.toContain("PRIVATE_FILE_SENTINEL");
  expect((repairModule as any).privateRepairRejectionEvidence(error)?.payload).toContain("PRIVATE_FILE_SENTINEL");
});

it("refuses unsupported opt-in schema without stripping bounds or fetching again", async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"ll-schema-refusal-")); roots.push(root); const desktop=path.join(root,"desktop.png"); await fs.writeFile(desktop,"evidence");
  const budgetModule=await import("../scripts/creative-repair-experiment.mjs"); let actual=0;
  const budget=budgetModule.createQaRepairCallBudget({fetchImpl:async()=>{actual++; return Response.json({error:{message:"unsupported maxItems"}},{status:400});}});
  await expect(requestRepair({model:"test/model",referenceDna:{sectionSequence:repairSectionSequence,evidence:{desktopScreenshot:{path:desktop}}},files:{experience:"old",styles:".owned{color:navy}",motion:"old"},findings:[],screenshots:[],automaticSpanRepair:true,fetchImpl:budget.forCandidate("candidate-a"),logger:()=>{}} as any)).rejects.toThrow("OpenRouter creative repair failed (400).");
  expect(actual).toBe(1); expect(budget.snapshot().total).toBe(1);
});

it("refuses an opt-in response above its advertised edit ceiling even when global text fits", async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"ll-request-count-"));roots.push(root);const desktop=path.join(root,"desktop.png");await fs.writeFile(desktop,"evidence");
 const files={experience:"x\n",styles:".owned{color:navy}\n",motion:"z\n",servicePage:"a\n"};const index=buildRepairSpanCatalog(files);
 const fetchImpl=async()=>Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify({edits:index.spans.map(span=>({spanId:span.id,replace:span.find}))})}}]});
 await expect(requestRepair({model:"test/model",referenceDna:{sectionSequence:repairSectionSequence,evidence:{desktopScreenshot:{path:desktop}}},files,findings:[],screenshots:[],automaticSpanRepair:true,fetchImpl,logger:()=>{}} as any)).rejects.toThrow(/request.*3.*edit|edit.*ceiling/i);
});
