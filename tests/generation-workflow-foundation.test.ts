import fs from "node:fs";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { buildSafeVisualManifest } from "../scripts/visual-quality-gate-lib.mjs";

const workflow = YAML.parse(
  fs.readFileSync(".github/workflows/generate-client.yml", "utf8"),
);
const generateSteps = workflow.jobs.generate.steps;
const step = (name: string) => {
  const found = generateSteps.find((candidate: any) => candidate.name === name);
  if (!found) throw new Error(`Missing workflow step: ${name}`);
  return found;
};

describe("generation workflow foundation renderer", () => {
  it("exposes an explicit renderer and foundation policy", () => {
    const inputs = workflow.on.workflow_dispatch.inputs;
    expect(inputs.renderer.options).toEqual(["creative", "foundation"]);
    expect(inputs.renderer.default).toBe("creative");
    expect(inputs.foundation_id.type).toBe("string");
    expect(inputs.foundation_policy.options).toEqual([
      "renderable-only",
      "allow-partial",
      "allow-adaptation",
    ]);
    expect(workflow.jobs.renderer_policy.outputs).toMatchObject({
      renderer: "${{ steps.policy.outputs.renderer }}",
      foundation_id: "${{ steps.policy.outputs.foundation_id }}",
      foundation_policy: "${{ steps.policy.outputs.foundation_policy }}",
    });
    expect(workflow.jobs.generate.needs).toContain("renderer_policy");
  });

  it("keeps every authoring and repair step on the creative renderer", () => {
    for (const name of [
      "Author independent experience candidates",
      "Commit authored experience evidence",
      "Render and repair creative candidates in the production shell",
      "Prepare private creative-recovery report",
      "Build and deploy noindex diagnostic preview",
      "Register one-time repair session and create signed review link",
    ]) {
      expect(step(name).if).toContain(
        "needs.renderer_policy.outputs.renderer == 'creative'",
      );
    }
  });

  it("selects and records the source foundation before preview", () => {
    const names = generateSteps.map((candidate: any) => candidate.name);
    expect(names).toContain("Select source foundation");
    expect(names).toContain("Record foundation select stage");
    expect(names).toContain("Record foundation render started");
    expect(names).toContain("Record foundation render stage");
    expect(step("Select source foundation").if).toBe(
      "needs.renderer_policy.outputs.renderer == 'foundation'",
    );
    expect(step("Select source foundation").run).toContain(
      'renderer:"foundation"',
    );
    expect(step("Select source foundation").run).toContain(
      'selectionMode:"foundation-preview"',
    );
    expect(step("Select source foundation").run).toContain(
      "allow-adaptation is not implemented",
    );
    expect(step("Record foundation select stage").run).toContain(
      "--stage foundation_select",
    );
    expect(step("Record foundation render started").run).toContain(
      "--stage foundation_render --status started",
    );
    expect(step("Record foundation render stage").run).toContain(
      "--stage foundation_render --status completed",
    );
  });

  it("branches the preview build and assertions for foundations", () => {
    const preview = step("Build and direct-upload public preview");
    expect(preview.run).toContain(
      'if [ "$GENERATION_RENDERER" = "foundation" ]',
    );
    expect(preview.run).toContain("data-foundation-dossier");
    expect(preview.run).toContain("data-experience-pack");
    expect(preview.run).toContain("data-foundation-contact");
    expect(preview.run).toContain("Foundation license credit missing");
    expect(preview.run).toContain(
      "data-creative-candidate|legacy-design-family",
    );
    expect(preview.run).toContain("verify-rendered-revision.mjs");
    expect(preview.run).toContain("seo-release-gate.mjs");
  });

  it("records foundation failures with the foundation stage", () => {
    const failure = step("Record generation failure");
    expect(failure.run).toContain(
      'if [ "$GENERATION_RENDERER" = "foundation" ]',
    );
    expect(failure.run).toContain("FAILURE_STAGE=foundation_render");
    expect(failure.run).toContain("FAILURE_CATEGORY=foundation_render");
  });

  it("builds a foundation visual manifest instead of a pack or legacy manifest", () => {
    const manifest = buildSafeVisualManifest({
      preset: "home-services",
      industry: "home-services",
      businessKind: "landscaping",
      business: { name: "Harbor & Pine", serviceAreas: ["Millbrook"] },
      services: [],
      design: {
        recipe: "local-trades",
        sections: [],
        experience: {
          renderer: "foundation",
          foundationId: "spicer-landscaping-season-wheel",
          fingerprint: "abc123",
          foundationCompatibility: "needs-adaptation",
        },
      },
    });
    expect(manifest.design.renderer).toMatchObject({
      type: "foundation",
      foundationId: "spicer-landscaping-season-wheel",
      fingerprint: "abc123",
      compatibility: "needs-adaptation",
    });
    expect(manifest.design.requiredSections).toEqual([
      "hero",
      "conversion",
      "services",
      "faq",
      "contact",
    ]);
    expect(manifest.design.navigationLinks).toEqual([
      "Services",
      "FAQs",
      "Contact",
    ]);
  });

  it("wires the generic renderer into the client site", () => {
    const component = fs.readFileSync(
      "templates/client-site/src/components/FoundationExperience.astro",
      "utf8",
    );
    expect(component).toContain("compileFoundationContent");
    expect(component).toContain("renderFoundation");
    expect(component).toContain("<LeadForm");
    expect(component).toContain("<ReferencePackCredit");
    expect(component).toContain("data-experience-pack");
    const page = fs.readFileSync(
      "templates/client-site/src/pages/index.astro",
      "utf8",
    );
    expect(page).toContain("foundationRenderer");
    expect(page).toContain("<FoundationExperience");
  });
});
