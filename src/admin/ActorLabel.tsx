import type { ActorSnapshot } from "../lib/admin-contracts";
import { formatActor } from "./format";

export function ActorLabel({
  actor,
  showSource = true,
}: {
  actor: ActorSnapshot | null | undefined;
  showSource?: boolean;
}) {
  const { label, sourceLabel } = formatActor(actor);
  return (
    <span className="admin-actor">
      <span className="admin-actor__name">{label}</span>
      {showSource ? (
        <span className="admin-actor__source">{sourceLabel}</span>
      ) : null}
    </span>
  );
}
