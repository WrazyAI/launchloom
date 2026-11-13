import { afterEach, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import {
  collectContrastTargets,
  decodeRgbaPixels,
  resolveRenderedBackdrop,
  worstCasePixelRatio,
  uniformOpaqueBackground,
  flatContrastRatio,
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

describe("uniform opaque backdrop resolution", () => {
  it("prefers a provable DOM pair over a neighbouring pixel plate", () => {
    expect(flatContrastRatio([255, 255, 255, 1], [15, 61, 62, 1])).toBeGreaterThan(4.5);
    expect(flatContrastRatio([20, 32, 29, 1], [248, 246, 240, 1])).toBeGreaterThan(4.5);
    expect(uniformOpaqueBackground([[15, 61, 62, 1], [15, 61, 62, 1]])).toEqual([15, 61, 62, 1]);
    expect(uniformOpaqueBackground([[0, 0, 0, 1], [255, 255, 255, 1]])).toBeNull();
  });
});

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

describe("focus ring band capture", () => {
  // Measured production bug: an outset ring paints outside the border box, so
  // an element-box screenshot never contains it. Hiding the ring then changes
  // no pixels, and the checker scored a clearly visible ring 1.000
  // ("indistinguishable from its rendered backdrop"). These assertions pin the
  // geometry that makes the padded band necessary.
  async function ringPage() {
    const browser = await chromium.launch({ headless: true });
    browsers.push(browser);
    const page = await browser.newPage({
      viewport: { width: 800, height: 400 },
    });
    await page.setContent(`
      <style>
        body { margin: 0; background: #f8f6f0; }
        header { background: #f8f6f0; padding: 40px; }
        header a { display: inline-block; line-height: 0; }
        header :where(a):focus-visible {
          outline: 2px solid #bd552d;
          outline-offset: 3px;
        }
        header img { width: 48px; height: 48px; display: block; }
      </style>
      <header>
        <a href="#" id="logo" aria-label="Home">
          <img alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect width='48' height='48' fill='%2314201d'/%3E%3C/svg%3E">
        </a>
      </header>
    `);
    return page;
  }

  const maxDelta = (a: Uint8Array, b: Uint8Array) => {
    let worst = 0;
    for (let index = 0; index < Math.min(a.length, b.length); index += 1)
      worst = Math.max(worst, Math.abs(a[index] - b[index]));
    return worst;
  };

  it("proves an outset ring is invisible to an element-box capture", async () => {
    const page = await ringPage();
    await page.keyboard.press("Tab");
    const locator = page.locator("#logo");
    const withRing = (
      await decodeRgbaPixels(await locator.screenshot({ type: "png" }))
    ).pixels;
    await locator.evaluate((element) =>
      element.setAttribute("style", "outline-color:transparent !important"),
    );
    const withoutRing = (
      await decodeRgbaPixels(await locator.screenshot({ type: "png" }))
    ).pixels;
    // The ring contributes nothing inside the border box: the capture is blind
    // to it, which is exactly why the old code false-reported 1.000.
    expect(maxDelta(withRing, withoutRing)).toBe(0);
  });

  it("shows the same ring in a padded band capture", async () => {
    const page = await ringPage();
    await page.keyboard.press("Tab");
    const locator = page.locator("#logo");
    const rect = await locator.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        pad:
          (parseFloat(style.outlineOffset) || 0) +
          (parseFloat(style.outlineWidth) || 0) +
          5,
      };
    });
    const clip = {
      x: rect.x - rect.pad,
      y: rect.y - rect.pad,
      width: rect.width + rect.pad * 2,
      height: rect.height + rect.pad * 2,
    };
    const withRing = (
      await decodeRgbaPixels(await page.screenshot({ type: "png", clip }))
    ).pixels;
    await locator.evaluate((element) =>
      element.setAttribute("style", "outline-color:transparent !important"),
    );
    const withoutRing = (
      await decodeRgbaPixels(await page.screenshot({ type: "png", clip }))
    ).pixels;
    // The padded band does contain the ring, so hiding it is detectable.
    expect(maxDelta(withRing, withoutRing)).toBeGreaterThan(50);
  });
});

describe("text backdrop sampling scope", () => {
  // Measured production regression (intake 146, run 43483476413): the hero
  // phone link read 1.000 twice with two different foregrounds, and the hero
  // button read 1.180. Each time the element plate contained pixels that are
  // not the backdrop behind the text: the link's own 1px border in the text
  // colour, and a sliver of the surrounding panel caught at the element
  // screenshot edge. The text was readable (13.2:1 and 5.4:1), so a readable
  // control must not fail on its own painted edge.
  async function heroPage() {
    const browser = await chromium.launch({ headless: true });
    browsers.push(browser);
    const page = await browser.newPage({
      viewport: { width: 1536, height: 864 },
    });
    await page.setContent(`
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; background: #f8f6f0; }
        .hero { position: relative; height: 540px; background: #14201d; }
        .photo { position: absolute; inset: 0;
                 background: linear-gradient(120deg,#2b3a34,#0d1512 60%,#3d4a42); }
        .panel { position: absolute; left: 56.4px; bottom: 40px; width: 560px;
                 padding: 28px; background: #e8eee5; color: #14201d; }
        .actions { display: flex; gap: 12px; align-items: center; }
        .btn { display: inline-flex; align-items: center; min-height: 48px;
               padding: 0 22px; border: 1px solid transparent;
               font: 700 14.7px/1 sans-serif; text-decoration: none; }
        .quiet { background: #e8eee5; color: #14201d; border-color: #14201d; }
        .primary { background: #7cd5c1; color: #000; border-color: #7cd5c1; }
        .primary:hover { background: #027262; color: #ffffff; border-color: #027262; }
      </style>
      <div class="hero"><div class="photo"></div>
        <div class="panel">
          <div class="actions">
            <a class="btn primary" href="#x">Call now</a>
            <a class="btn quiet" id="quiet" href="#y">0598020802</a>
          </div>
        </div>
      </div>
    `);
    return page;
  }

  it("does not sample the element's own border as the text backdrop", async () => {
    const { inspectContrastPage } = await import(
      "../scripts/rendered-contrast.mjs"
    );
    const page = await heroPage();
    const report = await inspectContrastPage(page, { route: "/", states: false });
    // Border and text are both #14201d; the surface behind the label is #e8eee5.
    const quiet = (report.targets || []).find(
      (entry: any) => entry.text === "0598020802" && entry.kind === "text",
    );
    expect(quiet).toBeTruthy();
    expect(quiet.status).toBe("pass");
    expect(quiet.ratio).toBeGreaterThan(12);
  }, 40000);

  it("does not sample the surrounding panel at the element edge", async () => {
    const { inspectContrastPage } = await import(
      "../scripts/rendered-contrast.mjs"
    );
    const page = await heroPage();
    const report = await inspectContrastPage(page, { route: "/", states: true });
    // White label on the #027262 hover fill; the panel is #e8eee5.
    const hoveredPrimary = (report.targets || []).find(
      (entry: any) =>
        entry.text === "Call now" &&
        entry.state === "hover" &&
        entry.color === "#ffffff",
    );
    expect(hoveredPrimary).toBeTruthy();
    expect(hoveredPrimary.status).toBe("pass");
    expect(hoveredPrimary.ratio).toBeGreaterThan(4.5);
  }, 60000);
});
