import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import {
  ensureContrast,
  rgbHex,
  composite,
  contrast,
} from "./color-contrast.mjs";
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
 * Repairs are foreground-only (color, text-fill, outline). Opaque plate paint
 * was retired because it boxed text and force-painted controls; unresolved
 * image/overlap cases defer to bounded author repair instead. Ambiguous
 * selectors/routes/effects are not repairable. All repairs must pass the
 * rebuilt audit and the caller's existing source/fidelity/visual gates. */
/** Every measured backdrop a correction for these targets must satisfy. */
function backdropCandidates(targets) {
  const candidates = new Set();
  for (const target of targets) {
    if (target.background) candidates.add(target.background);
    if (target.pixelBackdrop?.dark) candidates.add(target.pixelBackdrop.dark);
    if (target.pixelBackdrop?.light) candidates.add(target.pixelBackdrop.light);
  }
  return [...candidates];
}

/** Nearest readable color at the requested minimum against every backdrop.
 * Returns null when no single foreground satisfies all of them (for example a
 * full black-to-white photo range); the repair is then refused instead of
 * guessing. A color proven against the darkest and lightest measured pixels is
 * proven against everything between them.
 * @param {string} original
 * @param {string[]} backdrops
 * @param {number} minimum
 */
export function proveForegroundAgainst(original, backdrops, minimum) {
  const candidates = [];
  for (const backdrop of backdrops) {
    try {
      candidates.push(ensureContrast(original, backdrop, minimum));
    } catch {
      // No readable foreground exists for this backdrop alone; another
      // backdrop's candidate may still satisfy the whole set.
    }
  }
  // The pure ends are the strongest single-sided proofs: a range that is
  // entirely dark is satisfied by white and vice versa, where a minimal
  // per-backdrop candidate would fail the other side.
  candidates.push("#000000", "#ffffff");
  for (const candidate of candidates) {
    let pass = true;
    for (const backdrop of backdrops) {
      const ratio = contrast(candidate, backdrop);
      if (!Number.isFinite(ratio) || ratio + 1e-9 < minimum) {
        pass = false;
        break;
      }
    }
    if (pass) return candidate;
  }
  return null;
}

/** Restrict changes to known local text and focus indicators, consistent
 * within the correction's state scope. Corrections are foreground-only (color,
 * text-fill, outline: outline synthesis for missing or unreadable focus
 * indicators) and must be proven against every measured backdrop of every
 * state of the same selector, including pixel-resolved backdrops. Opaque plate
 * paint was retired because it boxed text and force-painted controls.
 * Unresolved peers, differing state foreground colors, unprovable backdrop
 * ranges, ambiguous selectors, and over-budget plans defer to bounded author
 * repair. All repairs must pass the rebuilt audit and the caller's existing
 * source/fidelity/visual gates. */
