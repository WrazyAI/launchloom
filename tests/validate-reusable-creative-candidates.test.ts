import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildCreativeContentManifest } from "../scripts/production-experience-author.mjs";
import { validateAndCopyReusableCandidates } from "../scripts/validate-reusable-creative-candidates.mjs";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value)}\n`);
}

describe("reusable creative candidate validation", () => {
  it("rejects stale sealed content before copying any candidate files", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-reusable-candidates-"),
    );
    roots.push(root);
    const configPath = path.join(root, "site.config.json");
    const inspirationPath = path.join(root, "inspiration-pack.json");
    const candidatesPath = path.join(root, "candidates");
    const outputPath = path.join(root, "output");
    const sessionPath = path.join(root, "reasoning-preflight.json");
    const creativeSession = {
      version: 1,
      mode: "shadow",
      creativeModel: "openai/gpt-6-luna",
      sessionId: `launchloom:creative:${"a".repeat(40)}`,
      reasoningEffort: "xhigh",
      recommendedEffort: "xhigh",
      reasoningPolicyVersion: "adaptive-reasoning-v1",
      judgmentSchemaVersion: "design-complexity-v1",
      selectorModelVersion: "jev-1.13.0",
      selector: { fallbackUsed: false },
      decision: {},
    };
    const routes = ["route-01", "route-02", "route-03"].map((id) => ({ id }));
    const config = { business: { name: "Test business" } };
    await writeJson(configPath, config);
    await writeJson(inspirationPath, { referenceDnaAnalyzed: true, routes });
    await writeJson(sessionPath, creativeSession);
    await writeJson(path.join(candidatesPath, "creative-run.json"), {
      status: "authored",
      model: "openai/gpt-6-luna",
      creativeSession,
      contentManifestDigest: buildCreativeContentManifest(config, routes[0])
        .digest,
    });
    await writeJson(
      path.join(candidatesPath, "content-manifest.json"),
      buildCreativeContentManifest(config, routes[0]),
    );
    await writeJson(
      path.join(candidatesPath, "reasoning-preflight.json"),
      creativeSession,
    );

    for (const [index, name] of [
      "candidate-a",
      "candidate-b",
      "candidate-c",
    ].entries()) {
      const directory = path.join(candidatesPath, name);
      await writeJson(path.join(directory, "metadata.json"), {
        candidateId: name,
        routeId: routes[index].id,
        model: "openai/gpt-6-luna",
        contentManifestDigest: "stale-digest",
      });
      await writeJson(path.join(directory, "content-manifest.json"), {
        digest: "stale-digest",
        values: {},
        tokens: [],
      });
      await writeJson(path.join(directory, "contract.json"), {});
      await fs.writeFile(
        path.join(directory, "Experience.jsx"),
        "export default function Experience(){ return null; }",
      );
      await fs.writeFile(
        path.join(directory, "styles.css"),
        ".candidate { color: black; }",
      );
      await fs.writeFile(
        path.join(directory, "motion.js"),
        "export function mountExperienceMotion(){ return () => {}; }",
      );
    }

    await expect(
      validateAndCopyReusableCandidates({
        configPath,
        inspirationPath,
        candidatesPath,
        outputPath,
        sessionPath,
        model: "openai/gpt-6-luna",
      }),
    ).rejects.toThrow(/content tokens do not match/u);
    await expect(fs.access(outputPath)).rejects.toThrow();

    for (const [index, name] of [
      "candidate-a",
      "candidate-b",
      "candidate-c",
    ].entries()) {
      const manifest = buildCreativeContentManifest(config, routes[index]);
      const metadataPath = path.join(candidatesPath, name, "metadata.json");
      const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
      metadata.contentManifestDigest = manifest.digest;
      await writeJson(metadataPath, metadata);
      await writeJson(
        path.join(candidatesPath, name, "content-manifest.json"),
        manifest,
      );
    }
    await expect(
      validateAndCopyReusableCandidates({
        configPath,
        inspirationPath,
        candidatesPath,
        outputPath,
        sessionPath,
        model: "openai/gpt-6-luna",
      }),
    ).rejects.toThrow(/missing a required Reference DNA binding/u);
    await expect(fs.access(outputPath)).rejects.toThrow();
  });
});
