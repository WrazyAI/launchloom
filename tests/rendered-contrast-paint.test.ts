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
  it("proves an opaque nav plate inside a positive-z header over negative-z hero media", async () => {
    const report = await scan(
      '<style>body{margin:0;background:#fff}.hero{position:relative;isolation:isolate;width:600px;height:240px;background:#f8f6f0;color:#14201d}.hero__media{position:absolute;z-index:-1;inset:0;overflow:hidden;background:#222}.hero__media img{display:block;width:100%;height:100%;object-fit:cover;transform:scale(1.01)}.hero__header{position:absolute;z-index:3;top:0;left:0;right:0}.hero__nav{display:flex;min-height:58px;padding:18px;background:#f8f6f0;color:#14201d}.hero__nav a{color:#14201d}</style><section class="hero"><div class="hero__media"><img alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></div><header class="hero__header"><nav class="hero__nav"><a href="#">Juniper &amp; Loaf Bakehouse</a></nav></header></section>',
      1440,
      { states: false },
    );
    expect(report.pass, JSON.stringify(report.findings)).toBe(true);
  });
  it("does not treat a proven non-overlapping decorative pseudo marker as text backdrop", async () => {
    const report = await scan(
      '<style>body{margin:0;background:#e8eee5;color:#14201d}ul{margin:0;padding:0;list-style:none}li{position:relative;width:320px;padding:8px 8px 8px 24px;color:#14201d}li::before{position:absolute;top:14px;left:4px;width:6px;height:6px;border-radius:50%;background:#c8ec58;content:""}</style><ul><li>Service coverage in Tacoma, Washington</li></ul>',
      1440,
      { states: false },
    );
    expect(report.pass, JSON.stringify(report.findings)).toBe(true);
  });
  it("keeps overlapping pseudo-element paint unresolved", async () => {
    const report = await scan(
      '<style>body{margin:0;background:#e8eee5;color:#14201d}li{position:relative;width:320px;color:#14201d}li::before{position:absolute;inset:0;background:#000;content:""}</style><ul><li>Text over a pseudo backdrop</li></ul>',
      1440,
      { states: false },
    );
    expect(report.pass).toBe(false);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: "Text over a pseudo backdrop",
          status: "unresolved",
        }),
      ]),
    );
  });
  it("does not prove pseudo-element separation through a transformed owner", async () => {
    const report = await scan(
      '<style>body{margin:0;background:#e8eee5;color:#14201d}li{position:relative;width:320px;padding:8px 8px 8px 120px;color:#14201d;transform:rotate(45deg)}li::before{position:absolute;top:0;left:0;width:6px;height:6px;background:#c8ec58;content:""}</style><ul><li>Service coverage in Tacoma, Washington</li></ul>',
      1440,
      { states: false },
    );
    expect(report.pass).toBe(false);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: "Service coverage in Tacoma, Washington",
          status: "unresolved",
        }),
      ]),
    );
  });
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

