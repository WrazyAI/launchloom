import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryRoots: string[] = [];

describe("production inspiration pack compiler", () => {
  afterEach(() => {
    for (const root of temporaryRoots.splice(0))
      fs.rmSync(root, { recursive: true, force: true });
  });

  it("uses a specific configured businessKind instead of the broad intake industry", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "launchloom-kind-compile-"));
    temporaryRoots.push(root);
    const configPath = path.join(root, "site.config.json");
    const intakePath = path.join(root, "intake.md");
    const historyPath = path.join(root, "recent-launch-signatures.json");
    const outputPath = path.join(root, "inspiration-pack.json");
    fs.writeFileSync(configPath, JSON.stringify({
      industry: "wellness",
      businessKind: "fitness",
      business: { name: "Pulse Strength Studio" },
      style: { tone: "direct and athletic" },
    }));
    fs.writeFileSync(intakePath, `# Intake\n\n\`\`\`json\n${JSON.stringify({
      industry: "wellness",
      businessName: "Pulse Strength Studio",
      services: "Strength coaching and group fitness",
    })}\n\`\`\`\n`);
    fs.writeFileSync(historyPath, JSON.stringify({
      launches: [
        {
          businessKind: "fitness",
          referenceIds: ["colorlib-ironworks-strength-club"],
          routeSignatures: ["fitness-route-signature"],
        },
        {
          businessKind: "legal-services",
          referenceIds: ["colorlib-caseworth-legal-ledger"],
          routeSignatures: ["legal-route-signature"],
        },
      ],
    }));

    execFileSync(process.execPath, [
      path.resolve("scripts/compile-inspiration-pack.mjs"),
      "--config", configPath,
      "--intake", intakePath,
      "--history", historyPath,
      "--out", outputPath,
    ], { cwd: process.cwd(), encoding: "utf8" });

    const pack = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    expect(pack.request.industry).toBe("fitness");
    expect(pack.request.recentReferenceIds).toEqual([
      "colorlib-ironworks-strength-club",
    ]);
    expect(pack.request.recentRouteSignatures).toEqual([
      "fitness-route-signature",
    ]);
    expect(pack.request.referenceExposure).toEqual({
      "colorlib-ironworks-strength-club": 1,
    });
    const selected = new Set(pack.routes.map((route: any) => route.referenceDossier.id));
    const fitnessCore = JSON.parse(fs.readFileSync(path.resolve("data/reference-library/core-collection.json"), "utf8"))
      .niches.find((niche: any) => niche.businessKind === "fitness");
    expect(selected.size).toBe(3);
    expect([...selected].every((id) => fitnessCore.referenceIds.includes(id))).toBe(true);
    expect(selected.has("colorlib-ironworks-strength-club")).toBe(false);
  }, 30_000);

  it("skips broad configured kinds and selects another explicit business kind", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "launchloom-kind-fallback-"));
    temporaryRoots.push(root);
    const configPath = path.join(root, "site.config.json");
    const historyPath = path.join(root, "recent-launch-signatures.json");
    const outputPath = path.join(root, "inspiration-pack.json");
    fs.writeFileSync(configPath, JSON.stringify({
      businessKind: "all",
      industry: "fitness",
      preset: "editorial",
      business: { name: "Pulse Strength Studio" },
    }));
    fs.writeFileSync(historyPath, JSON.stringify({ version: 1, launches: [] }));

    execFileSync(process.execPath, [
      path.resolve("scripts/compile-inspiration-pack.mjs"),
      "--config", configPath,
      "--history", historyPath,
      "--out", outputPath,
    ], { cwd: process.cwd(), encoding: "utf8" });

    const pack = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    expect(pack.request.industry).toBe("fitness");
  }, 30_000);

  it("uses a workflow-attempt ID as the variation seed while keeping the intake ID separate", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "launchloom-generation-seed-"));
    temporaryRoots.push(root);
    const configPath = path.join(root, "site.config.json");
    const intakePath = path.join(root, "intake.md");
    const historyPath = path.join(root, "recent-launch-signatures.json");
    const outputPath = path.join(root, "inspiration-pack.json");
    fs.writeFileSync(configPath, JSON.stringify({
      businessKind: "home-care",
      business: { name: "Willow and Hearth Home Care" },
      design: { recipe: "care-editorial" },
    }));
    fs.writeFileSync(intakePath, `# Intake\n\n\`\`\`json\n${JSON.stringify({
      submissionId: "intake-104",
      industry: "home-care",
    })}\n\`\`\`\n`);
    fs.writeFileSync(historyPath, JSON.stringify({ version: 1, launches: [] }));

    const outputs = [] as any[];
    for (const attemptId of ["run-8801-attempt-1", "run-8801-attempt-2"]) {
      execFileSync(process.execPath, [
        path.resolve("scripts/compile-inspiration-pack.mjs"),
        "--config", configPath,
        "--intake", intakePath,
        "--history", historyPath,
        "--out", outputPath,
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, LAUNCHLOOM_INTAKE_ID: "104", LAUNCHLOOM_GENERATION_ID: attemptId },
      });
      outputs.push(JSON.parse(fs.readFileSync(outputPath, "utf8")));
    }

    expect(outputs.map((pack) => pack.request.seed)).toEqual([
      "run-8801-attempt-1",
      "run-8801-attempt-2",
    ]);
    expect(outputs.map((pack) => pack.request.generationId)).toEqual([
      "run-8801-attempt-1",
      "run-8801-attempt-2",
    ]);
    expect(outputs[0].selectionKey).not.toBe(outputs[1].selectionKey);
    expect(outputs.every((pack) => pack.request.industry === "home-care")).toBe(true);
  }, 30_000);
});
