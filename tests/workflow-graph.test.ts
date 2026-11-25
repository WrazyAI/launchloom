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

function connections(stages: string[]) {
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
  const nodes = [...document.querySelectorAll(".flow-node")].map((node) => {
    const style = node.parentElement!.style;
    return {
      stage: node.getAttribute("data-stage"),
      x: Number.parseFloat(style.left) + Number.parseFloat(style.width) / 2,
      top: Number.parseFloat(style.top),
      bottom: Number.parseFloat(style.top) + Number.parseFloat(style.height),
    };
  });
  return [...document.querySelectorAll(".flow-edge")].map((edge) => {
    const points = edge
      .getAttribute("d")!
      .match(/-?\d+(?:\.\d+)?/gu)!
      .map(Number);
    const start = points.slice(0, 2);
    const end = points.slice(-2);
    const from = nodes.find(
      (node) =>
        Math.abs(node.x - start[0]) < 1 && Math.abs(node.bottom - start[1]) < 8,
    );
    const to = nodes.find(
      (node) =>
        Math.abs(node.x - end[0]) < 1 && Math.abs(node.top - end[1]) < 8,
    );
    expect(from).toBeDefined();
    expect(to).toBeDefined();
    return `${from!.stage}->${to!.stage}`;
  });
}

describe("workflow dependency layout", () => {
  it("omits bypass links already connected through the visible authoring path", () => {
    expect(
      connections([
        "imagery",
        "authoring",
        "authored_evidence",
        "creative_render",
        "preview_deploy",
      ]),
    ).toEqual([
      "imagery->authoring",
      "authoring->authored_evidence",
      "authored_evidence->creative_render",
      "creative_render->preview_deploy",
    ]);
  });

  it("retains genuine alternate branches into deployment", () => {
    const edges = connections([
      "imagery",
      "pack_select",
      "foundation_select",
      "authoring",
      "authored_evidence",
      "creative_render",
      "preview_deploy",
    ]);
    expect(edges).toHaveLength(8);
    for (const parent of [
      "pack_select",
      "foundation_select",
      "creative_render",
    ])
      expect(edges).toContain(`${parent}->preview_deploy`);
    for (const child of ["pack_select", "foundation_select", "authoring"])
      expect(edges).toContain(`imagery->${child}`);
  });

  it("keeps research branches without bypassing the visible reference chain", () => {
    expect(
      connections([
        "intake",
        "seo_research",
        "seo_telemetry",
        "inspiration_selection",
        "reference_analysis",
        "client_repo",
      ]),
    ).toEqual([
      "intake->seo_research",
      "intake->seo_telemetry",
      "seo_telemetry->inspiration_selection",
      "inspiration_selection->reference_analysis",
      "reference_analysis->client_repo",
    ]);
  });

  it("keeps stage buttons in visual reading order when callbacks arrive late", () => {
    const arrivals = [
      "setup",
      "intake_handoff_check",
      "intake",
      "profile_policy",
      "renderer_policy",
    ];
    const { document } = parseHTML(
      renderToStaticMarkup(
        createElement(WorkflowGraph, {
          stages: arrivals.map((stage) => ({
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
    expect(top("intake_handoff_check")).toBe(top("renderer_policy"));
    expect(
      [...document.querySelectorAll("button[data-stage]")].map((button) =>
        button.getAttribute("data-stage"),
      ),
    ).toEqual([
      "profile_policy",
      "intake_handoff_check",
      "renderer_policy",
      "setup",
      "intake",
    ]);
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
