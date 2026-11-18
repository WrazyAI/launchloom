// This process and its browser have no host network or project mounts.
import { createInterface } from "node:readline";
import { isDeepStrictEqual } from "node:util";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("/runner/playwright");
const lines = createInterface({ input: process.stdin });
const send = message => console.log(JSON.stringify(message));
const pending = new Map();
let nextId = 0;
function request(method, url) {
  const id = ++nextId;
  return new Promise(resolve => {
    pending.set(id, resolve);
    send({ kind: "request", id, method, url });
  });
}

async function walk(plan) {
  const browser = await chromium.launch({
    executablePath: process.argv[2], headless: true, chromiumSandbox: true, timeout: 45_000,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 700 }, serviceWorkers: "block", acceptDownloads: false,
    });
    await context.route("**/*", async route => {
      const req = route.request();
      const response = await request(req.method(), req.url());
      if (response.blocked) await route.abort();
      else await route.fulfill({
        status: response.status, contentType: response.contentType,
        body: Buffer.from(response.body, "base64"),
      });
    });
    await context.routeWebSocket("**/*", ws => ws.close());
    const page = await context.newPage();
    context.on("page", popup => { if (popup !== page) void popup.close().catch(() => {}); });
    const steps = [];
    let stop = false;
    for (const step of plan.steps) {
      if (stop) {
        steps.push({ status: "untested" });
        continue;
      }
      const locator = step.role ? page.getByRole(step.role, { name: step.name, exact: true }) : null;
      let record = { status: "passed" };
      try {
        if (step.type === "open") {
          const url = plan.origin + step.path;
          const response = await page.goto(url, { waitUntil: "load", timeout: 5000 });
          record.observed = response?.status() ?? 0;
          if (!response?.ok() || page.url() !== url) record.status = "blocked";
        } else if (step.type === "click") {
          if (!await locator.isVisible()) record = { status: "failed", observed: false };
          else await locator.click({ timeout: 3000 });
        } else if (step.type === "visible") {
          try {
            await locator.waitFor({ state: step.expected ? "visible" : "hidden", timeout: 3000 });
            record = { status: "passed", observed: step.expected };
          } catch {
            record = { status: "failed", observed: !step.expected };
          }
        } else if (step.type === "screenshot") {
          record.capture = (await page.screenshot({ timeout: 3000 })).toString("base64");
        } else if (step.type === "http") {
          const response = await request("GET", plan.origin + step.path);
          if (response.blocked) record.status = "blocked";
          else {
            const sameJson = !Object.hasOwn(step, "json") || (() => {
              try {
                return isDeepStrictEqual(JSON.parse(Buffer.from(response.body, "base64")), step.json);
              } catch {
                return false;
              }
            })();
            record = { status: response.status === step.status && sameJson ? "passed" : "failed",
              observed: response.status };
          }
        }
      } catch {
        record = { status: "blocked" };
      }
      if (record.status === "blocked" || (step.type === "click" && record.status === "failed")) stop = true;
      // Do not interact with browser-generated error pages or other origins.
      if (step.type !== "http" && !plan.paths.includes(page.url().slice(plan.origin.length))) {
        record = { status: "blocked" };
        stop = true;
      }
      steps.push(record);
    }
    return steps;
  } finally {
    await browser.close();
  }
}

let started = false;
lines.on("line", line => {
  const data = JSON.parse(line);
  if (!started) {
    started = true;
    walk(data).then(steps => {
      send({ kind: "result", steps });
      lines.close();
      process.stdin.pause();
    }).catch(error => { console.error(error.message); process.exit(1); });
  } else {
    pending.get(data.id)?.(data);
    pending.delete(data.id);
  }
});
