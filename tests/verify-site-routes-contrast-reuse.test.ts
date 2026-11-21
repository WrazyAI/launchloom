import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { distArtifactDigest } from "../scripts/destination-route-verification.mjs";
import { loadVerifiedContrastReport } from "../scripts/verify-site-routes.mjs";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

async function makeDistFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ll-contrast-reuse-"));
  tempDirs.push(root);
  const dist = path.join(root, "dist");
  await fs.mkdir(path.join(dist, "about"), { recursive: true });
  await fs.writeFile(
    path.join(dist, "index.html"),
    "<!doctype html><html><body><h1>Home</h1></body></html>\n",
  );
  await fs.writeFile(
    path.join(dist, "about/index.html"),
    "<!doctype html><html><body><h1>About</h1></body></html>\n",
  );
  await fs.writeFile(
    path.join(dist, "404.html"),
    "<!doctype html><html><body><h1>Not found</h1></body></html>\n",
  );
  const distDigest = await distArtifactDigest(dist);
  const reportPath = path.join(root, "production-contrast.json");
  const validReport = {
    version: 1,
    pass: true,
    distDigest,
    repairs: [],
    after: {
      version: 1,
      pass: true,
      routes: ["/", "/404.html", "/about/"],
      pages: [
        { route: "/", pass: true, findings: [] },
        { route: "/about/", pass: true, findings: [] },
        { route: "/404.html", pass: true, findings: [] },
      ],
      findings: [],
    },
  };
  await fs.writeFile(reportPath, JSON.stringify(validReport, null, 2));
  return { root, dist, reportPath, validReport };
}

describe("verify-site-routes contrast report reuse", () => {
  it("reuses a digest-matched passing contrast report and ignores .launchloom-release.json", async () => {
    const { dist, reportPath, validReport } = await makeDistFixture();
    // Simulates pre-deploy verify-site-routes writing .launchloom-release.json
    // before post-deploy destination verification reuses the same contrast report.
    await fs.writeFile(
      path.join(dist, ".launchloom-release.json"),
      JSON.stringify({ version: 1 }) + "\n",
    );
    const reused = await loadVerifiedContrastReport({ reportPath, dist });
    expect(reused).toEqual(validReport.after);
  });

  it("fails closed if any built dist asset changes after contrast verification", async () => {
    const { dist, reportPath } = await makeDistFixture();
    await fs.writeFile(
      path.join(dist, "index.html"),
      "<!doctype html><html><body><h1>Mutated</h1></body></html>\n",
    );
    await expect(
      loadVerifiedContrastReport({ reportPath, dist }),
    ).rejects.toThrow(/digest does not match/iu);
  });

  it("fails closed if the contrast report did not pass", async () => {
    const { dist, reportPath, validReport } = await makeDistFixture();
    validReport.pass = false;
    validReport.after.pass = false;
    await fs.writeFile(reportPath, JSON.stringify(validReport, null, 2));
    await expect(
      loadVerifiedContrastReport({ reportPath, dist }),
    ).rejects.toThrow(/not a valid passing/iu);
  });

  it("fails closed if route coverage is incomplete", async () => {
    const { dist, reportPath, validReport } = await makeDistFixture();
    validReport.after.routes = ["/", "/404.html"];
    await fs.writeFile(reportPath, JSON.stringify(validReport, null, 2));
    await expect(
      loadVerifiedContrastReport({ reportPath, dist }),
    ).rejects.toThrow(/route coverage does not match/iu);
  });
});
