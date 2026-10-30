import type { ClientRecord } from "../lib/admin-contracts";

export type ClientGroup = {
  key: string;
  clients: ClientRecord[];
};

function normalized(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, " ");
}

/**
 * A business with more than one accepted intake is still one site. Email is the
 * fallback identity only when no business name was recorded.
 */
export function groupClients(clients: ClientRecord[]): ClientGroup[] {
  const groups = new Map<string, ClientRecord[]>();
  for (const client of clients) {
    const business = normalized(client.businessName);
    const email = normalized(client.email);
    const key = business
      ? `business:${business}`
      : email
        ? `email:${email}`
        : `client:${client.clientId}`;
    const group = groups.get(key) ?? [];
    group.push(client);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, records]) => ({
      key,
      clients: [...records].sort(
        (a, b) =>
          (b.submittedAt ?? b.createdAt) - (a.submittedAt ?? a.createdAt),
      ),
    }))
    .sort(
      (a, b) =>
        (b.clients[0].submittedAt ?? b.clients[0].createdAt) -
        (a.clients[0].submittedAt ?? a.clients[0].createdAt),
    );
}
