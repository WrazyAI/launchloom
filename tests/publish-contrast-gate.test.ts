import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Run the actual publication shell with real local Git and real Chromium.
// Redirect only provider/build boundaries; no deployment or email leaves this test.
function publication(color: string, override: boolean, routeFailure = "") {
  const root = mkdtempSync(path.join(os.tmpdir(), "ll-publish-contrast-"));
  try {
    const fixture = path.join(root, "fixture"),
      bin = path.join(root, "bin"),
      runner = path.join(root, "runner");
    for (const dir of [
      path.join(fixture, "src"),
      path.join(fixture, "dist"),
      bin,
      runner,
    ])
      mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(fixture, ".launchloom-deployment.json"),
      JSON.stringify({ project: "contrast-fixture" }),
    );
    writeFileSync(
      path.join(fixture, "src/site.config.json"),
      JSON.stringify({
        business: { name: "Contrast Fixture" },
        services: [],
        revisionReport: {},
      }),
    );
    writeFileSync(
      path.join(fixture, "dist/index.html"),
      `<body data-ll-route="/" style="background:white;color:${color}"><p>Prepare for a visit</p></body>`,
    );
    execFileSync("git", ["init", "-q", fixture]);
    execFileSync("git", ["-C", fixture, "add", "."]);
    execFileSync("git", [
      "-C",
      fixture,
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit",
      "-qm",
      "Fixture",
    ]);
    const sha = execFileSync("git", ["-C", fixture, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const executable = (name: string, script: string) =>
      writeFileSync(path.join(bin, name), "#!/bin/sh\nset -eu\n" + script, {
        mode: 0o755,
      });
    executable(
      "git",
      'if [ "$1" = clone ]; then exec /usr/bin/git clone "$FIXTURE_REPO" "$3"; fi\nexec /usr/bin/git "$@"\n',
    );
    executable("npm", "exit 0\n");
    executable("gh", "exit 0\n");
    executable(
      "npx",
      'test "$1" = wrangler\ntest "$2" = pages\ntest "$3" = deploy\nprintf "%s\\n" "$APPROVED_SHA" > "$RELEASE_MARKER"\n',
    );
    executable(
      "node",
      'case "$1" in\n */verify-site-routes.mjs) case " $* " in *" --destination "*) test "$ROUTE_FAILURE" != destination;; *) test "$ROUTE_FAILURE" != local;; esac; exit $?;;\n */seo-release-gate.mjs) exit 0;;\n */create-review-link.mjs) printf "fixture-review-token\\n"; exit 0;;\n */send-preview-email.mjs) printf "sent\\n" > "$EMAIL_MARKER"; exit 0;;\n esac\nexec "$REAL_NODE" "$@"\n',
    );
    const workflow = readFileSync(".github/workflows/publish-site.yml", "utf8");
    const block = workflow.split("        run: |\n")[1]?.split("\n      - ")[0];
    expect(block).toBeTruthy();
    const shell = block
      .split("\n")
      .filter((line) => line.startsWith("          "))
      .map((line) => line.slice(10))
      .join("\n");
    const result = spawnSync("bash", ["-e", "-c", shell], {
      cwd: path.resolve("."),
      encoding: "utf8",
      timeout: 25000,
      env: {
        ...process.env,
        PATH: bin + ":" + process.env.PATH,
        REAL_NODE: process.execPath,
        ROUTE_FAILURE: routeFailure,
        FIXTURE_REPO: fixture,
        GITHUB_WORKSPACE: path.resolve("."),
        RUNNER_TEMP: runner,
        CLIENT_REPO: "fixture/client",
        CLIENT_EMAIL: "qa@example.test",
        CLIENT_PR: "1",
        FEEDBACK_ISSUE: "1",
        APPROVED_SHA: sha,
        DEVELOPER_OVERRIDE: String(override),
        OVERRIDE_SESSION_ID: "a".repeat(32),
        OVERRIDE_REVIEWED_SHA: sha,
        OVERRIDE_CANDIDATE_ID: "candidate-a",
        GITHUB_ORG_TOKEN: "fixture",
        RELEASE_MARKER: path.join(root, "released"),
        EMAIL_MARKER: path.join(root, "emailed"),
      },
    });
    return {
      status: result.status,
      output: result.stdout + result.stderr,
      released: existsSync(path.join(root, "released")),
      emailed: existsSync(path.join(root, "emailed")),
      publishedSha: existsSync(path.join(root, "released"))
        ? readFileSync(path.join(root, "released"), "utf8").trim()
        : null,
      sha,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("publication contrast guard", () => {
  it("blocks deployment when approved-route verification fails", () => {
    const result = publication("#14201d", false, "local");
    expect(result.status).not.toBe(0);
    expect(result.released).toBe(false);
    expect(result.emailed).toBe(false);
  }, 30000);
  it("blocks client email when destination verification fails after upload", () => {
    const result = publication("#14201d", false, "destination");
    expect(result.status).not.toBe(0);
    expect(result.released).toBe(true);
    expect(result.emailed).toBe(false);
  }, 30000);
  it.each([false, true])(
    "blocks deployment and delivery for pale text, visual override=%s",
    (override) => {
      const result = publication("#eeeeee", override);
      expect(result.output).toContain("contrast_verified=false");
      expect(result.status).not.toBe(0);
      expect(result.released).toBe(false);
      expect(result.emailed).toBe(false);
    },
    30000,
  );
  it("allows readable source to reach the approved release boundary", () => {
    const result = publication("#14201d", false);
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain("contrast_verified=true");
    expect(result.publishedSha).toBe(result.sha);
    expect(result.emailed).toBe(true);
  }, 30000);
});
