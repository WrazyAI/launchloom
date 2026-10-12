import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import {
  pageBriefFixture,
  fixtureImage,
} from "../scripts/fixtures/page-briefs-fixture.mjs";
import {
  captureRenderedInteractionEvidence,
  interactionSourceDigest,
} from "../scripts/rendered-interaction-evidence.mjs";
const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

it("samples local authored interaction offline while production retains trusted reviews and maps", async () => {
  const repository = path.resolve(".");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ll-judge-runtime-"));
  roots.push(root);
  const template = path.join(repository, "templates/client-site");
  await fs.cp(template, root, {
    recursive: true,
    filter: (file) =>
      !path
        .relative(template, file)
        .split(path.sep)
        .some((part) => ["node_modules", "dist", ".astro"].includes(part)),
  });
  await fs.symlink(
    path.join(repository, "node_modules"),
    path.join(root, "node_modules"),
    "dir",
  );
  const config: any = pageBriefFixture("local-trades");
  config.business.address = "14 Fiction Lane, Testville";
  config.business.addressVisibility = "public";
  config.socialProof = {
    source: "google_reviews",
    heading: "Fixture review source",
    intro: "Fictional regression material",
    points: [],
    fallback: {
      source: "verified_differentiators",
      heading: "Service preparation",
      intro: "",
      points: ["Discuss the service scope."],
    },
    google: {
      apiUrl: "https://trusted-runtime.invalid",
      token: "synthetic-review-token",
    },
  };
  config.design.experience = {
    renderer: "creative-candidate",
    candidateId: "offline-runtime-fixture",
    familyId: "synthetic",
  };
  await fs.writeFile(
    path.join(root, "src/site.config.json"),
    JSON.stringify(config),
  );
  await fs.mkdir(path.join(root, "public/images"), { recursive: true });
  for (const name of ["page-0.svg", "page-1.svg", "page-city.svg"])
    await fs.writeFile(path.join(root, "public/images", name), fixtureImage);
  const files = {
    experience:
      'import {SocialProof,LocationMap,LeadForm} from "@launchloom/runtime"; export default function Experience({content,runtime}) { return <main><h1>{content.hero.heading}</h1><section data-purposeful-interaction><details><summary>Preparation</summary><p>Discuss the service scope before booking.</p></details></section><SocialProof content={content} runtime={runtime}/><LocationMap content={content}/><section id="contact"><LeadForm content={content} runtime={runtime}/></section></main>; }',
    styles: "[data-purposeful-interaction]{padding:20px}",
    motion: "export function mountExperienceMotion(){return ()=>{};}",
  };
  for (const [key, name] of [
    ["experience", "Experience.jsx"],
    ["styles", "styles.css"],
    ["motion", "motion.js"],
  ] as const)
    await fs.writeFile(
      path.join(root, "src/generated-experiences/selected", name),
      files[key],
    );
  const env = {
    ...process.env,
    PUBLIC_REVIEW_MODE: "true",
    PUBLIC_CREATIVE_DIAGNOSTIC: "false",
    PUBLIC_SITE_URL: "https://fixture.invalid",
  };
  const build = (judge: boolean) =>
    exec(
      process.execPath,
      [path.join(repository, "node_modules/astro/bin/astro.mjs"), "build"],
      {
        cwd: root,
        env: { ...env, PUBLIC_CREATIVE_JUDGE: String(judge) },
        maxBuffer: 8 * 1024 * 1024,
      },
    );
  await build(true);
  const judgeHtml = await fs.readFile(
    path.join(root, "dist/index.html"),
    "utf8",
  );
  expect(judgeHtml).not.toContain("synthetic-review-token");
  expect(judgeHtml).not.toContain("<iframe");
  const browser = await chromium.launch();
  try {
    const capture = await captureRenderedInteractionEvidence({
      browser,
      origin: "http://127.0.0.1:43218",
      dist: path.join(root, "dist"),
      candidateId: "offline-runtime-fixture",
      sourceDigest: interactionSourceDigest(files),
      viewport: { name: "desktop", width: 1536, height: 864 },
      evidenceDir: root,
      requiredPurposeful: true,
      capturePair: true,
      timeoutMs: 1500,
      settleMs: 100,
    });
    expect(capture.observation.status, JSON.stringify(capture)).toBe("passed");
    expect(capture.failures).toEqual([]);
    expect(capture.observation.omittedRuntime?.sort()).toEqual([
      "google-reviews",
      "location-map",
    ]);
  } finally {
    await browser.close();
  }
  await build(false);
  const productionHtml = await fs.readFile(
    path.join(root, "dist/index.html"),
    "utf8",
  );
  expect(productionHtml).toContain("synthetic-review-token");
  expect(productionHtml).toContain("<iframe");
  expect(productionHtml).not.toContain("data-runtime-provider-omitted");
}, 120_000);
