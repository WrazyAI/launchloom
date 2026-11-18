import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { mkdir, mkdtemp, open, realpath, writeFile } from "node:fs/promises";
import http from "node:http";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allowedRequest, approve, MAX_MANIFEST } from "./scope.mjs";

const MAX_BODY = 2 * 1024 * 1024;
const MAX_LINE = 6 * 1024 * 1024;
const BLOCKED = { blocked: true };
const from = dirname(fileURLToPath(import.meta.url));

function get(plan, method, url) {
  const path = allowedRequest(plan, method, url);
  if (!path) return Promise.resolve(BLOCKED);
  return new Promise(resolve => {
    const request = http.get(plan.origin + path, {
      agent: false, headers: { "Accept-Encoding": "identity" },
    }, res => {
      const status = res.statusCode;
      if ((status >= 300 && status < 400) || (res.headers["content-encoding"] &&
          res.headers["content-encoding"] !== "identity")) {
        res.destroy();
        resolve(BLOCKED);
        return;
      }
      const chunks = [];
      let size = 0;
      res.on("error", () => resolve(BLOCKED));
      res.on("data", chunk => {
        size += chunk.length;
        if (size > MAX_BODY) {
          resolve(BLOCKED);
          res.destroy();
        } else chunks.push(chunk);
      });
      res.on("end", () => resolve({
        status, contentType: res.headers["content-type"] ?? "application/octet-stream",
        body: Buffer.concat(chunks).toString("base64"),
      }));
    });
    const timer = setTimeout(() => request.destroy(), 3000);
    request.on("close", () => clearTimeout(timer));
    request.on("error", () => resolve(BLOCKED));
  });
}

async function trustedPath(variable) {
  const path = process.env[variable];
  if (!path || !isAbsolute(path)) throw new Error(`set ${variable} to a trusted absolute installation path`);
  return realpath(path);
}

async function sandbox(plan, evidence) {
  const chrome = await trustedPath("WALKTHROUGH_CHROMIUM");
  const playwright = await trustedPath("WALKTHROUGH_PLAYWRIGHT_CORE");
  const args = [
    "--unshare-all", "--die-with-parent", "--new-session", "--clearenv",
    "--ro-bind", "/usr", "/usr", "--ro-bind-try", "/lib", "/lib",
    "--ro-bind-try", "/lib64", "/lib64", "--ro-bind-try", "/etc/fonts", "/etc/fonts",
    "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
    "--setenv", "HOME", "/tmp", "--setenv", "PATH", "/usr/bin",
    "--ro-bind", await realpath(process.execPath), "/runner/node",
    "--ro-bind", join(from, "worker.mjs"), "/runner/worker.mjs",
    "--ro-bind", playwright, "/runner/playwright",
    "--ro-bind", dirname(chrome), "/runner/chromium",
    "--chdir", "/tmp", "--", "/runner/node", "/runner/worker.mjs",
    `/runner/chromium/${chrome.split("/").at(-1)}`,
  ];
  const worker = spawn("/usr/bin/bwrap", args, { env: {}, stdio: ["pipe", "pipe", "pipe"] });
  worker.stdin.on("error", () => {});
  let requests = 0;
  let failure;
  let buffer = "";
  let result;
  const answer = message => worker.stdin.write(JSON.stringify(message) + "\n");
  const timer = setTimeout(() => worker.kill("SIGKILL"), 50_000);
  const closed = new Promise(resolve => {
    worker.on("error", () => resolve(1));
    worker.on("close", resolve);
  });
  let diagnostic = "";
  worker.stderr.on("data", chunk => { if (diagnostic.length < 2000) diagnostic += chunk.toString().slice(0, 2000); });
  answer(plan);
  try {
    for await (const chunk of worker.stdout.setEncoding("utf8")) {
      buffer += chunk;
      if (buffer.length > MAX_LINE) throw new Error("worker response too large");
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const msg = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        if (result) throw new Error("unexpected message after results");
        if (msg.kind === "request") {
          const response = ++requests <= 80 ? await get(plan, msg.method, msg.url) : BLOCKED;
          if (!response.blocked) answer({ ...response, id: msg.id });
          else answer({ ...BLOCKED, id: msg.id });
        } else if (msg.kind === "result") {
          if (!Array.isArray(msg.steps) || msg.steps.length !== plan.steps.length)
            throw new Error("invalid worker results");
          result = [];
          for (const [i, step] of msg.steps.entries()) {
            if (!["passed", "failed", "blocked", "untested"].includes(step.status) ||
                !["boolean", "number", "undefined"].includes(typeof step.observed))
              throw new Error("invalid worker observation");
            const record = { step: i + 1, type: plan.steps[i].type, status: step.status };
            if (step.observed !== undefined) record.observed = step.observed;
            if (step.capture && record.type === "screenshot" && record.status === "passed") {
              const image = Buffer.from(step.capture, "base64");
              if (image.length > MAX_BODY || image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
                throw new Error("invalid capture");
              const name = `${String(i + 1).padStart(2, "0")}.png`;
              await writeFile(join(evidence, name), image, { flag: "wx", mode: 0o600 });
              record.evidence = `evidence/${name}`;
            } else if (record.type === "screenshot" && record.status === "passed") {
              throw new Error("missing capture");
            }
            result.push(record);
          }
        } else throw new Error("unexpected worker message");
      }
    }
  } catch (error) {
    failure = error;
    worker.kill("SIGKILL");
  } finally {
    worker.stdin.end();
    const exit = await closed;
    clearTimeout(timer);
    if (!failure && (exit !== 0 || !result || buffer.length))
      failure = new Error(`isolated browser did not complete${diagnostic.startsWith("bwrap:") ||
        process.env.WALKTHROUGH_LOCAL_DIAGNOSTICS === "1" ? `: ${diagnostic.trim()}` : ""}`);
  }
  if (failure) throw failure;
  return result;
}

try {
  const [file, digest, scenario, root, extra] = process.argv.slice(2);
  if (!file || !digest || !scenario || !root || extra) {
    throw new Error("usage: node run.mjs <manifest.json> <approved sha256> <scenario-id> <private-run-root>");
  }
  const handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  let input;
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > MAX_MANIFEST) throw new Error("invalid manifest file");
    input = Buffer.alloc(MAX_MANIFEST + 1);
    const { bytesRead } = await handle.read(input, 0, input.length, 0);
    input = input.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
  const plan = approve(input, digest, scenario);
  const directory = await mkdtemp(join(await realpath(root), "scoped-"));
  const evidence = join(directory, "evidence");
  await mkdir(evidence, { mode: 0o700 });
  const steps = await sandbox(plan, evidence);
  const result = { directory, scenario, digest, steps };
  await writeFile(join(evidence, "observations.json"), JSON.stringify({ scenario, digest, steps }, null, 2) + "\n",
    { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(`Walkthrough blocked: ${error.message}`);
  process.exitCode = 1;
}
