import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { semanticColorCss } from "../scripts/palette-policy.mjs";
import {
  ensureContrast,
  contrast,
  toOklab,
} from "../scripts/color-contrast.mjs";

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

describe("rendered contrast independent of authored classes", () => {
  it("proves fully inset focus on a rounded opaque floating action", async () => {
    const report = await scan(
      '<style>body{background:white}.under{position:absolute;inset:0;background:black}a{position:fixed;top:50px;left:50px;z-index:2;background:black;color:white;padding:14px 18px;border-radius:999px}a:focus-visible{outline:2px solid white;outline-offset:-4px}</style><div class="under"></div><a href="#">Call us</a>',
    );
    expect(report.pass, JSON.stringify(report.findings)).toBe(true);
  });

  it.each(["#f8f6f0", "#17251f"])(
    "keeps the template floating action focus readable over %s",
    async (background) => {
      const css = readFileSync(
        new URL(
          "../templates/client-site/src/styles/site.css",
          import.meta.url,
        ),
        "utf8",
      );
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      try {
        await page.setContent(
          `<style>${css}:root{--brand:#205d51;--on-brand:#fff}body{background:${background}}</style><a class="mobile-call" href="#">Call us</a>`,
        );
        await page.keyboard.press("Tab");
        const paint = await page.locator("a").evaluate((el) => {
          const s = getComputedStyle(el);
          return {
            outline: s.outlineColor,
            offset: parseFloat(s.outlineOffset),
            width: parseFloat(s.outlineWidth),
            surface: s.backgroundColor,
          };
        });
        expect(
          contrast(
            paint.outline,
            paint.offset + paint.width <= 0 ? paint.surface : background,
          ),
        ).toBeGreaterThanOrEqual(3);
      } finally {
        await page.close();
      }
    },
  );
  it("does not use the fill beneath an inset outline painted on a border", async () => {
    const report = await scan(
      "<style>body{background:white}button{background:black;color:white;border:10px solid white;padding:20px}button:focus-visible{outline:2px solid white;outline-offset:-4px}</style><button>Border focus</button>",
    );
    expect(report.pass).toBe(false);
  });

  it("centers reachable focused controls clear of a fixed edge overlay", async () => {
    const report = await scan(
      '<style>body{margin:0;background:white;color:black}.space{height:1400px}input{display:block;width:100%;height:80px;background:white;color:black;border:2px solid black}input:focus-visible{outline:2px solid black;outline-offset:2px}.edge{position:fixed;bottom:0;right:0;width:100px;height:80px;background:black;z-index:2}</style><div class="space"></div><input value="First field"><div style="height:280px"></div><input value="Reachable field"><div style="height:500px"></div><div class="edge"></div>',
      390,
    );
    expect(report.findings.filter((f) => f.text === "Reachable field")).toEqual(
      [],
    );
  });

  it("uses keyboard focus modality after clicking a menu toggle", async () => {
    const report = await scan(
      `<style>body{background:white;color:black}a{color:black}a:focus-visible{color:#eee;outline:2px solid black}button:focus-visible{outline:2px solid black}</style><button type="button" aria-expanded="false" aria-controls="menu" onclick="document.getElementById('menu').hidden=!document.getElementById('menu').hidden;this.setAttribute('aria-expanded',String(!document.getElementById('menu').hidden))">Menu</button><div id="menu" hidden><a href="#answer">Keyboard menu action</a></div>`,
    );
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: "Keyboard menu action",
          state: "focus",
          status: "fail",
        }),
      ]),
    );
  });

  it.each(["hover", "focus-visible"])(
    "exercises native summary %s paint",
    async (state) => {
      const report = await scan(
        `<style>body{background:white;color:black}summary{outline:2px solid black}summary.target:${state}{color:#eee}</style><details><summary>First question</summary><p>First answer</p></details><details><summary class="target">Question</summary><p>Answer</p></details>`,
      );
      expect(report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ text: "Question", status: "fail" }),
        ]),
      );
    },
  );
  it.each(["details", "menu"])(
    "exercises controls revealed by %s",
    async (kind) => {
      const content = '<a href="#answer" id="answer">Revealed action</a>';
      const disclosure =
        kind === "details"
          ? `<details><summary>Question</summary>${content}</details>`
          : `<button type="button" aria-expanded="false" aria-controls="menu" onclick="document.getElementById('menu').hidden=!document.getElementById('menu').hidden;this.setAttribute('aria-expanded',String(!document.getElementById('menu').hidden))">Menu</button><div id="menu" hidden>${content}</div>`;
      const report = await scan(
        `<style>body{background:white;color:black}a{color:black}a:hover{color:#eee}a:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid black}</style>${disclosure}`,
      );
      expect(report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            text: "Revealed action",
            state: "hover",
            status: "fail",
          }),
        ]),
      );
    },
  );

  it("audits each exclusive native disclosure and restores its initial state", async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(
        '<style>body{background:white;color:black}summary:focus-visible{outline:2px solid black}</style><details name="faq"><summary>First question</summary><p style="color:#eee">Unreadable first answer</p></details><details name="faq"><summary>Second question</summary><p>Readable second answer</p></details>',
      );
      const report = await (
        await auditModule
      ).inspectContrastPage(page, { route: "/" });
      expect(report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            text: "Unreadable first answer",
            status: "fail",
          }),
        ]),
      );
      expect(await page.locator("details[open]").count()).toBe(0);
    } finally {
      await page.close();
    }
  });
  it("measures an inset focus outline against the filled control", async () => {
    const report = await scan(
      "<style>body{background:white}button{background:black;color:white;border:0;padding:20px}button:focus-visible{outline:2px solid black;outline-offset:-4px}</style><button>Continue</button>",
    );
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "focus", status: "fail", ratio: 1 }),
      ]),
    );
  });

  it.each(["#e8d590", "#ffffff"])(
    "catches pale navbar text on %s",
    async (background) => {
      const report = await scan(
        `<nav style="background:${background};color:#f8f6f0"><a style="color:inherit" href="/services/">Services</a></nav>`,
      );
      expect(report.pass).toBe(false);
      expect(report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "text",
            text: "Services",
            status: "fail",
            minimum: 4.5,
          }),
        ]),
      );
    },
  );
  it("does not use a parent plate that ends before the painted text", async () => {
    const report = await scan(
      '<style>body{background:white}.plate{position:relative;background:black;width:200px;height:40px}.plate p{position:absolute;top:80px;color:white}</style><div class="plate"><p>Outside the plate</p></div>',
      1440,
      { states: false },
    );
    expect(report.pass).toBe(false);
  });
  it("measures actual text fill in native fields and generated copy", async () => {
    const report = await scan(
      '<style>input{color:black;-webkit-text-fill-color:#eee;border:2px solid black;background:white}p::before{content:"Generated copy";color:black;-webkit-text-fill-color:#eee}</style><input value="Visible field value"><p></p>',
      1440,
      { states: false },
    );
    expect(report.findings.map((f) => f.text)).toEqual(
      expect.arrayContaining(["Visible field value", "Generated copy"]),
    );
  });
  it("does not pass SVG path opacity as an opaque icon", async () => {
    const report = await scan(
      '<svg role="img" aria-label="Search" width="30" height="30"><g opacity=".1"><rect fill="black" width="30" height="30"/></g></svg>',
      1440,
      { states: false },
    );
    expect(report.pass).toBe(false);
  });
  it("measures the final destination of a finite color animation", async () => {
    const report = await scan(
      "<style>@keyframes paint{from{color:black}to{color:#eee}}p{animation:paint 1s forwards}</style><p>Final copy</p>",
      1440,
      { states: false },
    );
    expect(report.pass).toBe(false);
    expect(report.findings[0].ratio).toBeLessThan(1.2);
  });
  it("blocks an unbounded paint animation even at a readable keyframe", async () => {
    const report = await scan(
      "<style>@keyframes paint{from{color:black}to{color:#eee}}p{animation:paint 1s infinite alternate}</style><p>Animated copy</p>",
      1440,
      { states: false },
    );
    expect(report.pass).toBe(false);
    expect(report.findings[0].status).toBe("unresolved");
  });
  it("does not prove translucent colored text from only grayscale image endpoints", async () => {
    // Endpoints give 3.0436:1, but a red pixel behind this scrim gives 2.9663:1.
    const report = await scan(
      '<section style="background:linear-gradient(black,red)"><div style="background:rgba(0,0,0,.9)"><h1 style="font-size:32px;color:rgba(64,192,255,.5)">Colored translucent title</h1></div></section>',
      1440,
      { states: false },
    );
    expect(report.pass).toBe(false);
    expect(report.findings[0].status).toBe("unresolved");
  });
  it.each([
    "border-bottom:2px solid black",
    "border-top:2px solid black;border-bottom:2px solid transparent",
  ])("recognizes a visible field boundary: %s", async (boundary) => {
    const report = await scan(
      `<input aria-label="Name" value="Ada" style="background:white;color:black;border:0;${boundary}">`,
      1440,
      { states: false },
    );
    expect(report.pass, JSON.stringify(report.findings)).toBe(true);
  });
  it("audits a scroll-reachable fixed child inside a transformed container", async () => {
    const report = await scan(
      '<section style="margin-top:1400px;height:200px;transform:translateZ(0);background:white"><button style="position:fixed;top:20px;left:20px;color:#eee;background:white">Scroll reachable CTA</button></section>',
      1440,
      { states: false },
    );
    expect(
      report.findings.some(
        (f) => f.text === "Scroll reachable CTA" && f.status === "fail",
      ),
    ).toBe(true);
  });
  it("does not try to hover a fixed control outside the reachable page", async () => {
    const report = await scan(
      '<button style="position:fixed;left:20000px;top:20px">Offscreen helper</button><p style="color:black">Visible copy</p>',
    );
    expect(
      report.findings.some((f) => f.text === "Hover target inaccessible"),
    ).toBe(false);
  });
  it("catches unclassified pale heading and ordinary body copy", async () => {
    const report = await scan(
      '<section style="background:white;color:#f8f6f0"><h1 style="font-size:64px">Willowbridge</h1><p>Visit preparation</p></section>',
    );
    expect(
      report.findings.filter((f) => f.status === "fail").map((f) => f.text),
    ).toEqual(expect.arrayContaining(["Willowbridge", "Visit preparation"]));
  });
  it("uses composited alpha rather than passing translucent black as black", async () => {
    const report = await scan(
      '<p style="background:white;color:rgba(0,0,0,.1)">Preparation</p>',
    );
    expect(report.pass).toBe(false);
    expect(report.findings[0].ratio).toBeLessThan(1.3);
  });
  it("passes an opaque local plate over an image and blocks an unbounded image", async () => {
    const bad = await scan(
      '<section style="background-image:linear-gradient(white,black);color:white"><p>Over image</p></section>',
    );
    expect(bad.pass).toBe(false);
    expect(bad.findings[0].status).toBe("unresolved");
    const good = await scan(
      '<section style="background-image:linear-gradient(white,black)"><p style="background:#14201d;color:white">Local plate</p></section>',
    );
    expect(good.pass).toBe(true);
  });
  it("proves white text over a sufficiently strong dark scrim", async () => {
    const report = await scan(
      '<section style="background-image:linear-gradient(white,black)"><div style="background:rgba(0,0,0,.8);color:white"><p>Calm visits</p></div></section>',
    );
    expect(report.pass).toBe(true);
  });
  it("inspects text runs in mixed parent and child markup without double counting", async () => {
    const report = await scan(
      '<p style="color:#f8f6f0;background:white">Pale <strong style="color:black">readable</strong> copy</p>',
    );
    expect(
      report.findings.filter((f) => f.kind === "text").map((f) => f.text),
    ).toEqual(["Pale", "copy"]);
  });
  it("checks input identification and keyboard focus indicators", async () => {
    const report = await scan(
      '<style>input:focus-visible{outline:2px solid #eeeeee}</style><label style="color:black">Name<input style="border:1px solid #eeeeee;background:white;color:black"></label>',
      1440,
      { states: true },
    );
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "control", status: "fail" }),
        expect.objectContaining({ kind: "focus", status: "fail" }),
      ]),
    );
  });
  it("checks hover and opened FAQ content", async () => {
    const report = await scan(
      '<style>a{color:black}a:hover{color:#eeeeee}</style><a href="#faq">FAQs</a><details id="faq"><summary>Prepare</summary><p style="color:#eeeeee">Bring records</p></details>',
      1440,
      { states: true },
    );
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: "hover", status: "fail" }),
        expect.objectContaining({
          text: "Bring records",
          state: "open",
          status: "fail",
        }),
      ]),
    );
  });
  it("keeps hidden content out of the default audit but catches responsive nav", async () => {
    const html =
      '<style>.mobile{display:none}@media(max-width:600px){.mobile{display:block;color:#eeeeee}}</style><nav class="mobile">Services</nav><p style="display:none;color:white">Hidden</p>';
    expect((await scan(html)).pass).toBe(true);
    expect((await scan(html, 390)).findings.map((f) => f.text)).toContain(
      "Services",
    );
  });
  it("marks blend/filter effects unresolved instead of reporting a false pass", async () => {
    const report = await scan(
      '<p style="color:black;filter:opacity(.1)">Filtered text</p>',
    );
    expect(report.findings[0].status).toBe("unresolved");
  });
  it("renders paired semantic light/dark/nav surfaces as readable", async () => {
    const css = semanticColorCss({
      primaryColor: "#e8d590",
      surfaces: { nav: { surface: "#e8d590" } },
    });
    const report = await scan(
      `<style>${css}</style><nav data-ll-surface="nav"><a href="/">Services</a></nav><section data-ll-surface="light"><h1>Visits</h1><p data-ll-muted>Prepare</p></section><section data-ll-surface="dark"><p>Care</p><a data-ll-action href="/contact/">Book</a></section>`,
    );
    expect(report.pass).toBe(true);
  });
});

