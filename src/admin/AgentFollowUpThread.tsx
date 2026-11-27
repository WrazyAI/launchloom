import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  AgentFollowUpSubmission,
  AgentSuggestion,
  AgentThreadPage,
} from "../lib/agent-follow-ups";
import type { AdminApi } from "./api";
import { requestErrorMessage } from "./format";

function Card({
  suggestion,
  writable,
  active,
  onApply,
  onOpenLatest,
}: {
  suggestion: AgentSuggestion;
  writable: boolean;
  active: boolean;
  onApply: () => void;
  onOpenLatest: () => void;
}) {
  const running = active || suggestion.status === "started";
  const delivered = suggestion.status === "delivered";
  const needsReview = suggestion.status === "needs_review";
  const label = running
    ? "Revision running"
    : delivered
      ? "Open revised preview"
      : needsReview
        ? "Needs review"
        : writable
          ? "Fix in Agent runs"
          : "Open latest preview";
  return (
    <article className="admin-follow-up-card" data-status={suggestion.status}>
      <p className="admin-follow-up-card__issue">{suggestion.issue}</p>
      <p className="admin-follow-up-card__fix">{suggestion.suggestedFix}</p>
      <p className="admin-follow-up-card__scope">
        {suggestion.edits.length} related{" "}
        {suggestion.edits.length === 1 ? "edit" : "edits"}
      </p>
      <button
        type="button"
        className="admin-follow-up-card__apply"
        disabled={running || delivered || needsReview}
        onClick={writable ? onApply : onOpenLatest}
      >
        {label}
      </button>
      {delivered ? (
        <p className="admin-follow-up-card__receipt">
          The revision passed its checks. The previous preview is still
          available.
        </p>
      ) : null}
    </article>
  );
}

export function AgentFollowUpThread({
  api,
  attemptId,
  enabled,
}: {
  api: AdminApi;
  attemptId: string;
  enabled: boolean;
}) {
  const [thread, setThread] = useState<AgentThreadPage | null>(null);
  const [draft, setDraft] = useState("");
  const [mode, setMode] =
    useState<AgentFollowUpSubmission["mode"]>("auto");
  const [busy, setBusy] = useState(false);
  const [openedLatest, setOpenedLatest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);

  async function refresh() {
    try {
      const next = await api.getAgentThread(attemptId);
      if (mounted.current) setThread(next);
    } catch (cause) {
      if (mounted.current) setError(requestErrorMessage(cause));
    }
  }

  useEffect(() => {
    mounted.current = true;
    if (!enabled) return () => { mounted.current = false; };
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [api, attemptId, enabled]);

  useEffect(() => {
    if (!thread?.activeRequestId) return;
    const timer = window.setInterval(() => void refresh(), 4_000);
    return () => window.clearInterval(timer);
  }, [thread?.activeRequestId, api, attemptId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.submitAgentFollowUp(attemptId, {
        requestId: crypto.randomUUID(),
        text,
        mode,
        ...(mode === "improvement"
          ? { baseDeploymentId: thread?.latestPreview?.deploymentId || "" }
          : {}),
      });
      if (result.fallback) {
        setNotice("Choose Ask about this run or Request an improvement.");
        return;
      }
      if (result.thread) setThread(result.thread);
      setDraft("");
    } catch (cause) {
      setError(requestErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function apply(suggestion: AgentSuggestion) {
    const preview = thread?.latestPreview;
    if (!preview || (!thread?.writable && !openedLatest)) return;
    setError(null);
    try {
      await api.applyAgentSuggestion(attemptId, suggestion.id, {
        requestId: crypto.randomUUID(),
        baseDeploymentId: preview.deploymentId,
      });
      setThread((current) =>
        current
          ? {
              ...current,
              activeRequestId: "pending",
              messages: current.messages.map((message) => ({
                ...message,
                suggestions: message.suggestions.map((item) =>
                  item.id === suggestion.id
                    ? { ...item, status: "started" }
                    : item,
                ),
              })),
            }
          : current,
      );
    } catch (cause) {
      setError(requestErrorMessage(cause));
    }
  }

  if (!enabled) return null;
  return (
    <section className="admin-follow-ups" aria-label="Agent follow-up thread">
      <div className="admin-follow-ups__thread">
        {thread?.messages.length ? (
          thread.messages.map((message) => (
            <div
              key={message.id}
              className={`admin-follow-up-message admin-follow-up-message--${message.role}`}
            >
              <span className="admin-follow-up-message__who">
                {message.role === "admin" ? "You" : "Agent"}
              </span>
              <p>{message.text}</p>
              {message.suggestions.map((suggestion) => (
                <Card
                  key={suggestion.id}
                  suggestion={suggestion}
                  writable={thread.writable || openedLatest}
                  active={Boolean(thread.activeRequestId)}
                  onApply={() => void apply(suggestion)}
                  onOpenLatest={() => {
                    if (!thread.latestPreview) return;
                    setOpenedLatest(true);
                    window.open(
                      thread.latestPreview.previewUrl,
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }}
                />
              ))}
            </div>
          ))
        ) : (
          <p className="admin-follow-ups__empty">
            Ask about this run, or describe an improvement.
          </p>
        )}
      </div>
      {error ? (
        <p className="admin-inline-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="admin-follow-ups__notice" role="status">
          {notice}
        </p>
      ) : null}
      <form className="admin-follow-ups__composer" onSubmit={submit}>
        <label className="admin-visually-hidden" htmlFor={`follow-up-${attemptId}`}>
          Follow-up message
        </label>
        <textarea
          id={`follow-up-${attemptId}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={2}
          maxLength={2_000}
          placeholder="Ask about this run, or describe what to improve"
        />
        <div className="admin-follow-ups__bar">
          <select
            value={mode}
            onChange={(event) =>
              setMode(event.target.value as AgentFollowUpSubmission["mode"])
            }
            aria-label="Request type"
          >
            <option value="auto">Decide automatically</option>
            <option value="question">Ask about this run</option>
            <option value="improvement">Request an improvement</option>
          </select>
          <button type="submit" disabled={!draft.trim() || busy}>
            {busy ? "Sending..." : "Send"}
          </button>
        </div>
      </form>
      <p className="admin-follow-ups__note">
        Only recorded actions and visible output are used. A suggestion never
        changes the site until you choose it.
      </p>
    </section>
  );
}
