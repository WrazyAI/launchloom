import type { AttemptSummary } from "../lib/admin-contracts";

export type SiteGroup = {
  key: string;
  name: string;
  clientId: string | null;
  issueNumber: number | null;
  issues: number[];
  attempts: AttemptSummary[];
};

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
      attempts: [],
    };
    group.attempts.push(attempt);
    if (!group.name && attempt.clientName) group.name = attempt.clientName;
    group.clientId ??= attempt.clientId;
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
      attempts: [...group.attempts].sort((a, b) => b.createdAt - a.createdAt),
    }))
    .sort((a, b) => b.attempts[0].createdAt - a.attempts[0].createdAt);
}
