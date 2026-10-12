import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";
import {
  compileRouteInventory,
  approvedRoutes,
} from "../templates/client-site/src/lib/route-inventory.mjs";
import {
  compilePageBriefs,
  pageBriefExpectedContent,
} from "../templates/client-site/src/lib/page-briefs.mjs";
import { redactPrivateLocation } from "../templates/client-site/src/lib/business-facts.mjs";
import {
  hasPipelineTest,
  hasTestOnlySite,
} from "../templates/client-site/src/lib/seo-readiness.mjs";
const message = (error) =>
  String(error?.message || error)
    .split("\n")[0]
    .replace(/(https?:\/\/[^?\s]+)\?[^\s]+/gu, "$1?[redacted]");

export function diagnosticFormMode(config, mode = "review") {
  if (mode === "production") {
    if (hasTestOnlySite(config))
      throw new Error(
        "Diagnostic test-only site provenance cannot use production form verification.",
      );
    return "mocked";
  }
  if (!hasTestOnlySite(config)) return "mocked";
  if (!hasPipelineTest(config) && config.demoNotice) return "test-preview";
  const provenance = config.pipelineTest;
  if (
    !provenance ||
    provenance.version !== 1 ||
    provenance.testOnly !== true ||
    !["seo-only", "creative-only", "full-preview"].includes(
      provenance.profile,
    ) ||
    !/^[a-f0-9]{40}$/iu.test(provenance.sourceSha || "") ||
    typeof provenance.runId !== "string" ||
    !provenance.runId.trim() ||
    config.lead?.apiUrl ||
    config.lead?.token
  )
    throw new Error(
      "Diagnostic test-preview form checks require valid persisted test provenance and empty API URL/token.",
    );
  return "test-preview";
}

