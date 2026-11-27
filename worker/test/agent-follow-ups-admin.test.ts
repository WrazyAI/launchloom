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
