import { useEffect, useRef, useState } from "react";
import type { AccessModePrincipal, AdminApi } from "./api";
import { requestErrorMessage } from "./format";

function identityReference(id: string) {
  const separator = id.indexOf(":");
  const scheme = separator === -1 ? "" : id.slice(0, separator);
  const digest = separator === -1 ? id : id.slice(separator + 1);
  const prefix = scheme === "access" ? "access:" : "";
  return `${prefix}${digest.slice(0, 8)}`;
}

function initials(principal: AccessModePrincipal) {
  const source = principal.displayName || principal.email.split("@")[0] || "";
  const letters = source.replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/u);
  const value = letters
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
  return value || "LL";
}

export function ProfileView({ api }: { api: AdminApi }) {
  const [principal, setPrincipal] = useState<AccessModePrincipal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    const requestId = ++request.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .getMe({ signal: controller.signal })
      .then((value) => {
        if (request.current !== requestId) return;
        setPrincipal(value);
        setLoading(false);
      })
      .catch((failure) => {
        if (controller.signal.aborted || request.current !== requestId) return;
        setPrincipal(null);
        setError(requestErrorMessage(failure));
        setLoading(false);
      });
    return () => controller.abort();
  }, [api, refreshToken]);

  return (
    <div className="admin-stack" id="profile-view">
      <div className="admin-notice" role="status">
        <strong>Persistent account profiles are not enabled yet.</strong>
        <span>
          This is the current verified Cloudflare Access identity. It is
          read-only and is not a stored member profile.
        </span>
      </div>

      {loading ? (
        <div className="admin-skeleton" aria-label="Loading Access identity">
          <span />
          <span />
        </div>
      ) : error ? (
        <div className="admin-error" role="alert">
          <strong>The verified Access identity could not be loaded.</strong>
          <span>{error}</span>
          <button
            className="admin-button admin-button--quiet"
            type="button"
            onClick={() => setRefreshToken((token) => token + 1)}
          >
            Retry identity
          </button>
        </div>
      ) : principal ? (
        <section className="admin-panel" aria-labelledby="profile-title">
          <div className="admin-panel__head">
            <div className="admin-profile">
              <span className="admin-profile__avatar" aria-hidden="true">
                {initials(principal)}
              </span>
              <div>
                <p className="admin-eyebrow">Current Access identity</p>
                <h3 id="profile-title">
                  {principal.displayName || "Name not recorded"}
                </h3>
              </div>
            </div>
          </div>
          <dl className="admin-facts">
            <div>
              <dt>Email address</dt>
              <dd>
                <label className="admin-visually-hidden" htmlFor="profile-email">
                  Verified email address (read-only)
                </label>
                <input
                  id="profile-email"
                  className="admin-readonly"
                  type="email"
                  value={principal.email}
                  readOnly
                  spellCheck={false}
                />
              </dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>Administrator</dd>
            </div>
            <div>
              <dt>Identity source</dt>
              <dd>Cloudflare Access</dd>
            </div>
          </dl>
          <details className="admin-facts__details">
            <summary>Technical reference</summary>
            <p className="admin-facts__reference">
              <span>Identity reference</span>
              <code data-identity-reference>{identityReference(principal.id)}</code>
            </p>
            <p>
              Only this short reference is shown. Use it if support needs to
              trace this Access identity.
            </p>
          </details>
          <p className="admin-muted">
            Account editing, sign-in, password reset and sign-out are not part of
            this interim Access-mode surface. All authorized admins see the same
            clients, invitations and generation records.
          </p>
        </section>
      ) : null}
    </div>
  );
}
