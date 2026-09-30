import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const repositoryRoot = path.resolve(".");
const verifier = path.join(repositoryRoot, "scripts/verify-creative-diagnostic.mjs");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function createDiagnosticSite({
  demoNotice,
  includeNotice,
  imageMarkup = "",
}: {
  demoNotice?: string;
  includeNotice: boolean;
  imageMarkup?: string;
}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-diagnostic-notice-"));
  roots.push(root);
  await fs.mkdir(path.join(root, "dist"), { recursive: true });
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(
    path.join(root, "src/site.config.json"),
    JSON.stringify({ ...(demoNotice ? { demoNotice } : {}) }),
  );
  const notice = includeNotice
    ? '<aside data-demo-notice role="note">Fictional pipeline demo</aside>'
    : "";
  await fs.writeFile(
    path.join(root, "dist/index.html"),
    `<!doctype html><html><head><meta name="robots" content="noindex, nofollow"><title>Test preview</title></head><body>${notice}<main data-creative-host="true" data-creative-diagnostic="true" data-creative-candidate="candidate-a" data-creative-renderer="creative-candidate"><section data-hero><h1>Test preview</h1></section>${imageMarkup}</main></body></html>`,
  );
  return root;
}

function runVerifier(root: string) {
  return spawnSync(
    process.execPath,
    [verifier, "--dist", "dist", "--candidate", "candidate-a", "--screenshots", ".launchloom/test-screenshots"],
    { cwd: root, encoding: "utf8", timeout: 30_000 },
  );
}

describe("creative diagnostic preview verification", () => {
  it("requires a configured fictional-demo notice to be visible in every viewport", async () => {
    const missing = await createDiagnosticSite({
      demoNotice: "Fictional pipeline demo",
      includeNotice: false,
    });
    const rejected = runVerifier(missing);

    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("demo notice is missing or not visible");

    const visible = await createDiagnosticSite({
      demoNotice: "Fictional pipeline demo",
      includeNotice: true,
    });
    const accepted = runVerifier(visible);

    expect(accepted.status).toBe(0);
    expect(accepted.stdout).toContain('"diagnosticPreview":"safe"');

    const ordinary = await createDiagnosticSite({ includeNotice: false });
    const ordinaryResult = runVerifier(ordinary);

    expect(ordinaryResult.status).toBe(0);
  }, 20_000);

  it("accepts decorative empty alt text and rejects images without an alt attribute", async () => {
    const pixel =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    const decorative = await createDiagnosticSite({
      includeNotice: false,
      imageMarkup: `<img src="${pixel}" alt="" />`,
    });
    const accepted = runVerifier(decorative);

    expect(accepted.status).toBe(0);
    expect(accepted.stdout).toContain('"diagnosticPreview":"safe"');

    const missing = await createDiagnosticSite({
      includeNotice: false,
      imageMarkup: `<img src="${pixel}" />`,
    });
    const rejected = runVerifier(missing);

    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("image missing alt text");
  }, 20_000);
});
