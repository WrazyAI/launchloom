import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
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
  it("uses a generous repair completion budget and reports bounded response diagnostics", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-repair-budget-"),
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
      files: repaired,
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
          category: "human-review-feedback",
          message: "Move the CTA below the gallery.",
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
      "The reviewer is authorized to change composition",
    );
    expect(prompt).toContain("Move the CTA below the gallery.");
    expect(prompt).not.toContain(
      "Preserve its composition and sealed content bindings.",
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
    expect(prompt).not.toContain(
      "Preserve its composition and sealed content bindings.",
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
