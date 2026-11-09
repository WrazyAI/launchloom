import fs from "node:fs/promises";
import yaml from "yaml";
import { describe, expect, it } from "vitest";

describe("effective renderer workflow", () => {
  it("preflights creative references before authoring and switches through the env", async () => {
    const source = await fs.readFile(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    expect(source).toContain("Resolve effective renderer");
    expect(source).toContain("reference-availability.mjs");
    expect(source).toContain("resolve-effective-renderer.mjs");
    expect(source).toContain("GENERATION_RENDERER=$EFFECTIVE");
    expect(source).toContain("RENDERER_FALLBACK_REASON");
    expect(source).toContain("RENDERER_NOTE");
    expect(source).toContain("renderer-fallback.txt");
    expect(source).toContain("--detail-code renderer_fallback");
    expect(source).not.toContain("needs.renderer_policy.outputs.renderer ==");
    expect(source).toContain("env.GENERATION_RENDERER == 'creative'");
    expect(source).toContain("env.GENERATION_RENDERER == 'pack'");
    expect(source).toContain("env.GENERATION_RENDERER == 'foundation'");
    const preflight = source.indexOf("Resolve effective renderer");
    const reserve = source.indexOf("Reserve inspiration routes");
    const authoring = source.indexOf(
      "Author independent experience candidates",
    );
    expect(preflight).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(reserve);
    expect(preflight).toBeLessThan(authoring);
  });

  it("keeps the renderer env dynamic for the pack selection step", async () => {
    const source = await fs.readFile(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    expect(source).toContain("RENDERER_PACK_ID: ${{ env.PACK_ID }}");
    expect(source).toContain("RENDERER_PACK_VARIANT: ${{ env.PACK_VARIANT }}");
    const reserve = source.slice(
      source.indexOf("Reserve inspiration routes"),
      source.indexOf("Record inspiration selection stage"),
    );
    expect(reserve).toContain("env.GENERATION_RENDERER == 'creative'");
  });

  it("switches to the pack path when creative authoring or rendering fails", async () => {
    const source = await fs.readFile(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    expect(source).toContain("Prepare pack fallback after creative failure");
    expect(source).toContain("id: pack_fallback");
    expect(source).toContain("GENERATION_RENDERER=pack");
    expect(source).toContain(
      "RENDERER_FALLBACK_REASON=creative-authoring-or-render-failure",
    );
    const deploy = source.slice(
      source.indexOf("name: Build and direct-upload public preview"),
      source.indexOf("name: Record preview deploy stage"),
    );
    expect(deploy).toContain("steps.pack_fallback.outputs.active == 'true'");
    for (const step of [
      "Wait for secure preview URL",
      "Record preview ready",
      "Create secure review link",
      "Post handoff links",
      "Send developer preview email",
    ]) {
      const start = source.indexOf(`name: ${step}`);
      const next = source.indexOf("\n      - name:", start + 10);
      const block = source.slice(start, next === -1 ? undefined : next);
      expect(block).toContain("always()");
      expect(block).toContain("steps.deploy.outputs.preview != ''");
    }
  });

  it("keeps the workflow parseable", async () => {
    const document = yaml.parse(
      await fs.readFile(".github/workflows/generate-client.yml", "utf8"),
    );
    expect(Object.keys(document.jobs)).toContain("generate");
    expect(Object.keys(document.jobs)).toContain("renderer_policy");
  });
});
