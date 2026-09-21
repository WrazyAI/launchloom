import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { applyCreativeVisualSafetyRepairs, requestRepair, resolveReferenceEvidencePath, runCreativeRepairLoop } from "../scripts/creative-repair-loop.mjs";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("creative repair loop", () => {
  it("prefers an accessible absolute reference evidence path", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-repair-evidence-"));
    roots.push(root);
    const absolutePath = path.join(root, "reference.png");
    await fs.writeFile(absolutePath, "reference");

    await expect(resolveReferenceEvidencePath({
      path: "missing/repository-relative.png",
      absolutePath,
    })).resolves.toBe(absolutePath);
  });

  it("loads reference screenshots through absolute paths when relative paths are unavailable", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-repair-"));
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    const mobile = path.join(root, "mobile.png");
    await fs.writeFile(desktop, "desktop-evidence");
    await fs.writeFile(mobile, "mobile-evidence");
    const repaired = { experience: "fixed", styles: "fixed", motion: "fixed" };
    const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(repaired) } }],
    })));
    vi.stubGlobal("fetch", fetchMock);

    expect(await requestRepair({
      model: "test/model",
      referenceDna: { evidence: {
        desktopScreenshot: { path: path.join(root, "missing-desktop.png"), absolutePath: desktop },
        mobileScreenshot: { path: path.join(root, "missing-mobile.png"), absolutePath: mobile },
      } },
      findings: [],
      files: repaired,
      screenshots: [],
    })).toEqual(repaired);
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const images = body.messages[1].content.filter((part: any) => part.type === "image_url");
    expect(images.map((part: any) => part.image_url.url)).toEqual([
      `data:image/png;base64,${Buffer.from("desktop-evidence").toString("base64")}`,
      `data:image/png;base64,${Buffer.from("mobile-evidence").toString("base64")}`,
    ]);
  });

  it("authorizes requested composition changes only for explicit human review findings", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-human-repair-prompt-"));
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const repaired = { experience: "fixed", styles: "fixed", motion: "fixed" };
    const fetchMock = vi.fn(async (_url: string, options: RequestInit) =>
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
    const prompt = body.messages[1].content[0].text;
    expect(prompt).toContain(
      "The reviewer is authorized to change composition",
    );
    expect(prompt).toContain("Move the CTA below the gallery.");
    expect(prompt).not.toContain(
      "Preserve its composition and sealed content bindings.",
    );
  });

  it.each([
    undefined,
    {},
    { available: true },
    { available: false, path: "desktop.png" },
  ])("fails terminally before requesting a repair for invalid desktop evidence %j", async (desktopScreenshot) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const evaluate = vi.fn(async () => ({ pass: true, findings: [] }));
    await expect(runCreativeRepairLoop({
      files: { experience: "old", styles: "old", motion: "old" },
      referenceDna: { evidence: { desktopScreenshot } },
      findings: [{ evidence: "Hero heading is white-on-white on a light panel." }],
      generate: (request: any) => requestRepair({ model: "test/model", ...request }),
      evaluate,
    })).rejects.toThrow("Creative repair requires desktop reference evidence");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(evaluate).toHaveBeenCalledOnce();
  });

  it.each([undefined, {}, { available: false, path: "missing-mobile.png" }])("keeps mobile reference evidence optional: %j", async (mobileScreenshot) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-repair-"));
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const repaired = { experience: "fixed", styles: "fixed", motion: "fixed" };
    const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(repaired) } }],
    })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestRepair({
      model: "test/model",
      referenceDna: { evidence: { desktopScreenshot: { path: desktop }, mobileScreenshot } },
      findings: [],
      files: repaired,
      screenshots: [],
    })).resolves.toEqual(repaired);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[1].content.filter((part: any) => part.type === "image_url")).toHaveLength(1);
  });

  it.each([
    ["desktopScreenshot", false],
    ["desktopScreenshot", true],
    ["mobileScreenshot", false],
    ["mobileScreenshot", true],
  ] as const)("fails terminally for unreadable %s (directory: %s) instead of applying safety repairs", async (kind, directory) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-repair-"));
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const evaluate = vi.fn(async () => ({ pass: true, findings: [] }));
    await expect(runCreativeRepairLoop({
      files: { experience: "old", styles: "old", motion: "old" },
      referenceDna: { evidence: {
        desktopScreenshot: { path: desktop },
        [kind]: {
          path: path.join(root, "missing.png"),
          absolutePath: directory ? root : path.join(root, "also-missing.png"),
        },
      } },
      findings: [{ evidence: "Hero heading is white-on-white on a light panel." }],
      generate: (request: any) => requestRepair({ model: "test/model", ...request }),
      evaluate,
    })).rejects.toThrow("Creative repair cannot load required reference evidence");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(evaluate).toHaveBeenCalledOnce();
  });

  it("repairs at most two cycles and returns the passing source", async () => {
    let calls = 0;
    const result = await runCreativeRepairLoop({
      files: { experience: "old", styles: "old", motion: "old" },
      referenceDna: { familyId: "test" },
      generate: async ({ cycle }: any) => { calls += 1; return { experience: `fixed-${cycle}`, styles: "fixed", motion: "fixed" }; },
      evaluate: async (files: any) => ({ pass: files.experience === "fixed-2", findings: files.experience === "fixed-2" ? [] : ["still generic"] }),
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
      generate: async () => ({ experience: "still-old", styles: "still-old", motion: "still-old" }),
      evaluate: async () => ({ pass: false, findings: ["not fixed"] }),
      maxCycles: 2,
    });
    expect(result.pass).toBe(false);
    expect(result.cyclesUsed).toBe(2);
  });

  it("applies only scoped repairs for measured footer and mobile CTA defects", () => {
    const result = applyCreativeVisualSafetyRepairs(
      { experience: "<main></main>", styles: ".footer { color: #111; }", motion: "" },
      [
        {
          category: "content-integrity",
          evidence: "Footer brand is unreadable against the dark background and clipped at the top edge.",
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
          evidence: "On mobile the navigation is hidden and no menu is visible.",
        },
        {
          category: "hierarchy",
          evidence: "The services intro is an oversized five-line display heading that dwarfs the service rows.",
        },
      ],
    );
    expect(result.styles).toContain("launchloom-visual-repair: footer-contrast");
    expect(result.styles).toContain("launchloom-visual-repair: conversion-clearance");
    expect(result.styles).toContain("launchloom-visual-repair: hero-host-collision");
    expect(result.styles).toContain("launchloom-visual-repair: mobile-navigation-visibility");
    expect(result.styles).toContain('body:has([data-creative-host="true"]) .quick-answers');
    expect(result.styles).toContain('[data-creative-host="true"] a[data-navigation-geometry="fixed-bottom-conversation-pill"]');
    expect(result.styles).toContain("launchloom-visual-repair: service-intro-hierarchy");
    expect(result.styles).not.toContain("data-experience-pack");
  });

  it("keeps visual findings when the structural evaluator already passes", async () => {
    let repairFindings: unknown[] = [];
    const result = await runCreativeRepairLoop({
      files: { experience: "<main></main>", styles: ".footer { color: #111; }", motion: "" },
      findings: [{ category: "content-integrity", evidence: "Footer text is unreadable against the dark background." }],
      referenceDna: { familyId: "test" },
      generate: async ({ findings }: any) => {
        repairFindings = findings;
        return { experience: "<main></main>", styles: ".footer { color: #111; }", motion: "" };
      },
      evaluate: async () => ({ pass: true, findings: [] }),
      maxCycles: 2,
    });
    expect(repairFindings).toHaveLength(1);
    expect(result.pass).toBe(true);
    expect(result.files.styles).toContain("launchloom-visual-repair: footer-contrast");
  });

  it("fits long unbroken service titles on mobile", () => {
    const result = applyCreativeVisualSafetyRepairs(
      { experience: "<main />", styles: ".archive-row-name { font-size: 4rem; }", motion: "" },
      [{
        category: "content-integrity",
        severity: "critical",
        viewport: "mobile",
        evidence: "ASTROPHOTOGRAPHY is cut off at the right viewport edge.",
        recommendation: "Allow the long service title to wrap on mobile.",
      }],
    );

    expect(result.styles).toContain("mobile-service-title-fit");
    expect(result.styles).toContain("overflow-wrap: break-word");
    expect(result.styles).toContain("word-break: normal");
    expect(result.styles).toContain('[data-creative-host="true"] .archive-row-name');
  });

  it("uses only deterministic safety repairs when the author returns malformed output", async () => {
    const result = await runCreativeRepairLoop({
      files: { experience: "<main></main>", styles: ".hero { background: var(--cream); }", motion: "" },
      findings: [{ category: "content-integrity", evidence: "Hero heading is white-on-white on a light panel." }],
      referenceDna: { familyId: "test" },
      generate: async () => { throw new Error("OpenRouter returned malformed JSON"); },
      evaluate: async (files: any) => ({
        pass: files.styles.includes("hero-host-collision"),
        findings: files.styles.includes("hero-host-collision") ? [] : ["hero still collides"],
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
