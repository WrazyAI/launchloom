import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repository = path.resolve(new URL("..", import.meta.url).pathname);
const outputFlag = process.argv.indexOf("--out");
const output = path.resolve(
  (outputFlag >= 0 ? process.argv[outputFlag + 1] : undefined) ||
    path.join(os.tmpdir(), "launchloom-design-demos"),
);
const demos = ["home-care", "garage-door"];

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

await fs.mkdir(output, { recursive: true });
for (const name of demos) {
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), `launchloom-${name}-`),
  );
  await fs.cp(path.join(repository, "templates/client-site"), workspace, {
    recursive: true,
    filter: (source) =>
      !source.includes(`${path.sep}node_modules`) &&
      !source.includes(`${path.sep}dist`),
  });
  await fs.symlink(
    path.join(repository, "templates/client-site/node_modules"),
    path.join(workspace, "node_modules"),
    "dir",
  );
  await fs.copyFile(
    path.join(repository, "fixtures/design-demos", `${name}.json`),
    path.join(workspace, "src/site.config.json"),
  );
  await run("npm", ["run", "build"], workspace);
  await fs.rm(path.join(output, name), { recursive: true, force: true });
  await fs.cp(path.join(workspace, "dist"), path.join(output, name), {
    recursive: true,
  });
  console.log(`design_demo=${name} output=${path.join(output, name)}`);
}
