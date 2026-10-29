import { describe, expect, it, vi } from "vitest";
import {
  createOperationsStore,
  OperationsError,
} from "../src/operations/store";
import type { AcceptanceInput } from "../src/operations/contracts";

const input: AcceptanceInput = {
  inviteId: "invite-test",
  submissionId: "submission-test",
  fingerprint: "a".repeat(64),
  payloadVersion: 1,
  payload: { businessName: "Synthetic business" },
  consent: { termsVersion: "v1", rightsConfirmed: true },
  profile: "care",
};
const row = {
  intake_id: "intake",
  request_id: "request",
  attempt_id: "attempt",
  operation_id: "operation",
  created: true,
};

describe("operations store (SQL transport boundary, not database semantics)", () => {
  it("accepts through one parameterized database function, never client-side transaction calls", async () => {
    const query = vi.fn().mockResolvedValue([row]);
    const result = await createOperationsStore({ query }).createAcceptance(
      input,
    );
    expect(result).toEqual({
      intakeId: "intake",
      requestId: "request",
      attemptId: "attempt",
      operationId: "operation",
      created: true,
    });
    expect(query).toHaveBeenCalledExactlyOnceWith(
      "select * from launchloom_operations.create_acceptance($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)",
      [
        input.inviteId,
        input.submissionId,
        input.fingerprint,
        1,
        JSON.stringify(input.payload),
        JSON.stringify(input.consent),
        "care",
      ],
    );
  });

  it("preserves database-owned IDs and duplicate status", async () => {
    const query = vi.fn().mockResolvedValue([{ ...row, created: false }]);
    expect(
      await createOperationsStore({ query }).createAcceptance(input),
    ).toMatchObject({ intakeId: "intake", created: false });
  });

  it("maps changed fingerprint to a safe conflict without leaking SQL or private content", async () => {
    const query = vi
      .fn()
      .mockRejectedValue(new Error("acceptance_conflict private payload"));
    await expect(
      createOperationsStore({ query }).createAcceptance(input),
    ).rejects.toMatchObject({
      code: "conflict",
      message: "Submission conflicts with the saved acceptance.",
    });
  });

  it.each([
    { fingerprint: "bad" },
    { inviteId: "" },
    { submissionId: " x " },
    { payloadVersion: 0 },
    { payload: [] },
    { consent: { rightsConfirmed: false } },
    { profile: "" },
  ])("rejects malformed input before SQL: %j", async (change) => {
    const query = vi.fn();
    await expect(
      createOperationsStore({ query }).createAcceptance({
        ...input,
        ...change,
      } as AcceptanceInput),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(query).not.toHaveBeenCalled();
  });

  it("fails closed when acceptance does not return durable IDs", async () => {
    const query = vi.fn().mockResolvedValue([]);
    await expect(
      createOperationsStore({ query }).createAcceptance(input),
    ).rejects.toBeInstanceOf(OperationsError);
  });

  it("confirms in one function and sanitizes dependency errors", async () => {
    const query = vi.fn().mockResolvedValue([]);
    const store = createOperationsStore({ query });
    await store.confirmAcceptance("intake");
    expect(query).toHaveBeenCalledExactlyOnceWith(
      "select launchloom_operations.confirm_acceptance($1)",
      ["intake"],
    );
    query.mockRejectedValueOnce(new Error("postgres://secret private payload"));
    await expect(store.confirmAcceptance("intake")).rejects.toMatchObject({
      code: "dependency_unavailable",
      message: "Operations storage is temporarily unavailable.",
    });
  });

  it("returns private intake records only from the server-side read function, or null", async () => {
    const record = {
      schemaVersion: 1,
      intakeId: "intake",
      payload: input.payload,
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ record }])
      .mockResolvedValueOnce([]);
    const store = createOperationsStore({ query });
    expect(await store.getIntake("intake")).toEqual(record);
    expect(await store.getIntake("missing")).toBeNull();
    expect(query).toHaveBeenNthCalledWith(
      1,
      "select * from launchloom_operations.get_intake($1)",
      ["intake"],
    );
  });
});
