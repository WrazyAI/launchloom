import type {
  AttemptSummary,
  DeliveryStatus,
  ExecutionStatus,
} from "../lib/admin-contracts";
import { groupBySite, siteStatus } from "./site-groups";
import { GenerationPreview } from "./GenerationPreview";
import { describeAttempt, formatProfile } from "./format";
import type { KeyboardEvent, MouseEvent } from "react";

type Tone = "success" | "running" | "failure" | "warning" | "neutral";

const TONE: Record<ExecutionStatus, Tone> = {
  queued: "neutral",
  running: "running",
  succeeded: "success",
  failed: "failure",
  cancelled: "neutral",
  skipped: "neutral",
  unknown: "warning",
};

const DELIVERY_TONE: Record<DeliveryStatus, Tone> = {
  none: "neutral",
  diagnostic: "warning",
  attention: "failure",
  preview_ready: "running",
  published: "success",
};

function actorInitials(name: string) {
  return (
    name
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(/\s+/u)
      .slice(0, 2)
      .map((part) => part[0] || "")
      .join("")
      .toUpperCase() || "LL"
  );
}

function localTime(value: number | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function localDayKey(value: number) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayLabel(value: number) {
  const date = new Date(value);
  const today = new Date();
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const day = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
  if (day === start) return "Today";
  if (day === start - 86_400_000) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(value);
}

function clientName(attempt: AttemptSummary) {
  return (
    attempt.clientName ||
    (attempt.clientId
      ? attempt.clientId.replace(/^submission:/u, "")
      : "No client linked")
  );
}

function actorName(attempt: AttemptSummary) {
  return attempt.initiator.email || attempt.initiator.name || "Not recorded";
}

function select(
  attempt: AttemptSummary,
  onSelect: (attempt: AttemptSummary, trigger: HTMLButtonElement) => void,
  event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
) {
  const target = event.target as HTMLElement;
  if (target.closest("a,button") && !target.closest("[data-row-action]"))
    return;
  const trigger =
    target.closest<HTMLButtonElement>("[data-row-action]") ||
    (event.currentTarget.querySelector<HTMLButtonElement>(
      "[data-row-action]",
    ) ??
      null);
  if (trigger) onSelect(attempt, trigger);
}

export function AttemptLedger({
  attempts,
  selectedId,
  onSelect,
}: {
  attempts: AttemptSummary[];
  selectedId: string | null;
  onSelect: (attempt: AttemptSummary, trigger: HTMLButtonElement) => void;
}) {
  const groups: Array<{
    key: string;
    label: string;
    attempts: AttemptSummary[];
  }> = [];
  for (const attempt of attempts) {
    const key = localDayKey(attempt.createdAt);
    const group = groups.find((item) => item.key === key);
    if (group) group.attempts.push(attempt);
    else
      groups.push({
        key,
        label: dayLabel(attempt.createdAt),
        attempts: [attempt],
      });
  }

  return (
    <div className="admin-ledger-groups">
      {groups.map((group) => (
        <section key={group.key} aria-label={`${group.label} generations`}>
          <div className="admin-day-label">
            {group.label}{" "}
            <span>
              {group.attempts.length}{" "}
              {group.attempts.length === 1 ? "generation" : "generations"}
            </span>
          </div>
          <div className="admin-table-wrap admin-ledger-wrap">
            <table className="admin-ledger">
              <caption className="admin-visually-hidden">
                Generation attempts for {group.label}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Generation</th>
                  <th scope="col">Status</th>
                  <th scope="col">Initiated by</th>
                  <th scope="col">Finished</th>
                  <th scope="col">
                    <span className="admin-visually-hidden">Preview</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.attempts.map((attempt) => {
                  const { executionLabel, deliveryLabel } =
                    describeAttempt(attempt);
                  const tone = TONE[attempt.executionStatus] || "neutral";
                  const deliveryTone =
                    attempt.deliveryStatus === "none"
                      ? "neutral"
                      : DELIVERY_TONE[attempt.deliveryStatus];
                  const finished = attempt.completedAt || attempt.updatedAt;
                  const isSelected = selectedId === attempt.attemptId;
                  return (
                    <tr
                      key={attempt.attemptId}
                      tabIndex={0}
                      aria-selected={isSelected || undefined}
                      onClick={(event) => select(attempt, onSelect, event)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          select(attempt, onSelect, event);
                        }
                      }}
                    >
                      <td>
                        <div className="admin-gen-cell">
                          <span className="admin-preview">
                            <GenerationPreview attempt={attempt} />
                          </span>
                          <span className="admin-gen-copy">
                            <span className="admin-gen-name">
                              {clientName(attempt)}
                            </span>
                            <span className="admin-gen-meta">
                              {formatProfile(attempt.profile)} · attempt{" "}
                              {attempt.attemptId.slice(0, 12)}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="admin-status">
                          <span
                            className={`admin-status__dot admin-status__dot--${tone}`}
                          />
                          {executionLabel}
                        </span>
                        <span className="admin-gen-substatus">
                          {attempt.deliveryStatus === "none"
                            ? "No delivery"
                            : deliveryLabel}
                        </span>
                      </td>
                      <td>
                        <span className="admin-actor">
                          <span
                            className={`admin-avatar${deliveryTone === "warning" ? " admin-avatar--lime" : ""}`}
                            aria-hidden="true"
                          >
                            {actorInitials(actorName(attempt))}
                          </span>
                          <span className="admin-actor__copy">
                            <strong>{actorName(attempt)}</strong>
                            <span>
                              {attempt.initiator.kind === "admin"
                                ? "Admin"
                                : attempt.initiator.source}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="admin-time">
                          {localTime(finished)}
                          <span>
                            {finished
                              ? `${attempt.completedAt ? "Finished" : "Updated"} ${localTime(finished)}`
                              : "No timestamp"}
                          </span>
                        </span>
                      </td>
                      <td>
                        <button
                          className="admin-row-action"
                          type="button"
                          data-row-action
                          aria-label={`Open attempt ${attempt.attemptId} for ${clientName(attempt)}`}
                          aria-expanded={isSelected}
                          aria-controls={
                            isSelected ? "attempt-inspector" : undefined
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelect(attempt, event.currentTarget);
                          }}
                        >
                          Preview
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

export function AttemptGallery({
  attempts,
  selectedId,
  onSelect,
}: {
  attempts: AttemptSummary[];
  selectedId: string | null;
  onSelect: (attempt: AttemptSummary, trigger: HTMLButtonElement) => void;
}) {
  return (
    <div className="admin-gallery">
      {attempts.map((attempt) => {
        const { executionLabel, deliveryLabel } = describeAttempt(attempt);
        const tone = TONE[attempt.executionStatus] || "neutral";
        const finished = attempt.completedAt || attempt.updatedAt;
        return (
          <button
            key={attempt.attemptId}
            className="admin-gallery-card"
            type="button"
            aria-pressed={selectedId === attempt.attemptId}
            onClick={(event) => onSelect(attempt, event.currentTarget)}
          >
            <span className="admin-gallery-card__preview">
              <GenerationPreview
                attempt={attempt}
                className="admin-gallery-card__image"
              />
              <span className="admin-gallery-card__badge">
                <span
                  className={`admin-status__dot admin-status__dot--${tone}`}
                />
                {executionLabel}
              </span>
            </span>
            <span className="admin-gallery-card__copy">
              <span className="admin-gallery-card__topline">
                <span className="admin-gallery-card__name">
                  {clientName(attempt)}
                </span>
                <span className="admin-time">
                  {localTime(finished)}
                  <span>{formatProfile(attempt.profile)}</span>
                </span>
              </span>
              <span className="admin-gallery-card__meta">
                <span>{deliveryLabel}</span>
                <span>·</span>
                <span>{actorName(attempt)}</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SiteTimeline({
  attempts,
  selectedId,
  onSelect,
  onOpenClient,
}: {
  attempts: AttemptSummary[];
  selectedId: string | null;
  onSelect: (attempt: AttemptSummary, trigger: HTMLButtonElement) => void;
  onOpenClient?: (clientId: string) => void;
}) {
  const groups = groupBySite(attempts);
  return (
    <div className="admin-site-groups">
      {groups.map((group) => {
        const latest = group.attempts[0];
        const status = siteStatus(group.attempts);
        const statusLabel =
          status.deliveryStatus === "published"
            ? "Published"
            : status.deliveryStatus === "preview_ready"
              ? "Preview ready"
              : status.deliveryStatus === "attention"
                ? "Needs attention"
                : status.deliveryStatus === "diagnostic"
                  ? "Diagnostic preview"
                  : describeAttempt(status).executionLabel;
        const tone =
          status.deliveryStatus === "published"
            ? "success"
            : status.deliveryStatus === "preview_ready"
              ? "running"
              : status.deliveryStatus === "attention"
                ? "failure"
                : status.deliveryStatus === "diagnostic"
                  ? "warning"
                  : TONE[status.executionStatus] || "neutral";
        return (
          <section
            key={group.key}
            className="admin-site-group"
            aria-label={`${group.name} generations`}
            data-site-key={group.key}
          >
            <header className="admin-site-head">
              <div className="admin-site-identity">
                <h3 className="admin-site-name">{group.name}</h3>
                <p className="admin-site-meta">
                  {group.attempts.length}{" "}
                  {group.attempts.length === 1 ? "generation" : "generations"}
                  {" · last "}
                  {dayLabel(latest.createdAt)} {localTime(latest.createdAt)}
                  {group.issues.length
                    ? ` · ${group.issues.length === 1 ? "Intake" : "Intakes"} ${group.issues.map((issue) => `#${issue}`).join(", ")}`
                    : ""}
                </p>
              </div>
              <div className="admin-site-head__actions">
                <span className="admin-status">
                  <span
                    className={`admin-status__dot admin-status__dot--${tone}`}
                  />
                  {statusLabel}
                </span>
                {group.clientId && onOpenClient ? (
                  <button
                    type="button"
                    className="admin-button admin-button--quiet admin-site-open"
                    onClick={() => onOpenClient(group.clientId as string)}
                  >
                    View site
                  </button>
                ) : null}
              </div>
            </header>
            <ol className="admin-site-timeline">
              {group.attempts.map((attempt) => {
                const { executionLabel, deliveryLabel } =
                  describeAttempt(attempt);
                const itemTone = TONE[attempt.executionStatus] || "neutral";
                const finished = attempt.completedAt || attempt.updatedAt;
                return (
                  <li
                    key={attempt.attemptId}
                    className="admin-site-timeline__item"
                  >
                    <button
                      type="button"
                      className="admin-site-timeline__row"
                      aria-pressed={selectedId === attempt.attemptId}
                      aria-label={`Open attempt ${attempt.attemptId} for ${group.name}`}
                      onClick={(event) =>
                        onSelect(attempt, event.currentTarget)
                      }
                    >
                      <span
                        className={`admin-site-timeline__dot admin-site-timeline__dot--${itemTone}`}
                        aria-hidden="true"
                      />
                      <span className="admin-site-timeline__when">
                        <strong>{dayLabel(attempt.createdAt)}</strong>
                        <span>{localTime(attempt.createdAt)}</span>
                      </span>
                      <span className="admin-site-timeline__what">
                        <strong>{formatProfile(attempt.profile)}</strong>
                        <span>
                          {actorName(attempt)} ·{" "}
                          {attempt.attemptId.slice(0, 12)}
                        </span>
                      </span>
                      <span className="admin-site-timeline__status">
                        <span className="admin-status">
                          <span
                            className={`admin-status__dot admin-status__dot--${itemTone}`}
                          />
                          {executionLabel}
                        </span>
                        <span className="admin-gen-substatus">
                          {attempt.deliveryStatus === "none"
                            ? "No delivery"
                            : deliveryLabel}
                        </span>
                      </span>
                      <span className="admin-preview admin-site-timeline__preview">
                        <GenerationPreview attempt={attempt} />
                      </span>
                      <span className="admin-site-timeline__time">
                        {finished ? localTime(finished) : "No timestamp"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
