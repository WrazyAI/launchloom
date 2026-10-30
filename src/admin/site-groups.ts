import type { AttemptSummary } from "../lib/admin-contracts";

export type SiteGroup = {
  key: string;
  name: string;
  clientId: string | null;
  issueNumber: number | null;
  issues: number[];
  clients: Array<{ clientId: string; issueNumber: number | null }>;
  attempts: AttemptSummary[];
};

/** Only full generations produce a client site. Analysis probes stay in the ledger. */
export function isSiteGeneration(
  attempt: Pick<AttemptSummary, "profile">,
): boolean {
  return attempt.profile === "full" || attempt.profile === "full-preview";
}

function siteNameKey(name: string | null | undefined) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, " ");
}

export function groupBySite(attempts: AttemptSummary[]): SiteGroup[] {
  const groups = new Map<string, SiteGroup>();
  for (const attempt of attempts) {
    const nameKey = siteNameKey(attempt.clientName);
    const key = nameKey
      ? `site:${nameKey}`
      : attempt.clientId
        ? `client:${attempt.clientId}`
        : attempt.issueNumber
          ? `issue:${attempt.issueNumber}`
          : `attempt:${attempt.attemptId}`;
    const group = groups.get(key) ?? {
      key,
      name: "",
      clientId: null,
      issueNumber: null,
      issues: [],
      clients: [],
      attempts: [],
    };
    group.attempts.push(attempt);
    if (!group.name && attempt.clientName) group.name = attempt.clientName;
    group.clientId ??= attempt.clientId;
    if (
      attempt.clientId &&
      !group.clients.some((client) => client.clientId === attempt.clientId)
    )
      group.clients.push({
        clientId: attempt.clientId,
        issueNumber: attempt.issueNumber,
      });
    if (attempt.issueNumber && !group.issues.includes(attempt.issueNumber))
      group.issues.push(attempt.issueNumber);
    group.issueNumber ??= attempt.issueNumber;
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      name:
        group.name ||
        (group.issueNumber
          ? `Intake #${group.issueNumber}`
          : "Unlinked generation"),
      issues: [...group.issues].sort((a, b) => b - a),
      clients: [...group.clients].sort(
        (a, b) => (b.issueNumber ?? 0) - (a.issueNumber ?? 0),
      ),
      attempts: [...group.attempts].sort((a, b) => b.createdAt - a.createdAt),
    }))
    .sort((a, b) => b.attempts[0].createdAt - a.attempts[0].createdAt);
}

/**
 * A site's status is its best delivered outcome, not the latest attempt.
 * A later failed attempt must not demote an earlier live preview.
 */
export function siteStatus(attempts: AttemptSummary[]): AttemptSummary {
  return (
    attempts.find((attempt) => attempt.deliveryStatus === "published") ??
    attempts.find((attempt) => attempt.deliveryStatus === "preview_ready") ??
    attempts.find((attempt) => attempt.deliveryStatus === "attention") ??
    attempts.find((attempt) => attempt.deliveryStatus === "diagnostic") ??
    attempts[0]
  );
}
