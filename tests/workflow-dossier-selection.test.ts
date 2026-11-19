import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function compile(config: object, mode: string, extra: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), "dossier-selection-"));
  try {
    const input = join(dir, "config.json");
    const output = join(dir, "pack.json");
    writeFileSync(input, JSON.stringify(config));
    const result = spawnSync(
      process.execPath,
      [
        "scripts/compile-inspiration-pack.mjs",
        "--config",
        input,
        "--out",
        output,
        "--selection",
        mode,
        ...extra,
      ],
      { encoding: "utf8" },
    );
    return {
      status: result.status,
      error: result.stderr,
      pack:
        result.status === 0 ? JSON.parse(readFileSync(output, "utf8")) : null,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("workflow dossier selection", () => {
  it("selects home-care dossiers even when the industry bucket is wellness", () => {
    const result = compile(
      { businessKind: "home-care", industry: "wellness" },
      "allow-shortage",
    );
    expect(result.status).toBe(0);
    expect(result.pack.request.industry).toBe("home-care");
    expect(result.pack.referenceLibrary.status).toBe("selected");
    expect(result.pack.routes).toHaveLength(3);
  });

  it("returns a typed shortage for workflow fallback without relaxing strict callers", () => {
    const config = {
      businessKind: "coffee-roaster",
      industry: "coffee-roaster",
    };
    const result = compile(config, "allow-shortage");
    expect(result.status).toBe(0);
    expect(result.pack.referenceLibrary).toMatchObject({
      status: "reference-shortage",
      eligibleDossierCount: 2,
      selectedDossierCount: 0,
    });
    expect(result.pack.routes).toEqual([]);
    expect(compile(config, "strict").status).toBe(1);
  });

  it("does not classify a missing registry as a shortage", () => {
    const result = compile({ businessKind: "home-care" }, "allow-shortage", [
      "--registry",
      "/nonexistent/dossier-registry.json",
    ]);
    expect(result.status).toBe(1);
    expect(result.error).toContain("ENOENT");
  });

  it("fails closed if a core record is missing from the workflow registry", () => {
    const dir = mkdtempSync(join(tmpdir(), "dossier-registry-"));
    try {
      const registryPath = join(dir, "registry.json");
      const registry = JSON.parse(
        readFileSync("data/inspiration-registry.json", "utf8"),
      );
      registry.records = registry.records.filter(
        ({ id }: { id: string }) => id !== "html5up-home-care-story",
      );
      writeFileSync(registryPath, JSON.stringify(registry));
      const result = compile({ businessKind: "home-care" }, "allow-shortage", [
        "--registry",
        registryPath,
      ]);
      expect(result.status).toBe(1);
      expect(result.error).toContain(
        "Core reference 'html5up-home-care-story'",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not read the dossier registry when selection is skipped", () => {
    const result = compile({ businessKind: "home-care" }, "skip", [
      "--registry",
      "/nonexistent/dossier-registry.json",
    ]);
    expect(result.status).toBe(0);
    expect(result.pack.referenceLibrary.status).toBe("skipped");
    expect(result.pack.routes).toEqual([]);
  });
});
