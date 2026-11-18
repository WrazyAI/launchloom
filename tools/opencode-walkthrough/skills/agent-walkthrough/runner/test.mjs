import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

const module = new URL("./scope.mjs", import.meta.url);
async function scope() {
  await assert.doesNotReject(readFile(module), "runner scope not implemented");
  return import(module);
}
const fixture = () => ({
  origin: "http://127.0.0.1:38211", paths: ["/", "/health"], scenarios: {
    panel: [
      { type: "open", path: "/" },
      { type: "click", role: "button", name: "Sites" },
      { type: "visible", role: "heading", name: "Sites", expected: true },
      { type: "screenshot" },
      { type: "http", path: "/health", status: 200, json: { ok: true } },
    ],
  },
});

test("real browser records panel states and only forwards approved GETs", {
  skip: !process.env.WALKTHROUGH_CHROMIUM || !process.env.WALKTHROUGH_PLAYWRIGHT_CORE,
}, async () => {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push([req.method, req.url, req.headers.cookie]);
    if (req.url === "/health") return res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
    if (req.url === "/redirect") return res.writeHead(302, { location: "/forbidden" }).end();
    res.writeHead(200, { "Content-Type": "text/html", "Set-Cookie": "fixture=private" }).end(
      `<button onclick="document.querySelector('h2').hidden=false;
        fetch('/forbidden').catch(()=>{}); fetch('/health',{method:'POST'}).catch(()=>{})">Sites</button>
        <h2 hidden>Sites</h2>`);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const folder = await mkdtemp(join(tmpdir(), "walkthrough-test-"));
  try {
    const plan = fixture();
    plan.origin = `http://127.0.0.1:${server.address().port}`;
    plan.paths.push("/redirect");
    plan.scenarios.panel.splice(1, 0, { type: "screenshot" });
    plan.scenarios.broken = [{ type: "open", path: "/" },
      { type: "visible", role: "heading", name: "Sites", expected: true }];
    plan.scenarios["blocked-then-skipped"] = [
      { type: "open", path: "/" },
      { type: "click", role: "button", name: "Missing" },
      { type: "screenshot" },
    ];
    plan.scenarios.redirect = [{ type: "http", path: "/redirect", status: 200 }];
    const [bytes, digest] = encoded(plan);
    await writeFile(join(folder, "plan.json"), bytes);
    const run = async id => {
      const { stdout } = await promisify(execFile)(process.execPath, [
        new URL("./run.mjs", import.meta.url).pathname, join(folder, "plan.json"), digest, id, folder,
      ], { timeout: 60_000 });
      return JSON.parse(stdout);
    };
    const result = await run("panel");
    assert.deepEqual(result.steps.map(s => s.status), Array(6).fill("passed"));
    for (const index of [1, 4]) {
      const shot = await readFile(join(result.directory, result.steps[index].evidence));
      assert.equal(shot.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    }
    assert.equal((await run("broken")).steps[1].status, "failed");
    assert.equal((await run("redirect")).steps[0].status, "blocked");
    assert.deepEqual((await run("blocked-then-skipped")).steps.map(s => s.status),
      ["passed", "failed", "untested"]);
    assert.equal((await run("panel")).scenario, "panel");
    assert.ok(seen.some(([, url]) => url === "/health"));
    assert.ok(seen.every(([method, url, cookie]) =>
      method === "GET" && ["/", "/health", "/redirect"].includes(url) && cookie === undefined));
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(folder, { recursive: true });
  }
});
function encoded(manifest) {
  const bytes = Buffer.from(JSON.stringify(manifest));
  return [bytes, createHash("sha256").update(bytes).digest("hex")];
}

test("operator approval CLI prints the exact digest and scenario IDs", async () => {
  const folder = await mkdtemp(join(tmpdir(), "walkthrough-approve-"));
  try {
    const manifest = fixture();
    const [bytes, digest] = encoded(manifest);
    const file = join(folder, "plan.json");
    await writeFile(file, bytes);
    const cli = promisify(execFile);
    const { stdout } = await cli(process.execPath, [
      new URL("./approve.mjs", import.meta.url).pathname, file,
    ]);
    assert.deepEqual(JSON.parse(stdout), { digest, origin: manifest.origin, scenarios: ["panel"] });
    await writeFile(file, "{");
    await assert.rejects(cli(process.execPath, [new URL("./approve.mjs", import.meta.url).pathname, file]),
      error => error.code === 1 && !error.stderr.includes("Traceback"));
  } finally {
    await rm(folder, { recursive: true });
  }
});

test("only exact, hash-approved scenario IDs can run", async () => {  const { approve } = await scope();
  const args = encoded(fixture());
  assert.equal(approve(...args, "panel").steps.length, 5);
  assert.throws(() => approve(args[0], "0".repeat(64), "panel"), /digest/);
  for (const id of ["constructor", "../panel", { id: "panel" }, "panel "] )
    assert.throws(() => approve(...args, id), /scenario/);
});

test("reject external origins, noncanonical addresses and dangerous paths", async () => {
  const { approve } = await scope();
  for (const origin of ["http://localhost:99", "http://127.1:99", "http://127.0.0.1",
    "http://127.0.0.1:90@remote.test", "http://127.0.0.1:90/", "https://127.0.0.1:90"]) {
    assert.throws(() => approve(...encoded({ ...fixture(), origin }), "panel"), /origin/);
  }
  for (const path of ["//remote.test", "/%2e%2e/home", "/x?secret=x", "/a/../b", "/a\\b"]) {
    assert.throws(() => approve(...encoded({ ...fixture(), paths: [path] }), "panel"), /path/);
  }
});

test("no shell, eval, selector fragments, overrides or unapproved request paths", async () => {
  const { approve, allowedRequest } = await scope();
  for (const step of [{ type: "shell", command: "true" }, { type: "open", path: "/other" },
    { type: "click", role: "button", name: "Sites", selector: "*"}, { type: "evaluate" }]) {
    const m = fixture();
    m.scenarios.panel.push(step);
    assert.throws(() => approve(...encoded(m), "panel"));
  }
  const plan = approve(...encoded(fixture()), "panel");
  assert.equal(allowedRequest(plan, "GET", `${plan.origin}/health`), "/health");
  for (const [method, url] of [
    ["POST", `${plan.origin}/health`], ["GET", `${plan.origin}/health?more=1`],
    ["GET", "http://127.0.0.1:38212/health"], ["GET", `${plan.origin}/health#anchor`],
    ["GET", `${plan.origin}/other`], ["GET", "file:///etc/passwd"],
  ]) assert.equal(allowedRequest(plan, method, url), null);
});
