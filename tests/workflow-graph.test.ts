import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createElement } from "react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import type { WorkflowGraph as GraphComponent } from "../src/admin/WorkflowGraph";

let directory: string;
let WorkflowGraph: typeof GraphComponent;
beforeAll(async () => {
  const cache = path.resolve("node_modules/.cache");
  await mkdir(cache, { recursive: true });
  directory = await mkdtemp(path.join(cache, "workflow-graph-"));
  const outfile = path.join(directory, "graph.mjs");
  await build({
    entryPoints: [path.resolve("src/admin/WorkflowGraph.tsx")],
    outfile,
    bundle: true,
    packages: "external",
    platform: "node",
    format: "esm",
    jsx: "automatic",
  });
  ({ WorkflowGraph } = await import(
    /* @vite-ignore */ pathToFileURL(outfile).href
  ));
});
afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("workflow dependency layout", () => {
  it("keeps the policy root above setup when callbacks arrive late", () => {
    const { document } = parseHTML(
      renderToStaticMarkup(
        createElement(WorkflowGraph, {
          stages: ["setup", "intake", "profile_policy"].map((stage) => ({
            stage,
            status: "completed",
          })),
          active: false,
          delivery: "none",
          selected: null,
          onSelect: () => {},
        }),
      ),
    );
    const top = (stage: string) =>
      Number.parseFloat(
        document.querySelector(`[data-stage="${stage}"]`)!.parentElement!.style
          .top,
      );
    expect(top("setup")).toBeGreaterThan(top("profile_policy") + 68);
    expect(top("intake")).toBeGreaterThan(top("setup") + 68);
  });

  it("puts later stages below their dependencies even on a wide canvas", () => {
    const stages = [
      "profile_policy",
      "renderer_policy",
      "intake_handoff_check",
      "setup",
      "intake",
      "seo_research",
      "seo_telemetry",
      "inspiration_selection",
      "reference_analysis",
      "client_repo",
      "review_branch",
      "imagery",
      "authoring",
      "authored_evidence",
      "creative_render",
      "preview_deploy",
    ];
    const { document } = parseHTML(
      renderToStaticMarkup(
        createElement(WorkflowGraph, {
          stages: stages.map((stage) => ({ stage, status: "completed" })),
          active: false,
          delivery: "none",
          selected: null,
          onSelect: () => {},
        }),
      ),
    );
    const top = (stage: string) =>
      Number.parseFloat(
        document.querySelector(`[data-stage="${stage}"]`)!.parentElement!.style
          .top,
      );
    for (const [before, after] of [
      ["profile_policy", "setup"],
      ["setup", "intake"],
      ["intake", "seo_research"],
      ["seo_telemetry", "inspiration_selection"],
      ["reference_analysis", "client_repo"],
      ["imagery", "authoring"],
      ["creative_render", "preview_deploy"],
    ])
      expect(top(after)).toBeGreaterThan(top(before) + 68);
    expect(document.querySelectorAll(".flow-node").length).toBe(stages.length);
  });
});
