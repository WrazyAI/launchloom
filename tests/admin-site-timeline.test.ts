import { describe, expect, it } from "vitest";
import { groupBySite } from "../src/admin/site-groups";

function attempt(overrides: Record<string, unknown>) {
  return {
    attemptId: "github:1:1",
    requestId: null,
    clientId: null,
    clientName: null,
    issueNumber: null,
    profile: "full",
    initiator: { kind: "system", source: "github", name: null, email: null },
    invitationCreator: {
      kind: "system",
      source: "github",
      name: null,
      email: null,
    },
    repository: null,
    runId: null,
    runAttempt: null,
    executionStatus: "succeeded",
    deliveryStatus: "preview_ready",
    stale: false,
    createdAt: 1_000,
    startedAt: 1_000,
    completedAt: 2_000,
    updatedAt: 2_000,
    failure: {
      category: null,
      stage: null,
      summary: null,
      evidenceUrl: null,
      nextStep: null,
    },
    costs: { actualUsd: null, estimatedUsd: null, unreportedCount: 0 },
    ...overrides,
  } as any;
}

describe("site timeline grouping", () => {
  it("groups every attempt for the same client into one site", () => {
    const groups = groupBySite([
      attempt({
        attemptId: "a",
        clientId: "submission:one",
        clientName: "Northline Dental",
        createdAt: 1_000,
      }),
      attempt({
        attemptId: "b",
        clientId: "submission:one",
        clientName: "Northline Dental",
        createdAt: 3_000,
      }),
      attempt({
        attemptId: "c",
        clientId: "submission:one",
        clientName: "Northline Dental",
        createdAt: 2_000,
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Northline Dental");
    expect(groups[0].attempts.map((item) => item.attemptId)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("groups unlinked manual attempts by intake issue", () => {
    const groups = groupBySite([
      attempt({ attemptId: "a", issueNumber: 202, createdAt: 1_000 }),
      attempt({ attemptId: "b", issueNumber: 202, createdAt: 2_000 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Intake #202");
    expect(groups[0].attempts).toHaveLength(2);
  });

  it("merges separate client records that share a business name", () => {
    const groups = groupBySite([
      attempt({
        attemptId: "a",
        clientId: "submission:one",
        clientName: "Harbor & Pine",
        issueNumber: 197,
        createdAt: 3_000,
      }),
      attempt({
        attemptId: "b",
        clientId: "submission:two",
        clientName: "Harbor & Pine",
        issueNumber: 183,
        createdAt: 1_000,
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Harbor & Pine");
    expect(groups[0].clientId).toBe("submission:one");
    expect(groups[0].issues).toEqual([197, 183]);
  });

  it("keeps unrelated unlinked attempts separate and sorts sites by latest activity", () => {
    const groups = groupBySite([
      attempt({ attemptId: "a", createdAt: 1_000 }),
      attempt({ attemptId: "b", createdAt: 4_000 }),
      attempt({ attemptId: "c", clientId: "submission:one", createdAt: 2_000 }),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0].attempts[0].attemptId).toBe("b");
    expect(groups[1].attempts[0].attemptId).toBe("c");
  });
});
