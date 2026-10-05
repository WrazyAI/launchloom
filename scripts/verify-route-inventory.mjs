import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import http from "node:http";
import { chromium } from "playwright";
import { checkSeoRelease } from "./seo-release-gate.mjs";
import {
  compileRouteInventory,
  approvedRoutes,
} from "../templates/client-site/src/lib/route-inventory.mjs";
const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const template = JSON.parse(
  await fs.readFile(
    root + "/templates/client-site/src/site.config.json",
    "utf8",
  ),
);
const admission = {
  services: ["Leak repair"],
  visitorNeed: "Determine whether side access is needed before booking.",
  distinctValue: "Client instructions for properties with side access.",
  localFacts: [
    {
      value: "Ask the owner whether side access can be opened for the visit.",
      provenance: "client_supplied_local_information",
      source: "synthetic client notes",
    },
  ],
};
const base = {
  ...template,
  industry: "home-services",
  preset: "home-services",
  businessKind: "plumbing",
  demoNotice: "Synthetic route verification fixture",
  business: {
    name: "Fixture Plumbing",
    tagline: "Practical help with water leaks.",
    description:
      "Fixture Plumbing is a fictional verification business. This synthetic page explains how a customer can describe a leak, confirm service coverage and choose the next step. It contains no real service offer.",
    phone: "(555) 555-0100",
    email: "fixture@example.com",
    address: "",
    addressVisibility: "private",
    serviceAreas: ["Testville", "North Testville"],
    hours: "",
    primaryCta: "Request a quote",
    leadEmail: "fixture@example.com",
  },
  services: [
    {
      name: "Leak repair",
      slug: "leak-repair",
      description:
        "Describe where the water is appearing and when it started. The team can discuss the service scope and confirm the next step before any visit.",
    },
    {
      name: "Inspection",
      slug: "inspection",
      description:
        "Discuss a plumbing concern and the details that may affect an inspection. Share the property address to confirm coverage and ask what to prepare.",
    },
  ],
  locations: [
    {
      name: "Testville",
      slug: "testville",
      localNote: admission.localFacts[0].value,
      description:
        "Ask about plumbing support in Testville and whether side access will be available for the visit. Share the exact address and the issue so coverage and preparation can be confirmed.",
    },
    {
      name: "North Testville",
      slug: "north-testville",
      localNote: admission.localFacts[0].value,
      description:
        "Share your North Testville address and plumbing concern to check service availability. Discuss the access available at the property and what details will help prepare for the requested service.",
    },
  ],
  images: {},
  assets: {},
  differentiators: [
    "Scope discussed before scheduling",
    "Client confirms access instructions",
  ],
  conversion: {
    layout: "local-proof",
    process: [
      "Describe the plumbing concern.",
      "Confirm coverage and access.",
      "Discuss the next step.",
    ],
    faqs: [
      {
        question: "How do I check coverage?",
        answer:
          "Share the address and service need to confirm whether the request can be supported.",
      },
    ],
  },
  routePolicy: { version: 1, decisions: [] },
};
for (const scenario of [
  "zero",
  "approved",
  "omitted",
  "legacy",
  "pending",
  "preview",
]) {
  const dir = path.join(root, "artifacts/stage2", scenario);
  await fs.rm(dir, { recursive: true, force: true });
  const template = path.join(root, "templates/client-site");
  await fs.cp(template, dir, {
    recursive: true,
    filter: (source) =>
      !["node_modules", ".astro", "dist"].includes(
        path.relative(template, source).split(path.sep)[0],
      ),
  });
  await fs.symlink(root + "/node_modules", dir + "/node_modules");
  const c = structuredClone(base);
  if (scenario === "approved")
    c.routePolicy.decisions = c.locations.map((l) => ({
      pageType: "location",
      target: l.name,
      status: "approved",
      evidence: ["synthetic operator review"],
      admission,
    }));
  if (scenario === "omitted") {
    c.routePolicy.decisions = [
      { pageType: "about", status: "omitted" },
      { pageType: "contact", status: "omitted" },
      { pageType: "services-hub", status: "omitted" },
      { pageType: "service", target: "Inspection", status: "omitted" },
      { pageType: "privacy", status: "approved", indexable: false },
    ];
    c.supportingPages = {
      privacy: {
        title: "Fixture privacy information",
        body: "This is synthetic supplied text for route verification. It is not a policy for a real business. The fixture tests whether a supplied and reviewed document can render as a separate page, remain linked from the footer, and stay outside the production sitemap when marked nonindexable. No legal text is generated by the pipeline. The source stays associated with the route approval record. The fixture does not collect or submit information and does not describe any actual organization. The next step for an operator is to supply the real approved document and verify it in the rendered build.",
        reviewed: true,
        source: "synthetic supplied fixture document",
      },
    };
  }
  if (scenario === "preview")
    c.routePolicy.decisions = [
      {
        pageType: "service",
        target: "Leak repair",
        status: "approved",
        previewOnly: true,
      },
    ];
  if (scenario === "legacy") delete c.routePolicy;
  if (scenario === "pending")
    c.routePolicy.decisions = [
      { pageType: "privacy", status: "approved" },
      {
        pageType: "service",
        target: "Leak repair",
        status: "approved",
        previewOnly: true,
      },
    ];
  await fs.writeFile(dir + "/src/site.config.json", JSON.stringify(c, null, 2));
  const env = {
    ...process.env,
    PUBLIC_SITE_URL: "https://fixture.pages.dev",
    PUBLIC_LAUNCHLOOM_API_URL: "https://api.fixture.invalid",
    PUBLIC_REVIEW_MODE: scenario === "pending" ? "true" : "false",
  };
  const built = await exec(
    path.join(root, "node_modules/.bin/astro"),
    ["build", "--root", dir],
    { cwd: root, env, maxBuffer: 10 * 1024 * 1024 },
  );
  await fs.writeFile(dir + "/build.log", built.stdout + "\n" + built.stderr);
  const inventory = compileRouteInventory(c);
  await fs.writeFile(
    dir + "/route-inventory.json",
    JSON.stringify(inventory, null, 2),
  );
  const failures = await checkSeoRelease({
    mode: scenario === "pending" ? "review" : "production",
    config: c,
    dist: dir + "/dist",
    origin: "https://fixture.pages.dev",
  });
  if (failures.length) throw new Error(scenario + ": " + failures.join("\n"));
  if (scenario === "pending") {
    const production = await checkSeoRelease({
      mode: "production",
      config: c,
      dist: dir + "/dist",
      origin: "https://fixture.pages.dev",
    });
    if (!production.some((failure) => failure.includes("supporting content")))
      throw new Error("Missing supporting content did not block production.");
  }
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, "http://localhost").pathname;
      const file = path.join(
        dir,
        "dist",
        pathname.endsWith("/") ? pathname + "index.html" : pathname,
      );
      const body = await fs.readFile(file);
      res.setHeader(
        "Content-Type",
        file.endsWith(".html")
          ? "text/html"
          : file.endsWith(".js")
            ? "application/javascript"
            : file.endsWith(".css")
              ? "text/css"
              : "application/octet-stream",
      );
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ headless: true });
  let views = 0;
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/**", (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"error":"synthetic_fixture"}',
        }),
      );
      for (const record of approvedRoutes(inventory, {
        production: scenario !== "pending",
      })) {
        const token =
          Buffer.from(
            JSON.stringify({
              stage: "developer",
              reviewerEmail: "synthetic@example.com",
            }),
          ).toString("base64url") + ".synthetic";
        await page.goto(
          origin +
            record.path +
            (scenario === "pending" ? "?review=" + token : ""),
          { waitUntil: "networkidle" },
        );
        if (scenario === "pending") {
          const approve = page.getByRole("button", {
            name: "Route approvals required",
          });
          if (!(await approve.isDisabled()))
            throw new Error(
              "Missing supporting content did not disable approval.",
            );
          if (
            !(await page.locator(".ll-review__summary").innerText()).includes(
              "supporting content",
            )
          )
            throw new Error("Route blocker is not disclosed.");
        }
        if ((await page.locator("h1").count()) !== 1)
          throw new Error(scenario + record.path + ": expected one H1");
        if (
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          )
        )
          throw new Error(scenario + record.path + ": horizontal overflow");
        if (
          await page
            .locator("body")
            .innerText()
            .then((text) => text.includes("—"))
        )
          throw new Error("Rendered em dash");
        if (errors.length) throw new Error(errors.join("\n"));
        if (
          record.path === "/" ||
          record.pageType === "location" ||
          record.pageType === "privacy"
        )
          await page.screenshot({
            path: dir + "/" + record.path.replaceAll("/", "-") + width + ".png",
            fullPage: true,
          });
        views++;
      }
      if (["zero", "omitted"].includes(scenario)) {
        const missing = await page.request.get(
          origin + "/locations/testville/",
        );
        if (missing.status() !== 404)
          throw new Error("Unapproved location served content");
      }
      if (scenario === "preview") {
        const missing = await page.request.get(
          origin + "/services/leak-repair/",
        );
        if (missing.status() !== 404)
          throw new Error("Preview-only service returned production content.");
      }
      if (scenario === "omitted") {
        for (const pathname of [
          "/about/",
          "/contact/",
          "/services/",
          "/services/inspection/",
        ])
          if ((await page.request.get(origin + pathname)).status() !== 404)
            throw new Error("Omitted path served " + pathname);
      }
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  console.log(
    JSON.stringify({
      scenario,
      build: true,
      gate: true,
      browserViewports: views,
      providerRequests: 0,
    }),
  );
}
