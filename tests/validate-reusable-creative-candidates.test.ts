import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildCreativeContentManifest } from "../scripts/production-experience-author.mjs";
import { buildCandidateManifest } from "../scripts/creative-compiler.mjs";
import { buildInspirationPack } from "../scripts/inspiration-registry.mjs";
import { loadReferenceDossier } from "../scripts/reference-dossier.mjs";
import { validateAndCopyReusableCandidates } from "../scripts/validate-reusable-creative-candidates.mjs";
import {
  assertReusableCandidateDossierBinding,
  assertReusableInspirationPack,
} from "../scripts/validate-reusable-creative-candidates.mjs";

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
  function architecturePack() {
    const registry = JSON.parse(readFileSync("data/inspiration-registry.json", "utf8"));
    const pack: any = buildInspirationPack(
      {
        seed: "reusable-pack-test",
        industry: "architecture",
        styleTerms: [],
        recentReferenceIds: [],
        recentRouteSignatures: [],
      },
      registry,
      { repositoryRoot: path.resolve("."), requireDossiers: true },
    );
    pack.referenceLibrary = {
      policy: "permission-cleared-only",
      source: "data/reference-library/core-collection.json",
      selectedDossierCount: pack.routes.length,
      recordIds: pack.routes.map((route: any) => route.referenceDossier.id),
    };
    return pack;
  }

  it("revalidates reusable dossier digests and canonical business-kind membership", async () => {
    const inspiration = architecturePack();
    expect(
      await assertReusableInspirationPack({
        inspiration,
        config: { businessKind: "architecture" },
        repositoryRoot: path.resolve("."),
      }),
    ).toBe(inspiration);

    const stale: any = structuredClone(inspiration);
    stale.routes[0].referenceDossier.digest = "0".repeat(64);
    await expect(
      assertReusableInspirationPack({
        inspiration: stale,
        config: { businessKind: "architecture" },
        repositoryRoot: path.resolve("."),
      }),
    ).rejects.toThrow(/stale or mismatched Reference Dossier/iu);

    await expect(
      assertReusableInspirationPack({
        inspiration,
        config: { businessKind: "dental" },
        repositoryRoot: path.resolve("."),
      }),
    ).rejects.toThrow(/not in the canonical core niche for business kind 'dental'/iu);

    const wrongNiche: any = structuredClone(inspiration);
    const dental = loadReferenceDossier(
      "data/reference-library/dossiers/html5up-dental-dimension",
    );
    wrongNiche.routes[0].referenceDossier = {
      id: dental.id,
      referenceName: dental.referenceName,
      familyId: dental.familyId,
      source: dental.source,
      path: dental.path,
      digest: dental.digest,
      tags: dental.tags,
      designPrompt: dental.designPrompt,
    };
    wrongNiche.routes[0].referenceDna = dental.referenceDna;
    wrongNiche.referenceLibrary.recordIds[0] = dental.id;
    await expect(
      assertReusableInspirationPack({
        inspiration: wrongNiche,
        config: { businessKind: "architecture" },
        repositoryRoot: path.resolve("."),
      }),
    ).rejects.toThrow(/not in the canonical core niche/iu);
  });

  it("binds each reused candidate manifest to its exact validated route dossier", () => {
    const route = architecturePack().routes[0];
    const creativeManifest = buildCandidateManifest({
      candidate: { candidateId: "candidate-a" },
      route,
      model: "openai/gpt-6-luna",
      contentManifestDigest: "a".repeat(64),
    });
    const metadata = { creativeManifest };
    const contract = { creativeManifest };

    expect(() =>
      assertReusableCandidateDossierBinding(metadata, contract, route, "candidate-a"),
    ).not.toThrow();

    const tampered: any = structuredClone(metadata);
    tampered.creativeManifest.referenceDossier.digest = "0".repeat(64);
    expect(() =>
      assertReusableCandidateDossierBinding(tampered, contract, route, "candidate-a"),
    ).toThrow(/Reference Dossier does not match its route/iu);
  });

  it("rejects reusable artifacts without canonical dossier bindings before copying", async () => {
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
    ).rejects.toThrow(/permission-cleared dossier-backed Reference DNA pack/iu);
    await expect(fs.access(outputPath)).rejects.toThrow();
  });
});
