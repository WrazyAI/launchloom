import type { OnboardingInvites } from "./onboarding-invites";

export type IntakeIssue = { number: number; body?: string; pull_request?: unknown };
export class IntakeRecoveryError extends Error {
  constructor(readonly code: "in_progress" | "recovery_required") {
    super(code === "recovery_required"
      ? "Your intake needs operator recovery. Contact the person who invited you; do not submit a new invitation until it is reconciled."
      : "This submission is being reconciled. Retry shortly with the same details.");
  }
}
export function intakeOperationMarker(operationId: string, payloadHash: string) {
  return `<!-- launchloom-intake-operation:${operationId}:${payloadHash} -->`;
}
export async function readIntakeIssuePayload(issue: IntakeIssue) {
  if (issue.pull_request || !Number.isSafeInteger(issue.number) || issue.number <= 0) return null;
  const raw = issue.body?.match(/```json\s*([\s\S]*?)```/u)?.[1];
  try {
    const payload = JSON.parse(raw || "") as Record<string, unknown>;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload))));
    return { payload, hash: [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("") };
  } catch { return null; }
}
export async function verifyIntakeIssueOwnership(issue: IntakeIssue, operationId: string, payloadHash: string) {
  if (!issue.body?.includes(intakeOperationMarker(operationId, payloadHash))) return false;
  return (await readIntakeIssuePayload(issue))?.hash === payloadHash;
}

/** Bound work per request while retaining the page cursor across interruptions. */
export async function recoverIntakeIssue(
  coordinator: DurableObjectStub<OnboardingInvites>, inviteId: string, submissionId: string,
  loadPage: (page: number) => Promise<IntakeIssue[]>,
): Promise<number | null> {
  const operation = await coordinator.intakeOperation(inviteId, submissionId);
  if (!operation || operation.recoveryRequired) throw new IntakeRecoveryError("recovery_required");
  const scan = await coordinator.claimRecovery(inviteId, operation.operationId);
  if (!scan) throw new IntakeRecoveryError("in_progress");
  let page = scan.page;
  try {
    for (let read = 0; read < 10; read++) {
      const issues = await loadPage(page);
      if (!Array.isArray(issues)) throw new Error("Invalid intake recovery response.");
      for (const issue of issues) {
        if (await verifyIntakeIssueOwnership(issue, operation.operationId, operation.submissionHash)) {
          await coordinator.checkpointRecovery(inviteId, operation.operationId, scan.lease, 1, false);
          return issue.number;
        }
      }
      if (issues.length < 100) {
        await coordinator.checkpointRecovery(inviteId, operation.operationId, scan.lease, 1, operation.phase === "creating_issue");
        if (operation.phase === "creating_issue")
          throw new IntakeRecoveryError(operation.sweeps + 1 >= 3 ? "recovery_required" : "in_progress");
        return null;
      }
      page++;
      // Keep the lease until this scan ends, but persist progress immediately.
      await coordinator.advanceRecovery(inviteId, operation.operationId, scan.lease, page);
    }
  } catch (error) {
    if (!(error instanceof IntakeRecoveryError)) {
      // A failed sweep retains its cursor and consumes the same bounded recovery allowance.
      await coordinator.checkpointRecovery(inviteId, operation.operationId, scan.lease, page, true);
      if (operation.sweeps + 1 >= 3) throw new IntakeRecoveryError("recovery_required");
    }
    throw error;
  } finally {
    await coordinator.checkpointRecovery(inviteId, operation.operationId, scan.lease, page, false);
  }
  throw new IntakeRecoveryError("in_progress");
}
