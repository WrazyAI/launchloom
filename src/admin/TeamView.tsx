import { useEffect, useRef, useState } from "react";
import type {
  AdminApi,
  EnrollmentLink,
  TeamMember,
  WorkspacePrincipal,
} from "./api";
import { formatTimestamp, requestErrorMessage } from "./format";

type PendingChange = {
  member: TeamMember;
  role?: "owner" | "admin";
  active?: boolean;
};

const ROLE_LABELS: Record<TeamMember["role"], string> = {
  owner: "Owner",
  admin: "Admin",
};

function isAmbiguous(error: unknown) {
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

function AccessUnavailable() {
  return (
    <div className="admin-stack" id="team-view">
      <div className="admin-placeholder" role="status">
        <p className="admin-eyebrow">Accounts unavailable</p>
        <h3>Administrator accounts are not configured yet</h3>
        <p>
          Team membership, roles and account profiles require the persistent
          identity store, which is not enabled in this Access-mode workspace.
        </p>
        <ul>
          <li>No administrator members, invitations or roles are shown.</li>
          <li>No owner controls are available in this step.</li>
          <li>No account is created, edited or deactivated here.</li>
          <li>Access remains protected by the existing verified identity.</li>
        </ul>
      </div>
      <div className="admin-notice">
        <strong>Why this surface is empty</strong>
        <span>
          Showing placeholder people or roles would misrepresent who can access
          LaunchLoom. This view will be connected only after persistent accounts
          and membership verification are available.
        </span>
      </div>
    </div>
  );
}

export function TeamView({ api }: { api: AdminApi }) {
  const [principal, setPrincipal] = useState<WorkspacePrincipal | null>(null);
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const request = useRef(0);

  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<EnrollmentLink | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createUncertain, setCreateUncertain] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">(
    "idle",
  );
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const createInFlight = useRef(false);

  const [pending, setPending] = useState<PendingChange | null>(null);
  const [changing, setChanging] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeNotice, setChangeNotice] = useState<string | null>(null);
  const changeInFlight = useRef(false);

  useEffect(() => {
    const requestId = ++request.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .getMe({ signal: controller.signal })
      .then(async (value) => {
        if (request.current !== requestId) return;
        setPrincipal(value);
        if (value.authSource !== "neon") {
          setMembers(null);
          setLoading(false);
          return;
        }
        const team = await api.getTeam({ signal: controller.signal });
        if (request.current !== requestId) return;
        setMembers(team);
        setLoading(false);
      })
      .catch((failure) => {
        if (controller.signal.aborted || request.current !== requestId) return;
        setPrincipal(null);
        setMembers(null);
        setError(requestErrorMessage(failure));
        setLoading(false);
      });
    return () => controller.abort();
  }, [api, refreshToken]);

  const isNeon = principal?.authSource === "neon";
  const isOwner = isNeon && principal.role === "owner";

  async function submitEnrollment(event: { preventDefault(): void }) {
    event.preventDefault();
    if (createInFlight.current || createUncertain || created) return;
    createInFlight.current = true;
    setCreating(true);
    setCreateError(null);
    setCopyState("idle");
    setCopyMessage(null);
    try {
      const enrollment = await api.createEnrollment(email);
      setCreated(enrollment);
      setEmail("");
    } catch (failure) {
      if (isAmbiguous(failure)) {
        setCreateUncertain(true);
        setCreateError(
          "The enrollment link was not confirmed. The server may still have created a link that cannot be shown again. Do not issue another blindly.",
        );
      } else {
        setCreateError(requestErrorMessage(failure));
      }
    } finally {
      createInFlight.current = false;
      setCreating(false);
    }
  }

  async function copyLink() {
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
        "Copy failed. Select the link above and copy it manually. The link was not recreated.",
      );
    }
  }

  function dismissCreated() {
    setCreated(null);
    setCopyState("idle");
    setCopyMessage(null);
    setConfirmDiscard(false);
  }

  function requestDismiss() {
    if (copyState !== "copied") setConfirmDiscard(true);
    else dismissCreated();
  }

  async function confirmChange() {
    if (!pending || changeInFlight.current) return;
    const { member } = pending;
    changeInFlight.current = true;
    setChanging(true);
    setChangeError(null);
    setChangeNotice(null);
    try {
      const update =
        pending.active === false
          ? { active: false as const }
          : { role: pending.role! };
      const updated = await api.changeMember(member.id, update);
      setPending(null);
      if (pending.active === false) {
        setMembers((current) =>
          current ? current.filter((item) => item.id !== member.id) : current,
        );
        setChangeNotice(
          `${updated.displayName} was deactivated. Their workspace access is revoked on the next request.`,
        );
      } else {
        setMembers((current) =>
          current
            ? current.map((item) => (item.id === updated.id ? updated : item))
            : current,
        );
        setChangeNotice(
          `${updated.displayName} is now ${ROLE_LABELS[updated.role].toLowerCase()}.`,
        );
      }
    } catch (failure) {
      setChangeError(requestErrorMessage(failure));
    } finally {
      changeInFlight.current = false;
      setChanging(false);
    }
  }

  if (loading) {
    return (
      <div className="admin-stack" id="team-view">
        <div className="admin-skeleton" aria-label="Loading workspace team">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-stack" id="team-view">
        <div className="admin-error" role="alert">
          <strong>The workspace team could not be loaded.</strong>
          <span>{error}</span>
          <button
            className="admin-button admin-button--quiet"
            type="button"
            onClick={() => setRefreshToken((token) => token + 1)}
          >
            Retry team
          </button>
        </div>
      </div>
    );
  }

  if (!isNeon) return <AccessUnavailable />;

  return (
    <div className="admin-stack" id="team-view">
      <section className="admin-panel" aria-labelledby="team-members-title">
        <div className="admin-panel__head">
          <div>
            <p className="admin-eyebrow">Active membership</p>
            <h3 id="team-members-title">
              {members
                ? `${members.length} active ${members.length === 1 ? "member" : "members"}`
                : "Workspace members"}
            </h3>
          </div>
          <button
            className="admin-button admin-button--quiet"
            type="button"
            onClick={() => setRefreshToken((token) => token + 1)}
          >
            Refresh team
          </button>
        </div>
        <p className="admin-muted">
          Every owner and admin sees the same clients, invitations and
          generation records. Deactivation keeps historical attribution but
          revokes workspace access.
        </p>
        {changeNotice ? (
          <div className="admin-notice" role="status">
            {changeNotice}
          </div>
        ) : null}
        {changeError && !pending ? (
          <div className="admin-inline-error" role="alert">
            {changeError}
          </div>
        ) : null}
        {members && members.length > 0 ? (
          <div className="admin-table-wrap" tabIndex={0}>
            <table className="admin-table admin-table--team">
              <caption className="admin-visually-hidden">
                Active workspace members
              </caption>
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  {isOwner ? <th scope="col">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const pendingHere = pending?.member.id === member.id;
                  return (
                    <tr key={member.id}>
                      <td>
                        <span className="admin-profile">
                          <span
                            className="admin-profile__avatar"
                            aria-hidden="true"
                          >
                            {member.initials}
                          </span>
                          <span>{member.displayName}</span>
                        </span>
                      </td>
                      <td>{member.email}</td>
                      <td>{ROLE_LABELS[member.role]}</td>
                      <td>{member.active ? "Active" : "Inactive"}</td>
                      {isOwner ? (
                        <td>
                          {pendingHere ? (
                            <div
                              className="admin-confirm"
                              role="group"
                              aria-label={`Confirm change for ${member.displayName}`}
                            >
                              <span>
                                {pending!.active === false
                                  ? `Deactivate ${member.displayName}? They lose workspace access immediately.`
                                  : `Change ${member.displayName} to ${ROLE_LABELS[pending!.role!]}?`}
                              </span>
                              <div className="admin-form__actions">
                                <button
                                  className="admin-button"
                                  type="button"
                                  onClick={() => void confirmChange()}
                                  disabled={changing}
                                >
                                  {changing ? "Saving..." : "Confirm change"}
                                </button>
                                <button
                                  className="admin-button admin-button--quiet"
                                  type="button"
                                  onClick={() => {
                                    setPending(null);
                                    setChangeError(null);
                                  }}
                                  disabled={changing}
                                >
                                  Cancel
                                </button>
                              </div>
                              {changeError ? (
                                <span
                                  className="admin-inline-error"
                                  role="alert"
                                >
                                  {changeError}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <div className="admin-form__actions">
                              <label
                                className="admin-field admin-field--small"
                                htmlFor={`member-role-${member.id}`}
                              >
                                Role for {member.displayName}
                                <select
                                  id={`member-role-${member.id}`}
                                  value={member.role}
                                  onChange={(event) => {
                                    const role = event.target.value as
                                      "owner" | "admin";
                                    if (role === member.role) return;
                                    setChangeError(null);
                                    setChangeNotice(null);
                                    setPending({ member, role });
                                  }}
                                  disabled={changing}
                                >
                                  <option value="owner">Owner</option>
                                  <option value="admin">Admin</option>
                                </select>
                              </label>
                              <button
                                className="admin-button admin-button--quiet"
                                type="button"
                                onClick={() => {
                                  setChangeError(null);
                                  setChangeNotice(null);
                                  setPending({ member, active: false });
                                }}
                                disabled={changing}
                              >
                                Deactivate {member.displayName}
                              </button>
                            </div>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty" role="status">
            <h3>No active members are recorded</h3>
            <p>An owner can invite the first administrator below.</p>
          </div>
        )}
        {!isOwner ? (
          <p className="admin-muted">
            This account is an admin. Only an owner can change membership or
            roles.
          </p>
        ) : null}
      </section>

      {isOwner ? (
        <section className="admin-panel" aria-labelledby="team-enroll-title">
          <div className="admin-panel__head">
            <div>
              <p className="admin-eyebrow">Single-use enrollment</p>
              <h3 id="team-enroll-title">Invite an administrator</h3>
            </div>
          </div>
          <p className="admin-muted">
            The invited person signs in with this exact verified email address,
            then accepts the link. LaunchLoom does not send the message
            automatically.
          </p>
          <form className="admin-form" onSubmit={submitEnrollment}>
            <label
              className="admin-field admin-field--wide"
              htmlFor="enroll-email"
            >
              Invitation email
              <input
                id="enroll-email"
                type="email"
                autoComplete="off"
                value={email}
                placeholder="admin@example.com"
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={creating || Boolean(created) || createUncertain}
              />
            </label>
            <div className="admin-form__actions">
              <button
                className="admin-button"
                type="submit"
                disabled={creating || Boolean(created) || createUncertain}
              >
                {creating ? "Creating link..." : "Create enrollment link"}
              </button>
              <span className="admin-muted">
                {created
                  ? "Copy or discard the current one-time link before creating another."
                  : "The link expires after 72 hours and can be used once."}
              </span>
            </div>
          </form>

          {createError ? (
            <div className="admin-inline-error" role="alert">
              <strong>Enrollment not confirmed</strong>
              <span>{createError}</span>
              {createUncertain ? (
                <button
                  className="admin-button admin-button--quiet"
                  type="button"
                  onClick={() => {
                    setCreateUncertain(false);
                    setCreateError(null);
                  }}
                >
                  I understand, allow another attempt
                </button>
              ) : null}
            </div>
          ) : null}

          {created ? (
            <div
              className="admin-invite-result"
              role="status"
              aria-labelledby="enroll-result-title"
            >
              <div className="admin-panel__head">
                <div>
                  <p className="admin-eyebrow">One-time result</p>
                  <h3 id="enroll-result-title">
                    Copy this enrollment link now
                  </h3>
                </div>
              </div>
              <p>
                This is the only time the link is shown. It is held in this
                browser tab only and is not saved to storage, analytics or logs.
                Send it privately to the invited email address.
              </p>
              <label
                className="admin-field admin-field--wide"
                htmlFor="enroll-link"
              >
                One-time enrollment link
                <input
                  id="enroll-link"
                  type="text"
                  readOnly
                  value={created.url}
                  onFocus={(event) => event.currentTarget.select()}
                  spellCheck={false}
                />
              </label>
              <p className="admin-muted">
                Bound to the invited email. Expires{" "}
                {formatTimestamp(created.expiresAt)}.
              </p>
              {confirmDiscard ? (
                <div
                  className="admin-confirm"
                  role="group"
                  aria-label="Confirm discard of un-copied enrollment link"
                >
                  <span>
                    This un-copied link will be lost permanently if you discard
                    it.
                  </span>
                  <div className="admin-form__actions">
                    <button
                      className="admin-button"
                      type="button"
                      onClick={dismissCreated}
                    >
                      Discard link
                    </button>
                    <button
                      className="admin-button admin-button--quiet"
                      type="button"
                      onClick={() => setConfirmDiscard(false)}
                    >
                      Keep link
                    </button>
                  </div>
                </div>
              ) : (
                <div className="admin-form__actions">
                  <button
                    className="admin-button"
                    type="button"
                    onClick={() => void copyLink()}
                  >
                    {copyState === "copied" ? "Copied" : "Copy link"}
                  </button>
                  {copyState === "manual" ? (
                    <button
                      className="admin-button admin-button--quiet"
                      type="button"
                      onClick={() => {
                        setCopyState("copied");
                        setCopyMessage(
                          "Marked as copied. This link is still not stored anywhere.",
                        );
                      }}
                    >
                      I copied this link
                    </button>
                  ) : null}
                  <button
                    className="admin-button admin-button--quiet"
                    type="button"
                    onClick={requestDismiss}
                  >
                    Create another link
                  </button>
                </div>
              )}
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
      ) : null}
    </div>
  );
}
