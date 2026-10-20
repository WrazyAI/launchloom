import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AdminApi,
  BackfillResult,
  CreatedInvite,
  LegacyInvite,
} from "./api";
import { formatTimestamp, requestErrorMessage } from "./format";

const STATUS_LABELS: Record<string, string> = {
  unused: "Unused",
  consumed: "Consumed",
  expired: "Expired",
  revoked: "Revoked",
};

function statusLabel(status: string) {
  return STATUS_LABELS[status] || "Unrecognized status";
}

function creatorLabel(invite: LegacyInvite) {
  if (!invite.creator) return "Not recorded";
  return invite.creator.name || invite.creator.email || "Recorded admin";
}

function isAmbiguousFailure(error: unknown) {
  if (typeof error !== "object" || error === null) return true;
  const status = (error as { status?: unknown }).status;
  const code = (error as { code?: unknown }).code;
  return (
    status === 0 ||
    (typeof status === "number" && status >= 500) ||
    code === "invalid_response" ||
    code === "network_unavailable"
  );
}

type CopyState = "idle" | "copied" | "manual";

export function InvitationsView({ api }: { api: AdminApi }) {
  const [invites, setInvites] = useState<LegacyInvite[] | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const [clientEmail, setClientEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createUncertain, setCreateUncertain] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokeNotice, setRevokeNotice] = useState<string | null>(null);

  const [backfilling, setBackfilling] = useState(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(
    null,
  );

  const [recoveryInviteId, setRecoveryInviteId] = useState("");
  const [recoveryIssue, setRecoveryIssue] = useState("");
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [recoveryUncertain, setRecoveryUncertain] = useState(false);

  const listRequest = useRef(0);
  const loadedRef = useRef(false);
  const createInFlight = useRef(false);
  const revokeInFlight = useRef(false);
  const backfillInFlight = useRef(false);
  const recoveryInFlight = useRef(false);
  const clearCreateUncertainOnLoad = useRef(false);
  const clearRecoveryUncertainOnLoad = useRef(false);

  useEffect(() => {
    const requestId = ++listRequest.current;
    const controller = new AbortController();
    if (loadedRef.current) setRefreshing(true);
    else setListLoading(true);
    setListError(null);
    api
      .listInvites({ signal: controller.signal })
      .then((items) => {
        if (listRequest.current !== requestId) return;
        loadedRef.current = true;
        setInvites(items);
        setListLoading(false);
        setRefreshing(false);
        if (clearCreateUncertainOnLoad.current) {
          clearCreateUncertainOnLoad.current = false;
          setCreateUncertain(false);
          setCreateError(null);
        }
        if (clearRecoveryUncertainOnLoad.current) {
          clearRecoveryUncertainOnLoad.current = false;
          setRecoveryUncertain(false);
        }
      })
      .catch((failure) => {
        if (controller.signal.aborted || listRequest.current !== requestId)
          return;
        setListError(requestErrorMessage(failure));
        setListLoading(false);
        setRefreshing(false);
      });
    return () => controller.abort();
  }, [api, refreshToken]);

  const refresh = useCallback(
    (options: { clearCreateUncertain?: boolean } = {}) => {
      if (options.clearCreateUncertain)
        clearCreateUncertainOnLoad.current = true;
      setRefreshToken((token) => token + 1);
    },
    [],
  );

  async function submitCreate(event: { preventDefault(): void }) {
    event.preventDefault();
    if (createInFlight.current || createUncertain) return;
    createInFlight.current = true;
    setCreating(true);
    setCreateError(null);
    setCopyState("idle");
    setCopyMessage(null);
    try {
      const result = await api.createInvite(clientEmail.trim() || null);
      setCreated(result);
      setClientEmail("");
      refresh();
    } catch (failure) {
      if (isAmbiguousFailure(failure)) {
        setCreateUncertain(true);
        setCreateError(
          "The invitation was not confirmed. The server may still have created one, so check the list before creating another.",
        );
      } else {
        setCreateError(requestErrorMessage(failure));
      }
    } finally {
      createInFlight.current = false;
      setCreating(false);
    }
  }

  async function copyCreatedLink() {
    if (!created) return;
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(created.url);
      setCopyState("copied");
      setCopyMessage("Copied to clipboard. This link is not stored anywhere.");
    } catch {
      setCopyState("manual");
      setCopyMessage(
        "Copy failed. Select the link above and copy it manually. The invitation was not recreated.",
      );
    }
  }

  async function confirmRevoke(inviteId: string) {
    if (revokeInFlight.current) return;
    revokeInFlight.current = true;
    setRevokingId(inviteId);
    setRevokeError(null);
    setRevokeNotice(null);
    try {
      await api.revokeInvite(inviteId);
      setConfirmRevokeId(null);
      setRevokeNotice("Invitation revoked. Unused links can no longer be used.");
      refresh();
    } catch (failure) {
      if (isAmbiguousFailure(failure)) {
        setConfirmRevokeId(null);
        setRevokeError(
          "Revocation was not confirmed. The list was refreshed so you can check the actual status before trying again.",
        );
        refresh();
      } else {
        setRevokeError(requestErrorMessage(failure));
      }
    } finally {
      revokeInFlight.current = false;
      setRevokingId(null);
    }
  }

  async function runBackfill() {
    if (backfillInFlight.current) return;
    backfillInFlight.current = true;
    setBackfilling(true);
    setBackfillError(null);
    setBackfillResult(null);
    try {
      const result = await api.backfillInvites();
      setBackfillResult(result);
      refresh();
    } catch (failure) {
      if (isAmbiguousFailure(failure)) {
        setBackfillError(
          "Backfill was not confirmed. The list was refreshed so you can check for updated client emails before retrying.",
        );
        refresh();
      } else {
        setBackfillError(requestErrorMessage(failure));
      }
    } finally {
      backfillInFlight.current = false;
      setBackfilling(false);
    }
  }

  async function submitRecovery(event: { preventDefault(): void }) {
    event.preventDefault();
    if (recoveryInFlight.current || recoveryUncertain) return;
    const issueNumber = Number(recoveryIssue);
    if (
      !recoveryInviteId ||
      !recoveryConfirmed ||
      !Number.isSafeInteger(issueNumber) ||
      issueNumber <= 0
    )
      return;
    recoveryInFlight.current = true;
    setRecovering(true);
    setRecoveryError(null);
    setRecoveryNotice(null);
    try {
      const result = await api.recoverInviteIntake(
        recoveryInviteId,
        issueNumber,
      );
      setRecoveryNotice(
        result.duplicate
          ? `Recovery for issue #${result.issue} was already recorded. No second dispatch was queued.`
          : `Recovery recorded for issue #${result.issue}.`,
      );
      setRecoveryConfirmed(false);
      setRecoveryIssue("");
      setRecoveryInviteId("");
      refresh();
    } catch (failure) {
      if (isAmbiguousFailure(failure)) {
        setRecoveryUncertain(true);
        setRecoveryError(
          "Recovery was not confirmed. The list is refreshing so you can review the invitation and issue state before trying again.",
        );
        clearRecoveryUncertainOnLoad.current = true;
        refresh();
      } else {
        setRecoveryError(requestErrorMessage(failure));
      }
    } finally {
      recoveryInFlight.current = false;
      setRecovering(false);
    }
  }

  const recoveryInvites = (invites || []).filter(
    (invite) => invite.recoveryRequired,
  );
  const issueNumber = Number(recoveryIssue);
  const recoveryReady =
    Boolean(recoveryInviteId) &&
    recoveryConfirmed &&
    Number.isSafeInteger(issueNumber) &&
    issueNumber > 0;

  return (
    <div className="admin-stack" id="invitations-view">
      <section
        className="admin-panel"
        aria-labelledby="invite-create-title"
      >
        <div className="admin-panel__head">
          <div>
            <p className="admin-eyebrow">Single-use links</p>
            <h3 id="invite-create-title">Create an invitation</h3>
          </div>
        </div>
        <p className="admin-muted">
          The creator is recorded from the verified Access identity on the
          server. No administrator identity is sent from this form.
        </p>
        <form className="admin-form" onSubmit={submitCreate}>
          <label className="admin-field admin-field--wide" htmlFor="invite-email">
            Client email (optional)
            <input
              id="invite-email"
              name="clientEmail"
              type="email"
              autoComplete="off"
              value={clientEmail}
              placeholder="client@example.com"
              onChange={(event) => setClientEmail(event.target.value)}
              disabled={creating}
            />
          </label>
          <div className="admin-form__actions">
            <button
              className="admin-button"
              type="submit"
              disabled={creating || createUncertain}
            >
              {creating
                ? "Creating invitation..."
                : createUncertain
                  ? "Creation unconfirmed"
                  : "Create invitation"}
            </button>
            <span className="admin-muted">
              Expires 14 days after creation. The link is shown once.
            </span>
          </div>
        </form>

        {createError ? (
          <div className="admin-inline-error" role="alert">
            <strong>Invitation not confirmed</strong>
            <span>{createError}</span>
            {createUncertain ? (
              <button
                className="admin-button admin-button--quiet"
                type="button"
                onClick={() => refresh({ clearCreateUncertain: true })}
              >
                Check invitation list before retrying
              </button>
            ) : null}
          </div>
        ) : null}

        {created ? (
          <div
            className="admin-invite-result"
            role="status"
            aria-labelledby="invite-result-title"
          >
            <div className="admin-panel__head">
              <div>
                <p className="admin-eyebrow">One-time result</p>
                <h3 id="invite-result-title">Copy this invitation link now</h3>
              </div>
            </div>
            <p>
              This is the only time the link is shown. It is held in this
              browser tab only and is not saved to storage, analytics or logs.
            </p>
            <label className="admin-field admin-field--wide" htmlFor="invite-link">
              New invitation link
              <input
                id="invite-link"
                type="text"
                readOnly
                value={created.url}
                onFocus={(event) => event.currentTarget.select()}
                spellCheck={false}
              />
            </label>
            <div className="admin-form__actions">
              <button
                className="admin-button"
                type="button"
                onClick={() => void copyCreatedLink()}
              >
                {copyState === "copied" ? "Copied" : "Copy link"}
              </button>
              <button
                className="admin-button admin-button--quiet"
                type="button"
                onClick={() => {
                  setCreated(null);
                  setCopyState("idle");
                  setCopyMessage(null);
                }}
              >
                Create another invitation
              </button>
              <span className="admin-muted">
                {created.clientEmail
                  ? `Bound to ${created.clientEmail}. `
                  : "Not bound to a client email. "}
                Expires {formatTimestamp(created.expiresAt)}.
              </span>
            </div>
            {copyMessage ? (
              <p
                className={
                  copyState === "manual"
                    ? "admin-copy-warning"
                    : "admin-muted"
                }
                role="status"
              >
                {copyMessage}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="admin-panel" aria-labelledby="invite-list-title">
        <div className="admin-panel__head">
          <div>
            <p className="admin-eyebrow">Recorded invitations</p>
            <h3 id="invite-list-title">
              {invites ? `${invites.length} invitations` : "Invitations"}
            </h3>
          </div>
          <div className="admin-form__actions">
            <button
              className="admin-button admin-button--quiet"
              type="button"
              onClick={() => refresh()}
              disabled={listLoading || refreshing}
            >
              {refreshing ? "Refreshing..." : "Refresh invitations"}
            </button>
            <button
              className="admin-button admin-button--quiet"
              type="button"
              onClick={() => void runBackfill()}
              disabled={backfilling}
            >
              {backfilling ? "Backfilling..." : "Backfill client emails"}
            </button>
          </div>
        </div>
        <p className="admin-muted">
          The coordinator returns at most 100 recent invitations. Older records
          are not loaded here.
        </p>

        {backfillResult ? (
          <div className="admin-notice" role="status">
            <strong>Backfill finished.</strong>
            <span>
              Updated {backfillResult.backfilled} invitation
              {backfillResult.backfilled === 1 ? "" : "s"}.{" "}
              {backfillResult.remaining} still missing a client email.
            </span>
          </div>
        ) : null}
        {backfillError ? (
          <div className="admin-inline-error" role="alert">
            {backfillError}
          </div>
        ) : null}
        {revokeNotice ? (
          <div className="admin-notice" role="status">
            {revokeNotice}
          </div>
        ) : null}
        {revokeError ? (
          <div className="admin-inline-error" role="alert">
            {revokeError}
          </div>
        ) : null}
        {listError ? (
          <div className="admin-error" role="alert">
            <strong>Invitations could not be loaded.</strong>
            <span>{listError}</span>
            <button
              className="admin-button admin-button--quiet"
              type="button"
              onClick={() => refresh()}
            >
              Retry
            </button>
          </div>
        ) : null}

        {listLoading && !invites ? (
          <div className="admin-skeleton" aria-label="Loading invitations">
            <span />
            <span />
            <span />
          </div>
        ) : invites && invites.length === 0 ? (
          <div className="admin-empty" role="status">
            <h3>No invitations are recorded</h3>
            <p>Create the first single-use invitation above.</p>
          </div>
        ) : invites ? (
          <div className="admin-table-wrap" tabIndex={0}>
            <table className="admin-table admin-table--invites">
              <caption className="admin-visually-hidden">
                Invitations recorded by the coordinator
              </caption>
              <thead>
                <tr>
                  <th scope="col">Invitation</th>
                  <th scope="col">Created</th>
                  <th scope="col">Client email</th>
                  <th scope="col">Expires</th>
                  <th scope="col">Status</th>
                  <th scope="col">Creator</th>
                  <th scope="col">Issue</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => {
                  const confirmed = confirmRevokeId === invite.inviteId;
                  return (
                    <tr key={invite.inviteId}>
                      <td>
                        <span title={invite.inviteId}>
                          {invite.inviteId.slice(0, 14)}
                          {invite.inviteId.length > 14 ? "..." : ""}
                        </span>
                      </td>
                      <td>{formatTimestamp(invite.createdAt)}</td>
                      <td>
                        {invite.clientEmail || invite.submitterEmail || (
                          <span className="admin-muted">Not recorded</span>
                        )}
                      </td>
                      <td>{formatTimestamp(invite.expiresAt)}</td>
                      <td>
                        <span>{statusLabel(invite.status)}</span>
                        {invite.recoveryRequired ? (
                          <span className="admin-recovery-flag">
                            Intake recovery needed
                          </span>
                        ) : null}
                      </td>
                      <td>{creatorLabel(invite)}</td>
                      <td>
                        {invite.issueNumber
                          ? `#${invite.issueNumber}`
                          : "Not recorded"}
                      </td>
                      <td>
                        {invite.status === "unused" ? (
                          confirmed ? (
                            <div
                              className="admin-confirm"
                              role="group"
                              aria-label={`Confirm revoke ${invite.inviteId}`}
                            >
                              <span>Revoke this unused link?</span>
                              <div className="admin-form__actions">
                                <button
                                  className="admin-button"
                                  type="button"
                                  onClick={() => void confirmRevoke(invite.inviteId)}
                                  disabled={revokingId === invite.inviteId}
                                >
                                  {revokingId === invite.inviteId
                                    ? "Revoking..."
                                    : "Confirm revoke"}
                                </button>
                                <button
                                  className="admin-button admin-button--quiet"
                                  type="button"
                                  onClick={() => setConfirmRevokeId(null)}
                                  disabled={revokingId === invite.inviteId}
                                >
                                  Keep invitation
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              className="admin-button admin-button--quiet"
                              type="button"
                              onClick={() => {
                                setRevokeError(null);
                                setConfirmRevokeId(invite.inviteId);
                              }}
                            >
                              Revoke
                            </button>
                          )
                        ) : (
                          <span className="admin-muted">No action available</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="admin-panel" aria-labelledby="invite-recovery-title">
        <div className="admin-panel__head">
          <div>
            <p className="admin-eyebrow">Existing confirmed recovery</p>
            <h3 id="invite-recovery-title">Recover intake</h3>
          </div>
        </div>
        <p className="admin-muted">
          Use this only after reviewing the original GitHub issue and its intake
          details. The server verifies the issue, submission hash and operation
          before queueing anything.
        </p>
        {recoveryInvites.length === 0 ? (
          <div className="admin-empty" role="status">
            <h3>No invitations require recovery</h3>
            <p>
              Invitations that fail intake reconciliation will appear here after
              a refresh.
            </p>
          </div>
        ) : (
          <form className="admin-form" onSubmit={submitRecovery}>
            <label
              className="admin-field admin-field--wide"
              htmlFor="recovery-invite"
            >
              Invitation requiring recovery
              <select
                id="recovery-invite"
                value={recoveryInviteId}
                onChange={(event) => {
                  setRecoveryInviteId(event.target.value);
                  setRecoveryUncertain(false);
                  setRecoveryError(null);
                }}
                disabled={recovering}
              >
                <option value="">Choose an invitation</option>
                {recoveryInvites.map((invite) => (
                  <option key={invite.inviteId} value={invite.inviteId}>
                    {invite.inviteId}
                    {invite.issueNumber
                      ? ` (original issue #${invite.issueNumber})`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label
              className="admin-field admin-field--issue"
              htmlFor="recovery-issue"
            >
              Reviewed issue number
              <input
                id="recovery-issue"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={recoveryIssue}
                onChange={(event) => {
                  setRecoveryIssue(event.target.value);
                  setRecoveryUncertain(false);
                  setRecoveryError(null);
                }}
                disabled={recovering}
              />
            </label>
            <label className="admin-check admin-field--wide">
              <input
                type="checkbox"
                checked={recoveryConfirmed}
                onChange={(event) => {
                  setRecoveryConfirmed(event.target.checked);
                  setRecoveryUncertain(false);
                  setRecoveryError(null);
                }}
                disabled={recovering}
              />
              I reviewed the original issue and its intake details, and I
              understand this queues the existing recovery workflow.
            </label>
            <div className="admin-form__actions">
              <button
                className="admin-button"
                type="submit"
                disabled={!recoveryReady || recovering || recoveryUncertain}
              >
                {recovering ? "Recording recovery..." : "Record recovery"}
              </button>
            </div>
          </form>
        )}
        {recoveryNotice ? (
          <div className="admin-notice" role="status">
            {recoveryNotice}
          </div>
        ) : null}
        {recoveryError ? (
          <div className="admin-inline-error" role="alert">
            {recoveryError}
          </div>
        ) : null}
      </section>
    </div>
  );
}