export function planContrastRepairs(report, { maxRepairs = 32 } = {}) {
  const groups = new Map();
  for (const page of report.pages) {
    if (!page.repairScopeVerified) continue;
    for (const f of page.findings) {
      if (
        f.status !== "fail" ||
        !/^body(?: > [a-z][a-z0-9-]*:nth-of-type\(\d+\))*$/.test(f.selector)
      )
        continue;
      // Corrections are state-scoped: hover findings repair with :hover rules
      // and focus/outline findings with :focus-visible rules, so an element
      // whose paint differs between states no longer blocks its own repair.
      // Default-state repairs keep the cross-state foreground guard: a static
      // rule may not override a state that paints a different color.
      const focusScoped =
        f.paintProperty === "outline-color" ||
        f.kind === "focus" ||
        f.state === "focus";
      const stateScope = focusScoped
        ? ":focus-visible"
        : f.state === "hover"
          ? ":hover"
          : f.state === "default"
            ? ""
            : null;
      if (stateScope === null || (!focusScoped && f.kind !== "text")) continue;
      const peers =
        stateScope === ""
          ? page.targets.filter(
              (t) => t.selector === f.selector && t.kind === f.kind,
            )
          : page.targets.filter(
              (t) =>
                t.selector === f.selector &&
                t.state === f.state &&
                t.kind === f.kind,
            );
      if (peers.some((t) => t.status === "unresolved" || t.color !== f.color))
        continue;
      const backdrops = backdropCandidates(peers);
      if (!backdrops.length) continue;
      const minimum = Math.max(f.minimum, ...peers.map((t) => t.minimum));
      const effective = f.pixelResolved
        ? f.color
        : rgbHex(composite(f.foreground, f.backgrounds[0]));
      const color = proveForegroundAgainst(effective, backdrops, minimum);
      if (!color) continue;
      const key = JSON.stringify([
        page.route,
        page.viewport.name,
        f.selector,
        stateScope,
      ]);
      const previous = groups.get(key);
      groups.set(key, {
        kind: focusScoped ? "indicator" : "foreground",
        route: page.route,
        viewport: page.viewport,
        mediaConditions: page.mediaConditions,
        selector: f.selector,
        stateScope,
        minimum: Math.max(minimum, previous?.minimum || 0),
        paintProperty: focusScoped
          ? "outline"
          : f.paintProperty === "-webkit-text-fill-color"
            ? "-webkit-text-fill-color"
            : "color",
        original: f.color,
        background: backdrops.join(","),
        ratio: f.ratio,
        color,
        text: f.text,
      });
    }
  }
  const colorRepairs = [...groups.values()];
  // A bounded color sweep never fixes an arbitrary prefix and hides the rest,
  // so an over-budget color plan is refused entirely and defers to the
  // bounded author repair path.
  const colorGroups = new Set(
    colorRepairs.map((r) =>
      JSON.stringify([
        r.mediaConditions ?? r.viewport,
        r.paintProperty,
        r.color,
      ]),
    ),
  );
  return colorGroups.size > maxRepairs ||
    contrastRepairCss(colorRepairs).length > 16384
    ? []
    : colorRepairs;
}
export function contrastRepairCss(repairs) {
  const groups = new Map();
  for (const r of repairs) {
    if (r.kind === "plate") continue;
    const conditions = r.mediaConditions ?? [
      [
        `(min-width: ${r.viewport.min}px)`,
        r.viewport.max !== null && `(max-width: ${r.viewport.max}px)`,
      ]
        .filter(Boolean)
        .join(" and "),
    ];
    const scopedSelector =
      r.selector.replace(
        /^body/,
        `body[data-ll-route=${JSON.stringify(r.route)}]`,
      ) + (r.stateScope || "");
    const indicator = r.kind === "indicator";
    const property = r.paintProperty || "color";
    const key = JSON.stringify([
      conditions,
      indicator ? "indicator" : property,
      r.color,
    ]);
    if (!groups.has(key))
      groups.set(key, {
        conditions,
        property,
        indicator,
        color: r.color,
        selectors: new Set(),
      });
    groups.get(key).selectors.add(scopedSelector);
  }
  const colorRules = [...groups.values()].map((g) => {
    const selectorList = [...g.selectors].join(",");
    let rule = g.indicator
      ? `${selectorList}{outline:2px solid ${g.color}!important;outline-offset:2px!important}`
      : `${selectorList}{--ll-creative-auto-text:${g.color};${g.property}:var(--ll-creative-auto-text)!important}`;
    for (const condition of g.conditions) rule = `@media ${condition}{${rule}}`;
    return rule;
  });
  return (
    "\n/* launchloom: bounded rendered contrast corrections */\n" +
    colorRules.join("\n") +
    "\n/* launchloom: end bounded rendered contrast corrections */\n"
  );
}

export const BOUNDED_CORRECTIONS_START =
  "/* launchloom: bounded rendered contrast corrections */";
export const BOUNDED_CORRECTIONS_END =
  "/* launchloom: end bounded rendered contrast corrections */";

// Generated corrections are single-line rules with these exact signatures;
// anything else that follows a legacy marker is authored CSS and is preserved.
const GENERATED_RULE_SIGNATURES = [
  "{--ll-creative-auto-text:#",
  "{outline:2px solid #",
  "position:relative!important;z-index:3!important;background-color:#",
  "content:none!important;}",
];

