import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { hasPipelineTest } from "../templates/client-site/src/lib/seo-readiness.mjs";

try {
  const args = process.argv.slice(2);
  if (
    args.length !== 4 ||
    args[0] !== "--site" ||
    args[2] !== "--approved-sha" ||
    !/^[a-f0-9]{40}$/iu.test(args[3])
  )
    throw new Error(
      "Production safeguard requires a site and exact approved commit.",
    );
  const site = path.resolve(args[1]);
  const git = (values) =>
    execFileSync("git", values, {
      cwd: site,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  if (git(["rev-parse", "HEAD"]).trim() !== args[3])
    throw new Error("Approved commit checkout mismatch.");
  const config = JSON.parse(git(["show", `${args[3]}:src/site.config.json`]));
  if (
    hasPipelineTest(config) ||
    fs.existsSync(path.join(site, ".launchloom/pipeline-test-report.json"))
  )
    throw new Error(
      "Production publication rejected: test-only pipeline provenance is present.",
    );
  git([
    "diff",
    "--exit-code",
    "HEAD",
    "--",
    "src/site.config.json",
    ".launchloom/pipeline-test-report.json",
  ]);
  console.log("Production provenance verified at approved commit.");
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Could not verify production provenance.",
  );
  process.exitCode = 1;
}
