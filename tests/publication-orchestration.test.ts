import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { coordinatePublication } from "../scripts/publication-client.mjs";
import { findPublicationDeployment } from "../scripts/publication-deployment.mjs";

describe("publication adapters", () => {
  it("fails closed when the durable coordinator rejects upload ownership", async () => {
    const request = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ allowed: false, state: "stale" }),
    );
    await expect(
      coordinatePublication(
        {
          PUBLICATION_ACTION: "authorize-upload",
          CLIENT_REPO: "WrazyAI/fixture",
          PUBLICATION_ID: "operation",
          REVISION_COORDINATOR_SECRET: "test",
          PUBLICATION_RUN_ID: "run",
        },
        request,
      ),
    ).rejects.toThrow("rejected");
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toMatchObject({
      action: "authorize-upload",
      runId: "run",
      publicationId: "operation",
    });
  });
  it("treats a duplicate workflow claim as a skipped operation", async () => {
    const result = await coordinatePublication(
      {
        PUBLICATION_ACTION: "claim",
        CLIENT_REPO: "WrazyAI/fixture",
        PUBLICATION_ID: "operation",
        REVISION_COORDINATOR_SECRET: "test",
        PUBLICATION_RUN_ID: "run",
      },
      async () => Response.json({ run: false, state: "published" }),
    );
    expect(result.run).toBe(false);
  });
  it("recovers the exact operation beyond page one instead of adopting the same commit from another operation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ll-publication-"));
    try {
      const file = path.join(root, "deployment.json");
      const calls: string[] = [];
      const request: typeof fetch = async (input) => {
        const url = String(input);
        calls.push(url);
        if (!url.includes("/deployments?"))
          return Response.json({
            success: true,
            result: { canonical_deployment: { id: "owned" } },
          });
        if (url.endsWith("page=1"))
          return Response.json({
            success: true,
            result: Array.from({ length: 25 }, () => ({
              id: "other",
              environment: "production",
              deployment_trigger: {
                metadata: {
                  commit_hash: "sha",
                  commit_message: "LaunchLoom publication another-operation",
                },
              },
            })),
          });
        return Response.json({
          success: true,
          result: [
            {
              id: "owned",
              environment: "production",
              latest_stage: { status: "success", name: "deploy" },
              deployment_trigger: {
                metadata: {
                  commit_hash: "sha",
                  commit_message: "LaunchLoom publication operation",
                },
              },
            },
          ],
        });
      };
      const result = await findPublicationDeployment(
        {
          CLOUDFLARE_ACCOUNT_ID: "account",
          CLOUDFLARE_API_TOKEN: "test",
          PUBLICATION_PROJECT: "fixture",
          PUBLICATION_ID: "operation",
          APPROVED_SHA: "sha",
          PUBLICATION_DEPLOYMENT_FILE: file,
        },
        request,
      );
      expect(result).toEqual({
        id: "owned",
        origin: "https://fixture.pages.dev",
        commit: "sha",
      });
      expect(JSON.parse(await readFile(file, "utf8"))).toEqual(result);
      expect(calls.at(-1)).toContain("page=2");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("refuses an older matching deployment after another production release supersedes it", async () => {
    const request: typeof fetch = async (input) =>
      Response.json({
        success: true,
        result: String(input).includes("/deployments?")
          ? [
              {
                id: "old",
                environment: "production",
                latest_stage: { status: "success", name: "deploy" },
                deployment_trigger: {
                  metadata: {
                    commit_hash: "sha",
                    commit_message: "LaunchLoom publication operation",
                  },
                },
              },
            ]
          : { canonical_deployment: { id: "new" } },
      });
    await expect(
      findPublicationDeployment(
        {
          CLOUDFLARE_ACCOUNT_ID: "account",
          CLOUDFLARE_API_TOKEN: "test",
          PUBLICATION_PROJECT: "fixture",
          PUBLICATION_ID: "operation",
          APPROVED_SHA: "sha",
          PUBLICATION_DEPLOYMENT_FILE: "/not-written",
        },
        request,
      ),
    ).rejects.toThrow("superseded");
  });
});
