import type { Page } from "../../../src/lib/admin-contracts";

/** Keyset paging over a complete retained dataset, never a legacy capped list. */
export function pageRecords<T>(
  items: T[],
  query: { cursor?: string; limit?: number },
  scope: string,
  key: (item: T) => string,
  time: (item: T) => number,
): Page<T> {
  const limit = query.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new Error("invalid limit");
  const bounded = Math.min(limit, 100);
  items.sort(
    (a, b) =>
      time(b) - time(a) || (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0),
  );
  const total = items.length;
  if (query.cursor !== undefined) {
    try {
      const c = JSON.parse(decodeURIComponent(atob(query.cursor)));
      if (
        c.scope !== scope ||
        !Number.isSafeInteger(c.time) ||
        typeof c.key !== "string"
      )
        throw new Error();
      items = items.filter(
        (item) =>
          time(item) < c.time || (time(item) === c.time && key(item) < c.key),
      );
    } catch {
      throw new Error("invalid cursor or cursor filters");
    }
  }
  const selected = items.slice(0, bounded);
  const last = selected.at(-1);
  return {
    items: selected,
    total,
    nextCursor:
      items.length > bounded && last
        ? btoa(
            encodeURIComponent(
              JSON.stringify({ scope, time: time(last), key: key(last) }),
            ),
          )
        : null,
  };
}
