import type { WorkspaceCapabilities } from "../../../src/lib/admin-contracts";

/** Configuration presence only. Never expose a connection string or probe the DB. */
export function workspaceCapabilities(env: {
  OPERATIONS_RECONCILE_MODE?: string;
  OPERATIONS_DATABASE_URL?: string;
  GENERATION_ACTIVITY_ENABLED?: string;
}): WorkspaceCapabilities {
  const database = Boolean(env.OPERATIONS_DATABASE_URL?.trim());
  return {
    operationsRead: env.OPERATIONS_RECONCILE_MODE === "observe-v1" && database,
    generationActivityRead:
      env.GENERATION_ACTIVITY_ENABLED === "true" && database,
  };
}
