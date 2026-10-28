import { describe, expect, it } from "vitest";
import {
  acceptIntake,
  reconcileAcceptance,
  recoverAcceptance,
  type AcceptanceDependencies,
  type InviteAcceptanceAdapter,
  type InviteReservation,
} from "../src/operations/acceptance";
import type {
  AcceptanceInput,
  AcceptanceResult,
  IntakeRecord,
  OperationsStore,
} from "../src/operations/contracts";
import { OperationsError } from "../src/operations/store";

const FINGERPRINT = "a".repeat(64);

function acceptanceInput(
  overrides: Partial<AcceptanceInput> = {},
): AcceptanceInput {
  return {
    inviteId: "invite-acceptance-001",
    submissionId: "submission-acceptance-001",
    fingerprint: FINGERPRINT,
    payloadVersion: 2,
    payload: {
      submissionId: "submission-acceptance-001",
      businessName: "Harbor Plumbing",
      industry: "home-services",
    },
    consent: { termsVersion: "client-intake-v2", rightsConfirmed: true },
    profile: "home-services",
    ...overrides,
  };
}

function result(created = true): AcceptanceResult {
  return {
    intakeId: "11111111-1111-4111-8111-111111111111",
    requestId: "22222222-2222-4222-8222-222222222222",
    attemptId: "33333333-3333-4333-8333-333333333333",
    operationId: "44444444-4444-4444-8444-444444444444",
    created,
  };
}

type ReservationOptions = {
  mode?: InviteReservation["mode"];
  state?: InviteReservation["state"];
  expired?: boolean;
  reason?: InviteReservation["reason"];
  fingerprint?: string;
};

class FakeInvites implements InviteAcceptanceAdapter {
  mode: InviteReservation["mode"];
  state: InviteReservation["state"];
  expired: boolean;
  reason: InviteReservation["reason"] | undefined;
  fingerprint: string;
  failConfirm = false;
  failReceipt = false;
  confirmCalls = 0;
  receiptCalls = 0;
  releaseCalls = 0;
  commitStartedCalls = 0;
  recoverySchedules: Array<{
    delayMs: number;
    error?: string;
  }> = [];
  completeCalls = 0;
  confirmed: AcceptanceResult | null = null;
  receipt: { recipient: string; businessName: string } | null = null;
  lastConfirm: {
    inviteId: string;
    submissionId: string;
    fingerprint: string;
    acceptance: AcceptanceResult;
  } | null = null;

  constructor(options: ReservationOptions = {}) {
    this.mode = options.mode ?? "postgres";
    this.state = options.state ?? "unconfirmed";
    this.expired = options.expired ?? false;
    this.reason = options.reason;
    this.fingerprint = options.fingerprint ?? FINGERPRINT;
  }

  reservation(): InviteReservation {
    if (this.reason)
      return {
        accepted: false,
        mode: this.mode,
        state: this.state,
        fingerprint: this.fingerprint,
        expired: this.expired,
        reason: this.reason,
      };
    return {
      accepted: true,
      mode: this.mode,
      state: this.state,
      fingerprint: this.fingerprint,
      expired: this.expired,
      duplicate: this.state === "confirmed",
      acceptance: this.state === "confirmed" ? this.confirmed : null,
    };
  }

  async reserve(): Promise<InviteReservation> {
    return this.reservation();
  }

  async inspect(): Promise<InviteReservation | null> {
    return this.reservation();
  }

  async confirm(input: {
    inviteId: string;
    submissionId: string;
    fingerprint: string;
    acceptance: AcceptanceResult;
  }): Promise<{ confirmed: true; duplicate: boolean }> {
    this.confirmCalls += 1;
    this.lastConfirm = input;
    if (this.failConfirm) throw new Error("DO unavailable");
    if (input.fingerprint !== this.fingerprint)
      throw new Error("fingerprint mismatch");
    if (this.state === "confirmed") {
      if (
        !this.confirmed ||
        this.confirmed.intakeId !== input.acceptance.intakeId ||
        this.confirmed.requestId !== input.acceptance.requestId ||
        this.confirmed.attemptId !== input.acceptance.attemptId ||
        this.confirmed.operationId !== input.acceptance.operationId
      )
        throw new Error("conflict");
      return { confirmed: true, duplicate: true };
    }
    this.state = "confirmed";
    this.confirmed = { ...input.acceptance };
    return { confirmed: true, duplicate: false };
  }

  async queueReceipt(input: {
    inviteId: string;
    submissionId: string;
    recipient: string;
    businessName: string;
  }): Promise<void> {
    this.receiptCalls += 1;
    if (this.failReceipt) throw new Error("receipt outbox unavailable");
    this.receipt = {
      recipient: input.recipient,
      businessName: input.businessName,
    };
  }

