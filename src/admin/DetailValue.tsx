/** Event evidence is untrusted text. Only JSON containers get structured;
 * values never become HTML or links. Bound DOM depth/size for retained payloads. */
function fieldLabel(key: string): string {
  const label = key
    .replace(/([a-z\d])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .trim();
  return label
    ? label[0].toUpperCase() + label.slice(1).toLowerCase()
    : "Field";
}

/** Inspect iteratively before React renders any subtree. Exceeding a limit
 * falls back once to the original evidence, not a reserialized remainder. */
function withinStructureBudget(value: unknown): boolean {
  const pending = [{ value, depth: 0 }];
  let visited = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    visited += 1;
    if (visited > 400) return false;
    if (entry.value === null || typeof entry.value !== "object") continue;
    if (entry.depth >= 5) return false;
    const children = Array.isArray(entry.value)
      ? entry.value
      : Object.values(entry.value);
    if (
      children.length > 80 ||
      visited + pending.length + children.length > 400
    )
      return false;
    for (const child of children)
      pending.push({ value: child, depth: entry.depth + 1 });
  }
  return true;
}

function StructuredValue({ value }: { value: unknown }) {
  if (value === null) return <span className="admin-muted">Not recorded</span>;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  if (typeof value !== "object") return <span>{String(value)}</span>;
  if (Array.isArray(value)) {
    if (!value.length) return <span className="admin-muted">No items</span>;
    return (
      <>
        <ol className="admin-detail-array">
          {value.slice(0, 40).map((item, index) => (
            <li key={index}>
              <StructuredValue value={item} />
            </li>
          ))}
        </ol>
        {value.length > 40 ? (
          <details className="admin-detail-remainder">
            <summary>{value.length - 40} more items</summary>
            <pre className="admin-detail-code">
              {JSON.stringify(value.slice(40))}
            </pre>
          </details>
        ) : null}
      </>
    );
  }

  const entries = Object.entries(value);
  if (!entries.length) return <span className="admin-muted">No fields</span>;
  return (
    <>
      <dl className="admin-detail-object">
        {entries.slice(0, 40).map(([key, item]) => (
          <div key={key}>
            <dt title={key}>{fieldLabel(key)}</dt>
            <dd>
              <StructuredValue value={item} />
            </dd>
          </div>
        ))}
      </dl>
      {entries.length > 40 ? (
        <details className="admin-detail-remainder">
          <summary>{entries.length - 40} more fields</summary>
          <pre className="admin-detail-code">
            {JSON.stringify(Object.fromEntries(entries.slice(40)))}
          </pre>
        </details>
      ) : null}
    </>
  );
}

export function DetailValue({ value }: { value: string }) {
  const text = value.trim();
  if (
    text.length <= 100_000 &&
    (text.startsWith("{") || text.startsWith("["))
  ) {
    try {
      const parsed: unknown = JSON.parse(text);
      return (
        <div className="admin-structured-value">
          {withinStructureBudget(parsed) ? (
            <StructuredValue value={parsed} />
          ) : (
            <pre className="admin-detail-code">{value}</pre>
          )}
        </div>
      );
    } catch {
      // Malformed or partially retained JSON is still useful evidence.
    }
  }
  return <p className="admin-timeline__detail">{value}</p>;
}
