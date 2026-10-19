import { afterEach, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import {
  collectContrastTargets,
  decodeRgbaPixels,
  resolveRenderedBackdrop,
  worstCasePixelRatio,
} from "../scripts/rendered-contrast.mjs";

const browsers: Array<any> = [];

afterEach(async () => {
  await Promise.all(
    browsers.splice(0).map((browser) => browser.close().catch(() => {})),
  );
});

async function fixturePage() {
  const browser = await chromium.launch({ headless: true });
  browsers.push(browser);
  const page = await browser.newPage({ viewport: { width: 800, height: 400 } });
  await page.setContent(`
    <style>
      body { margin: 0; background: #ffffff; }
      .wrap { position: relative; width: 360px; height: 60px; }
      .deco { position: absolute; inset: 0; background: #efefef; }
      .deco-dark { position: absolute; inset: 0; background: #a0a0a0; }
      .txt { position: relative; font: 16px/60px sans-serif; }
      .filtered { filter: blur(0.6px); }
    </style>
    <div class="wrap" id="good-wrap">
      <div class="deco"></div>
      <div class="txt" id="good" style="color:#101010">Readable overlapping text</div>
    </div>
    <div class="wrap" id="bad-wrap">
      <div class="deco-dark"></div>
      <div class="txt" id="bad" style="color:#a2a2a2">Low contrast overlapping text</div>
    </div>
    <div class="wrap filtered" id="filtered-wrap">
      <div class="txt" id="filtered" style="color:#151515; background:#ffffff">Filtered readable text</div>
    </div>
  `);
  return page;
}

function target(overrides: Record<string, any>) {
  return {
    kind: "text",
    state: "default",
    status: "unresolved",
    minimum: 4.5,
    issues: ["overlapping non-ancestor paint requires rendered review"],
    rect: { x: 0, y: 0, width: 360, height: 60 },
    ...overrides,
  };
}

describe("rendered pixel contrast resolution", () => {
  it("computes the worst-case ratio against decoded pixels", async () => {
    // White text over black pixels is 21:1.
    const black = new Uint8Array([0, 0, 0, 255, 0, 0, 0, 255]);
    expect(worstCasePixelRatio([255, 255, 255, 1], black)).toBeCloseTo(21, 1);
    // Near-identical text and backdrop pixels are worst case.
    const gray = new Uint8Array([165, 165, 165, 255]);
    expect(worstCasePixelRatio([162, 162, 162, 1], gray)).toBeLessThan(1.2);
    // The worst pixel wins over favorable ones.
    const mixed = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]);
    expect(worstCasePixelRatio([255, 255, 255, 1], mixed)).toBeCloseTo(1, 1);
  });

  it("decodes screenshots into strided RGBA samples", async () => {
    const sharp = (await import("sharp")).default;
    const png = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .png()
      .toBuffer();
    const { pixels, width, height } = await decodeRgbaPixels(png);
    expect(width).toBe(8);
    expect(height).toBe(8);
    expect(pixels.length).toBeGreaterThanOrEqual(4);
    expect(Array.from(pixels.slice(0, 4))).toEqual([10, 20, 30, 255]);
  });

  it("resolves bail classes from pixels and rules on the actual contrast", async () => {
    const page = await fixturePage();
    const targets: any[] = [
      target({ selector: "#good", foreground: [16, 16, 16, 1] }),
      target({ selector: "#bad", foreground: [162, 162, 162, 1] }),
      target({
        selector: "#filtered",
        foreground: [21, 21, 21, 1],
        issues: ["filter, blend, backdrop-filter or group opacity"],
      }),
      target({ selector: "#missing", foreground: [0, 0, 0, 1] }),
    ];
    const result = await resolveRenderedBackdrop(page, targets);
    expect(result.attempted).toBe(4);
    expect(result.resolved).toBe(3);
    expect(result.failed).toBe(1);
    expect(targets[0]).toMatchObject({
      status: "pass",
      pixelResolved: true,
    });
    expect(targets[1].status).toBe("fail");
    expect(targets[1].ratio).toBeLessThan(4.5);
    expect(targets[2].status).toBe("pass");
    // The measured backdrop extremes travel with the resolution so bounded
    // repairs can prove a corrected foreground against real pixels.
    expect(targets[0].pixelBackdrop).toMatchObject({
      dark: expect.stringMatching(/^#[0-9a-f]{6}$/),
      light: expect.stringMatching(/^#[0-9a-f]{6}$/),
    });
    // Fail closed: an unlocatable element stays unresolved.
    expect(targets[3].status).toBe("unresolved");
    expect(targets[3].pixelResolved).toBeUndefined();
  }, 20000);

  it("re-measures a variable-backdrop text fail and an icon from pixels", async () => {
    const page = await fixturePage();
    // A readable dark icon part on the light page; the DOM cannot bound its
    // backdrop, the pixels can.
    await page.evaluate(() => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", "Icon");
      svg.setAttribute("width", "16");
      svg.setAttribute("height", "16");
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("fill", "#111111");
      rect.setAttribute("width", "16");
      rect.setAttribute("height", "16");
      svg.appendChild(rect);
      document.body.appendChild(svg);
    });
    const targets: any[] = [
      // Variable-backdrop text fail from the DOM endpoint estimate.
      target({
        selector: "#good",
        foreground: [16, 16, 16, 1],
        status: "fail",
        ratio: 1,
        background: null,
        issues: ["overlapping non-ancestor paint requires rendered review"],
      }),
      target({
        selector: 'svg[role="img"] rect',
        kind: "icon",
        foreground: [16, 16, 16, 1],
        status: "fail",
        ratio: 1,
        background: null,
        issues: ["overlapping non-ancestor paint requires rendered review"],
      }),
    ];
    await resolveRenderedBackdrop(page, targets);
    // Dark text on the light overlapping field is actually readable: the
    // conservative DOM fail is overturned by the measured pixels.
    expect(targets[0]).toMatchObject({
      status: "pass",
      pixelResolved: true,
    });
    expect(targets[0].ratio).toBeGreaterThan(4.5);
    // The icon is measurably readable on the page surface.
    expect(targets[1]).toMatchObject({
      status: "pass",
      pixelResolved: true,
    });
  }, 20000);

  it("resolves real collected targets by their nth-of-type selectors", async () => {
    const page = await fixturePage();
    const collected = await page.evaluate(collectContrastTargets, {
      route: "/",
      state: "default",
    });
    const overlay = collected.find(
      (entry: any) => entry.kind === "text" && entry.text.includes("Low contrast"),
    );
    expect(overlay).toBeTruthy();
    const { measure } = await import("../scripts/rendered-contrast.mjs");
    const measured = measure(overlay);
    const targets = collected.map(measure);
    const result = await resolveRenderedBackdrop(page, targets);
    expect(result.resolved).toBeGreaterThan(0);
    const resolvedOverlay = targets.find(
      (entry: any) => entry.text === measured.text,
    );
    expect(resolvedOverlay?.status).toBe("fail");
    expect(resolvedOverlay?.pixelResolved).toBe(true);
    expect(resolvedOverlay?.issues).toContain("resolved from rendered pixels");
  }, 20000);
});
