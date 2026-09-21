import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("human creative revision lifecycle", () => {
  it("prepares the persisted selected candidate as the next Luna revision source", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-creative-revision-"),
    );
    roots.push(root);
    const evidenceDir = path.join(
      root,
      ".launchloom/generated-experiences/original-candidate",
    );
    const selectedDir = path.join(
      root,
      "src/generated-experiences/selected",
    );
    const outDir = path.join(root, "prepared");
    await fs.mkdir(evidenceDir, { recursive: true });
    await fs.mkdir(selectedDir, { recursive: true });
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(
      path.join(root, "src/site.config.json"),
      JSON.stringify({
        business: {
          name: "Current Business",
          phone: "555-0100",
          email: "hello@example.test",
          address: "Accra",
          serviceAreas: ["Accra"],
          primaryCta: "Book now",
          tagline: "Current tagline",
          description: "Current description",
        },
        services: [
          {
            name: "Current service",
            description: "Current service description",
          },
        ],
        conversion: {
          process: [],
          faqs: [],
        },
        copy: {
          heroHeading: "Revised hero heading",
          heroBody: "Revised hero body",
        },
        design: {
          experience: {
            renderer: "creative-candidate",
            candidateId: "candidate-a",
          },
        },
        revisionReport: { creativeSourceRepairRequired: true },
      }),
    );
    await fs.writeFile(
      path.join(evidenceDir, "metadata.json"),
      JSON.stringify({
        candidateId: "candidate-a",
        contentManifestDigest: "old-digest",
        creativeManifest: { contentManifestDigest: "old-digest" },
      }),
    );
    await fs.writeFile(
      path.join(evidenceDir, "contract.json"),
      JSON.stringify({
        route: { id: "route-01" },
        creativeManifest: { contentManifestDigest: "old-digest" },
      }),
    );
    await fs.writeFile(
      path.join(evidenceDir, "content-manifest.json"),
      JSON.stringify({
        version: 1,
        digest: "old-digest",
        values: { hero: { heading: "Old hero heading" } },
        tokens: [],
      }),
    );
    for (const [name, original, selected] of [
      ["Experience.jsx", "original experience", "current selected experience"],
      ["styles.css", "original styles", "current selected styles"],
      ["motion.js", "original motion", "current selected motion"],
    ] as const) {
      await fs.writeFile(path.join(evidenceDir, name), original);
      await fs.writeFile(path.join(selectedDir, name), selected);
    }

    const output = execFileSync(
      process.execPath,
      [
        "scripts/prepare-creative-revision-candidate.mjs",
        "--client",
        root,
        "--out",
        outDir,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const result = JSON.parse(output);

    expect(result).toMatchObject({
      creative: true,
      repairRequired: true,
      candidateId: "candidate-a",
    });
    expect(
      await fs.readFile(
        path.join(outDir, "candidate-a/Experience.jsx"),
        "utf8",
      ),
    ).toBe("current selected experience");
    expect(
      await fs.readFile(path.join(outDir, "candidate-a/styles.css"), "utf8"),
    ).toBe("current selected styles");
    const refreshedManifest = JSON.parse(
      await fs.readFile(
        path.join(outDir, "candidate-a/content-manifest.json"),
        "utf8",
      ),
    );
    const refreshedMetadata = JSON.parse(
      await fs.readFile(
        path.join(outDir, "candidate-a/metadata.json"),
        "utf8",
      ),
    );
    const refreshedContract = JSON.parse(
      await fs.readFile(
        path.join(outDir, "candidate-a/contract.json"),
        "utf8",
      ),
    );
    expect(refreshedManifest.values.hero.heading).toBe(
      "Revised hero heading",
    );
    expect(refreshedManifest.values.services[0].name).toBe(
      "Current service",
    );
    expect(refreshedManifest.digest).not.toBe("old-digest");
    expect(refreshedMetadata.contentManifestDigest).toBe(
      refreshedManifest.digest,
    );
    expect(refreshedMetadata.creativeManifest.contentManifestDigest).toBe(
      refreshedManifest.digest,
    );
    expect(refreshedContract.creativeManifest.contentManifestDigest).toBe(
      refreshedManifest.digest,
    );
  });

  it("fails before resolving a missing output path and leaves the working directory intact", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-creative-revision-args-"),
    );
    roots.push(root);
    const sentinel = path.join(root, "sentinel.txt");
    await fs.writeFile(sentinel, "keep");

    expect(() =>
      execFileSync(
        process.execPath,
        [
          path.resolve("scripts/prepare-creative-revision-candidate.mjs"),
          "--client",
          root,
        ],
        { cwd: root, encoding: "utf8", stdio: "pipe" },
      ),
    ).toThrow();
    expect(await fs.readFile(sentinel, "utf8")).toBe("keep");
  });

  it("reports missing creative evidence with the candidate-specific error", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-creative-revision-missing-evidence-"),
    );
    roots.push(root);
    await fs.mkdir(path.join(root, "src/generated-experiences/selected"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(root, "src/site.config.json"),
      JSON.stringify({
        design: {
          experience: {
            renderer: "creative-candidate",
            candidateId: "candidate-a",
          },
        },
        revisionReport: { creativeSourceRepairRequired: true },
      }),
    );
    for (const file of ["Experience.jsx", "styles.css", "motion.js"])
      await fs.writeFile(
        path.join(root, "src/generated-experiences/selected", file),
        "current",
      );

    expect(() =>
      execFileSync(
        process.execPath,
        [
          path.resolve("scripts/prepare-creative-revision-candidate.mjs"),
          "--client",
          root,
          "--out",
          path.join(root, "prepared"),
        ],
        { cwd: process.cwd(), encoding: "utf8", stdio: "pipe" },
      ),
    ).toThrow(/Could not find authored candidate evidence for candidate-a/u);
  });

  it("keeps developer and client feedback on the developer-first approval path", () => {
    const developer = readFileSync(
      ".github/workflows/process-feedback.yml",
      "utf8",
    );
    const client = readFileSync(
      ".github/workflows/process-client-feedback.yml",
      "utf8",
    );
    const publish = readFileSync(".github/workflows/publish-site.yml", "utf8");
    const worker = readFileSync("worker/src/index.ts", "utf8");

    for (const workflow of [developer, client]) {
      expect(workflow).toContain(
        "scripts/prepare-creative-revision-candidate.mjs",
      );
      expect(workflow).toContain("scripts/run-rendered-creative-repair.mjs");
      expect(workflow).toContain("--require-diversity false");
      expect(workflow).toContain("humanRevisionPass == true");
    }

    expect(developer).toContain(
      '--feedback-file "$RUNNER_TEMP/developer-feedback.txt"',
    );
    expect(client).toContain(
      '--feedback-file "$RUNNER_TEMP/client-feedback.txt"',
    );
    expect(client).toContain('--to "$LAUNCHLOOM_DEVELOPER_EMAIL"');
    expect(client).not.toContain('--to "$CLIENT_EMAIL"');
    expect(client).toContain('BRANCH="review/client-revision-$SAFE_REQUEST"');
    expect(client).not.toContain("BRANCH=review/client-revision\n");

    expect(worker).toContain('claims.stage !== "developer"');
    expect(worker).toContain('await dispatch(env, "publish-site"');
    expect(worker).toContain("approvedSha: mergeResult.sha");
    expect(publish).toContain("APPROVED_SHA");
    expect(publish).toContain('git checkout --detach "$APPROVED_SHA"');
    expect(publish).toContain('--commit-hash "$APPROVED_SHA"');
    expect(publish).toContain('--to "$CLIENT_EMAIL"');
    expect(publish).toContain("client-approved-feedback.txt");
    expect(publish).toContain('--feedback-file "$RUNNER_TEMP/client-approved-feedback.txt"');
  });

  it("returns client-requested revisions to the developer with the triggering request in the email", () => {
    const workflow = readFileSync(
      ".github/workflows/process-client-feedback.yml",
      "utf8",
    );
    expect(workflow).toContain("Client-feedback developer preview");
    expect(workflow).toContain('--audience developer');
    expect(workflow).toContain(
      '--feedback-file "$RUNNER_TEMP/client-feedback.txt"',
    );
    expect(workflow).toContain(
      "Nothing was sent back to the client.",
    );
  });
});
