import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import { ensureContrast, rgbHex, composite } from "./color-contrast.mjs";
import { inspectContrastPage } from "./rendered-contrast.mjs";

export const CONTRAST_VIEWPORTS = [
  { name: "desktop", width: 1536, height: 864, min: 1440, max: null },
  { name: "compact", width: 1366, height: 768, min: 768, max: 1439 },
  { name: "mobile", width: 390, height: 844, min: 0, max: 767 },
];
async function htmlRoutes(dist, relative = "") {
  const routes = [];
  for (const entry of await fs.readdir(path.join(dist, relative), {
    withFileTypes: true,
  })) {
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) routes.push(...(await htmlRoutes(dist, name)));
    else if (entry.isFile() && entry.name.endsWith(".html")) {
      const route = "/" + name.split(path.sep).join("/");
      routes.push(route.endsWith("/index.html") ? route.slice(0, -10) : route);
    }
  }
  return routes.sort();
}
async function serve(dist) {
  const types = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
  };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const relative = decodeURIComponent(url.pathname).replace(/^\//, "");
      const file = path.resolve(
        dist,
        relative.endsWith("/") || !relative
          ? path.join(relative, "index.html")
          : relative,
      );
      if (!file.startsWith(path.resolve(dist) + path.sep))
        throw new Error("Unsafe path");
      const bytes = await fs.readFile(file);
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
      });
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
/** @param {{dist: string, browser?: import("playwright").Browser, screenshotsDir?: string, viewports?: typeof CONTRAST_VIEWPORTS, states?: boolean, routes?: string[] | null}} options */
export async function auditBuiltContrast({
  dist,
  browser: existingBrowser,
  screenshotsDir,
  viewports = CONTRAST_VIEWPORTS,
  states = true,
  routes: routeAllowlist = null,
}) {
  const allRoutes = await htmlRoutes(dist);
  const routes = routeAllowlist
    ? allRoutes.filter((route) => routeAllowlist.includes(route))
    : allRoutes;
  if (!routes.length)
    return {
      version: 1,
      pass: false,
      routes,
      pages: [],
      findings: [{ status: "unresolved", text: "No built HTML routes" }],
    };
  const browser =
    existingBrowser || (await chromium.launch({ headless: true }));
  const { server, origin } = await serve(dist);
  const pages = [];
  try {
    if (screenshotsDir) await fs.mkdir(screenshotsDir, { recursive: true });
    for (const route of routes) {
      for (const viewport of viewports) {
        const auditStarted = Date.now();
        if (process.env.LL_CONTRAST_TRACE === "1")
          process.stdout.write(
            `contrast_audit=start route=${route} viewport=${viewport.name}\n`,
          );
        const page = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
        });
        try {
          const response = await page.goto(origin + route, {
            waitUntil: "networkidle",
          });
          if (!response?.ok())
            throw new Error(`Route HTTP ${response?.status()}`);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(150);
          const report = await inspectContrastPage(page, { route, states });
          // Scope corrections to the actual stylesheet media regime, including
          // untested widths. Container/cross-origin conditions remain read-only.
          const mediaConditions = await page.evaluate(() => {
            const conditions = new Set();
            let supported = true;
            const visit = (rules) => {
              for (const rule of rules) {
                if (rule instanceof CSSContainerRule) supported = false;
                if (rule instanceof CSSMediaRule) {
                  const query = rule.conditionText;
                  if (matchMedia(query).matches) conditions.add(query);
                  else {
                    // Media lists are OR clauses. Negate each clause separately.
                    for (let clause of query.split(",")) {
                      clause = clause.trim().replace(/^only\s+/, "");
                      const inverse = /^not\s+/.test(clause)
                        ? clause.replace(/^not\s+/, "")
                        : /^(all|screen|print)\b/.test(clause)
                          ? `not ${clause}`
                          : `not all and ${clause}`;
                      if (!matchMedia(inverse).matches) supported = false;
                      conditions.add(inverse);
                    }
                  }
                }
                try {
                  if (rule.styleSheet) visit(rule.styleSheet.cssRules);
                  else if (rule.cssRules) visit(rule.cssRules);
                } catch {
                  supported = false;
                }
              }
            };
            for (const sheet of document.styleSheets) {
              try {
                visit(sheet.cssRules);
              } catch {
                supported = false;
              }
            }
            return supported ? [...conditions].sort() : null;
          });
          const scope = await page.getAttribute("body", "data-ll-route");
          if (screenshotsDir)
            await page.screenshot({
              path: path.join(
                screenshotsDir,
                `${route.replace(/[^a-z0-9-]/gi, "_")}-${viewport.name}.png`,
              ),
              fullPage: true,
            });
          if (process.env.LL_CONTRAST_TRACE === "1")
            process.stdout.write(
              `contrast_audit=complete route=${route} viewport=${viewport.name} ms=${Date.now() - auditStarted} findings=${report.findings.length}\n`,
            );
          pages.push({
            ...report,
            viewport,
            repairScopeVerified: scope === route && mediaConditions !== null,
            mediaConditions,
          });
        } catch (error) {
          pages.push({
            route,
            viewport,
            pass: false,
            targets: [],
            findings: [
              {
                route,
                status: "unresolved",
                text: error.message,
                repairEligible: false,
              },
            ],
          });
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (!existingBrowser) await browser.close();
  }
  return {
    version: 1,
    pass: pages.every((p) => p.pass),
    routes,
    pages,
    findings: pages.flatMap((p) =>
      p.findings.map((f) => ({ ...f, viewport: p.viewport.name })),
    ),
  };
}

/** Restrict changes to known solid local text, consistent across measured states.
 * Ambiguous selectors/routes/effects are not repairable. All repairs must pass
 * the rebuilt audit and the caller's existing source/fidelity/visual gates.
 * Plate repairs paint a provable local opaque surface from the client palette
 * contract for text that no color sweep can prove, such as text over authored
 * pseudo-element or overlapping paint. */
export function planContrastRepairs(
  report,
  { maxRepairs = 32, plates = false } = {},
) {
  const groups = new Map();
  for (const page of report.pages) {
    if (!page.repairScopeVerified) continue;
    for (const f of page.findings) {
      if (
        f.status !== "fail" ||
        !/^body(?: > [a-z][a-z0-9-]*:nth-of-type\(\d+\))*$/.test(f.selector)
      )
        continue;
      const peers = page.targets.filter(
        (t) => t.selector === f.selector && t.kind === "text",
      );
      if (
        peers.some(
          (t) =>
            t.status === "unresolved" ||
            !t.background ||
            t.background !== f.background ||
            t.color !== f.color,
        )
      )
        continue;
      const key = JSON.stringify([page.route, page.viewport.name, f.selector]);
      const previous = groups.get(key);
      const minimum = Math.max(
        f.minimum,
        ...peers.map((t) => t.minimum),
        previous?.minimum || 0,
      );
      const effective = rgbHex(composite(f.foreground, f.backgrounds[0]));
      groups.set(key, {
        route: page.route,
        viewport: page.viewport,
        mediaConditions: page.mediaConditions,
        selector: f.selector,
        minimum,
        paintProperty:
          f.paintProperty === "-webkit-text-fill-color"
            ? "-webkit-text-fill-color"
            : f.paintProperty === "outline-color"
              ? "outline-color"
              : "color",
        original: f.color,
        background: f.background,
        ratio: f.ratio,
        color: ensureContrast(effective, f.background, minimum),
        text: f.text,
      });
    }
  }
  const repairs = [...groups.values()];
  const plateRepairs = [];
  if (plates) {
    const grouped = new Map();
    for (const page of report.pages || []) {
      if (!page.repairScopeVerified) continue;
      for (const target of page.targets || []) {
        if (target.kind !== "text") continue;
        if (target.status !== "unresolved" && target.status !== "fail") continue;
        if (!target.plateSafe) continue;
        if (
          !/^body(?: > [a-z][a-z0-9-]*:nth-of-type\(\d+\))*$/.test(
            target.selector,
          )
        )
          continue;
        const surface = /^#[0-9a-f]{6}$/u.test(String(target.plateSurface || ""))
          ? String(target.plateSurface)
          : null;
        const base = /^#[0-9a-f]{6}$/u.test(String(target.plateText || ""))
          ? String(target.plateText)
          : /^#[0-9a-f]{6}$/u.test(String(target.color || ""))
            ? String(target.color)
            : null;
        if (!surface || !base) continue;
        const peers = page.targets.filter(
          (t) => t.selector === target.selector && t.kind === "text",
        );
        if (
          peers.some(
            (t) =>
              t.plateSafe === false ||
              (t.plateSurface && t.plateSurface !== surface),
          )
        )
          continue;
        const key = JSON.stringify([
          page.route,
          page.viewport.name,
          target.selector,
        ]);
        const previous = grouped.get(key);
        const minimum = Math.max(
          target.minimum,
          ...peers.map((t) => t.minimum),
          previous?.minimum || 0,
        );
        grouped.set(key, {
          kind: "plate",
          route: page.route,
          viewport: page.viewport,
          mediaConditions: page.mediaConditions,
          selector: target.selector,
          minimum,
          surface,
          original: target.color || null,
          color: ensureContrast(base, surface, minimum),
          pseudo: previous?.pseudo === true || target.platePseudo === true,
          text: target.text,
        });
      }
    }
    const plateKeys = new Set(
      [...grouped.values()].map((r) =>
        JSON.stringify([r.route, r.viewport.name, r.selector]),
      ),
    );
    for (const repair of repairs) {
      // A plate already paints and re-colors the same element; drop the color
      // sweep for that selector so the bounded overlay stays minimal.
      if (
        plateKeys.has(
          JSON.stringify([repair.route, repair.viewport.name, repair.selector]),
        )
      )
        continue;
      plateRepairs.push(repair);
    }
    plateRepairs.push(...grouped.values());
  }
  // A bounded color sweep never fixes an arbitrary prefix and hides the rest,
  // so an over-budget color plan is refused entirely and defers to the
  // bounded author repair path.
  const colorRepairs = plates
    ? plateRepairs.filter((r) => r.kind !== "plate")
    : repairs;
  const platesOnly = plates
    ? plateRepairs.filter((r) => r.kind === "plate")
    : [];
  const colorGroups = new Set(
    colorRepairs.map((r) =>
      JSON.stringify([
        r.mediaConditions ?? r.viewport,
        r.paintProperty,
        r.color,
      ]),
    ),
  );
  const boundedColor =
    colorGroups.size > maxRepairs ||
    contrastRepairCss(colorRepairs).length > 16384
      ? []
      : colorRepairs;
  // Plates are repair aids, not a success claim: every application is bounded
  // and the caller's rebuilt audit decides. A large candidate converges over
  // repeated passes, so an over-budget plate plan selects a deterministic
  // subset instead of bailing out.
  const boundedPlates = [];
  if (platesOnly.length) {
    const key = (r) =>
      JSON.stringify([r.route, r.viewport?.name, r.selector]);
    const sorted = [...platesOnly].sort((a, b) => key(a).localeCompare(key(b)));
    const groups = new Set();
    for (const plate of sorted) {
      const group = JSON.stringify([
        plate.mediaConditions ?? plate.viewport,
        "plate",
        plate.surface,
        plate.color,
      ]);
      const nextGroups = new Set(groups).add(group);
      if (
        nextGroups.size > maxRepairs ||
        contrastRepairCss([...boundedPlates, plate]).length > 16384
      )
        break;
      groups.add(group);
      boundedPlates.push(plate);
    }
  }
  return [...boundedColor, ...boundedPlates];
}
export function contrastRepairCss(repairs) {
  const groups = new Map();
  const plateGroups = new Map();
  for (const r of repairs) {
    const conditions = r.mediaConditions ?? [
      [
        `(min-width: ${r.viewport.min}px)`,
        r.viewport.max !== null && `(max-width: ${r.viewport.max}px)`,
      ]
        .filter(Boolean)
        .join(" and "),
    ];
    const scopedSelector = r.selector.replace(
      /^body/,
      `body[data-ll-route=${JSON.stringify(r.route)}]`,
    );
    if (r.kind === "plate") {
      const key = JSON.stringify([conditions, r.surface, r.color]);
      if (!plateGroups.has(key))
        plateGroups.set(key, {
          conditions,
          surface: r.surface,
          color: r.color,
          selectors: new Set(),
          pseudoSelectors: new Set(),
        });
      const group = plateGroups.get(key);
      group.selectors.add(scopedSelector);
      if (r.pseudo) group.pseudoSelectors.add(scopedSelector);
      continue;
    }
    const property = r.paintProperty || "color";
    const key = JSON.stringify([conditions, property, r.color]);
    if (!groups.has(key))
      groups.set(key, {
        conditions,
        property,
        color: r.color,
        selectors: new Set(),
      });
    groups.get(key).selectors.add(scopedSelector);
  }
  const colorRules = [...groups.values()].map((g) => {
    let rule = `${[...g.selectors].join(",")}{--ll-creative-auto-text:${g.color};${g.property}:var(--ll-creative-auto-text)!important;}`;
    for (const condition of g.conditions)
      rule = `@media ${condition}{${rule}}`;
    return rule;
  });
  // A plate is an opaque local surface from the client palette contract. Its
  // background paints inside the element's own box and its neutralized
  // pseudo-elements keep the glyph backdrop provable; the bounded repair is
  // only emitted for elements without own transforms, filters or clipping.
  const plateRules = [...plateGroups.values()].map((g) => {
    const scoped = [...g.selectors];
    const fill = scoped
      .map(
        (selector) =>
          `${selector}{position:relative!important;z-index:3!important;background-color:${g.surface}!important;background-image:none!important;color:${g.color}!important;padding:.1em .35em!important;box-sizing:border-box;box-decoration-break:clone;isolation:isolate;}`,
      )
      .join("");
    const pseudos = [...g.pseudoSelectors]
      .flatMap((selector) => [`${selector}::before`, `${selector}::after`])
      .map((selector) => `${selector}{content:none!important;}`)
      .join("");
    let rule = fill + pseudos;
    for (const condition of g.conditions)
      rule = `@media ${condition}{${rule}}`;
    return rule;
  });
  return (
    "\n/* launchloom: bounded rendered contrast corrections */\n" +
    [...colorRules, ...plateRules].join("\n") +
    "\n"
  );
}
/** Discovered built HTML routes, for callers that scope audits. */
export async function builtRoutes(dist) {
  return htmlRoutes(dist);
}
/** @param {{dist: string, stylesPath?: string, deployedStylesPath?: string, build?: () => unknown, reportPath?: string, browser?: import("playwright").Browser, screenshotsDir?: string, repair?: boolean, plates?: boolean, routes?: string[] | null, maxPasses?: number, maxTotalCssChars?: number}} options */
export async function enforceBuiltContrast({
  dist,
  stylesPath,
  deployedStylesPath,
  build,
  reportPath,
  browser,
  screenshotsDir,
  repair = true,
  plates = false,
  routes = null,
  maxPasses = 8,
  maxTotalCssChars = 98_304,
}) {
  const before = await auditBuiltContrast({ dist, browser, routes, screenshotsDir: repair ? undefined : screenshotsDir });
  let after = before;
  const repairs = [];
  if (repair && stylesPath) {
    const applied = new Set();
    let appliedCssChars = 0;
    // Each application stays inside the existing bounded sweep contract
    // (group and size caps), and a large candidate converges over a few
    // passes because every plated element passes the next audit.
    for (let pass = 0; pass < maxPasses && !after.pass; pass += 1) {
      const planned = planContrastRepairs(after, { plates });
      const fresh = planned.filter((repair) => {
        const signature = JSON.stringify([
          repair.kind || "color",
          repair.route,
          repair.viewport?.name,
          repair.selector,
          repair.color,
          repair.surface,
        ]);
        if (applied.has(signature)) return false;
        applied.add(signature);
        return true;
      });
      if (!fresh.length) break;
      if (typeof build !== "function")
        throw new Error("Contrast repair requires a real rebuild callback");
      const css = contrastRepairCss(fresh);
      if (appliedCssChars + css.length > maxTotalCssChars) break;
      const original = await fs.readFile(stylesPath, "utf8");
      await fs.writeFile(stylesPath, original + css);
      if (
        deployedStylesPath &&
        path.resolve(deployedStylesPath) !== path.resolve(stylesPath)
      ) {
        const deployed = await fs.readFile(deployedStylesPath, "utf8");
        await fs.writeFile(deployedStylesPath, deployed + css);
      }
      appliedCssChars += css.length;
      repairs.push(...fresh);
      await build();
      after = await auditBuiltContrast({ dist, browser, routes });
    }
    if (screenshotsDir)
      after = await auditBuiltContrast({ dist, browser, routes, screenshotsDir });
  } else if (screenshotsDir && repair)
    after = await auditBuiltContrast({ dist, browser, routes, screenshotsDir });
  const report = { version: 1, pass: after.pass, before, repairs, after };
  if (reportPath) {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  }
  return report;
}
