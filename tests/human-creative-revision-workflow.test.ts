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
      JSON.stringify({ candidateId: "candidate-a" }),
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

    expect(worker).toContain('claims.stage !== "developer"');
    expect(worker).toContain('await dispatch(env, "publish-site"');
    expect(publish).toContain('--to "$CLIENT_EMAIL"');
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
