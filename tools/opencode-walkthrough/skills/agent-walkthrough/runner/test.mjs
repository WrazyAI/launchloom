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
  skip: process.env.WALKTHROUGH_SKIP_BROWSER === "1" ? "explicitly skipped" : false,
}, async () => {
  if (!process.env.WALKTHROUGH_CHROMIUM || !process.env.WALKTHROUGH_PLAYWRIGHT_CORE) {
    assert.fail("set WALKTHROUGH_CHROMIUM and WALKTHROUGH_PLAYWRIGHT_CORE, or WALKTHROUGH_SKIP_BROWSER=1");
  }
  const seen = [];
  const server = createServer((req, res) => {
    seen.push([req.method, req.url, req.headers.cookie]);
    if (req.url === "/health") return res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
    if (req.url === "/redirect") return res.writeHead(302, { location: "/forbidden" }).end();
    res.writeHead(200, { "Content-Type": "text/html", "Set-Cookie": "fixture=private" }).end(
      `<button onclick="document.querySelector('h2').hidden=false;
        setTimeout(()=>document.querySelector('h3').hidden=false,300);
        fetch('/forbidden').catch(()=>{}); fetch('/health',{method:'POST'}).catch(()=>{})">Sites</button>
        <h2 hidden>Sites</h2><h3 hidden>Async ready</h3>`);
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
    plan.scenarios.async = [
      { type: "open", path: "/" },
      { type: "click", role: "button", name: "Sites" },
      { type: "visible", role: "heading", name: "Async ready", expected: true },
    ];
    plan.scenarios.redirect = [{ type: "http", path: "/redirect", status: 200 }];
    const [bytes, digest] = encoded(plan);
    await writeFile(join(folder, "plan.json"), bytes);
    await writeFile(join(folder, "approval.json"), JSON.stringify({
      digest, manifest: plan, scenarios: Object.keys(plan.scenarios),
    }));
    const selectionFor = id => {
      const file = join(folder, `selection-${id}.json`);
      return writeFile(file, JSON.stringify({
        scenario: id, digest, agent: "walkthrough-verifier", sessionID: "ses_test000",
        providerID: "deeprelay", model: "deepseek-v4.1-flash", variant: "xhigh",
      })).then(() => file);
    };
    const invoke = async (id, selection) => {
      selection ??= await selectionFor(id);
      const child = promisify(execFile)(process.execPath, [
        new URL("./run.mjs", import.meta.url).pathname,
        join(folder, "plan.json"), join(folder, "approval.json"), selection, folder,
      ], { timeout: 130_000 });
      try {
        const { stdout } = await child;
        return { code: 0, result: JSON.parse(stdout) };
      } catch (error) {
        if (error.stdout) return { code: error.code, result: JSON.parse(error.stdout) };
        throw error;
      }
    };
    const run = async id => (await invoke(id)).result;
    const result = await run("panel");
    assert.deepEqual(result.steps.map(s => s.status), Array(6).fill("passed"));
    for (const index of [1, 4]) {
      const shot = await readFile(join(result.directory, result.steps[index].evidence));
      assert.equal(shot.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    }
    assert.equal((await run("broken")).steps[1].status, "failed");
    const redirect = await invoke("redirect");
    assert.equal(redirect.code, 1);
    assert.equal(redirect.result.steps[0].status, "blocked");
    const skipped = await invoke("blocked-then-skipped");
    assert.equal(skipped.code, 1);
    assert.deepEqual(skipped.result.steps.map(s => s.status),
      ["passed", "failed", "untested"]);
    assert.equal((await invoke("async")).code, 0);
    const asyncResult = await run("async");
    assert.equal(asyncResult.steps[2].status, "passed", JSON.stringify(asyncResult));
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

test("operator approval CLI writes a bound approval artifact", async () => {
  const folder = await mkdtemp(join(tmpdir(), "walkthrough-approve-"));
  try {
    const manifest = fixture();
    const [bytes, digest] = encoded(manifest);
    const file = join(folder, "plan.json");
    const approval = join(folder, "approval.json");
    await writeFile(file, bytes);
    const cli = promisify(execFile);
    const { stdout } = await cli(process.execPath, [
      new URL("./approve.mjs", import.meta.url).pathname, file, "--out", approval,
    ]);
    assert.deepEqual(JSON.parse(stdout), { digest, origin: manifest.origin, scenarios: ["panel"] });
    const saved = JSON.parse(await readFile(approval, "utf8"));
    assert.equal(saved.digest, digest);
    assert.deepEqual(saved.manifest, manifest);
    await writeFile(file, "{");
    await assert.rejects(cli(process.execPath, [
      new URL("./approve.mjs", import.meta.url).pathname, file, "--out", join(folder, "bad.json"),
    ]), error => error.code === 1 && !error.stderr.includes("Traceback"));
  } finally {
    await rm(folder, { recursive: true });
  }
});

test("approval artifact binds the exact manifest and scenario", async () => {
  const { verifyApproval } = await scope();
  const [bytes] = encoded(fixture());
  const digest = createHash("sha256").update(bytes).digest("hex");
  const approval = { digest, manifest: fixture(), scenarios: ["panel"] };
  assert.equal(verifyApproval(bytes, approval, "panel").steps.length, 5);
  assert.throws(() => verifyApproval(bytes, { ...approval, digest: "0".repeat(64) }, "panel"), /digest/);
  assert.throws(() => verifyApproval(bytes, { ...approval, scenarios: ["other"] }, "panel"), /scenario/);
  assert.throws(() => verifyApproval(bytes, { ...approval, manifest: { ...fixture(), origin: "http://127.0.0.1:1" } }, "panel"), /manifest/);
});

test("selection artifact binds exact agent, model, session and scenario", async () => {
  const { approve, verifySelection } = await scope();
  const [bytes, digest] = encoded(fixture());
  const plan = approve(bytes, digest, "panel");
  const selection = {
    agent: "walkthrough-verifier", providerID: "deeprelay",
    model: "deepseek-v4.1-flash", variant: "xhigh", digest,
    sessionID: "ses_test", scenario: "panel",
  };
  assert.equal(verifySelection(plan, selection).sessionID, "ses_test");
  for (const [key, value] of [
    ["agent", "general"], ["providerID", "other"], ["model", "deepseek-v4.1-flash-free"],
    ["variant", "high"], ["sessionID", "not-a-session"], ["scenario", "other"],
    ["digest", "0".repeat(64)],
  ]) {
    assert.throws(() => verifySelection(plan, { ...selection, [key]: value }), /selection/);
  }
});

test("zero-scenario manifests are refused", async () => {
  const { approve } = await scope();
  const [bytes, digest] = encoded({ ...fixture(), scenarios: {} });
  assert.throws(() => approve(bytes, digest, "panel"), /scenario/);
});

test("only exact, hash-approved scenario IDs can run", async () => {
  const { approve } = await scope();
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
