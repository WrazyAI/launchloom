import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { inspectSeoRelease } from "./seo-release-gate.mjs";
import { auditBuiltContrast } from "./contrast-sweep.mjs";
import {
  serveBuiltSite,
  verifyApprovedRoutes,
  diagnosticFormMode,
} from "./browser-route-verification.mjs";
import {
  buildRouteHandoff,
  sanitizeVerificationReport,
} from "./route-verification-handoff.mjs";
import {
  createReleaseManifest,
  contentDigest,
  verifyDestinationArtifact,
} from "./destination-route-verification.mjs";
export async function verifySiteRoutes({
  config,
  dist,
  origin,
  mode = "review",
  reportPath,
  screenshotsDir,
  site = process.cwd(),
  commit,
  destination,
  writeManifest = false,
}) {
  dist = path.resolve(dist);
  const configDigest = contentDigest(JSON.stringify(config));
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: site,
    encoding: "utf8",
  }).trim();
  if (commit && commit !== sourceCommit)
    throw new Error("Tested checkout does not match the authorized commit.");
  if (
    (reportPath && path.resolve(reportPath).startsWith(dist + path.sep)) ||
    (screenshotsDir && path.resolve(screenshotsDir).startsWith(dist + path.sep))
  )
    throw new Error(
      "Private evidence must be stored outside the public dist directory.",
    );
  const dirty = Boolean(
    execFileSync("git", ["status", "--porcelain"], {
      cwd: site,
      encoding: "utf8",
    }).trim(),
  );
  const identity = {
    commit: sourceCommit,
    uncommittedChanges: dirty,
    configDigest,
    briefVersion: 1,
    mode,
    environment: destination
      ? "destination-with-intercepted-synthetic-delivery"
      : "local-static",
  };
  const technical = await inspectSeoRelease({ config, dist, origin, mode });
  const server = destination ? null : await serveBuiltSite(dist);
  let browser;
  let contrast;
  try {
    browser = await verifyApprovedRoutes({
      config,
      mode,
      origin: destination || server.origin,
      formMode: diagnosticFormMode(config, mode),
      screenshotsDir,
    });
    contrast = await auditBuiltContrast({
      dist,
      screenshotsDir: screenshotsDir && path.join(screenshotsDir, "contrast"),
    });
  } finally {
    await server?.close();
  }
  const manifest = await createReleaseManifest({
    dist,
    sourceCommit,
    configDigest,
  });
  let destinationReport;
  if (destination)
    destinationReport = await verifyDestinationArtifact({
      origin: destination,
      manifest,
    });
  const report = buildRouteHandoff({
    config,
    identity,
    technical,
    browser,
    contrast,
    destination: destinationReport,
  });
  // Destination browser evidence is separate; contrast remains the byte-matched local artifact audit.
  if (destination) {
    report.scope =
      "destination-browser-with-intercepted-synthetic-delivery-plus-byte-matched-local-contrast";
    report.readiness.production.status =
      destinationReport.status === "pass" &&
      report.readiness.local.status === "pass"
        ? "pass"
        : "fail";
  }
  if (writeManifest) {
    if (
      mode !== "production" ||
      dirty ||
      report.readiness.local.status !== "pass"
    )
      throw new Error(
        "Release manifest requires a clean production checkout and passing local route scope.",
      );
    await fs.writeFile(
      path.join(dist, ".launchloom-release.json"),
      JSON.stringify(manifest) + "\n",
    );
  }
  if (reportPath) {
    await fs.mkdir(path.dirname(path.resolve(reportPath)), { recursive: true });
    await fs.writeFile(
      reportPath,
      JSON.stringify(sanitizeVerificationReport(report, config), null, 2) +
        "\n",
    );
  }
  return report;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .reduce(
        (pairs, value, index, all) =>
          index % 2
            ? pairs
            : [...pairs, [value.replace(/^--/u, ""), all[index + 1]]],
        [],
      ),
  );
  if (!args.config || !args.dist || !args.report)
    throw new Error("--config, --dist and --report are required.");
  const config = JSON.parse(
    await fs.readFile(path.resolve(args.config), "utf8"),
  );
  const report = await verifySiteRoutes({
    config,
    dist: args.dist,
    origin: args.origin,
    mode: args.mode,
    reportPath: args.report,
    screenshotsDir: args.screenshots,
    site: args.site,
    commit: args.commit,
    destination: args.destination,
    writeManifest: args["write-manifest"] === "true",
  });
  console.log(
    JSON.stringify({
      status: report.readiness.local.status,
      production: report.readiness.production.status,
      routes: report.routes.length,
      report: args.report,
    }),
  );
  if (
    report.readiness.local.status !== "pass" ||
    (args.destination && report.readiness.production.status !== "pass")
  )
    process.exitCode = 1;
}
