import { describe, expect, it } from "vitest";
import type { ClientRecord } from "../src/lib/admin-contracts";
import { groupClients } from "../src/admin/client-groups";

function client(overrides: Partial<ClientRecord>): ClientRecord {
  return {
    clientId: "submission:one",
    inviteId: "invite-one",
    submissionId: "one",
    issueNumber: 101,
    businessName: "Northline Dental Studio",
    contactName: "Priya Raman",
    email: "priya@example.test",
    phone: null,
    creator: {
      kind: "admin",
      id: "admin-one",
      name: "David",
      email: null,
      source: "neon",
    },
    submittedAt: 1_000,
    createdAt: 1_000,
    updatedAt: 1_000,
    previewUrl: null,
    productionUrl: null,
    ...overrides,
  } as ClientRecord;
}

describe("client directory grouping", () => {
  it("merges accepted intakes for the same business and keeps the latest first", () => {
    const groups = groupClients([
      client({
        clientId: "submission:old",
        issueNumber: 183,
        submittedAt: 1_000,
      }),
      client({
        clientId: "submission:new",
        issueNumber: 197,
        submittedAt: 3_000,
      }),
      client({
        clientId: "submission:other",
        issueNumber: 202,
        businessName: "Ridgeline Plumbing",
        submittedAt: 2_000,
      }),
    ]);
    expect(groups.map((group) => group.key)).toEqual([
      "business:northline dental studio",
      "business:ridgeline plumbing",
    ]);
    expect(groups[0].clients.map((record) => record.issueNumber)).toEqual([
      197, 183,
    ]);
  });

  it("falls back to email when a business name is not recorded", () => {
    const groups = groupClients([
      client({
        clientId: "submission:a",
        issueNumber: 70,
        businessName: null,
        contactName: null,
        email: "same@example.test",
      }),
      client({
        clientId: "submission:b",
        issueNumber: 71,
        businessName: null,
        contactName: null,
        email: "same@example.test",
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].clients).toHaveLength(2);
  });

  it("keeps unidentified records separate", () => {
    const groups = groupClients([
      client({
        clientId: "submission:a",
        issueNumber: 70,
        businessName: null,
        contactName: null,
        email: null,
      }),
      client({
        clientId: "submission:b",
        issueNumber: 71,
        businessName: null,
        contactName: null,
        email: null,
      }),
    ]);
    expect(groups).toHaveLength(2);
  });
});