async function verifyDiagnosticForm(
  page,
  form,
  phase,
  requests,
  network,
  timeout,
) {
  const result = {
    renderer: "preview",
    rendering: "pass",
    initialization: "not_verified",
    previewDisabled: "not_verified",
    delivery: {
      success: "not_verified",
      failure: "not_verified",
      networkFailure: "not_verified",
    },
    externalDelivery: "not_verified",
    syntheticRequests: 0,
    failures: [],
  };
  try {
    if (
      !(await form.isVisible()) ||
      (await form.getAttribute("data-lead-preview")) !== "true"
    )
      throw new Error("Diagnostic form must be visible and preview-marked.");
    if (
      await form
        .locator('[name="lead-token"]')
        .evaluateAll((nodes) => nodes.some((node) => node.value))
    )
      throw new Error("Diagnostic form exposes a live token.");
    for (let count = 0; count < 8; count++) {
      const radio = form
        .locator("[data-lead-step]:not([hidden]) input[type=radio]")
        .first();
      if (!(await radio.count())) break;
      await radio.check();
      await page.waitForTimeout(180);
    }
    for (const [name, value] of Object.entries({
      name: "Stage 4 Synthetic",
      phone: "555-0101",
      email: "stage4@example.test",
      message: "Synthetic disabled-preview verification.",
    }))
      await form.locator(`[name="${name}"]`).fill(value);
    for (const select of await form.locator("select[required]").all()) {
      const value = await select
        .locator("option")
        .evaluateAll(
          (nodes) => nodes.find((node) => node.value && !node.disabled)?.value,
        );
      if (value) await select.selectOption(value);
    }
    await page.evaluate(() => {
      window.__llQaPreviewSubmitted = 0;
      window.addEventListener(
        "launchloom:lead-submitted",
        () => window.__llQaPreviewSubmitted++,
      );
    });
    const before = requests.length + network.length;
    const status = form.locator("[role=status]").last();
    await status.evaluate((node) => {
      node.textContent = "";
    });
    phase.value = "preview-submit";
    await form.locator("button[type=submit]").click();
    await status
      .filter({
        hasText:
          /(?:test-only preview|developer preview only).*(?:disabled|nothing was sent|not connected)/iu,
      })
      .waitFor({ timeout });
    // Keep the submission guard active during the bounded post-response observation.
    await page.waitForTimeout(500);
    result.syntheticRequests = requests.length + network.length - before;
    if (
      result.syntheticRequests ||
      (await page.evaluate(() => window.__llQaPreviewSubmitted))
    )
      throw new Error(
        "Diagnostic submission attempted network delivery or reported success.",
      );
    result.previewDisabled = "pass";
    result.initialization = "pass";
  } catch (error) {
    result.failures.push("Diagnostic preview lifecycle: " + message(error));
  } finally {
    phase.value = "observe";
  }
  return result;
}
const profiles = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];
const representatives = [
  { name: "compact", width: 1366, height: 768 },
  { name: "tablet", width: 768, height: 1024 },
];
const sleep = (page) => page.waitForTimeout(150);
export async function serveBuiltSite(dist) {
  const root = path.resolve(dist);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const pathname = decodeURIComponent(url.pathname);
      const file = path.resolve(
        root,
        "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname),
      );
      if (!file.startsWith(root + path.sep)) throw new Error("Unsafe path");
      const body = await fs.readFile(file);
      const mime = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".json": "application/json",
        ".woff2": "font/woff2",
      };
      res.setHeader(
        "Content-Type",
        mime[path.extname(file)] || "application/octet-stream",
      );
      res.end(body);
    } catch {
      const notFound = await fs
        .readFile(path.join(root, "404.html"))
        .catch(() => null);
      res.statusCode = notFound ? 404 : 200;
      res.setHeader("Content-Type", "text/html");
      res.end(
        notFound ||
          (await fs
            .readFile(path.join(root, "index.html"))
            .catch(() => Buffer.from("Not found"))),
      );
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: "http://127.0.0.1:" + server.address().port,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function verifyForm(page, form, config, phase, requests, timeout) {
  const result = {
    renderer:
      (await form.getAttribute("data-runtime")) === "lead-form"
        ? "shared-react"
        : "native",
    rendering: "pass",
    initialization: "not_verified",
    delivery: {
      failure: "not_verified",
      networkFailure: "not_verified",
      success: "not_verified",
    },
    externalDelivery: "not_verified",
    destination: "intercepted synthetic provider",
    failures: [],
  };
  if (!config.lead?.apiUrl || !config.lead?.token) {
    result.failures.push(
      "Form delivery not verified: API URL/token is not configured.",
    );
    return result;
  }
  const values = {
    name: "Stage 4 Synthetic",
    phone: "555-0101",
    email: "stage4@example.test",
    message: "Synthetic verification only. No actual lead delivery.",
  };
  async function fill() {
    for (let count = 0; count < 8; count++) {
      const radio = form
        .locator("[data-lead-step]:not([hidden]) input[type=radio]")
        .first();
      if (!(await radio.count())) break;
      await radio.check();
      await page.waitForTimeout(180);
    }
    for (const [name, value] of Object.entries(values))
      await form.locator(`[name="${name}"]`).fill(value);
    for (const select of await form.locator("select[required]").all()) {
      const value = await select
        .locator("option")
        .evaluateAll(
          (nodes) => nodes.find((node) => node.value && !node.disabled)?.value,
        );
      if (value) await select.selectOption(value);
    }
  }
  const status = form.locator("[role=status]").last();
  const before = requests.length;
  try {
    await page.evaluate(() => {
      window.__llQaLeadSubmitted = 0;
      if (window.__llQaLeadHandler)
        window.removeEventListener(
          "launchloom:lead-submitted",
          window.__llQaLeadHandler,
        );
      window.__llQaLeadHandler = () => window.__llQaLeadSubmitted++;
      window.addEventListener(
        "launchloom:lead-submitted",
        window.__llQaLeadHandler,
      );
    });
    for (const attempt of ["failure", "networkFailure", "success"]) {
      phase.value = attempt;
      await fill();
      const start = requests.length;
      await form.locator("button[type=submit]").click();
      await page
        .waitForFunction(
          () => !document.querySelector("form button[type=submit]:disabled"),
          null,
          { timeout },
        )
        .catch(() => {});
      if (attempt === "failure")
        await status
          .getByText("Synthetic delivery failed. No lead was sent.", {
            exact: true,
          })
          .waitFor({ timeout });
      else if (attempt === "success")
        await status
          .getByText("Thank you. We will be in touch shortly.", { exact: true })
          .waitFor({ timeout });
      else
        await page.waitForFunction(
          () =>
            [...document.querySelectorAll("form [role=status]")].some(
              (node) =>
                /fetch|send|network/i.test(node.textContent || "") &&
                !/Sending|Thank you/i.test(node.textContent || ""),
            ),
          null,
          { timeout },
        );
      const request = requests.at(-1);
      if (requests.length !== start + 1 || !request?.payloadBound)
        throw new Error(
          "Expected exactly one configured synthetic lead request.",
        );
      if (attempt !== "success") {
        if (
          (await status.innerText()).includes("Thank you") ||
          (await page.evaluate(() => window.__llQaLeadSubmitted)) > 0 ||
          !(
            await Promise.all(
              Object.entries(values).map(
                async ([name, value]) =>
                  (await form.locator(`[name="${name}"]`).inputValue()) ===
                  value,
              ),
            )
          ).every(Boolean)
        )
          throw new Error(
            "Failed delivery was reported as successful or discarded visitor input.",
          );
      }
      if (
        attempt === "success" &&
        ((await page.evaluate(() => window.__llQaLeadSubmitted)) !== 1 ||
          !(
            await Promise.all(
              Object.keys(values).map(
                async (name) =>
                  (await form.locator(`[name="${name}"]`).inputValue()) === "",
              ),
            )
          ).every(Boolean))
      )
        throw new Error(
          "Successful delivery did not emit exactly one lifecycle event and reset the input fields.",
        );
      result.delivery[attempt] = "pass";
    }
    result.initialization = "pass";
    result.syntheticRequests = requests.length - before;
  } catch (error) {
    result.failures.push("Form lifecycle: " + message(error));
  } finally {
    phase.value = "observe";
  }
  return result;
}

/** Approved route browser evidence. Mutating requests are always intercepted.
 * @param {{config: any, origin: string, formMode?: string, mode?: string, viewports?: Array<{name:string,width:number,height:number}>, representativeViewports?: Array<{name:string,width:number,height:number}>, screenshotsDir?: string, timeout?: number, browser?: import("playwright").Browser}} options
 */
export async function verifyApprovedRoutes({
  config,
  origin,
  formMode = "observe",
  mode = "review",
  viewports,
  representativeViewports = representatives,
  screenshotsDir,
  timeout = 5000,
  browser: existingBrowser,
}) {
  if (
    formMode === "test-preview" &&
    diagnosticFormMode(config, mode) !== "test-preview"
  )
    throw new Error(
      "Diagnostic test-preview checks cannot replace ordinary or production delivery checks.",
    );
  const target = new URL(origin);
  if (
    !["http:", "https:"].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.search ||
    target.hash
  )
    throw new Error("Use a credential-free HTTP(S) origin.");
  const inventory = compileRouteInventory(config);
  const records = approvedRoutes(inventory, {
    production: mode === "production",
  });
  const briefs = compilePageBriefs(config);
  const failures = [];
  const routes = [];
  const negativeRoutes = [];
  const browser =
    existingBrowser || (await chromium.launch({ headless: true }));
  if (screenshotsDir) await fs.mkdir(screenshotsDir, { recursive: true });
  const seenTypes = new Set();
  const api = config.lead?.apiUrl
    ? config.lead.apiUrl.replace(/\/$/u, "") + "/api/lead"
    : null;
  try {
    for (const record of records) {
      const firstType = !seenTypes.has(record.pageType);
      seenTypes.add(record.pageType);
      const selected = viewports || [
        ...profiles,
        ...(firstType ? representativeViewports : []),
      ];
      const route = {
        routeId: record.id,
        path: record.path,
        pageType: record.pageType,
        status: "pass",
        profiles: [],
      };
      for (const viewport of selected) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
        });
        const page = await context.newPage();
        page.setDefaultTimeout(timeout);
        const phase = { value: "observe" };
        const requests = [];
        const runtime = [];
        const consoleErrors = [];
        const network = [];
        const checks = [];
        const forms = [];
        let snapshot = null;
        const add = (name, ok, detail) =>
          checks.push({ name, status: ok ? "pass" : "fail", detail });
        await context.route("**/*", async (intercepted) => {
          const req = intercepted.request();
          // The disabled form must not initiate any network activity. The page
          // is already network-idle before submit; guard every resource type,
          // including image/ping GET beacons, throughout this bounded phase.
          if (formMode === "test-preview" && phase.value === "preview-submit") {
            network.push("Diagnostic submission attempted a network request.");
            await intercepted.abort();
            return;
          }
          if (req.method() === "GET" || req.method() === "HEAD") {
            await intercepted.continue();
            return;
          }
          if (formMode === "mocked" && api && req.url() === api) {
            let payload = {};
            try {
              payload = req.postDataJSON();
            } catch {}
            requests.push({
              path: new URL(req.url()).pathname,
              payloadBound:
                payload.token === config.lead.token &&
                payload.name === "Stage 4 Synthetic" &&
                payload.email === "stage4@example.test" &&
                (() => {
                  try {
                    return (
                      new URL(payload.pageUrl || origin).pathname ===
                      record.path
                    );
                  } catch {
                    return false;
                  }
                })(),
            });
            if (phase.value === "networkFailure")
              await intercepted.abort("connectionrefused");
            else
              await intercepted.fulfill({
                status: phase.value === "success" ? 200 : 503,
                contentType: "application/json",
                body: JSON.stringify(
                  phase.value === "success"
                    ? { ok: true }
                    : { error: "Synthetic delivery failed. No lead was sent." },
                ),
              });
            return;
          }
          network.push("Unexpected mutating request intercepted.");
          await intercepted.abort();
        });
        page.on("pageerror", (error) => runtime.push(message(error)));
        page.on("console", (event) => {
          if (
            event.type() === "error" &&
            !(api && event.location().url === api && phase.value !== "observe")
          )
            consoleErrors.push(message(event.text()));
        });
        page.on("response", (response) => {
          const req = response.request();
          if (
            response.status() >= 400 &&
            [
              "document",
              "script",
              "stylesheet",
              "image",
              "font",
              "xhr",
              "fetch",
            ].includes(req.resourceType()) &&
            !(api && req.url() === api && phase.value !== "observe")
          )
            network.push(
              `asset/network HTTP ${response.status()} (${req.resourceType()})`,
            );
        });
        page.on("requestfailed", (req) => {
          if (
            !(api && req.url() === api && phase.value !== "observe") &&
            req.failure()?.errorText !== "net::ERR_ABORTED"
          )
            network.push(
              "asset/network request failed (" + req.resourceType() + ")",
            );
        });
        try {
          const response = await page.goto(new URL(record.path, origin).href, {
            waitUntil: "networkidle",
          });
          add(
            "direct-http",
            response?.status() === 200,
            "Direct approved route returns HTTP 200.",
          );
          await page.evaluate(() => document.fonts.ready);
          await sleep(page);
          const brief = briefs.briefs.find(
            (item) => item.routeId === record.id,
          );
          const h1 = page.locator("main h1");
          add(
            "h1",
            (await h1.count()) === 1 &&
              Boolean(await h1.first().innerText()) &&
              (await h1.first().isVisible()),
            "One visible meaningful main H1.",
          );
          const disclosures = page.locator("main details");
          for (const detail of await disclosures.all()) {
            const summary = detail.locator("summary").first();
            await detail.evaluate((node) => (node.open = false));
            await summary.focus();
            await page.keyboard.press("Enter");
            add(
              "disclosure",
              (await detail.getAttribute("open")) !== null,
              "Native disclosure opens with keyboard.",
            );
          }
          if (brief?.mode === "supported") {
            const body = await page.locator("main").innerText();
            add(
              "supported-content",
              pageBriefExpectedContent(brief).every((value) =>
                body.includes(value),
              ),
              "Supported page-specific content remains visible after hydration/disclosure.",
            );
          }
          const images = await page.locator("main img").evaluateAll((nodes) =>
            nodes.map((node) => ({
              loaded: node.complete && node.naturalWidth > 0,
              alt: node.hasAttribute("alt"),
            })),
          );
          add(
            "media",
            images.every((image) => image.loaded && image.alt),
            "Page assets load and have explicit alt attributes.",
          );
          add(
            "overflow",
            !(await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth + 1,
            )),
            "No horizontal overflow.",
          );
          for (const form of await page
            .locator("main form.lead-form,main form.launchloom-lead-form")
            .all()) {
            if (formMode === "test-preview") {
              forms.push(
                await verifyDiagnosticForm(
                  page,
                  form,
                  phase,
                  requests,
                  network,
                  timeout,
                ),
              );
              continue;
            }
            if ((await form.getAttribute("data-lead-preview")) === "true") {
              // Developer previews render the authored form for inspection
              // without a live submission path; it has no lifecycle to verify.
              forms.push({
                renderer: "preview",
                rendering: "pass",
                delivery: { success: "not_verified", failure: "not_verified" },
                failures:
                  mode === "production"
                    ? [
                        "Production forms require terminal synthetic lifecycle evidence.",
                      ]
                    : [],
              });
              continue;
            }
            if (formMode === "mocked" && !runtime.length)
              forms.push(
                await verifyForm(page, form, config, phase, requests, timeout),
              );
            else
              forms.push({
                renderer: "observed",
                delivery: { success: "not_verified", failure: "not_verified" },
                failures: [
                  "Form delivery not verified: observation-only or runtime failure.",
                ],
              });
          }
          const unknownForms = await page
            .locator(
              "main iframe[data-form-provider],main [data-form-embed],main [data-runtime=lead-form-disabled],main form:not(.lead-form):not(.launchloom-lead-form)",
            )
            .count();
          if (unknownForms)
            forms.push({
              renderer: "embed",
              delivery: { success: "not_verified", failure: "not_verified" },
              failures: [
                "Embedded form lifecycle not verified: no supported adapter.",
              ],
            });
          add(
            "conversion",
            (!["contact", "service", "location"].includes(record.pageType) ||
              forms.length > 0) &&
              forms.every((form) => form.failures.length === 0),
            "Required service/location/contact forms must render and have terminal synthetic lifecycle evidence.",
          );
          if (
            formMode === "test-preview" &&
            forms.some((form) => form.failures.length)
          )
            throw new Error(
              forms.flatMap((form) => form.failures).join(" ") +
                " Close the page before navigation can replay a submission target.",
            );
          const reload = await page.reload({ waitUntil: "networkidle" });
          add(
            "refresh",
            reload?.status() === 200 &&
              new URL(page.url()).pathname === record.path,
            "Refreshing the approved route returns HTTP 200 and preserves its path.",
          );
          const refreshedH1 = page.locator("main h1");
          add(
            "main-heading-after-refresh",
            (await refreshedH1.count()) === 1 &&
              Boolean(await refreshedH1.first().innerText()) &&
              (await refreshedH1.first().isVisible()),
            "After refresh, the main landmark still contains one visible meaningful H1.",
          );
          const links = page.locator("main a[href]");
          let navigated = false;
          for (const link of await links.all()) {
            const href = await link.getAttribute("href");
            let url;
            try {
              url = new URL(href, page.url());
            } catch {
              continue;
            }
            if (
              url.origin !== target.origin ||
              url.pathname === record.path ||
              !records.some((item) => item.path === url.pathname) ||
              !(await link.isVisible())
            )
              continue;
            await link.click();
            await page.waitForURL(url.href, { timeout });
            await page.goBack({ waitUntil: "networkidle" });
            add(
              "back",
              new URL(page.url()).pathname === record.path,
              "Back restores the tested page.",
            );
            await page.goForward({ waitUntil: "networkidle" });
            add(
              "forward",
              new URL(page.url()).pathname === url.pathname,
              "Forward restores the linked route.",
            );
            navigated = true;
            break;
          }
          add(
            "navigation",
            navigated || records.length === 1,
            "At least one visible contextual route link navigates.",
          );
          await page.goto(new URL(record.path, origin).href, {
            waitUntil: "networkidle",
          });
          await page.emulateMedia({ reducedMotion: "reduce" });
          await page.reload({ waitUntil: "networkidle" });
          await sleep(page);
          const reduced = await page.evaluate(() => ({
            matches: matchMedia("(prefers-reduced-motion: reduce)").matches,
            running: document
              .getAnimations()
              .filter(
                (animation) =>
                  animation.playState === "running" &&
                  (!Number.isFinite(
                    animation.effect?.getComputedTiming().endTime,
                  ) ||
                    animation.effect?.getComputedTiming().duration > 500),
              ).length,
          }));
          add(
            "reduced-motion",
            reduced.matches && reduced.running === 0,
            "Reduced motion loads without sustained nonessential animation.",
          );
          await page.keyboard.press("Tab");
          const focused = await page.evaluate(
            () => document.activeElement !== document.body,
          );
          add("focus", focused, "Keyboard can reach an interactive control.");
          if (screenshotsDir) {
            snapshot = path.join(
              screenshotsDir,
              record.id.replace(/[^a-z0-9]/giu, "-") +
                "-" +
                viewport.name +
                ".png",
            );
            await page.screenshot({ path: snapshot, fullPage: true });
          }
          add("runtime", runtime.length === 0, "No runtime script errors.");
          add(
            "console",
            consoleErrors.length === 0,
            "No unexpected console errors.",
          );
          add(
            "network",
            network.length === 0,
            "No unexpected failed assets/network requests.",
          );
          route.profiles.push({
            viewport,
            checks,
            forms,
            screenshot: snapshot,
            runtimeErrors: runtime,
            consoleErrors,
            networkErrors: network,
          });
        } catch (error) {
          add("browser", false, message(error));
          route.profiles.push({
            viewport,
            checks,
            forms,
            screenshot: snapshot,
            runtimeErrors: runtime,
            consoleErrors,
            networkErrors: network,
          });
        } finally {
          await context.close();
        }
      }
      route.status = route.profiles.every((profile) =>
        profile.checks.every((check) => check.status === "pass"),
      )
        ? "pass"
        : "fail";
      routes.push(route);
      for (const profile of route.profiles) {
        for (const check of profile.checks.filter(
          (check) => check.status === "fail",
        ))
          failures.push(
            `${record.path} ${profile.viewport.name}: ${check.name}: ${check.detail}`,
          );
        for (const form of profile.forms)
          failures.push(
            ...form.failures.map(
              (detail) => `${record.path} ${profile.viewport.name}: ${detail}`,
            ),
          );
      }
    }
    const context = await browser.newContext();
    try {
      for (const pathname of [
        "/launchloom-nonexistent/",
        "/services/launchloom-nonexistent/",
        "/locations/launchloom-nonexistent/",
        "/services/__invalid_slug__/",
      ]) {
        const response = await context.request.get(
          new URL(pathname, origin).href,
        );
        const status = response.status();
        negativeRoutes.push({
          path: pathname,
          http: status,
          status: status === 404 ? "pass" : "fail",
        });
        if (status !== 404)
          failures.push(
            `${pathname}: invalid/unknown route must return real HTTP 404, received ${status}.`,
          );
      }
    } finally {
      await context.close();
    }
  } finally {
    if (!existingBrowser) await browser.close();
  }
  const report = {
    version: 1,
    scope: "browser-and-synthetic-conversion",
    environment:
      target.hostname === "127.0.0.1" || target.hostname === "localhost"
        ? "local-static"
        : "destination-read-only-with-interception",
    origin,
    formMode,
    status: failures.length ? "fail" : "pass",
    routes,
    negativeRoutes,
    failures,
    externalDelivery: "not_verified",
    realSubmissions: 0,
  };
  const safe = redactPrivateLocation(report, config.business || {});
  return JSON.parse(
    JSON.stringify(safe).replaceAll(
      config.lead?.token || "\u0000",
      "[redacted]",
    ),
  );
}
