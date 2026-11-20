import { describe, expect, it } from "vitest";
import { backfillFailureReasons } from "../scripts/backfill-failure-reasons.mjs";

const run = (id: number) => ({
  databaseId: id,
  attempt: 1,
  displayTitle: `LLGEN issue=${id} profile=full renderer=pack request=none`,
  conclusion: "failure",
});

describe("failure reason backfill", () => {
  it("records bounded evidence for mapped failed stages and skips missing attempts", async () => {
    const posted: any[] = [];
    const calls: string[][] = [];
    const gh = async (args: string[], options: { json?: boolean } = {}) => {
      calls.push(args);
      if (args[0] === "run" && args[1] === "list") return [run(42), run(43)];
      if (args.includes("--json"))
        return {
          jobs: [
            {
              name: "generate",
              steps: [
                {
                  name: "Build and direct-upload public preview",
                  status: "completed",
                  conclusion: "failure",
                },
              ],
            },
          ],
        };
      return [
        "generate UNKNOWN STEP Error: preview upload failed with HTTP 502",
        "generate UNKNOWN STEP token=super-secret owner@example.test",
      ].join("\n");
    };
    const report = await backfillFailureReasons({
      limit: 2,
      dryRun: false,
      gh,
      pause: async () => {},
      post: async (body: any) => {
        posted.push(body);
        return body.runId === "43" ? "not_found" : "updated";
      },
    });
    expect(report).toMatchObject({
      examined: 2,
      updated: 1,
      skipped: 1,
      failed: 0,
    });
    expect(posted[0]).toMatchObject({
      runId: "42",
      runAttempt: 1,
      code: "LL_PREVIEW_DEPLOY_HTTP_502",
    });
    expect(posted[0].detail).not.toMatch(/super-secret|owner@example/u);
    expect(calls.some((args) => args.includes("--log-failed"))).toBe(true);
  });

  it("does not post in dry-run mode and reports a bounded count", async () => {
    const report = await backfillFailureReasons({
      limit: 1,
      dryRun: true,
      gh: async (args: string[]) => {
        if (args[1] === "list") return [run(42)];
        if (args.includes("--json")) return { jobs: [] };
        return "Error: preview upload failed with HTTP 500\n";
      },
      pause: async () => {},
      post: async () => {
        throw new Error("must not post");
      },
    });
    expect(report).toMatchObject({ examined: 1, updated: 1, dryRun: true });
  });
});
