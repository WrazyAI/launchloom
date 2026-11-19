import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "yaml";
import { describe, expect, it } from "vitest";

describe("effective renderer workflow", () => {
  it.each([
    ["selected", ""],
    ["reference-shortage", "GENERATION_RENDERER=pack"],
  ])(
    "makes a %s routing decision from the compiler output",
    async (status, assignment) => {
      const dir = await fs.mkdtemp(join(tmpdir(), "workflow-renderer-"));
      try {
        const { jobs } = yaml.parse(
          await fs.readFile(".github/workflows/generate-client.yml", "utf8"),
        );
        const step = jobs.generate.steps.find(
          ({ name }: { name: string }) => name === "Resolve effective renderer",
        );
        await fs.writeFile(
          join(dir, "site.config.json"),
          JSON.stringify({
            industry: "wellness",
            businessKind: "home-care",
            design: { experience: { packId: "kinetic-poster" } },
          }),
        );
        await fs.writeFile(
          join(dir, "inspiration-pack.json"),
          JSON.stringify({
            referenceLibrary: { status },
          }),
        );
        const envFile = join(dir, "github-env");
        await fs.writeFile(envFile, "");
        execFileSync(
          "bash",
          ["-eo", "pipefail", "-c", step.run.replaceAll("/tmp/", `${dir}/`)],
          {
            env: { ...process.env, GITHUB_ENV: envFile },
          },
        );
        const exported = await fs.readFile(envFile, "utf8");
        if (assignment) {
          expect(exported).toContain(`${assignment}\n`);
          expect(exported).toContain("PACK_ID=kinetic-poster\n");
          expect(exported).toContain(
            "RENDERER_FALLBACK_REASON=creative-reference-shortage\n",
          );
        } else {
          expect(exported).toBe("");
        }
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    },
  );

  it("routes from the compiled selection before authoring and switches through the env", async () => {
    const source = await fs.readFile(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    expect(source).toContain("Resolve effective renderer");
    expect(source).not.toContain("reference-availability.mjs");
    expect(source).toContain("'.referenceLibrary.status'");
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
    expect(preflight).toBeGreaterThan(reserve);
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
    expect(reserve).toContain('if [ "$GENERATION_RENDERER" != "creative" ]');
  });

  it("records a completed reservation only after the reservation step confirms it", async () => {
    const { jobs } = yaml.parse(
      await fs.readFile(".github/workflows/generate-client.yml", "utf8"),
    );
    const step = jobs.generate.steps.find(
      ({ name }: { name: string }) =>
        name === "Record inspiration selection stage",
    );
    expect(step.if).toBe("steps.inspiration.outputs.reserved == 'true'");
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

  it("allows the explicit preview-only canary through the full intake guard", async () => {
    const source = await fs.readFile(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    expect(source).toContain("GUARD_PROFILE=full");
    expect(source).toContain(
      'if [ "$PREVIEW_ONLY" = "true" ]; then GUARD_PROFILE=full-preview; fi',
    );
    expect(
      (source.match(/assert-client-generation-mode\.mjs/gu) || []).length,
    ).toBe(2);
  });

  it("keeps the workflow parseable", async () => {
    const document = yaml.parse(
      await fs.readFile(".github/workflows/generate-client.yml", "utf8"),
    );
    expect(Object.keys(document.jobs)).toContain("generate");
    expect(Object.keys(document.jobs)).toContain("renderer_policy");
  });
});