/** Remove every managed corrections block (delimited or legacy undelimited)
 * while preserving authored CSS anywhere in the file. */
export function stripBoundedCorrections(existing) {
  let text = String(existing ?? "");
  let guard = 0;
  while (guard++ < 200) {
    const start = text.indexOf(BOUNDED_CORRECTIONS_START);
    if (start === -1) break;
    const end = text.indexOf(BOUNDED_CORRECTIONS_END, start);
    if (end !== -1) {
      text =
        text.slice(0, start) + text.slice(end + BOUNDED_CORRECTIONS_END.length);
      continue;
    }
    // Legacy undelimited block: the marker line plus the contiguous generated
    // rule lines that follow it are managed content; authored CSS stops the
    // scan and is preserved.
    const lines = text
      .slice(start + BOUNDED_CORRECTIONS_START.length)
      .split("\n");
    let consumed = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "") {
        consumed += 1;
        continue;
      }
      const generated =
        trimmed.endsWith("}") &&
        GENERATED_RULE_SIGNATURES.some((signature) =>
          trimmed.includes(signature),
        );
      if (!generated) break;
      consumed += 1;
    }
    text = text.slice(0, start) + lines.slice(consumed).join("\n");
  }
  return text.replace(/\n{3,}/g, "\n\n").trimEnd();
}

/** Rewrite the managed corrections block in place so repeated passes and
 * repeated runs never append duplicate or obsolete rules, and authored CSS
 * before or after the block is always preserved. */
export function withBoundedCorrections(existing, css) {
  const base = stripBoundedCorrections(existing);
  return base ? `${base}\n${css}` : String(css).trimStart();
}
/** Discovered built HTML routes, for callers that scope audits. */
export async function builtRoutes(dist) {
  return htmlRoutes(dist);
}
/** @param {{dist: string, stylesPath?: string, deployedStylesPath?: string, build?: () => unknown, reportPath?: string, browser?: import("playwright").Browser, screenshotsDir?: string, repair?: boolean, routes?: string[] | null, maxPasses?: number, maxTotalCssChars?: number}} options */
export async function enforceBuiltContrast({
  dist,
  stylesPath,
  deployedStylesPath,
  build,
  reportPath,
  browser,
  screenshotsDir,
  repair = true,
  routes = null,
  maxPasses = 8,
  maxTotalCssChars = 98_304,
}) {
  const before = await auditBuiltContrast({
    dist,
    browser,
    routes,
    screenshotsDir: repair ? undefined : screenshotsDir,
  });
  let after = before;
  const repairs = [];
  if (repair && stylesPath) {
    const applied = new Set();
    // Each pass rewrites the managed corrections block with the accumulated
    // foreground-only repairs; a large candidate converges over a few passes
    // because every corrected element passes the next audit.
    for (let pass = 0; pass < maxPasses && !after.pass; pass += 1) {
      const planned = planContrastRepairs(after);
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
      const cumulative = [...repairs, ...fresh];
      const css = contrastRepairCss(cumulative);
      if (css.length > maxTotalCssChars) break;
      const original = await fs.readFile(stylesPath, "utf8");
      await fs.writeFile(stylesPath, withBoundedCorrections(original, css));
      if (
        deployedStylesPath &&
        path.resolve(deployedStylesPath) !== path.resolve(stylesPath)
      ) {
        const deployed = await fs.readFile(deployedStylesPath, "utf8");
        await fs.writeFile(
          deployedStylesPath,
          withBoundedCorrections(deployed, css),
        );
      }
      repairs.push(...fresh);
      await build();
      after = await auditBuiltContrast({ dist, browser, routes });
    }
  } else if (screenshotsDir && repair)
    after = await auditBuiltContrast({ dist, browser, routes, screenshotsDir });
  const report = { version: 1, pass: after.pass, before, repairs, after };
  if (reportPath) {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  }
  return report;
}