describe("bounded deterministic plate repairs", () => {
  const plateCss = (selector: string, surface: string, color: string) =>
    `${selector}{position:relative!important;z-index:3!important;background-color:${surface}!important;background-image:none!important;color:${color}!important;padding:.1em .35em!important;box-sizing:border-box;box-decoration-break:clone;isolation:isolate}${selector}::before,${selector}::after{content:none!important}`;

  it("clears an own pseudo backdrop only with the plate, and reports the local role pair", async () => {
    const html = (plate: string) =>
      `<style>body{margin:0;background:#fff}[data-ll-surface="hero"]{--ll-surface:#1d3143;--ll-text:#f4f1ea;background-color:#1d3143;color:#f4f1ea;padding:40px}.kicker{color:#71652f;font-size:12px;margin:0}.kicker::before{content:"";display:block;width:60px;height:1px;margin-bottom:8px;background:#8a7d48}${plate}</style><div data-ll-surface="hero"><p class="kicker">Estate law, explained plainly</p></div>`;
    const without = await scan(html(""), 1440, { states: false });
    expect(without.pass).toBe(false);
    const finding = without.findings.find(
      (f: any) => f.text === "Estate law, explained plainly",
    );
    expect(finding).toMatchObject({
      status: "unresolved",
      plateSurface: "#1d3143",
      plateText: "#f4f1ea",
      plateSafe: true,
      platePseudo: true,
    });
    expect(finding.issues).toEqual(
      expect.arrayContaining([
        "pseudo-element backdrop requires rendered review",
      ]),
    );
    const withPlate = await scan(
      html(plateCss(".kicker", "#1d3143", "#f4f1ea")),
      1440,
      { states: false },
    );
    expect(withPlate.pass, JSON.stringify(withPlate.findings)).toBe(true);
  });

  it("clears a wrapper pseudo backdrop with a plate on the inner text", async () => {
    const html = (plate: string) =>
      `<style>body{margin:0;background:#fff}[data-ll-surface="hero"]{--ll-surface:#1d3143;--ll-text:#f4f1ea;background-color:#1d3143;color:#f4f1ea;padding:40px}.copy::before{content:"";display:block;width:60px;height:1px;margin-bottom:8px;background:#8a7d48}.text{color:#f4f1ea;margin:0;font-size:14px}${plate}</style><div data-ll-surface="hero"><div class="copy"><p class="text">Wrapper pseudo backdrop</p></div></div>`;
    const without = await scan(html(""), 1440, { states: false });
    expect(without.pass).toBe(false);
    const withPlate = await scan(
      html(plateCss(".text", "#1d3143", "#f4f1ea")),
      1440,
      { states: false },
    );
    expect(withPlate.pass, JSON.stringify(withPlate.findings)).toBe(true);
  });

  it("proves an in-flow plate against overlapping rear paint", async () => {
    const html = (plate: string) =>
      `<style>body{margin:0;background:#fff}.panel{position:relative;width:320px;height:110px}.paint{position:absolute;inset:0;background:#000}.text{margin:0;color:#f4f1ea;font-size:14px}${plate}</style><div class="shell"><astro-island><div class="host"><div class="panel"><div class="paint"></div><p class="text">Overlapping rear paint</p></div></div></astro-island></div>`;
    const without = await scan(html(""), 1440, { states: false });
    expect(without.pass).toBe(false);
    const withPlate = await scan(
      html(plateCss(".text", "#1d3143", "#f4f1ea")),
      1440,
      { states: false },
    );
    expect(withPlate.pass, JSON.stringify(withPlate.findings)).toBe(true);
  });

  it("proves a plate inside a context-creating ancestor", async () => {
    const html = (plate: string) =>
      `<style>body{margin:0;background:#fff}.context{isolation:isolate;position:relative;width:320px;height:110px}.paint{position:absolute;inset:0;background:#000}.text{margin:0;color:#f4f1ea;font-size:14px}${plate}</style><div class="context"><div class="paint"></div><p class="text">Rear paint inside an isolated context</p></div>`;
    const without = await scan(html(""), 1440, { states: false });
    expect(without.pass).toBe(false);
    const withPlate = await scan(
      html(plateCss(".text", "#1d3143", "#f4f1ea")),
      1440,
      { states: false },
    );
    expect(withPlate.pass, JSON.stringify(withPlate.findings)).toBe(true);
  });

  it("proves a plate in a higher-z sibling context over a lower-z context", async () => {
    const html = (plate: string) =>
      `<style>body{margin:0;background:#fff}.context{isolation:isolate;position:relative;width:320px;height:110px}.inner{position:absolute;inset:0;z-index:1}.paint{position:absolute;inset:0;background:#000}.text{margin:0;color:#f4f1ea;font-size:14px}${plate}</style><div class="context"><div class="inner"><div class="paint"></div></div><p class="text">Layer under its own context</p></div>`;
    const withPlate = await scan(
      html(plateCss(".text", "#1d3143", "#f4f1ea")),
      1440,
      { states: false },
    );
    expect(withPlate.pass, JSON.stringify(withPlate.findings)).toBe(true);
  });

  it("keeps equal-z sibling stacking contexts unresolved", async () => {
    const report = await scan(
      '<style>body{margin:0;background:#fff}.context{isolation:isolate;position:relative;width:320px;height:110px}.media{position:absolute;inset:0;z-index:2;background:#000}.header{position:absolute;inset:0;z-index:2}.nav{background:#fff;color:#111;padding:20px}</style><div class="context"><div class="media"></div><header class="header"><nav class="nav"><a href="#">Equal z-order navigation</a></nav></header></div>',
      1440,
      { states: false },
    );
    expect(report.pass).toBe(false);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: "Equal z-order navigation",
          status: "unresolved",
          repairEligible: false,
        }),
      ]),
    );
  });

  it("does not prove a plate when a higher-z sibling context can cover it", async () => {
    const report = await scan(
      '<style>body{margin:0;background:#fff}.context{isolation:isolate;position:relative;width:320px;height:110px}.media{position:absolute;inset:0;z-index:2;background:#000}.header{position:absolute;inset:0;z-index:1}.nav{background:#fff;color:#111;padding:20px}</style><div class="context"><div class="media"></div><header class="header"><nav class="nav"><a href="#">Covered navigation</a></nav></header></div>',
      1440,
      { states: false },
    );
    expect(report.pass).toBe(false);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: "Covered navigation",
          status: "unresolved",
          repairEligible: false,
        }),
      ]),
    );
  });
});