  async markCommitStarted(): Promise<void> {
    this.commitStartedCalls += 1;
  }

  async scheduleRecovery(input: {
    delayMs: number;
    error?: string;
  }): Promise<void> {
    this.recoverySchedules.push(input);
  }

  async completeRecovery(): Promise<void> {
    this.completeCalls += 1;
  }

  /** Test-only evidence that uncertain ownership was never released. */
  async release(): Promise<void> {
    this.releaseCalls += 1;
    this.state = "unconfirmed";
  }
}

type StoreOptions = {
  failFirstCreate?: boolean;
  loseFirstResponse?: boolean;
  failFirstConfirmation?: boolean;
  conflict?: boolean;
  created?: boolean;
};

class FakeStore implements OperationsStore {
  async leaseDispatch() { return null; }
  async recordDispatchResult() {}
  async claimRun() { return "attention" as const; }
  async getClaimedOperation() { return null; }
  async getIntakeForRun() { return null; }
  async appendEvent() { return "attention" as const; }
  readonly committed = result();
  createCalls = 0;
  confirmCalls = 0;
  outboxState: "blocked_unconfirmed" | "pending" = "blocked_unconfirmed";
  intakeState: "unconfirmed" | "confirmed" = "unconfirmed";
  bindingRecord: IntakeRecord | null = null;
  bindingLookups = 0;
  private createAttempts = 0;
  private confirmAttempts = 0;

  constructor(private readonly options: StoreOptions = {}) {}

  async createAcceptance(input: AcceptanceInput): Promise<AcceptanceResult> {
    this.createCalls += 1;
    this.createAttempts += 1;
    if (this.options.conflict)
      throw new OperationsError(
        "conflict",
        "Submission conflicts with the saved acceptance.",
      );
    if (this.options.failFirstCreate && this.createAttempts === 1)
      throw new OperationsError(
        "dependency_unavailable",
        "Operations storage is temporarily unavailable.",
      );
    if (this.options.loseFirstResponse && this.createAttempts === 1)
      throw new OperationsError(
        "dependency_unavailable",
        "Operations storage is temporarily unavailable.",
      );
    if (input.fingerprint !== FINGERPRINT)
      throw new OperationsError(
        "invalid",
        "The operations request is not valid.",
      );
    return {
      ...this.committed,
      created: this.options.created ?? this.createAttempts === 1,
    };
  }

  async confirmAcceptance(intakeId: string): Promise<void> {
    this.confirmCalls += 1;
    this.confirmAttempts += 1;
    if (intakeId !== this.committed.intakeId)
      throw new OperationsError("not_found", "Intake not found.");
    if (this.options.failFirstConfirmation && this.confirmAttempts === 1)
      throw new OperationsError(
        "dependency_unavailable",
        "Operations storage is temporarily unavailable.",
      );
    this.intakeState = "confirmed";
    this.outboxState = "pending";
  }

  async getIntake(): Promise<IntakeRecord | null> {
    return this.bindingRecord;
  }

  async getIntakeByBinding(): Promise<IntakeRecord | null> {
    this.bindingLookups += 1;
    return this.bindingRecord;
  }
}

function bindingRecord(input: AcceptanceInput): IntakeRecord {
  return {
    ...result(false),
    ...input,
    schemaVersion: 1,
    clientId: "55555555-5555-4555-8555-555555555555",
    acceptanceState: "unconfirmed",
    receivedAt: new Date(0).toISOString(),
    confirmedAt: null,
  };
}

function dependencies(
  store: OperationsStore,
  invites: InviteAcceptanceAdapter,
): AcceptanceDependencies {
  return {
    store,
    invites,
    routingMode: "postgres",
    receipt: {
      recipient: "sam@example.test",
      businessName: "Harbor Plumbing",
    },
  };
}

