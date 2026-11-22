import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCreativeBakeoff } from "../scripts/run-creative-bakeoff.mjs";
import {
  cleanupTempRoots,
  makeFixture,
  makeTemplateCopy,
  validLocationPage,
  validServicePage,
  validServicesIndexPage,
} from "./helpers/creative-promotion-fixtures";

afterEach(cleanupTempRoots);

describe("creative candidate promotion (rendered shell)", () => {
  it("renders a candidate in the real Astro shell before reporting diversity fallback", async () => {
    const root = await makeFixture();
    const report = await runCreativeBakeoff({
      siteDir: await makeTemplateCopy(),
      candidatesDir: root,
      reportPath: path.join(root, "report.json"),
      screenshotsDir: path.join(root, "screenshots"),
    });
    expect(report.candidates[0].failures).toEqual([]);
    expect(report.candidates[0].valid).toBe(true);
    expect(report.candidates[0].contrast.after.routes).toContain("/services/");
    expect(report.candidates[0].contrast.after.pages).toHaveLength(
      report.candidates[0].contrast.after.routes.length * 3,
    );
    expect(report.candidates[0].eligible).toBe(false);
    expect(report.fallback).toBe(true);
    expect(report.selectedCandidateId).toBeNull();
    // Per-phase timing evidence is recorded with the report.
    expect(report.timings.version).toBe(1);
    expect(report.timings.totalMs).toBeGreaterThan(0);
    expect(report.timings.categories.render.count).toBeGreaterThan(0);
    expect(report.candidates[0].timings).toMatchObject({
      promote: expect.any(Number),
      build: expect.any(Number),
      contrast: expect.any(Number),
      capture: expect.any(Number),
      totalMs: expect.any(Number),
    });
  }, 300_000);

  it("renders authored service, location, and services-index pages with the homepage visual identity", async () => {
    const root = await makeFixture();
    await fs.writeFile(
      path.join(root, "candidate-a/ServicePage.jsx"),
      validServicePage,
    );
    await fs.writeFile(
      path.join(root, "candidate-a/LocationPage.jsx"),
      validLocationPage,
    );
    await fs.writeFile(
      path.join(root, "candidate-a/ServicesIndexPage.jsx"),
      validServicesIndexPage,
    );
    await fs.writeFile(
      path.join(root, "candidate-a/styles.css"),
      "body{background:rgb(16,18,20);color:rgb(240,240,240)}h1{font-family:Georgia,serif;font-weight:700}",
    );
    const siteRoot = await makeTemplateCopy({
      industry: "home-services",
      businessKind: "plumbing",
      locations: [
        {
          name: "East Austin",
          slug: "east-austin",
          description: "Serving East Austin homes.",
          localNote: "Same-week scheduling depends on the current route.",
        },
      ],
    });
    const report = await runCreativeBakeoff({
      siteDir: siteRoot,
      candidatesDir: root,
      reportPath: path.join(root, "authored-pages-report.json"),
      screenshotsDir: path.join(root, "authored-pages-screenshots"),
      preview: true,
      requireDiversity: false,
    });
    const candidate = report.candidates[0];
    expect(candidate.servicePage?.failures).toEqual([]);
    expect(candidate.servicePage?.pass).toBe(true);
    expect(candidate.locationPage?.failures).toEqual([]);
    expect(candidate.locationPage?.pass).toBe(true);
    expect(candidate.servicesIndexPage?.failures).toEqual([]);
    expect(candidate.servicesIndexPage?.pass).toBe(true);
  }, 300_000);
});
