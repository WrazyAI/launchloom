import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  applyCreativeRepairEdits,
  applyCreativeVisualSafetyRepairs,
  requestRepair,
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
    expect(prompt).toContain('"sectionIds": [\n    "hero"');
    expect(prompt).toContain("never complete files");
    expect(prompt).toContain("Improve the hero layout.");
    expect(result).toEqual(edits);
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
                "This request requires more credits, or fewer max_tokens. You requested up to 48000 tokens, but can only afford 30273.",
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
    expect(retryBody.max_completion_tokens).toBe(29249);
    expect(diagnostics.join(" ")).toContain(
      "creative_repair_retry reason=provider-affordability requested_max_completion_tokens=48000 retry_max_completion_tokens=29249",
    );
    expect(diagnostics.join(" ")).toContain(
      "creative_completion stage=creative-repair finish_reason=stop max_completion_tokens=29249 completion_tokens=3456 reasoning_tokens=321",
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

  it("splits large repairs by source file while preserving the frozen max-effort session", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-repair-file-scope-"),
    );
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const sourceFiles = {
      experience: "original JSX",
      styles: "x".repeat(21000),
      motion: "original motion",
    };
    const repaired = {
      experience: "complete JSX",
      styles: "complete CSS",
      motion: "complete motion",
    };
    const responses = [
      {
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                file: "experience",
                content: repaired.experience,
              }),
            },
          },
        ],
        usage: {
          completion_tokens: 1200,
          completion_tokens_details: { reasoning_tokens: 700 },
        },
      },
      {
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                file: "styles",
                content: repaired.styles,
              }),
            },
          },
        ],
        usage: {
          completion_tokens: 1100,
          completion_tokens_details: { reasoning_tokens: 650 },
        },
      },
      {
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                file: "motion",
                content: repaired.motion,
              }),
            },
          },
        ],
        usage: {
          completion_tokens: 800,
          completion_tokens_details: { reasoning_tokens: 500 },
        },
      },
    ];
    const fetchMock = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(JSON.stringify(responses.shift())),
    );
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
        { category: "palette-adherence", evidence: "Palette mismatch" },
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
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const bodies = fetchMock.mock.calls.map((call) =>
      JSON.parse(call[1].body as string),
    );
    expect(bodies.map((body) => body.reasoning.effort)).toEqual([
      "max",
      "max",
      "max",
    ]);
    expect(new Set(bodies.map((body) => body.session_id))).toEqual(
      new Set(["launchloom:creative:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]),
    );
    expect(
      bodies.map((body) => body.response_format.json_schema.schema.required),
    ).toEqual([
      ["file", "content"],
      ["file", "content"],
      ["file", "content"],
    ]);
    expect(
      bodies.map(
        (body) => body.response_format.json_schema.schema.properties.file.enum,
      ),
    ).toEqual([
      ["experience", "styles", "motion"],
      ["experience", "styles", "motion"],
      ["experience", "styles", "motion"],
    ]);
    const targetPrompts = bodies.map(
      (body) =>
        body.messages[1].content
          .filter(
            (part: { type: string; text?: string }) => part.type === "text",
          )
          .map((part: { text?: string }) => part.text || "")
          .join("\n")
          .match(/REPAIR TARGET: (experience|styles|motion)/u)?.[1],
    );
    expect(targetPrompts).toEqual(["experience", "styles", "motion"]);
    expect(diagnostics.join(" ")).not.toContain("from=max to=xhigh");
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
    expect(prompt).toContain(
      "Do not repair toward a generic LaunchLoom house style",
    );
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
    const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      const prompt = body.messages[1].content
        .filter((part: { type: string; text?: string }) => part.type === "text")
        .map((part: { text?: string }) => part.text || "")
        .join("\n");
      const target = prompt.match(
        /REPAIR TARGET: (experience|styles|motion)/u,
      )?.[1];
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  file: target,
                  content:
                    target === "motion"
                      ? "export function mountExperienceMotion(runtime) { return () => {}; }"
                      : files[target as keyof typeof files],
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
    const bodies = fetchMock.mock.calls.map((call) =>
      JSON.parse(call[1].body as string),
    );
    const motionPrompt = bodies[2].messages[1].content
      .filter((part: { type: string; text?: string }) => part.type === "text")
      .map((part: { text?: string }) => part.text || "")
      .join("\n");
    expect(motionPrompt).toContain("REPAIR TARGET: motion");
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

  it("rejects empty file-scoped repair output with completion diagnostics", async () => {
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
                  content: JSON.stringify({
                    file: "experience",
                    content: "  ",
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
        findings: [{ category: "visual", message: "Fix the hero layout." }],
        files,
        screenshots: [],
      }),
    ).rejects.toThrow(
      /returned an empty experience file.*finish_reason=stop/iu,
    );
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
