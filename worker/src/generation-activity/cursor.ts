import type { TraceIdentity } from "../../../src/lib/generation-activity";
import { OperationsError } from "../operations/store";

const PREFIX = "v1";
const CURSOR = /^v1\.([0-9a-f]{1,8})\.([0-9a-f]{8})$/u;

/**
 * Cursors are opaque, partition-scoped and not a security boundary. The suffix
 * detects accidental reuse against another attempt instead of silently
 * skipping or repeating rows.
 */
function identityTag(identity: TraceIdentity): string {
  const input = `${identity.namespace}:${identity.attemptId}`;
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function encodeActivityCursor(
  identity: TraceIdentity,
  cursor: number,
): string {
  return `${PREFIX}.${cursor.toString(16)}.${identityTag(identity)}`;
}

export function decodeActivityCursor(
  identity: TraceIdentity,
  value: string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  const match = CURSOR.exec(value);
  if (!match || match[2] !== identityTag(identity))
    throw new OperationsError("invalid", "Invalid activity cursor.");
  const cursor = Number.parseInt(match[1], 16);
  if (!Number.isSafeInteger(cursor) || cursor < 1)
    throw new OperationsError("invalid", "Invalid activity cursor.");
  return cursor;
}
