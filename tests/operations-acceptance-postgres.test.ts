import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  acceptIntake,
  reconcileAcceptance,
  type AcceptanceRoutingMode,
  type InviteAcceptanceAdapter,
  type InviteReservation,
} from "../worker/src/operations/acceptance";
import type {
  AcceptanceInput,
  AcceptanceResult,
} from "../worker/src/operations/contracts";
import {
  createOperationsStore,
  type OperationsSql,
} from "../worker/src/operations/store";

// Explicit opt-in to an ALREADY disposable LOCAL PostgreSQL database only.
// The fixture must have the operations migration applied and the separately
// configured launchloom_operations_worker role. This test never falls back to
// a deployed or admin connection.
const url = process.env.OPERATIONS_TEST_DATABASE_URL;
const enabled = Boolean(url) && process.env.OPERATIONS_TEST_DISPOSABLE === "1";

if (url) {
  const target = new URL(url);
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    target.search ||
    !/^\/launchloom_operations_test(?:_[a-z0-9_]+)?$/u.test(target.pathname)
  )
    throw new Error(
      "Acceptance integration tests require OPERATIONS_TEST_DISPOSABLE=1 and a fresh local launchloom_operations_test[_suffix] database without connection overrides.",
    );
}

function psql(sql: string): Promise<string> {
  if (!url) throw new Error("Disposable PostgreSQL target is required.");
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const child = spawn("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(([key]) => !key.startsWith("PG")),
        ),
        PGDATABASE: decodeURIComponent(target.pathname.slice(1)),
        PGHOST: target.hostname.replace(/^\[|\]$/gu, ""),
        PGPORT: target.port || "5432",
        PGUSER: decodeURIComponent(target.username),
        PGPASSWORD: decodeURIComponent(target.password),
        PGCONNECT_TIMEOUT: "5",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let error = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      error += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(error)),
    );
    child.stdin.end(sql);
  });
}

function literal(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function psqlSql(): OperationsSql {
  return {
    async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      const rendered = text.replace(/\$(\d+)/gu, (_match, index) => {
        const value = params[Number(index) - 1];
        if (value === undefined) throw new Error("Missing SQL parameter");
        return literal(value);
      });
      const output = await psql(
        `SET ROLE launchloom_operations_worker; SELECT COALESCE(json_agg(row_to_json(q)), '[]'::json) FROM (${rendered}) q;`,
      );
      const line = output.split("\n").filter(Boolean).at(-1) || "[]";
      return JSON.parse(line) as T[];
    },
  };
}

class SequentialInvites implements InviteAcceptanceAdapter {
  mode: AcceptanceRoutingMode = "postgres";
  state: InviteReservation["state"] = "unconfirmed";
  confirmed: AcceptanceResult | null = null;
  reserves = 0;
  confirms = 0;

  async reserve(): Promise<InviteReservation> {
    this.reserves += 1;
    return {
      accepted: true,
      mode: "postgres",
      state: this.state,
      fingerprint: fingerprint,
      expired: false,
      duplicate: this.state === "confirmed",
      acceptance: this.confirmed,
    };
  }

  async inspect(): Promise<InviteReservation | null> {
    return this.reserve();
  }

  async confirm(input: {
    inviteId: string;
    submissionId: string;
    fingerprint: string;
    acceptance: AcceptanceResult;
  }): Promise<{ confirmed: true; duplicate: boolean }> {
    this.confirms += 1;
    if (this.state === "confirmed") {
      if (
        !this.confirmed ||
        this.confirmed.intakeId !== input.acceptance.intakeId
      )
        throw new Error("conflict");
      return { confirmed: true, duplicate: true };
    }
    this.state = "confirmed";
    this.confirmed = input.acceptance;
    return { confirmed: true, duplicate: false };
  }

  async queueReceipt(): Promise<void> {}

  async markCommitStarted(): Promise<void> {}

  async scheduleRecovery(): Promise<void> {}

  async completeRecovery(): Promise<void> {}
}

const unique = crypto.randomUUID();
const fingerprint = crypto
  .randomUUID()
  .replaceAll("-", "")
  .padEnd(64, "a")
  .slice(0, 64);
const input: AcceptanceInput = {
  inviteId: `invite-real-pg-${unique}`,
  submissionId: `submission-real-pg-${unique}`,
  fingerprint,
  payloadVersion: 2,
  payload: {
    submissionId: `submission-real-pg-${unique}`,
    businessName: "Synthetic Harbor Plumbing",
    industry: "home-services",
  },
  consent: { termsVersion: "client-intake-v2", rightsConfirmed: true },
  profile: "home-services",
};

describe.runIf(enabled)(
  "acceptance concurrency on real disposable Postgres",
  () => {
    it("serializes concurrent duplicate intakes to one confirmed row set", async () => {
      const store = createOperationsStore(psqlSql());
      const invites = new SequentialInvites();
      const deps = {
        store,
        invites,
        routingMode: "postgres" as const,
        receipt: {
          recipient: "synthetic@example.test",
          businessName: "Synthetic Harbor Plumbing",
        },
      };

      const [left, right] = await Promise.all([
        acceptIntake(input, deps),
        acceptIntake(input, deps),
      ]);

      expect(left.intakeId).toBe(right.intakeId);
      expect(left.requestId).toBe(right.requestId);
      expect(left.attemptId).toBe(right.attemptId);
      expect(left.operationId).toBe(right.operationId);
      expect([left.created, right.created].sort()).toEqual([false, true]);

      const intake = await store.getIntake(left.intakeId);
      expect(intake).toMatchObject({
        intakeId: left.intakeId,
        requestId: left.requestId,
        attemptId: left.attemptId,
        operationId: left.operationId,
        submissionId: input.submissionId,
        inviteId: input.inviteId,
        fingerprint: input.fingerprint,
        profile: input.profile,
        acceptanceState: "confirmed",
      });
      expect(invites.confirms).toBe(2);
    });

    it("recovers the exact committed IDs from the authoritative binding", async () => {
      const store = createOperationsStore(psqlSql());
      const invites = new SequentialInvites();
      const suffix = crypto.randomUUID();
      const recoveryInput: AcceptanceInput = {
        ...input,
        inviteId: `invite-real-pg-recovery-${suffix}`,
        submissionId: `submission-real-pg-recovery-${suffix}`,
        fingerprint: crypto
          .randomUUID()
          .replaceAll("-", "")
          .padEnd(64, "d")
          .slice(0, 64),
        payload: {
          submissionId: `submission-real-pg-recovery-${suffix}`,
          businessName: "Synthetic Recovery Plumbing",
          industry: "home-services",
        },
      };
      const committed = await store.createAcceptance(recoveryInput);
      const recovered = await reconcileAcceptance(recoveryInput, {
        store,
        invites,
        receipt: {
          recipient: "synthetic-recovery@example.test",
          businessName: "Synthetic Recovery Plumbing",
        },
      });

      expect(recovered).toEqual({
        status: "confirmed",
        acceptance: { ...committed, created: false },
      });
      const intake = await store.getIntakeByBinding(
        recoveryInput.inviteId,
        recoveryInput.submissionId,
      );
      expect(intake).toMatchObject({
        intakeId: committed.intakeId,
        fingerprint: recoveryInput.fingerprint,
        acceptanceState: "confirmed",
      });
    });

    it("rejects a changed fingerprint for the same invite and submission", async () => {
      const store = createOperationsStore(psqlSql());
      await expect(
        store.createAcceptance({ ...input, fingerprint: "c".repeat(64) }),
      ).rejects.toMatchObject({ code: "conflict" });
    });
  },
);