describe("invite-to-postgres acceptance handshake", () => {
  it("does not acknowledge or consume an invite when Postgres fails before commit", async () => {
    const store = new FakeStore({ failFirstCreate: true });
    const invites = new FakeInvites();

    await expect(
      acceptIntake(acceptanceInput(), dependencies(store, invites)),
    ).rejects.toMatchObject({
      code: "dependency_unavailable",
      status: 503,
    });
    expect(invites.confirmCalls).toBe(0);
    expect(invites.state).toBe("unconfirmed");
    expect(invites.releaseCalls).toBe(0);
    expect(store.confirmCalls).toBe(0);
    expect(store.outboxState).toBe("blocked_unconfirmed");
  });

  it("returns the previously committed IDs after a lost Postgres response", async () => {
    const store = new FakeStore({ loseFirstResponse: true });
    const invites = new FakeInvites();

    await expect(
      acceptIntake(acceptanceInput(), dependencies(store, invites)),
    ).rejects.toMatchObject({ code: "dependency_unavailable" });
    expect(invites.confirmCalls).toBe(0);

    const retried = await acceptIntake(
      acceptanceInput(),
      dependencies(store, invites),
    );
    expect(retried).toEqual({ ...store.committed, created: false });
    expect(invites.confirmCalls).toBe(1);
    expect(invites.lastConfirm?.acceptance.intakeId).toBe(
      store.committed.intakeId,
    );
    expect(store.intakeState).toBe("confirmed");
    expect(store.outboxState).toBe("pending");
  });

  it("leaves Postgres unconfirmed and the outbox blocked when DO confirmation fails", async () => {
    const store = new FakeStore();
    const invites = new FakeInvites();
    invites.failConfirm = true;

    await expect(
      acceptIntake(acceptanceInput(), dependencies(store, invites)),
    ).rejects.toMatchObject({
      code: "confirmation_pending",
      status: 503,
    });
    expect(store.createCalls).toBe(1);
    expect(store.confirmCalls).toBe(0);
    expect(store.intakeState).toBe("unconfirmed");
    expect(store.outboxState).toBe("blocked_unconfirmed");
    expect(invites.state).toBe("unconfirmed");
  });

  it("recovers when the DO confirmed but Postgres eligibility confirmation failed", async () => {
    const store = new FakeStore({ failFirstConfirmation: true });
    const invites = new FakeInvites();

    await expect(
      acceptIntake(acceptanceInput(), dependencies(store, invites)),
    ).rejects.toMatchObject({ code: "dependency_unavailable" });
    expect(invites.state).toBe("confirmed");
    expect(store.outboxState).toBe("blocked_unconfirmed");

    const retried = await acceptIntake(
      acceptanceInput(),
      dependencies(store, invites),
    );
    expect(retried.created).toBe(false);
    expect(retried.intakeId).toBe(store.committed.intakeId);
    expect(invites.confirmCalls).toBe(2);
    expect(store.confirmCalls).toBe(2);
    expect(store.outboxState).toBe("pending");
  });

  it("fails closed on an expired reservation with unknown Postgres state", async () => {
    const store = new FakeStore({ failFirstCreate: true });
    const invites = new FakeInvites({ expired: true });

    await expect(
      acceptIntake(acceptanceInput(), dependencies(store, invites)),
    ).rejects.toMatchObject({
      code: "recovery_required",
      status: 503,
    });
    expect(invites.confirmCalls).toBe(0);
    expect(invites.state).toBe("unconfirmed");
    expect(invites.releaseCalls).toBe(0);
    expect(invites.expired).toBe(true);
  });

  it("returns the same IDs for a duplicate retry without creating new work", async () => {
    const store = new FakeStore();
    const invites = new FakeInvites();

    const first = await acceptIntake(
      acceptanceInput(),
      dependencies(store, invites),
    );
    const second = await acceptIntake(
      acceptanceInput(),
      dependencies(store, invites),
    );

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.intakeId).toBe(first.intakeId);
    expect(second.requestId).toBe(first.requestId);
    expect(second.attemptId).toBe(first.attemptId);
    expect(second.operationId).toBe(first.operationId);
    expect(store.createCalls).toBe(2);
    expect(invites.receiptCalls).toBe(2);
    expect(invites.receipt).toEqual({
      recipient: "sam@example.test",
      businessName: "Harbor Plumbing",
    });
  });

  it("rejects a changed submission with 409 and never commits it", async () => {
    const store = new FakeStore();
    const invites = new FakeInvites({ reason: "submission_mismatch" });

    await expect(
      acceptIntake(acceptanceInput(), dependencies(store, invites)),
    ).rejects.toMatchObject({
      code: "submission_mismatch",
      status: 409,
    });
    expect(store.createCalls).toBe(0);
    expect(invites.confirmCalls).toBe(0);
  });

  it("queues the existing receipt separately after confirmation and never fabricates an issue", async () => {
    const store = new FakeStore();
    const invites = new FakeInvites();

    const accepted = await acceptIntake(
      acceptanceInput(),
      dependencies(store, invites),
    );

    expect(accepted).not.toHaveProperty("issue");
    expect(invites.confirmCalls).toBe(1);
    expect(invites.lastConfirm).toMatchObject({
      inviteId: "invite-acceptance-001",
      submissionId: "submission-acceptance-001",
      fingerprint: FINGERPRINT,
      acceptance: { intakeId: store.committed.intakeId },
    });
    expect(invites.receiptCalls).toBe(1);
    expect(invites.receipt).toEqual({
      recipient: "sam@example.test",
      businessName: "Harbor Plumbing",
    });
    expect(store.intakeState).toBe("confirmed");
    expect(store.outboxState).toBe("pending");
  });

  it("signals the legacy route without writing to Postgres", async () => {
    const store = new FakeStore();
    const invites = new FakeInvites({ mode: "legacy", state: "legacy" });

    await expect(
      acceptIntake(acceptanceInput(), dependencies(store, invites)),
    ).rejects.toMatchObject({ code: "legacy_route" });
    expect(store.createCalls).toBe(0);
    expect(invites.confirmCalls).toBe(0);
    expect(invites.receiptCalls).toBe(0);
  });

  it("recovers an unconfirmed handshake after lease expiry without releasing ownership", async () => {
    const store = new FakeStore({ created: false });
    const invites = new FakeInvites({ expired: true });

    const recovered = await recoverAcceptance(
      acceptanceInput(),
      dependencies(store, invites),
    );

    expect(recovered.created).toBe(false);
    expect(recovered.intakeId).toBe(store.committed.intakeId);
    expect(invites.confirmCalls).toBe(1);
    expect(invites.state).toBe("confirmed");
    expect(invites.releaseCalls).toBe(0);
  });

  it("marks the commit intent before the Postgres network call", async () => {
    const store = new FakeStore({ loseFirstResponse: true });
    const invites = new FakeInvites();

    await expect(
      acceptIntake(acceptanceInput(), dependencies(store, invites)),
    ).rejects.toMatchObject({ code: "dependency_unavailable" });
    expect(invites.commitStartedCalls).toBe(1);
    expect(invites.completeCalls).toBe(0);
  });

  it("keeps durable recovery pending when receipt enqueue fails after confirmation", async () => {
    const store = new FakeStore();
    const invites = new FakeInvites();
    invites.failReceipt = true;

    const accepted = await acceptIntake(
      acceptanceInput(),
      dependencies(store, invites),
    );

    expect(accepted.intakeId).toBe(store.committed.intakeId);
    expect(store.intakeState).toBe("confirmed");
    expect(invites.receiptCalls).toBe(1);
    expect(invites.completeCalls).toBe(0);
    expect(invites.recoverySchedules).toEqual([
      expect.objectContaining({
        delayMs: 5_000,
        error: "receipt_not_queued",
      }),
    ]);

    invites.failReceipt = false;
    store.bindingRecord = bindingRecord(acceptanceInput());
    const recovered = await reconcileAcceptance(
      {
        inviteId: "invite-acceptance-001",
        submissionId: "submission-acceptance-001",
        fingerprint: FINGERPRINT,
        confirmed: store.committed,
      },
      dependencies(store, invites),
    );
    expect(recovered).toMatchObject({ status: "confirmed" });
    expect(invites.receiptCalls).toBe(2);
  });

  it("reconciles only from an authoritative committed binding", async () => {
    const store = new FakeStore();
    const invites = new FakeInvites();
    store.bindingRecord = bindingRecord(acceptanceInput());

    const recovered = await reconcileAcceptance(
      {
        inviteId: "invite-acceptance-001",
        submissionId: "submission-acceptance-001",
        fingerprint: FINGERPRINT,
      },
      dependencies(store, invites),
    );

    expect(recovered).toEqual({
      status: "confirmed",
      acceptance: { ...store.committed, created: false },
    });
    expect(store.bindingLookups).toBe(1);
    expect(invites.confirmCalls).toBe(1);
    expect(invites.lastConfirm).toMatchObject({
      fingerprint: FINGERPRINT,
      acceptance: { intakeId: store.committed.intakeId },
    });
    expect(store.confirmCalls).toBe(1);
    expect(invites.receiptCalls).toBe(1);
  });

  it("does not confirm when no authoritative Postgres commit exists", async () => {
    const store = new FakeStore();
    const invites = new FakeInvites();

    await expect(
      reconcileAcceptance(
        {
          inviteId: "invite-acceptance-001",
          submissionId: "submission-acceptance-001",
          fingerprint: FINGERPRINT,
        },
        dependencies(store, invites),
      ),
    ).resolves.toEqual({ status: "not_committed" });
    expect(invites.confirmCalls).toBe(0);
    expect(store.confirmCalls).toBe(0);
    expect(invites.receiptCalls).toBe(0);
  });

  it("refuses recovery when committed binding data does not match", async () => {
    const store = new FakeStore();
    const invites = new FakeInvites();
    store.bindingRecord = {
      ...bindingRecord(acceptanceInput()),
      fingerprint: "c".repeat(64),
    };

    await expect(
      reconcileAcceptance(
        {
          inviteId: "invite-acceptance-001",
          submissionId: "submission-acceptance-001",
          fingerprint: FINGERPRINT,
        },
        dependencies(store, invites),
      ),
    ).rejects.toMatchObject({ code: "recovery_required" });
    expect(invites.confirmCalls).toBe(0);
    expect(store.confirmCalls).toBe(0);
  });
});
