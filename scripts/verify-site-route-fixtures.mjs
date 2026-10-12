import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  pageBriefFixture,
  fixtureImage,
} from "./fixtures/page-briefs-fixture.mjs";
import { compilePageBriefs } from "../templates/client-site/src/lib/page-briefs.mjs";
import {
  validateServicePage,
  validateLocationPage,
} from "./production-experience-author.mjs";
import { verifySiteRoutes } from "./verify-site-routes.mjs";
const exec = promisify(execFile),
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowedScenarios = ["trades-static", "care-static", "trades-authored"];
const scenarios = process.argv.slice(2).length
  ? process.argv.slice(2)
  : allowedScenarios;
if (scenarios.some((value) => !allowedScenarios.includes(value)))
  throw new Error("Unknown synthetic route-verification scenario.");
for (const scenario of scenarios) {
  const dir = path.join(root, "artifacts/stage4", scenario),
    template = path.join(root, "templates/client-site");
  await fs.rm(dir, { recursive: true, force: true });
  await fs.cp(template, dir, {
    recursive: true,
    filter: (source) =>
      !["node_modules", ".astro", "dist"].includes(
        path.relative(template, source).split(path.sep)[0],
      ),
  });
  await fs.symlink(
    path.join(root, "node_modules"),
    path.join(dir, "node_modules"),
  );
  const config = pageBriefFixture(
    scenario === "care-static" ? "care-editorial" : "local-trades",
  );
  // These are test-only sites. Verify their disabled diagnostic forms in
  // review mode, never as a production form with placeholder credentials.
  config.lead = { apiUrl: "", token: "" };
  await fs.mkdir(path.join(dir, "public/images"), { recursive: true });
  for (const name of ["page-0.svg", "page-1.svg", "page-city.svg"])
    await fs.writeFile(path.join(dir, "public/images", name), fixtureImage);
  if (scenario === "trades-authored") {
    config.design.experience = {
      renderer: "creative-candidate",
      candidateId: "synthetic-page-brief",
      familyId: "synthetic",
      servicePage: true,
      locationPage: true,
    };
    // Keep the authored homepage's canonical services/faqs/contact contract.
    // This fixture tests renderer plumbing, not creative promotion quality.
    const homepagePath = path.join(
      dir,
      "src/generated-experiences/selected/Experience.jsx",
    );
    const homepage = await fs.readFile(homepagePath, "utf8");
    await fs.writeFile(
      homepagePath,
      homepage.replace(
          "<h3>{service.name}</h3>",
          "<h3><a href={`/services/${service.slug}/`}>{service.name}</a></h3>",
        ),
    );
    for (const kind of ["Service", "Location"]) {
      const source = await fs.readFile(
        path.join(root, "tests/fixtures/page-briefs", kind + "Page.jsx.txt"),
        "utf8",
      );
      (kind === "Service" ? validateServicePage : validateLocationPage)(
        source,
        { id: "synthetic-page-brief" },
        { pageBriefContractVersion: 1 },
      );
      await fs.writeFile(
        path.join(dir, "src/generated-experiences/selected", kind + "Page.jsx"),
        source,
      );
    }
  }
  const report = compilePageBriefs(config);
  if (report.issues.length) throw new Error(report.issues.join("\n"));
  await fs.writeFile(
    path.join(dir, "src/site.config.json"),
    JSON.stringify(config, null, 2),
  );
  await fs.writeFile(
    path.join(dir, "page-briefs.json"),
    JSON.stringify(report, null, 2),
  );
  const env = {
    ...process.env,
    PUBLIC_REVIEW_MODE: "false",
    PUBLIC_SITE_URL: "https://fixture.pages.dev",
    PUBLIC_LAUNCHLOOM_API_URL: "https://api.fixture.invalid",
  };
  await exec(
    path.join(root, "node_modules/.bin/astro"),
    ["check", "--root", dir],
    { cwd: root, env, maxBuffer: 10 * 1024 * 1024 },
  );
  const build = await exec(
    path.join(root, "node_modules/.bin/astro"),
    ["build", "--root", dir],
    { cwd: root, env, maxBuffer: 10 * 1024 * 1024 },
  );
  await fs.writeFile(
    path.join(dir, "build.log"),
    build.stdout + "\n" + build.stderr,
  );
  const evidence = await verifySiteRoutes({
    config,
    dist: path.join(dir, "dist"),
    origin: "https://fixture.pages.dev",
    mode: "review",
    site: root,
    reportPath: path.join(dir, "route-handoff.json"),
    screenshotsDir: path.join(dir, "screenshots"),
  });
  if (
    evidence.technical.status !== "pass" ||
    evidence.browser.status !== "pass"
  )
    throw new Error(
      JSON.stringify(
        {
          technical: evidence.technical.failures,
          browser: evidence.browser.failures,
        },
        null,
        2,
      ),
    );
  if (evidence.readiness.local.status !== "pass")
    throw new Error(
      "Positive " +
        scenario +
        " fixture blocked: " +
        JSON.stringify(evidence.readiness.local.blockers),
    );
  console.log(
    JSON.stringify({
      scenario,
      routes: evidence.routes.length,
      browserProfiles: evidence.browser.routes.reduce(
        (sum, route) => sum + route.profiles.length,
        0,
      ),
      technical: evidence.technical.status,
      browser: evidence.browser.status,
      contrast: evidence.contrast.pass,
      local: evidence.readiness.local.status,
      production: "not_verified",
      provider: "not_verified",
      realSubmissions: 0,
    }),
  );
}