describe("minimal readable variants", () => {
  it("preserves a passing color and searches either lightness direction", () => {
    expect(ensureContrast("#14201d", "#ffffff")).toBe("#14201d");
    for (const surface of ["#ffffff", "#14201d"]) {
      const derived = ensureContrast("#e8d590", surface);
      expect(contrast(derived, surface)).toBeGreaterThanOrEqual(4.5);
    }
    const original = toOklab("#e8d590"),
      darker = toOklab(ensureContrast("#e8d590", "#ffffff"));
    expect(darker[0]).toBeLessThan(original[0]);
    expect(Math.atan2(darker[2], darker[1])).toBeCloseTo(
      Math.atan2(original[2], original[1]),
      1,
    );
  });
});

describe("contrast audit review regressions", () => {
  it("does not falsely pass translucent gray over a variable image", async () => {
    const report = await scan(
      '<section style="background:linear-gradient(black,white)"><p style="color:rgba(117,117,117,.996);font-size:32px">Over image</p></section>',
      1440,
      { states: false },
    );
    expect(report.pass).toBe(false);
    expect(report.findings[0].ratio).toBe(1);
  });
  it.each([
    '<svg style="background:white"><text x="10" y="30" fill="#eeeeee">SVG heading</text></svg>',
    '<style>nav::before{content:"Generated heading";color:#eeeeee}</style><nav></nav>',
  ])("checks painted SVG and generated text", async (html) => {
    expect((await scan(html, 1440, { states: false })).pass).toBe(false);
  });
  it("waits for a hover color transition to settle", async () => {
    const report = await scan(
      '<style>a{color:black;transition:color 1s}a:hover{color:#eeeeee}</style><a href="/">Services</a>',
      1440,
      { states: true },
    );
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: "hover", status: "fail" }),
      ]),
    );
  });
  it("audits each menu and restores its original closed state", async () => {
    const module = await auditModule;
    const page = await browser.newPage();
    page.setDefaultTimeout(1000);
    try {
      await page.setContent(
        "<button type=\"button\" aria-controls=\"one\" aria-expanded=\"false\" onclick=\"this.setAttribute('aria-expanded',this.getAttribute('aria-expanded')==='false'?'true':'false');document.getElementById('one').hidden=!document.getElementById('one').hidden\">First</button><div id=\"one\" hidden>Readable</div><button type=\"button\" aria-controls=\"two\" aria-expanded=\"false\" onclick=\"this.setAttribute('aria-expanded',this.getAttribute('aria-expanded')==='false'?'true':'false');document.getElementById('two').hidden=!document.getElementById('two').hidden\">Second</button><div id=\"two\" hidden style=\"color:#eeeeee\">Unreadable second menu</div>",
      );
      const report = await module.inspectContrastPage(page, {
        route: "/",
        states: true,
      });
      expect(report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            text: "Unreadable second menu",
            state: "menu-open",
            status: "fail",
          }),
        ]),
      );
      expect(await page.locator("#one").isVisible()).toBe(false);
      expect(await page.locator("#two").isVisible()).toBe(false);
    } finally {
      await page.close();
    }
  });
  it("does not submit or reset a form while checking a menu toggle", async () => {
    const module = await auditModule;
    const page = await browser.newPage();
    page.setDefaultTimeout(1000);
    try {
      await page.setContent(
        '<script>window.submissions=0</script><form onsubmit="window.submissions++;event.preventDefault()"><button aria-expanded="false" aria-controls="menu">Menu</button><div id="menu" hidden style="color:#eee">Hidden menu</div></form>',
      );
      const report = await module.inspectContrastPage(page, {
        route: "/",
        states: true,
      });
      expect(await page.evaluate(() => (window as any).submissions)).toBe(0);
      expect(report.pass).toBe(false);
      expect(report.findings.some((f) => f.status === "unresolved")).toBe(true);
    } finally {
      await page.close();
    }
  });
});

