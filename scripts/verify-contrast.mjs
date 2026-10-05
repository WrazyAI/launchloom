import { spawn } from "node:child_process";
import path from "node:path";
import { enforceBuiltContrast } from "./contrast-sweep.mjs";
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, i, all) =>
        i % 2 === 0
          ? [...pairs, [value.replace(/^--/, ""), all[i + 1]]]
          : pairs,
      [],
    ),
);
const site = path.resolve(args.site || ".");
const repair = args.repair === "true";
if (repair && !args.styles)
  throw new Error("--repair true requires an explicit --styles path");
const report = await enforceBuiltContrast({
  dist: path.resolve(site, args.dist || "dist"),
  stylesPath: args.styles ? path.resolve(site, args.styles) : undefined,
  reportPath: path.resolve(
    site,
    args.report || ".launchloom/contrast-report.json",
  ),
  screenshotsDir: args.screenshots
    ? path.resolve(site, args.screenshots)
    : undefined,
  repair,
  build: () =>
    new Promise((resolve, reject) => {
      const child = spawn("npm", ["run", "build"], {
        cwd: site,
        stdio: "inherit",
        env: process.env,
      });
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`Contrast rebuild exited ${code}`)),
      );
    }),
});
console.log(
  `contrast_verified=${report.pass} routes=${report.after.routes.length} repairs=${report.repairs.length} unresolved=${report.after.findings.filter((f) => f.status === "unresolved").length}`,
);
if (!report.pass) process.exitCode = 1;
