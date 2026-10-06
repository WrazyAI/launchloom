import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
let browser: Browser;
const auditModule = import("../scripts/rendered-contrast.mjs");
beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
});
async function scan(html: string, width = 1440, options = {}) {
  const audit = await auditModule;
  expect(audit.inspectContrastPage).toBeTypeOf("function");
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await page.setContent(`<body data-ll-route="/">${html}</body>`);
    return await audit.inspectContrastPage(page, { route: "/", ...options });
  } finally {
    await page.close();
  }
}

describe("rendered contrast backdrop geometry", () => {
  it.each([
    '<div class="paint" style="background:black"></div>',
    '<style>.paint::before{content:"";position:absolute;inset:0;background:black}</style><div class="paint"></div>',
    '<svg class="paint" width="300" height="100"><rect fill="black" width="300" height="100"/></svg>',
  ])("blocks unproven overlapping sibling paint: %s", async (paint) => {
    const report = await scan(
      `<style>body{background:white;color:black}.panel{position:relative;width:300px;height:100px}.paint{position:absolute;inset:0}.panel p{position:relative}</style><div class="panel">${paint}<p>Black over a black sibling</p></div>`,
      1440,
      { states: false },
    );
    expect(report.pass).toBe(false);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: "Black over a black sibling",
          status: "unresolved",
          repairEligible: false,
        }),
      ]),
    );
  });
  it.each([
    '<div style="height:200px;background:black"></div>',
    `<img width="300" height="200" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200'%3E%3Crect width='300' height='200' fill='black'/%3E%3C/svg%3E">`,
  ])(
    "proves a root positive-z opaque plate above rear paint: %s",
    async (paint) => {
      const report = await scan(
        `<style>body{color:black;background:white}a{position:fixed;top:30px;left:30px;z-index:2;background:black;color:white;padding:20px}</style>${paint}<a href="#">Readable foreground plate</a>`,
        1440,
        { states: false },
      );
      expect(report.pass, JSON.stringify(report.findings)).toBe(true);
    },
  );
  it("proves a pill plate only when glyph bounds lie inside its normalized fill", async () => {
    const report = await scan(
      '<style>body{color:black;background:white}.rear{height:200px;background:black}a{position:fixed;top:30px;left:30px;z-index:2;background:black;color:white;padding:20px;border-radius:999px}</style><div class="rear"></div><a href="#">Readable pill plate</a>',
      1440,
      { states: false },
    );
    expect(report.pass, JSON.stringify(report.findings)).toBe(true);
  });
  it("does not prove glyphs outside a rounded plate fill", async () => {
    const report = await scan(
      '<style>body{background:white}.rear{height:200px;background:white}a{position:fixed;top:30px;left:30px;z-index:2;background:black;color:white;width:100px;height:100px;border-radius:50%;line-height:16px;font-size:12px}</style><div class="rear"></div><a href="#">Outside</a>',
      1440,
      { states: false },
    );
    expect(report.pass).toBe(false);
    expect(report.findings[0].status).toBe("unresolved");
  });
  it("does not let a local plate prove paint above its stacking context", async () => {
    const report = await scan(
      '<style>a{position:fixed;top:30px;left:30px;z-index:2;background:black;color:white;padding:20px}.front{position:fixed;inset:0;z-index:3;background:rgba(255,255,255,.5);pointer-events:none}</style><a href="#">Covered by foreground paint</a><div class="front"></div>',
      1440,
      { states: false },
    );
    expect(report.pass).toBe(false);
    expect(report.findings[0].status).toBe("unresolved");
  });
  it("keeps contrast independent of proven opaque foreground occlusion", async () => {
    const report = await scan(
      '<style>input{width:300px;height:100px;background:white;color:black;border:2px solid black}.front{position:fixed;left:200px;top:30px;width:200px;height:100px;z-index:3;background:black;border-radius:999px}</style><input value="Readable field"><div class="front"></div>',
      1440,
      { states: false },
    );
    expect(report.pass, JSON.stringify(report.findings)).toBe(true);
  });
  it("does not ignore translucent shadow around an opaque foreground plate", async () => {
    const report = await scan(
      '<style>input{width:300px;height:100px;background:white;color:black;border:2px solid black}.front{position:fixed;left:200px;top:30px;width:200px;height:100px;z-index:3;background:black;border-radius:999px;box-shadow:0 0 0 100px #fffc}</style><input value="Shadow-composited field"><div class="front"></div>',
      1440,
      { states: false },
    );
    expect(report.pass).toBe(false);
    expect(report.findings[0].status).toBe("unresolved");
  });
  it("proves an inset focus ring inside a nested fixed pill above sibling paint", async () => {
    const report = await scan(
      '<style>body{background:white}.rear{position:relative;isolation:isolate;min-height:900px;background:#10211f}.shell{position:fixed;left:24px;bottom:24px;z-index:16;isolation:isolate;display:flex;border-radius:999px;background:#205d51}.shell button{position:relative;z-index:1;isolation:isolate;border:0;border-radius:999px;padding:12px 17px;background:#205d51;color:white}.shell button:focus-visible{outline:3px solid white;outline-offset:-5px}</style><div class="rear"></div><aside class="shell"><button type="button">Got questions?</button></aside>',
      1440,
    );
    expect(report.pass, JSON.stringify(report.findings)).toBe(true);
  });
  it("does not use a text-clipped background as an opaque plate", async () => {
    const report = await scan(
      "<style>body{background:white}p{color:white;background:black;background-clip:text}</style><p>White over white canvas</p>",
      1440,
      { states: false },
    );
    expect(report.pass).toBe(false);
    expect(report.findings[0].repairEligible).toBe(false);
  });
});