it("pairs shared contact, form boundaries and footer focus with their own surfaces", async () => {
  const { readFile } = await import("node:fs/promises");
  const shared = await readFile(
    "templates/client-site/src/styles/site.css",
    "utf8",
  );
  const { resolvePalette } = await import("../scripts/palette-policy.mjs");
  const palette = resolvePalette({
    primaryColor: "#205d51",
    surfaceColor: "#f8f6f0",
  });
  const roles = semanticColorCss(palette);
  const report = await scan(
    `<style>${shared}\n${roles}</style><div style="--ink:${palette.inkColor};--muted:${palette.mutedColor};--cream:${palette.surfaceColor};--brand:${palette.primaryColor}"><section data-ll-surface="contact" class="contact-section"><div class="contact-copy"><p>Prepare for a visit</p></div><form class="lead-form"><label>Name<input aria-label="Name"></label></form></section><footer data-ll-surface="footer" class="footer"><a href="/">Contact</a></footer></div>`,
    1440,
    { states: true },
  );
  expect(report.findings).toEqual([]);
});

it("ignores visually hidden native controls during hover inspection", async () => {
  const report = await scan(
    '<label style="position:relative"><input type="radio" style="position:absolute;opacity:0;width:1px;height:1px"><span style="position:relative;z-index:2">Checkups</span></label>',
    1440,
    { states: true },
  );
  expect(report.findings).toEqual([]);
});
it("settles moving hover surfaces before reporting their text contrast", async () => {
  const report = await scan(
    '<style>a{display:block;background:white;color:black;transition:background .2s,transform .2s}a:hover{background:#e6efe5;transform:translateY(-3px)}</style><a href="/">Services</a>',
    1440,
    { states: true },
  );
  expect(report.findings).toEqual([]);
});

