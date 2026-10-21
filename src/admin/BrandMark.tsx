export function BrandMark({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <span className="admin-brand-mark-wrap">
      <span className="admin-brand-mark" aria-hidden="true">
        <svg viewBox="0 0 64 64">
          <path d="M24 14h11l-5 29h17l-2 8H17l7-37Z" fill="#f4f2ea" />
        </svg>
      </span>
      {!compact ? (
        <span className="admin-brand-wordmark">
          <span>LaunchLoom</span>
          <span>Operations workspace</span>
        </span>
      ) : null}
    </span>
  );
}
