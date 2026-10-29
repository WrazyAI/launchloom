import type { WorkspaceCapabilities } from "../../../src/lib/admin-contracts";

/** Configuration presence only. Never expose a connection string or probe the DB. */
export function workspaceCapabilities(env: {
  OPERATIONS_RECONCILE_MODE?: string;
  OPERATIONS_DATABASE_URL?: string;
}): WorkspaceCapabilities {
  return {
    operationsRead:
      env.OPERATIONS_RECONCILE_MODE === "observe-v1" &&
      Boolean(env.OPERATIONS_DATABASE_URL?.trim()),
  };
}
