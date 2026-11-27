import { describe, expect, it } from "vitest";
import { agentFollowUpsAdmin } from "../src/agent-follow-ups/http";

const path = "/api/admin/onboarding-invites/workspace/attempts/attempt-a/agent-follow-ups";
const thread = {
  repository: "WrazyAI/site-a",
  messages: [],
  nextCursor: null,
  latestPreview: null,
  latestEvidence: null,
  activeRequestId: null,
  writable: false,
};

function env(enabled = true) {
  return {
    AGENT_FOLLOW_UPS_ENABLED: enabled ? "true" : "false",
    GENERATION_LEDGER: {
      getByName: () => ({
        getAttempt: async () => ({
          attemptId: "attempt-a",
          repository: "WrazyAI/site-a",
        }),
      }),
    },
    REVISION_COORDINATOR: {
      getByName: () => ({
        readAgentThread: async () => thread,
      }),
    },
  } as never;
}

describe("agent follow-up admin API", () => {
  it("requires an admin and the capability", async () => {
    const forbidden = await agentFollowUpsAdmin(
      new Request(`https://api.test${path}`),
      env(),
      { role: "client" },
      path,
    );
    expect(forbidden?.status).toBe(403);

    const disabled = await agentFollowUpsAdmin(
      new Request(`https://api.test${path}`),
      env(false),
      { role: "admin" },
      path,
    );
    expect(disabled?.status).toBe(503);
  });

  it("resolves the thread from the attempt repository", async () => {
    const response = await agentFollowUpsAdmin(
      new Request(`https://api.test${path}`),
      env(),
      { role: "admin" },
      path,
    );
    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({ thread });
  });
});

import { http, HttpResponse } from "msw";
import { network } from "./network";

function modelThread() {
  return {
    repository: "WrazyAI/site-a",
    messages: [] as Array<{ role: string; text: string; suggestions: unknown[] }>,
    nextCursor: null,
    latestPreview: {
      repository: "WrazyAI/site-a",
      attemptId: "attempt-a",
      project: "site-a",
      pr: 9,
      sha: "a".repeat(40),
      deploymentId: "4c1e9a2b",
      previewUrl: "https://4c1e9a2b.site-a.pages.dev",
    },
    latestEvidence: {
      attemptId: "attempt-a",
      repository: "WrazyAI/site-a",
      siteId: "site-a",
      issueNumber: 9,
      profile: "full-preview",
      renderer: "creative",
      verdict: "passed",
      selectedCandidateId: "candidate-b",
      candidates: [],
      gates: [],
      failures: [],
      routeChecks: [],
      assets: null,
      preview: null,
      recordedAt: 1,
    },
    activeRequestId: null,
    writable: true,
  };
}

function modelEnv() {
  const thread = modelThread();
  const commands = new Set<string>();
  return {
    thread,
    env: {
      AGENT_FOLLOW_UPS_ENABLED: "true",
      OPENCODE_GO_API_KEY: "test",
      GENERATION_LEDGER: {
        getByName: () => ({
          getAttempt: async () => ({
            attemptId: "attempt-a",
            repository: "WrazyAI/site-a",
          }),
        }),
      },
      REVISION_COORDINATOR: {
        getByName: () => ({
          readAgentThread: async () => thread,
          reserveAgentCommand: async (_repo: string, id: string) => {
            if (commands.has(id)) return { duplicate: true };
            commands.add(id);
            return { duplicate: false };
          },
          appendAgentExchange: async (input: {
            adminText: string;
            agentText: string;
            intent: string;
            suggestions: Array<Record<string, unknown>>;
          }) => {
            thread.messages.push(
              { role: "admin", text: input.adminText, suggestions: [] },
              {
                role: "agent",
                text: input.agentText,
                suggestions: input.suggestions,
              },
            );
            return { message: { id: "agent-1" } };
          },
        }),
      },
    } as never,
  };
}

describe("agent follow-up POST", () => {
  it("stores validated cards once and returns a fallback on classifier failure", async () => {
    const { env: modelTestEnv, thread } = modelEnv();
    network.use(
      http.post("https://opencode.ai/inference/go/v1/responses", () =>
        HttpResponse.json({
          status: "completed",
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    intent: "question",
                    confidence: "high",
                    edits: [],
                    reason: "Asks for evidence.",
                  }),
                },
              ],
            },
          ],
        }),
      ),
    );
    const first = await agentFollowUpsAdmin(
      new Request(`https://api.test${path}`, {
        method: "POST",
        body: JSON.stringify({
          requestId: "00000000-0000-4000-8000-000000000001",
          text: "Why did mobile fail?",
          mode: "auto",
        }),
      }),
      modelTestEnv,
      { role: "admin" },
      path,
    );
    expect(first?.status).toBe(200);
    expect(thread.messages).toHaveLength(2);

    const duplicate = await agentFollowUpsAdmin(
      new Request(`https://api.test${path}`, {
        method: "POST",
        body: JSON.stringify({
          requestId: "00000000-0000-4000-8000-000000000001",
          text: "Why did mobile fail?",
          mode: "auto",
        }),
      }),
      modelTestEnv,
      { role: "admin" },
      path,
    );
    expect(duplicate?.status).toBe(200);
    expect(thread.messages).toHaveLength(2);
  });
});

describe("agent follow-up fallback", () => {
  it("returns choose_mode when classification is unavailable", async () => {
    const { env: modelTestEnv } = modelEnv();
    network.use(
      http.post("https://opencode.ai/inference/go/v1/responses", () =>
        new HttpResponse(null, { status: 503 }),
      ),
    );
    const response = await agentFollowUpsAdmin(
      new Request(`https://api.test${path}`, {
        method: "POST",
        body: JSON.stringify({
          requestId: "00000000-0000-4000-8000-000000000002",
          text: "Could the headline be clearer?",
          mode: "auto",
        }),
      }),
      modelTestEnv,
      { role: "admin" },
      path,
    );
    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      fallback: "choose_mode",
    });
  });
});
