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
  }, 30000);
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
  }, 30000);
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
  }, 30000);
});
