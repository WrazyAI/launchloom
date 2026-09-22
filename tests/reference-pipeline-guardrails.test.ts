import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prepareCreativeDiagnostics } from "../scripts/prepare-creative-diagnostics.mjs";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      fsp.rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("reference authoring pipeline guardrails", () => {
  it("tells Luna that section IDs and visual requirements are different contracts", () => {
    const author = fs.readFileSync(
      "scripts/author-production-experiences.mjs",
      "utf8",
    );
    expect(author).toContain(
      "A marker alone is not evidence: implement the signature description as real structure and composition.",
    );
    expect(author).toContain(
      "sectionVisualRequirements are descriptive evidence, never IDs",
    );
    expect(author).toContain(
      'data-reference-overlap-layer="product"',
    );
    expect(author).toContain(
      "full Reference DNA, and your current JSX are included in this repair request",
    );
    expect(author).toContain("expectedSectionIds");
    expect(author).toContain("requiredSignatures");
  });

  it("keeps structured reference findings, screenshots, DNA, and current source in the rendered repair lane", () => {
    const orchestrator = fs.readFileSync(
      "scripts/run-rendered-creative-repair.mjs",
      "utf8",
    );
    const repair = fs.readFileSync(
      "scripts/creative-repair-loop.mjs",
      "utf8",
    );
    expect(orchestrator).toContain(
      "...candidate?.referenceFidelity?.renderedVisualFindings",
    );
    expect(orchestrator).toContain("screenshots: availableScreenshots");
    expect(orchestrator).toContain("maxCycles = 2");
    expect(repair).toContain("ASSIGNED REFERENCE DNA");
    expect(repair).toContain("CURRENT EXPERIENCE.JSX");
    expect(repair).toContain("CURRENT STYLES.CSS");
    expect(repair).toContain("CURRENT MOTION.JS");
    expect(repair).toContain("for (const screenshot of screenshots.slice(0, 3))");
  });

  it("does not provision client resources or a review PR before creative promotion preflight passes", () => {
    const workflow = fs.readFileSync(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    const preflight = workflow.indexOf(
      "- name: Render and repair creative candidates before provisioning",
    );
    const provision = workflow.indexOf(
      "- name: Create private repository and Cloudflare Pages project",
    );
    const prCreate = workflow.indexOf("gh pr create");
    const copySelected = workflow.indexOf(
      'cp -R "$PRE_DIR/src/generated-experiences/selected" src/generated-experiences/selected',
    );
    const deploy = workflow.indexOf(
      "- name: Build and direct-upload public preview",
    );
    expect(preflight).toBeGreaterThan(-1);
    expect(provision).toBeGreaterThan(preflight);
    expect(copySelected).toBeGreaterThan(provision);
    expect(prCreate).toBeGreaterThan(copySelected);
    expect(deploy).toBeGreaterThan(prCreate);
    expect(workflow).toContain("--mode promote");
    expect(workflow).toContain("--require-diversity true");
    expect(workflow).toContain(".promotionReady == true");
    expect(workflow).toContain('data-creative-candidate="fallback"');
    expect(workflow.indexOf('data-creative-candidate="fallback"')).toBeLessThan(
      provision,
    );
  });

  it("keeps private failure diagnostics short-lived and excludes sealed content manifests", () => {
    const workflow = fs.readFileSync(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    const marker = "name: creative-failure-diagnostics-";
    const start = workflow.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    expect(workflow.slice(start, start + 500)).toContain("retention-days: 3");
  });

  it("sanitizes candidate diagnostics and omits content manifests", async () => {
    const root = await fsp.mkdtemp(
      path.join(os.tmpdir(), "launchloom-reference-diagnostics-"),
    );
    roots.push(root);
    const candidates = path.join(root, "candidates");
    const candidate = path.join(candidates, "candidate-a");
    const repair = path.join(root, "repair");
    const out = path.join(root, "out");
    await fsp.mkdir(candidate, { recursive: true });
    await fsp.mkdir(path.join(repair, "final/screenshots"), {
      recursive: true,
    });
    await fsp.writeFile(
      path.join(candidate, "Experience.jsx"),
      'export default () => <p>client@example.com https://secret.example</p>',
    );
    await fsp.writeFile(path.join(candidate, "styles.css"), ":root{}");
    await fsp.writeFile(
      path.join(candidate, "motion.js"),
      "export function mountExperienceMotion(){ return () => {}; }",
    );
    await fsp.writeFile(
      path.join(candidate, "content-manifest.json"),
      JSON.stringify({ values: { email: "client@example.com" } }),
    );
    await fsp.writeFile(
      path.join(candidate, "metadata.json"),
      JSON.stringify({
        candidateId: "candidate-a",
        routeId: "route-01",
        model: "openai/gpt-5.6-luna",
        referenceDna: {
          sectionSequence: ["hero", "services", "contact"],
          sectionVisualRequirements: ["layered collage hero"],
        },
      }),
    );
    await fsp.writeFile(
      path.join(repair, "final/screenshots/candidate-a-desktop.png"),
      Buffer.from("private screenshot"),
    );
    await fsp.writeFile(
      path.join(repair, "summary.json"),
      JSON.stringify({
        token: "super-secret-token-value",
        email: "client@example.com",
        status: "failed",
      }),
    );

    await prepareCreativeDiagnostics({
      candidatesDir: candidates,
      repairDir: repair,
      outDir: out,
    });

    const source = await fsp.readFile(
      path.join(out, "candidates/candidate-a/Experience.jsx"),
      "utf8",
    );
    expect(source).toContain("[redacted-email]");
    expect(source).toContain("[redacted-url]");
    await expect(
      fsp.access(
        path.join(out, "candidates/candidate-a/content-manifest.json"),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
    const report = JSON.parse(
      await fsp.readFile(
        path.join(out, "reports/summary.json"),
        "utf8",
      ),
    );
    expect(report.token).toBe("[redacted-secret]");
    expect(report.email).toBe("[redacted-email]");
  });
});