it("does not hover or open a widget that becomes suppressed after focus", async () => {
  const report = await scan(
    '<style>.suppressed{opacity:0;pointer-events:none;transition:opacity 160ms}</style><div id="widget"><button type="button" aria-expanded="false" aria-controls="panel" onfocus="requestAnimationFrame(()=>document.getElementById(\'widget\').classList.add(\'suppressed\'))">Questions</button><div id="panel" hidden>Answers</div></div>',
    1440,
    { states: true },
  ).catch(() => ({ pass: false, findings: [] }));
  expect(report.pass).toBe(true);
});

it("measures actual text fill instead of a different CSS color", async () => {
  const report = await scan(
    '<p style="color:black;-webkit-text-fill-color:#eeeeee">Pale fill</p>',
    1440,
    { states: false },
  );
  expect(report.pass).toBe(false);
});
it("composites SVG fill opacity for meaningful icons", async () => {
  const report = await scan(
    '<svg role="img" aria-label="Location"><path fill="black" fill-opacity=".1" d="M0 0H20V20H0Z"/></svg>',
    1440,
    { states: false },
  );
  expect(report.pass).toBe(false);
});
it("preserves normalized sRGB precision near a contrast threshold", async () => {
  const report = await scan(
    '<p style="background:black;color:color(srgb .4554 .4554 .4554)">Precise color</p>',
    1440,
    { states: false },
  );
  expect(report.pass).toBe(true);
});

it("keeps trades inner-hero labels and keyboard focus readable on the dark surface", async () => {
  const css = readFileSync(
    new URL("../templates/client-site/src/styles/site.css", import.meta.url),
    "utf8",
  );
  const report = await scan(
    `<style>${css}:root{--brand:#205d51;--on-brand:#fff;--muted:#5e6b66;--ink:#14201d;--cream:#f8f6f0}</style><main class="inner-page recipe-local-trades"><section class="inner-hero"><div class="wrap"><span class="kicker">Service details</span><h1>Drain cleaning</h1><a class="breadcrumb" href="/">Home</a><a class="cta" href="#contact">Discuss your request</a></div></section></main>`,
  );
  expect(report.pass, JSON.stringify(report.findings)).toBe(true);
});
