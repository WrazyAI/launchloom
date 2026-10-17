import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stripBoundedCorrections, enforceBuiltContrast } from "/home/maigreeks/projects/.worktrees/launchloom-creative-gate-recalibration/scripts/contrast-sweep.mjs";
const exec = promisify(execFile);
const CLONE = "/tmp/opencode/build-probe2";
const ORIGINAL = "/tmp/opencode/run-compare/recal158d";
const candidate = `${CLONE}/.launchloom/generated-experiences/candidate-a`;
const deployed = `${CLONE}/src/generated-experiences/selected`;
await fs.rm(deployed, { recursive: true, force: true });
await fs.cp(`${ORIGINAL}/src/generated-experiences/selected`, deployed, { recursive: true, force: true });
await fs.cp(candidate, deployed, { recursive: true, force: true });
const stylesPath = `${candidate}/styles.css`;
const deployedStyles = `${deployed}/styles.css`;
for (const file of [stylesPath, deployedStyles]) {
  await fs.writeFile(file, stripBoundedCorrections(await fs.readFile(file, "utf8")));
}
const build = async () => { await exec("npm", ["run", "build"], { cwd: CLONE }); };
await build();
try {
  const report = await enforceBuiltContrast({
    dist: `${CLONE}/dist`,
    stylesPath,
    deployedStylesPath: deployedStyles,
    build,
    reportPath: "/tmp/opencode/heavy-repro-report.json",
  });
  console.log(JSON.stringify({ pass: report.pass, repairs: report.repairs.length, before: (report.before.findings || []).length, after: (report.after.findings || []).length }));
  const kinds = {};
  for (const f of report.after.findings || []) { const k = `${f.status}/${f.paintProperty === "outline-color" || f.kind === "focus" ? "outline" : f.kind}/${f.state}`; kinds[k] = (kinds[k] || 0) + 1; }
  console.log("after:", JSON.stringify(kinds));
} catch (error) {
  console.error("SWEEP ERROR:", error?.stack || error);
}
