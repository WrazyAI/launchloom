import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import {
  fullPageCaptureErrors,
  inspect,
  prepareFullPageCapture,
  startServer,
} from "./client-render-harness.mjs";

const VIEWPORTS = [
  { name: "desktop", width: 1536, height: 864 },
  { name: "compact", width: 1366, height: 768 },
  { name: "mobile", width: 390, height: 844 },
];

function argsFrom(argv) {
  return Object.fromEntries(
    argv
      .slice(2)
      .reduce(
        (pairs, value, index, all) =>
          index % 2 === 0
            ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]]
            : pairs,
        [],
      ),
  );
}

async function main() {
  const args = argsFrom(process.argv);
  if (
    !args["site-dir"] ||
    !args["candidate-id"] ||
    !args.evidence ||
    !args.report
  )
    throw new Error(
      "--site-dir, --candidate-id, --evidence, and --report are required.",
    );
  const root = path.resolve(args["site-dir"]);
  const candidateId = String(args["candidate-id"]);
  if (!/^candidate-[a-z0-9]+$/u.test(candidateId))
    throw new Error("Candidate ID is not safe for screenshot filenames.");
  const evidenceDir = path.resolve(args.evidence);
  const reportPath = path.resolve(args.report);
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.mkdir(path.dirname(reportPath), { recursive: true });

  await fs.access(path.join(root, "dist", "index.html"));
  const { server, origin } = await startServer(path.join(root, "dist"));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const viewports = [];
    const captureViewport = args["capture-viewport"] === "true";
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const browserErrors = [];
      page.on("pageerror", (error) => browserErrors.push(error.message));
      try {
        await page.goto(origin, { waitUntil: "networkidle" });
        const evidence = await inspect(page);
        const renderedDom = captureViewport
          ? await page
              .locator("[data-creative-host]")
              .evaluate((element) => element.outerHTML)
          : null;
        if (captureViewport)
          await page.screenshot({
            path: path.join(
              evidenceDir,
              `${candidateId}-${viewport.name}-viewport.png`,
            ),
          });
        const browserErrorsBeforeCapture = browserErrors.length;
        await prepareFullPageCapture(page, {
          viewportHeight: viewport.height,
        });
        await page.screenshot({
          path: path.join(evidenceDir, `${candidateId}-${viewport.name}.png`),
          fullPage: true,
        });
        const pageCaptureErrors = fullPageCaptureErrors(
          browserErrors,
          browserErrorsBeforeCapture,
          viewport.name,
        );
        viewports.push({
          ...viewport,
          evidence,
          renderedDom,
          browserErrors,
          fullPageCaptureErrors: pageCaptureErrors,
        });
      } finally {
        await page.close();
      }
    }
    await fs.writeFile(
      reportPath,
      `${JSON.stringify({ version: 1, candidateId, viewports })}\n`,
    );
  } finally {
    await browser?.close().catch(() => {});
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
