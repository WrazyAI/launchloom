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

    execFileSync(process.execPath, [
      path.resolve("scripts/compile-inspiration-pack.mjs"),
      "--config", configPath,
      "--intake", intakePath,
      "--out", outputPath,
    ], { cwd: process.cwd(), encoding: "utf8" });

    const pack = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    expect(pack.request.industry).toBe("fitness");
    expect(new Set(pack.routes.map((route: any) => route.referenceDossier.id))).toEqual(new Set([
      "html5up-fitness-big-picture",
      "colorlib-ironworks-strength-club",
      "spicer-gym-timetable-first",
    ]));
  }, 30_000);
});
