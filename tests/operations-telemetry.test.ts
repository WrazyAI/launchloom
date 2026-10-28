import { describe, expect, it } from "vitest";
import {
  access,
  mkdtemp,
  writeFile,
  readFile,
  rm,
  mkdir,
  symlink,
} from "node:fs/promises";
import { readGenerationCostInputs } from "../scripts/generation-cost-summary.mjs";
import { recordOperationsTelemetry } from "../scripts/record-operations-telemetry.mjs";
import { postOperationsEvent } from "../scripts/record-generation-event.mjs";

const attempt = "11111111-1111-4111-8111-111111111111";
const sha = "a".repeat(40);
async function fixture() {
  const dir = await mkdtemp("/tmp/opencode/task5-telemetry-");
  return {
    dir,
    env: {
      OPERATION_ID: attempt,
      TRACK_ATTEMPT: attempt,
      RUNNER_TEMP: dir,
      OPERATIONS_API_URL: "https://worker.test",
    },
  };
}
describe("review: guarded telemetry preparation", () => {
  it.each(["authoring", "creative_render", "preview_deploy"])(
    "collects available paid usage after %s failure without altering execution or delivery",
    async (stage) => {
      const { dir, env } = await fixture();
      try {
        await writeFile(
          `${dir}/usage.json`,
          '{"records":[{"usage":{"cost":0.10000001},"prompt":"private@example.test token"},{"usage":{}}]}',
        );
        await writeFile(
          `${dir}/creative-run.json`,
          '{"status":"failed","usage":[{"usage":{"cost":0.20000002},"prompt":"private@example.test"}]}',
        );
        await mkdir(`${dir}/repair`);
        await writeFile(
          `${dir}/repair/visual-gate-1.json`,
          '{"usage":{"cost":0.30000003},"findings":"private@example.test"}',
        );
        const bodies: any[] = [];
        const send = async (_url: unknown, init?: RequestInit) => {
          bodies.push(JSON.parse(String(init?.body)));
          return Response.json({ status: "inserted" });
        };
        for (let i = 0; i < 2; i++)
          await recordOperationsTelemetry(
            {
              mode: "failure",
              stage,
              paths: {
                siteConfigUsage: `${dir}/usage.json`,
                creativeRun: `${dir}/creative-run.json`,
                repairDir: `${dir}/repair`,
                seo: `${dir}/missing.json`,
              },
            },
            { env, token: "token", fetchImpl: send },
          );
        const costs = bodies.filter((body) => body.stage === "site_config");
        expect(costs).toHaveLength(2);
        expect(costs[0].eventKey).toBe(costs[1].eventKey);
        expect(costs[0]).toMatchObject({
          costKind: "actual",
          amount: "0.10000001",
          coverageComplete: false,
        });
        expect(
          bodies.find(
            (body) =>
              body.stage === "authoring" && body.transition === "observed",
          ),
        ).toMatchObject({ costKind: "actual", amount: "0.20000002" });
        expect(bodies.find((body) => body.stage === "repair_qa")).toMatchObject(
          { costKind: "actual", amount: "0.30000003" },
        );
        expect(
          bodies.some(
            (body) => body.stage === stage && body.transition === "failed",
          ),
        ).toBe(true);
        expect(bodies.every((body) => body.stage !== "handoff")).toBe(true);
        expect(JSON.stringify(bodies)).not.toMatch(
          /private|token|succeeded|preview_ready|executionStatus|deliveryStatus/,
        );
        await expect(
          access(`${dir}/operations-preview-telemetry-ready`),
        ).rejects.toThrow();
      } finally {
        await rm(dir, { recursive: true });
      }
    },
  );
  it("records failure without fabricated usage when every artifact is missing", async () => {
    const { dir, env } = await fixture();
    try {
      const bodies: any[] = [];
      await recordOperationsTelemetry(
        {
          mode: "failure",
          stage: "authoring",
          paths: { siteConfigUsage: `${dir}/absent.json` },
        },
        {
          env,
          token: "token",
          fetchImpl: async (_url, init) => {
            bodies.push(JSON.parse(String(init?.body)));
            return Response.json({ status: "inserted" });
          },
        },
      );
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).toMatchObject({
        stage: "authoring",
        transition: "failed",
        costKind: "unreported",
      });
      expect(bodies[0]).not.toHaveProperty("amount");
    } finally {
      await rm(dir, { recursive: true });
    }
  });
  it("a failing real summary subprocess marks incomplete and cannot be bypassed by deleting the negative marker", async () => {
    const { dir, env } = await fixture();
    try {
      // Output path is a directory: the actual summary command fails at writeFile.
      await mkdir(`${dir}/operations-cost-preview.json`);
      await expect(
        recordOperationsTelemetry(
          { mode: "preview", buildSha: sha, paths: {} },
          {
            env,
            token: "token",
            fetchImpl: async () => Response.json({ status: "inserted" }),
          },
        ),
      ).rejects.toThrow("Operations telemetry preparation failed.");
      await access(`${dir}/operations-telemetry-incomplete`);
      await rm(`${dir}/operations-telemetry-incomplete`);
      await expect(
        postOperationsEvent(
          { stage: "handoff", "stage-status": "completed", sha },
          {
            env,
            token: "token",
            fetchImpl: async () => Response.json({ status: "inserted" }),
          },
        ),
      ).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true });
    }
  });
  it("binds successful preparation receipt to the attempt and selected build, never just marker absence", async () => {
    const { dir, env } = await fixture();
    try {
      const send = async () => Response.json({ status: "inserted" });
      await recordOperationsTelemetry(
        { mode: "preview", buildSha: sha, paths: {} },
        { env, token: "token", fetchImpl: send },
      );
      expect(
        JSON.parse(
          await readFile(`${dir}/operations-preview-telemetry-ready`, "utf8"),
        ),
      ).toEqual({ attemptId: attempt, buildSha: sha });
      expect(
        await postOperationsEvent(
          { stage: "handoff", "stage-status": "completed", sha },
          { env, token: "token", fetchImpl: send },
        ),
      ).toBe("inserted");
      await expect(
        postOperationsEvent(
          {
            stage: "handoff",
            "stage-status": "completed",
            sha: "b".repeat(40),
          },
          { env, token: "token", fetchImpl: send },
        ),
      ).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true });
    }
  });
  it("bounds recursive file discovery, bytes and symlink reads", async () => {
    const { dir, env } = await fixture();
    try {
      await writeFile(`${dir}/large.json`, " ".repeat(2_100_000));
      await expect(
        recordOperationsTelemetry(
          {
            mode: "preview",
            buildSha: sha,
            paths: { siteConfigUsage: `${dir}/large.json` },
          },
          {
            env,
            token: "token",
            fetchImpl: async () => Response.json({ status: "inserted" }),
          },
        ),
      ).rejects.toThrow();
      await access(`${dir}/operations-telemetry-incomplete`);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
  it("workflow routes both preview preparation and failure usage through the guarded boundary", async () => {
    const workflow = await readFile(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    const preview = workflow.slice(
      workflow.indexOf("- name: Record preview ready\n"),
      workflow.indexOf("- name: Record preview ready stage"),
    );
    const failure = workflow.slice(
      workflow.indexOf("- name: Record generation failure"),
    );
    expect(
      preview.includes("node scripts/record-operations-telemetry.mjs"),
    ).toBe(true);
    expect(preview.includes("--mode preview")).toBe(true);
    expect(preview.includes('id: preview_telemetry')).toBe(true);
    const handoff = workflow.slice(workflow.indexOf('- name: Record authenticated operations handoff'), workflow.indexOf('- name: Mark intake handoff complete'));
    expect(handoff.includes("steps.preview_telemetry.outcome == 'success'")).toBe(true);
    expect(failure.includes('--mode failure --stage "$FAILURE_STAGE"')).toBe(
      true,
    );
  });
  it("refuses symlinked and over-deep artifact discovery while failure collection retains other available usage", async () => {
    const { dir, env } = await fixture();
    try {
      await writeFile(
        `${dir}/usage.json`,
        '{"records":[{"usage":{"cost":0.10000001}}]}',
      );
      await symlink(`${dir}/usage.json`, `${dir}/symlink.json`);
      await expect(
        readGenerationCostInputs(
          { siteConfigUsage: `${dir}/symlink.json` },
          { bounded: true, exactDecimals: true },
        ),
      ).rejects.toThrow();
      await writeFile(`${dir}/nested.json`, JSON.stringify({ skipped: [{ imageReviews: Array.from({ length: 513 }, () => ({ usage: {} })) }] }));
      await expect(readGenerationCostInputs({ assets: `${dir}/nested.json` }, { bounded: true, exactDecimals: true })).rejects.toThrow();
      await mkdir(`${dir}/repair/a/b/c/d/e`, { recursive: true });
      await expect(
        readGenerationCostInputs(
          { repairDir: `${dir}/repair` },
          { bounded: true, exactDecimals: true },
        ),
      ).rejects.toThrow();
      const bodies: any[] = [];
      await recordOperationsTelemetry(
        {
          mode: "failure",
          stage: "creative_render",
          paths: {
            siteConfigUsage: `${dir}/usage.json`,
            repairDir: `${dir}/repair`,
          },
        },
        {
          env,
          token: "token",
          fetchImpl: async (_url, init) => {
            bodies.push(JSON.parse(String(init?.body)));
            return Response.json({ status: "inserted" });
          },
        },
      );
      expect(bodies.find((body) => body.stage === "site_config")).toMatchObject(
        { amount: "0.10000001", costKind: "actual" },
      );
      expect(
        bodies.find((body) => body.stage === "usage_collection"),
      ).toMatchObject({ costKind: "unreported", coverageComplete: false });
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
