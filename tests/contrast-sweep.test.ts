import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  copyFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
const modulePromise = import("../scripts/contrast-sweep.mjs");

describe("persisted bounded contrast sweep", () => {
  it("preserves the route allowlist during screenshot audits without a repair stylesheet", async () => {
    const module = await modulePromise;
    const root = await mkdtemp(
      path.join(os.tmpdir(), "ll-contrast-allowlist-"),
    );
    try {
      const dist = path.join(root, "dist");
      await mkdir(path.join(dist, "excluded"), { recursive: true });
      await writeFile(
        path.join(dist, "index.html"),
        '<body data-ll-route="/" style="background:white;color:black"><p>Readable</p></body>',
      );
      await writeFile(
        path.join(dist, "excluded/index.html"),
        '<body data-ll-route="/excluded/" style="background:white;color:white"><p>Excluded failure</p></body>',
      );
      const report = await module.enforceBuiltContrast({
        dist,
        routes: ["/"],
        repair: true,
        screenshotsDir: path.join(root, "screenshots"),
      });
      expect(report.before.routes).toEqual(["/"]);
      expect(report.after.routes).toEqual(["/"]);
      expect(report.pass).toBe(true);
      expect(report.repairs).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 60000);

  it("repairs both navbar cases and content in source, rebuilds, and verifies every route", async () => {
    const module = await modulePromise;
    expect(module.enforceBuiltContrast).toBeTypeOf("function");
    const root = await mkdtemp(path.join(os.tmpdir(), "ll-contrast-"));
    try {
      const dist = path.join(root, "dist"),
        source = path.join(root, "styles.css");
      await mkdir(path.join(dist, "services/checkups"), { recursive: true });
      await writeFile(
        source,
        "nav{background:#e8d590;color:#f8f6f0}a{color:black;-webkit-text-fill-color:#f8f6f0}h1,p{color:#f8f6f0}",
      );
      await copyFile(source, path.join(dist, "styles.css"));
      await writeFile(
        path.join(dist, "index.html"),
        '<link rel="stylesheet" href="/styles.css"><body data-ll-route="/"><nav><a href="/services/checkups/">Services</a></nav><h1>Willowbridge</h1><p>Prepare for your visit</p></body>',
      );
      await writeFile(
        path.join(dist, "services/checkups/index.html"),
        '<link rel="stylesheet" href="/styles.css"><body data-ll-route="/services/checkups/"><nav style="background:white"><a href="/">Contact</a></nav></body>',
      );
      let rebuilds = 0;
      const report = await module.enforceBuiltContrast({
        dist,
        stylesPath: source,
        reportPath: path.join(root, "report.json"),
        build: async () => {
          rebuilds++;
          await copyFile(source, path.join(dist, "styles.css"));
        },
      });
      expect(report.before.pass).toBe(false);
      expect(report.pass).toBe(true);
      expect(report.repairs.length).toBeGreaterThan(0);
      expect(rebuilds).toBe(1);
      expect(report.after.routes).toEqual(["/", "/services/checkups/"]);
      expect(report.after.pages.map((p) => p.viewport.name)).toEqual(
        expect.arrayContaining(["desktop", "compact", "mobile"]),
      );
      const css = await readFile(source, "utf8");
      expect(css).toContain('body[data-ll-route="/services/checkups/"]');
      expect(css).not.toContain("background-color:");
      const second = await module.enforceBuiltContrast({
        dist,
        stylesPath: source,
        build: async () => {
          rebuilds++;
        },
      });
      expect(second.pass).toBe(true);
      expect(second.repairs).toEqual([]);
      expect(rebuilds).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 60000);
  it("keeps repairs inside the original responsive color conditions", async () => {
    const module = await modulePromise;
    const root = await mkdtemp(path.join(os.tmpdir(), "ll-contrast-media-"));
    try {
      const dist = path.join(root, "dist"),
        source = path.join(root, "styles.css");
      await mkdir(dist);
      await writeFile(
        source,
        "body{background:white;color:#f8f6f0}@media (min-width:1000px) and (max-width:1200px){body{background:#17251f;color:white}}",
      );
      await copyFile(source, path.join(dist, "styles.css"));
      await writeFile(
        path.join(dist, "index.html"),
        '<link rel="stylesheet" href="/styles.css"><body data-ll-route="/"><p>Responsive copy</p></body>',
      );
      const report = await module.enforceBuiltContrast({
        dist,
        stylesPath: source,
        build: () => copyFile(source, path.join(dist, "styles.css")),
      });
      expect(report.pass).toBe(true);
      const intermediate = await module.auditBuiltContrast({
        dist,
        states: false,
        viewports: [
          { name: "intermediate", width: 1100, height: 800, min: 0, max: null },
        ],
      });
      expect(intermediate.pass, JSON.stringify(intermediate.findings)).toBe(
        true,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 60000);
  it("bounds unique correction groups without refusing repeated route text", async () => {
    const module = await modulePromise;
    const target = {
      selector: "body > nav:nth-of-type(1) > a:nth-of-type(1)",
      kind: "text",
      state: "default",
      status: "fail",
      repairEligible: true,
      color: "#f8f6f0",
      background: "#ffffff",
      foreground: [248, 246, 240, 1],
      backgrounds: [[255, 255, 255, 1]],
      minimum: 4.5,
      ratio: 1.1,
      text: "Services",
    };
    const pages = Array.from({ length: 40 }, (_, i) => ({
      route: `/service-${i}/`,
      viewport: module.CONTRAST_VIEWPORTS[0],
      repairScopeVerified: true,
      mediaConditions: [],
      targets: [target],
      findings: [target],
    }));
    const repairs = module.planContrastRepairs({ pages });
    expect(repairs).toHaveLength(40);
    expect(module.contrastRepairCss(repairs)).toContain("/service-39/");
  });
  it("does not claim success or rewrite source when an image backdrop is unresolved", async () => {
    const module = await modulePromise;
    expect(module.enforceBuiltContrast).toBeTypeOf("function");
    const root = await mkdtemp(path.join(os.tmpdir(), "ll-contrast-image-"));
    try {
      await mkdir(path.join(root, "dist"));
      const stylesPath = path.join(root, "styles.css"),
        original = "p{color:white}";
      await writeFile(stylesPath, original);
      await writeFile(
        path.join(root, "dist/index.html"),
        '<body data-ll-route="/"><section style="background:linear-gradient(white,black)"><p style="color:white">Over photo</p></section></body>',
      );
      const report = await module.enforceBuiltContrast({
        dist: path.join(root, "dist"),
        stylesPath,
        build: () => {
          throw new Error("Must not build");
        },
      });
      expect(report.pass).toBe(false);
      expect(report.repairs).toEqual([]);
      expect(await readFile(stylesPath, "utf8")).toBe(original);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 60000);
  it("never paints plates for unresolved or legacy plate metadata", async () => {
    const module = await modulePromise;
    const target = {
      selector:
        "body > main:nth-of-type(1) > section:nth-of-type(1) > p:nth-of-type(1)",
      kind: "text",
      state: "default",
      status: "unresolved",
      repairEligible: false,
      color: "#71652f",
      background: null,
      foreground: [113, 101, 47, 1],
      backgrounds: [[29, 49, 67, 1]],
      minimum: 4.5,
      issues: ["pseudo-element backdrop requires rendered review"],
      plateSafe: true,
      plateSurface: "#1d3143",
      plateText: "#f4f1ea",
      platePseudo: true,
      text: "Estate law, explained plainly",
    };
    const pages = [
      {
        route: "/",
        viewport: module.CONTRAST_VIEWPORTS[0],
        repairScopeVerified: true,
        mediaConditions: null,
        targets: [target],
        findings: [target],
      },
    ];
    // Unresolved image text is not repairable by the automated sweep, whether
    // or not the retired plate option is passed: it defers to author repair.
    expect(module.planContrastRepairs({ pages })).toEqual([]);
    expect(
      module.planContrastRepairs({ pages }, { plates: true } as any),
    ).toEqual([]);
    // Legacy plate metadata never converts a repairable sibling into paint.
    const colorTarget = {
      selector: "body > nav:nth-of-type(1) > a:nth-of-type(1)",
      kind: "text",
      state: "default",
      status: "fail",
      repairEligible: true,
      color: "#f8f6f0",
      background: "#ffffff",
      foreground: [248, 246, 240, 1],
      backgrounds: [[255, 255, 255, 1]],
      minimum: 4.5,
      ratio: 1.1,
      plateSafe: true,
      plateSurface: "#1d3143",
      plateText: "#f4f1ea",
      text: "Services",
    };
    const mixed = module.planContrastRepairs({
      pages: [
        {
          ...pages[0],
          targets: [target, colorTarget],
          findings: [target, colorTarget],
        },
      ],
    });
    expect(mixed).toHaveLength(1);
    const css = module.contrastRepairCss(mixed);
    expect(css).toContain("color:var(--ll-creative-auto-text)!important");
    for (const forbidden of [
      "background-color:",
      "background-image:",
      "box-decoration-break",
      "z-index:",
      "padding:",
    ])
      expect(css).not.toContain(forbidden);
  });
  it("budgets a heavy repair plan worst-first instead of falling back to paint", async () => {
    const module = await modulePromise;
    const makeTarget = (index: number) => ({
      selector: `body > main:nth-of-type(1) > p:nth-of-type(${index + 1})`,
      kind: "text",
      state: "default",
      status: "fail",
      repairEligible: true,
      color: `#${(0x101010 + index).toString(16).padStart(6, "0")}`,
      background: "#ffffff",
      foreground: [248, 246, 240, 1],
      backgrounds: [[255, 255, 255, 1]],
      minimum: 4.5,
      ratio: 1.1,
      plateSafe: true,
      plateSurface: "#1d3143",
      plateText: "#f4f1ea",
      text: `Target ${index}`,
    });
    const targets = [makeTarget(0)];
    const pages = Array.from({ length: 40 }, (_, index) => ({
      route: `/page-${index}/`,
      viewport: module.CONTRAST_VIEWPORTS[0],
      repairScopeVerified: true,
      mediaConditions: [`(min-width: ${1000 + index}px)`],
      targets,
      findings: targets,
    }));
    // Every page carries its own media condition. A heavy candidate gets the
    // bounded, worst-first plan instead of a wholesale refusal, and the
    // retired plate option still cannot paint anything.
    const planned = module.planContrastRepairs(
      { pages },
      { plates: true } as any,
    );
    expect(planned).toHaveLength(40);
    expect(planned.every((r: any) => r.kind !== "plate")).toBe(true);
    const bounded = module.planContrastRepairs(
      { pages },
      { maxRepairs: 4 } as any,
    );
    expect(bounded).toHaveLength(4);
    const capped = module.planContrastRepairs(
      { pages },
      { maxPlanCssChars: 900 } as any,
    );
    expect(capped.length).toBeGreaterThan(0);
    expect(capped.length).toBeLessThan(40);
  });
  it("leaves state-conflicting failures to author repair once plates are retired", async () => {
    const module = await modulePromise;
    const base = {
      selector: "body > p:nth-of-type(1)",
      kind: "text",
      status: "fail",
      repairEligible: false,
      color: "#ffffff",
      background: "#f8f6f0",
      foreground: [255, 255, 255, 1],
      backgrounds: [[248, 246, 240, 1]],
      minimum: 4.5,
      plateSafe: true,
      plateSurface: "#1d3143",
      plateText: "#f4f1ea",
      platePseudo: false,
      text: "Focus target",
    };
    const page = (targets: any[]) => [
      {
        route: "/",
        viewport: module.CONTRAST_VIEWPORTS[0],
        repairScopeVerified: true,
        mediaConditions: null,
        targets,
        findings: targets,
      },
    ];
    const focusOnly = module.planContrastRepairs(
      { pages: page([{ ...base, state: "focus" }]) },
      { plates: true } as any,
    );
    expect(focusOnly.length).toBeGreaterThan(0);
    expect(focusOnly.every((r: any) => r.kind !== "plate")).toBe(true);
    expect(module.contrastRepairCss(focusOnly)).not.toContain(
      "background-color:",
    );
    const consistent = module.planContrastRepairs({
      pages: page([
        { ...base, state: "focus" },
        { ...base, state: "default" },
      ]),
    });
    expect(consistent.length).toBeGreaterThan(0);
    expect(consistent.every((r: any) => r.kind !== "plate")).toBe(true);
    // A passing default with a different paint no longer blocks the focus
    // repair: the correction is scoped to :focus-visible, so it cannot
    // clobber the authored default paint. Plates remain retired.
    const mixed = module.planContrastRepairs(
      {
        pages: page([
          { ...base, state: "focus" },
          {
            ...base,
            state: "default",
            status: "pass",
            color: "#111111",
            background: "#ffffff",
            foreground: [17, 17, 17, 1],
            backgrounds: [[255, 255, 255, 1]],
          },
        ]),
      },
      { plates: true } as any,
    );
    expect(mixed.length).toBeGreaterThan(0);
    expect(mixed.every((r: any) => r.kind !== "plate")).toBe(true);
    expect(
      mixed.every((r: any) => r.stateScope === ":focus-visible"),
    ).toBe(true);
    const mixedCss = module.contrastRepairCss(mixed);
    expect(mixedCss).toContain(":focus-visible");
    expect(mixedCss).not.toContain("background-color:");
    // The default-state repair still refuses when another state of the same
    // selector paints a different color: a static rule would clobber it.
    const blockedDefault = (module.planContrastRepairs as any)({
      pages: page([
        {
          ...base,
          state: "default",
          status: "fail",
          color: "#ffffff",
          background: "#f8f6f0",
          foreground: [255, 255, 255, 1],
          backgrounds: [[248, 246, 240, 1]],
        },
        {
          ...base,
          state: "hover",
          status: "pass",
          color: "#111111",
          background: "#ffffff",
          foreground: [17, 17, 17, 1],
          backgrounds: [[255, 255, 255, 1]],
        },
      ]),
    });
    expect(blockedDefault).toEqual([]);
  });
  it("repairs a failing focus indicator with an outline-color correction", async () => {
    const module = await modulePromise;
    const target = {
      selector:
        "body > main:nth-of-type(1) > section:nth-of-type(3) > form:nth-of-type(1) > button:nth-of-type(1)",
      kind: "focus",
      state: "focus",
      status: "fail",
      repairEligible: false,
      color: "#ffffff",
      background: "#f8f6f0",
      foreground: [255, 255, 255, 1],
      backgrounds: [[248, 246, 240, 1]],
      minimum: 3,
      paintProperty: "outline-color",
      issues: [],
      text: "Request a planning conversation",
    };
    const pages = [
      {
        route: "/services/",
        viewport: module.CONTRAST_VIEWPORTS[0],
        repairScopeVerified: true,
        mediaConditions: null,
        targets: [target],
        findings: [target],
      },
    ];
    const repairs = module.planContrastRepairs({ pages });
    expect(repairs).toHaveLength(1);
    expect(repairs[0].kind).toBe("indicator");
    expect(repairs[0].paintProperty).toBe("outline");
    const css = module.contrastRepairCss(repairs);
    expect(css).toContain(":focus-visible{outline:2px solid #");
    expect(css).toContain("outline-offset:-2px!important");
  });
  it("repairs a failing focus-state text color as text, not as an indicator", async () => {
    const module = await modulePromise;
    const target = {
      selector:
        "body > main:nth-of-type(1) > section:nth-of-type(4) > a:nth-of-type(2) > span:nth-of-type(2)",
      kind: "text",
      state: "focus",
      status: "fail",
      repairEligible: false,
      color: "#6b716d",
      background: "#ece7dc",
      foreground: [107, 113, 109, 1],
      backgrounds: [[236, 231, 220, 1]],
      minimum: 4.5,
      paintProperty: "color",
      issues: [],
      text: "For brewing at home, choose whole-bean coffee.",
    };
    const pages = [
      {
        route: "/services/wholesale-coffee/",
        viewport: module.CONTRAST_VIEWPORTS[2],
        repairScopeVerified: true,
        mediaConditions: null,
        targets: [target],
        findings: [target],
      },
    ];
    const repairs = module.planContrastRepairs({ pages });
    expect(repairs).toHaveLength(1);
    expect(repairs[0].kind).toBe("foreground");
    expect(repairs[0].paintProperty).toBe("color");
    const css = module.contrastRepairCss(repairs);
    expect(css).toContain(":focus-visible");
    expect(css).toContain("color:var(--ll-creative-auto-text)!important");
    expect(css).not.toContain("outline:2px solid");
    // The span inherits the focused anchor's state; a pseudo-class on the
    // span itself would never match while the anchor holds focus.
    expect(css).toContain("a:nth-of-type(2):focus-visible > span:nth-of-type(2)");
    expect(css).not.toContain("span:nth-of-type(2):focus-visible{");
  });
  it("scopes a text repair to a non-native focused parent", async () => {
    const module = await modulePromise;
    const target = {
      selector:
        "body > main:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(1)",
      kind: "text",
      state: "focus",
      status: "fail",
      color: "#6b716d",
      background: "#ece7dc",
      foreground: [107, 113, 109, 1],
      backgrounds: [[236, 231, 220, 1]],
      minimum: 4.5,
      paintProperty: "color",
      issues: [],
      text: "Open the menu",
    };
    const pages = [
      {
        route: "/",
        viewport: module.CONTRAST_VIEWPORTS[0],
        repairScopeVerified: true,
        mediaConditions: null,
        targets: [target],
        findings: [target],
      },
    ];
    const css = module.contrastRepairCss(
      module.planContrastRepairs({ pages }),
    );
    expect(css).toContain(
      "div:nth-of-type(1):focus-visible > span:nth-of-type(1)",
    );
    expect(css).not.toContain("span:nth-of-type(1):focus-visible{");
  });

  it("keeps a text repair and an outline repair on the same selector", async () => {
    const module = await modulePromise;
    const selector =
      "body > main:nth-of-type(1) > button:nth-of-type(1)";
    const text = {
      selector,
      kind: "text",
      state: "focus",
      status: "fail",
      color: "#6b716d",
      background: "#ece7dc",
      foreground: [107, 113, 109, 1],
      backgrounds: [[236, 231, 220, 1]],
      minimum: 4.5,
      paintProperty: "color",
      issues: [],
      text: "Request a visit",
    };
    const outline = {
      selector,
      kind: "focus",
      state: "focus",
      status: "fail",
      color: "#ffffff",
      background: "#ece7dc",
      foreground: [255, 255, 255, 1],
      backgrounds: [[236, 231, 220, 1]],
      minimum: 3,
      paintProperty: "outline-color",
      issues: [],
      text: "Request a visit",
    };
    const pages = [
      {
        route: "/",
        viewport: module.CONTRAST_VIEWPORTS[0],
        repairScopeVerified: true,
        mediaConditions: null,
        targets: [text, outline],
        findings: [text, outline],
      },
    ];
    const repairs = module.planContrastRepairs({ pages });
    expect(repairs.map((repair: any) => repair.kind).sort()).toEqual([
      "foreground",
      "indicator",
    ]);
    const css = module.contrastRepairCss(repairs);
    expect(css).toContain("color:var(--ll-creative-auto-text)");
    expect(css).toContain("outline:2px solid");
  });

  it("scopes an audit to an explicit route allowlist", async () => {
    const module = await modulePromise;
    const root = await mkdtemp(path.join(os.tmpdir(), "ll-contrast-scope-"));
    try {
      const dist = path.join(root, "dist");
      await mkdir(path.join(dist, "contact"), { recursive: true });
      await writeFile(
        path.join(dist, "index.html"),
        `<body data-ll-route="/"><p style="color:#111;background:#fff">Home</p></body>`,
      );
      await writeFile(
        path.join(dist, "contact/index.html"),
        `<body data-ll-route="/contact/"><p style="color:#eeeeee;background:#fff">Contact</p></body>`,
      );
      const all = await module.auditBuiltContrast({ dist, states: false });
      expect([...all.routes].sort()).toEqual(["/", "/contact/"]);
      expect(all.pass).toBe(false);
      // Deterministic routes that never load the candidate stylesheet cannot
      // receive corrections and must not gate an authored candidate.
      const scoped = await module.auditBuiltContrast({
        dist,
        states: false,
        routes: ["/"],
      });
      expect(scoped.routes).toEqual(["/"]);
      expect(scoped.pass).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 60000);
  it("plans only foreground corrections when the retired plate option is passed", async () => {
    const module = await modulePromise;
    const colorTarget = {
      selector: "body > nav:nth-of-type(1) > a:nth-of-type(1)",
      kind: "text",
      state: "default",
      status: "fail",
      repairEligible: true,
      color: "#f8f6f0",
      background: "#ffffff",
      foreground: [248, 246, 240, 1],
      backgrounds: [[255, 255, 255, 1]],
      minimum: 4.5,
      ratio: 1.1,
      text: "Services",
    };
    const plateTarget = {
      selector: "body > main:nth-of-type(1) > p:nth-of-type(1)",
      kind: "text",
      state: "default",
      status: "unresolved",
      repairEligible: false,
      color: "#71652f",
      background: null,
      foreground: [113, 101, 47, 1],
      backgrounds: [[29, 49, 67, 1]],
      minimum: 4.5,
      issues: ["overlapping non-ancestor paint requires rendered review"],
      plateSafe: true,
      plateSurface: "#1d3143",
      plateText: "#f4f1ea",
      text: "Over authored paint",
    };
    const pages = [
      {
        route: "/",
        viewport: module.CONTRAST_VIEWPORTS[0],
        repairScopeVerified: true,
        mediaConditions: null,
        targets: [colorTarget, plateTarget],
        findings: [colorTarget, plateTarget],
      },
    ];
    const repairs = module.planContrastRepairs({ pages }, {
      plates: true,
    } as any);
    expect(repairs.map((r: any) => r.kind || "color")).toEqual(["foreground"]);
    const css = module.contrastRepairCss(repairs);
    expect(css).not.toMatch(
      /background-color:|background-image:|box-decoration-break|z-index:|padding:/u,
    );
  });
  it("repairs provable contrast on pixel-resolved backdrops against both extremes", async () => {
    const module = await modulePromise;
    const { contrast } = await import("../scripts/color-contrast.mjs");
    const target = {
      selector: "body > main:nth-of-type(1) > p:nth-of-type(1)",
      kind: "text",
      state: "default",
      status: "fail",
      repairEligible: false,
      pixelResolved: true,
      color: "#6b716d",
      background: null,
      foreground: [107, 113, 109, 1],
      backgrounds: [[29, 49, 67, 1]],
      pixelBackdrop: { dark: "#3a3f3b", light: "#57605a" },
      minimum: 4.5,
      ratio: 1.193,
      issues: ["overlapping non-ancestor paint requires rendered review", "resolved from rendered pixels"],
      text: "Begin a practical conversation",
    };
    const pages = [
      {
        route: "/",
        viewport: module.CONTRAST_VIEWPORTS[0],
        repairScopeVerified: true,
        mediaConditions: null,
        targets: [target],
        findings: [target],
      },
    ];
    const repairs = module.planContrastRepairs({ pages });
    expect(repairs).toHaveLength(1);
    expect(repairs[0].kind).toBe("foreground");
    expect(contrast(repairs[0].color, "#3a3f3b")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(repairs[0].color, "#57605a")).toBeGreaterThanOrEqual(4.5);
    // A full black-to-white photo range has no single color at 5:1 (the
    // crossing point of both extremes is below 4.6), so the sweep refuses.
    const wide = {
      ...target,
      minimum: 5,
      pixelBackdrop: { dark: "#000000", light: "#ffffff" },
    };
    expect(
      module.planContrastRepairs({
        pages: [{ ...pages[0], targets: [wide], findings: [wide] }],
      }),
    ).toEqual([]);
  });

  it("repairs a pixel-proven icon fill", async () => {
    const module = await modulePromise;
    const { contrast } = await import("../scripts/color-contrast.mjs");
    const icon = {
      selector: "body > nav:nth-of-type(1) > a:nth-of-type(1) > svg:nth-of-type(1) > path:nth-of-type(1)",
      kind: "icon",
      state: "default",
      status: "fail",
      pixelResolved: true,
      color: "#ced6d2",
      background: null,
      foreground: [206, 214, 210, 1],
      backgrounds: [[23, 33, 43, 1]],
      pixelBackdrop: { dark: "#17212b", light: "#1d2a35" },
      minimum: 3,
      ratio: 1.4,
      issues: ["resolved from rendered pixels"],
      paintProperty: "fill",
      text: "Search",
    };
    const pages = [
      {
        route: "/",
        viewport: module.CONTRAST_VIEWPORTS[0],
        repairScopeVerified: true,
        mediaConditions: null,
        targets: [icon],
        findings: [icon],
      },
    ];
    const repairs = module.planContrastRepairs({ pages });
    expect(repairs).toHaveLength(1);
    expect(repairs[0].paintProperty).toBe("fill");
    expect(module.contrastRepairCss(repairs)).toContain(
      "fill:var(--ll-creative-auto-text)!important",
    );
    expect(contrast(repairs[0].color, "#17212b")).toBeGreaterThanOrEqual(3);
    expect(contrast(repairs[0].color, "#1d2a35")).toBeGreaterThanOrEqual(3);
  });

  it("scopes pixel-resolved hover repairs to the hover state", async () => {
    const module = await modulePromise;
    const { contrast } = await import("../scripts/color-contrast.mjs");
    const target = {
      selector: "body > nav:nth-of-type(1) > a:nth-of-type(1)",
      kind: "text",
      state: "hover",
      status: "fail",
      repairEligible: false,
      pixelResolved: true,
      color: "#ffffff",
      background: null,
      foreground: [255, 255, 255, 1],
      backgrounds: [[200, 236, 88, 1]],
      pixelBackdrop: { dark: "#c8ec58", light: "#d6f37a" },
      minimum: 4.5,
      ratio: 1.18,
      issues: ["resolved from rendered pixels"],
      text: "Book a consultation",
    };
    const pages = [
      {
        route: "/",
        viewport: module.CONTRAST_VIEWPORTS[0],
        repairScopeVerified: true,
        mediaConditions: null,
        targets: [target],
        findings: [target],
      },
    ];
    const repairs = module.planContrastRepairs({ pages });
    expect(repairs).toHaveLength(1);
    expect(repairs[0].stateScope).toBe(":hover");
    expect(module.contrastRepairCss(repairs)).toContain(":hover{--ll-creative-auto-text:");
    expect(contrast(repairs[0].color, "#c8ec58")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(repairs[0].color, "#d6f37a")).toBeGreaterThanOrEqual(4.5);
  });

  it("repairs a provable default failure despite unresolved focus-state peers", async () => {
    const module = await modulePromise;
    const { contrast } = await import("../scripts/color-contrast.mjs");
    const target = {
      selector: "body > main:nth-of-type(1) > p:nth-of-type(1)",
      kind: "text",
      state: "default",
      status: "fail",
      repairEligible: false,
      pixelResolved: true,
      color: "#676c69",
      background: null,
      foreground: [103, 108, 105, 1],
      backgrounds: [[232, 238, 230, 1]],
      pixelBackdrop: {
        dark: "#e6ede3",
        light: "#e8eee6",
        provable: { min: 0, max: 0.1425 },
      },
      minimum: 4.5,
      ratio: 4.48,
      issues: ["resolved from rendered pixels"],
      text: "Choose the service",
    };
    const focusPeer = {
      ...target,
      state: "focus",
      status: "unresolved",
      ratio: null,
      color: null,
      pixelBackdrop: undefined,
      pixelResolved: undefined,
      issues: ["overlapping non-ancestor paint requires rendered review"],
    };
    const pages = [
      {
        route: "/",
        viewport: module.CONTRAST_VIEWPORTS[0],
        repairScopeVerified: true,
        mediaConditions: null,
        targets: [target, focusPeer],
        findings: [target],
      },
    ];
    const repairs = module.planContrastRepairs({ pages });
    expect(repairs).toHaveLength(1);
    expect(repairs[0].kind).toBe("foreground");
    expect(contrast(repairs[0].color, "#e6ede3")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(repairs[0].color, "#e8eee6")).toBeGreaterThanOrEqual(4.5);
  });

  it("strips synthesized outline indicator rules from legacy blocks", async () => {
    const module = await modulePromise;
    const legacy =
      "/* launchloom: bounded rendered contrast corrections */\nbody > a{outline:2px solid #0a0a0a!important;outline-offset:-2px!important}\np{color:red}";
    const stripped = module.stripBoundedCorrections(legacy);
    expect(stripped).not.toContain("outline:2px solid");
    expect(stripped).toContain("p{color:red}");
  });

  it("replaces a legacy corrections block instead of appending duplicates", async () => {
    const module = await modulePromise;
    const root = await mkdtemp(path.join(os.tmpdir(), "ll-contrast-replace-"));
    try {
      const dist = path.join(root, "dist"),
        source = path.join(root, "styles.css");
      await mkdir(dist);
      const markers = "/* launchloom: bounded rendered contrast corrections */";
      const generatedLegacy =
        `${markers}\n` +
        'body[data-ll-route="/"] > main:nth-of-type(1) > p:nth-of-type(1){position:relative!important;z-index:3!important;background-color:#f8f6f0!important;background-image:none!important;color:#14201d!important;padding:.1em .35em!important;box-sizing:border-box;box-decoration-break:clone;isolation:isolate;}\n' +
        `@media (min-width: 761px){body[data-ll-route="/"] > p:nth-of-type(2){--ll-creative-auto-text:#14201d;color:var(--ll-creative-auto-text)!important;}}\n` +
        `${markers}\n` +
        'body[data-ll-route="/services/"] > section:nth-of-type(1) > summary:nth-of-type(1) > span:nth-of-type(1){position:relative!important;z-index:3!important;background-color:#f8f6f0!important;background-image:none!important;color:#14201d!important;padding:.1em .35em!important;box-sizing:border-box;box-decoration-break:clone;isolation:isolate;}\n';
      const authoredAfter = ".after-authored{color:#aabbcc}\n";
      const legacy = `body{background:white;color:#f8f6f0}\n${generatedLegacy}${authoredAfter}`;
      await writeFile(source, legacy);
      await copyFile(source, path.join(dist, "styles.css"));
      await writeFile(
        path.join(dist, "index.html"),
        '<link rel="stylesheet" href="/styles.css"><body data-ll-route="/"><p>Cedar copy</p></body>',
      );
      const report = await module.enforceBuiltContrast({
        dist,
        stylesPath: source,
        build: () => copyFile(source, path.join(dist, "styles.css")),
      });
      expect(report.pass).toBe(true);
      const css = await readFile(source, "utf8");
      expect(
        css.split("/* launchloom: bounded rendered contrast corrections */")
          .length - 1,
      ).toBe(1);
      expect(
        css.split("/* launchloom: end bounded rendered contrast corrections */")
          .length - 1,
      ).toBe(1);
      expect(css).not.toContain("box-decoration-break");
      expect(css).not.toContain("background-color:");
      expect(css).not.toContain("z-index:");
      expect(css).not.toContain("position:relative!important");
      expect(css).not.toContain('body[data-ll-route="/services/"]');
      // Authored CSS that follows a legacy block must survive untouched.
      expect(css).toContain(".after-authored{color:#aabbcc}");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 60000);

  it("preserves authored CSS after a delimited corrections block", async () => {
    const module = await modulePromise;
    const root = await mkdtemp(
      path.join(os.tmpdir(), "ll-contrast-delimited-"),
    );
    try {
      const dist = path.join(root, "dist"),
        source = path.join(root, "styles.css");
      await mkdir(dist);
      const styles =
        "body{background:white;color:#f8f6f0}\n" +
        "/* launchloom: bounded rendered contrast corrections */\n" +
        'body[data-ll-route="/"] > p:nth-of-type(9){--ll-creative-auto-text:#123456;color:var(--ll-creative-auto-text)!important;}\n' +
        "/* launchloom: end bounded rendered contrast corrections */\n" +
        ".after-authored{color:#aabbcc}\n";
      await writeFile(source, styles);
      await copyFile(source, path.join(dist, "styles.css"));
      await writeFile(
        path.join(dist, "index.html"),
        '<link rel="stylesheet" href="/styles.css"><body data-ll-route="/"><p>Cedar copy</p></body>',
      );
      const report = await module.enforceBuiltContrast({
        dist,
        stylesPath: source,
        build: () => copyFile(source, path.join(dist, "styles.css")),
      });
      expect(report.pass).toBe(true);
      const css = await readFile(source, "utf8");
      expect(
        css.split("/* launchloom: bounded rendered contrast corrections */")
          .length - 1,
      ).toBe(1);
      expect(
        css.split("/* launchloom: end bounded rendered contrast corrections */")
          .length - 1,
      ).toBe(1);
      expect(css).not.toContain("nth-of-type(9)");
      expect(css).toContain(".after-authored{color:#aabbcc}");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 60000);
});
