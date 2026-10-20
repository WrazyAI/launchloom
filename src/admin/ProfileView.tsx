import { useEffect, useRef, useState } from "react";
import type {
  AccessModePrincipal,
  AdminApi,
  NeonMember,
  WorkspacePrincipal,
} from "./api";
import { requestErrorMessage } from "./format";

function identityReference(id: string) {
  const separator = id.indexOf(":");
  const scheme = separator === -1 ? "" : id.slice(0, separator);
  const digest = separator === -1 ? id : id.slice(separator + 1);
  const prefix = scheme === "access" ? "access:" : "";
  return `${prefix}${digest.slice(0, 8)}`;
}

function initials(principal: AccessModePrincipal | NeonMember) {
  if (principal.authSource === "neon" && principal.initials)
    return principal.initials;
  const source = principal.displayName || principal.email.split("@")[0] || "";
  const letters = source
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/u);
  const value = letters
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
  return value || "LL";
}

const ROLE_LABEL = { owner: "Owner", admin: "Admin" } as const;

function NeonProfile({
  api,
  principal,
  onPrincipal,
}: {
  api: AdminApi;
  principal: NeonMember;
  onPrincipal: (value: NeonMember) => void;
}) {
  const [displayName, setDisplayName] = useState(principal.displayName);
  const [avatarKey, setAvatarKey] = useState(principal.avatarKey ?? "");
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    setDisplayName(principal.displayName);
    setAvatarKey(principal.avatarKey ?? "");
  }, [principal]);

  async function save(event: { preventDefault(): void }) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setSaveError(null);
    setSaveNotice(null);
    try {
      const updated = await api.updateProfile({
        displayName: displayName.trim(),
        avatarKey: avatarKey.trim() || null,
      });
      onPrincipal(updated);
      setSaveNotice(
        "Profile saved. Historical actor records keep their recorded names.",
      );
    } catch (failure) {
      setSaveError(requestErrorMessage(failure));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  async function signOut() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSigningOut(true);
    setSignOutError(null);
    try {
      await api.signOut();
      window.location.assign("/admin/login");
    } catch (failure) {
      setSignOutError(requestErrorMessage(failure));
    } finally {
      inFlight.current = false;
      setSigningOut(false);
    }
  }

  return (
    <section className="admin-panel" aria-labelledby="profile-title">
      <div className="admin-panel__head">
        <div className="admin-profile">
          <span className="admin-profile__avatar" aria-hidden="true">
            {initials(principal)}
          </span>
          <div>
            <p className="admin-eyebrow">Current account</p>
            <h3 id="profile-title">{principal.displayName}</h3>
          </div>
        </div>
        <span className="admin-status-pill">
          {principal.active ? "Active" : "Inactive"}
        </span>
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
          <dd>{ROLE_LABEL[principal.role]}</dd>
        </div>
        <div>
          <dt>Identity source</dt>
          <dd>Neon account</dd>
        </div>
      </dl>
      <p className="admin-muted">
        The verified email address is read-only in this release. Changing the
        account email or linking another identity provider is not self-service.
      </p>

      <form className="admin-form" onSubmit={save}>
        <label className="admin-field" htmlFor="profile-name">
          Display name
          <input
            id="profile-name"
            type="text"
            value={displayName}
            maxLength={100}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            disabled={saving}
          />
        </label>
        <label className="admin-field" htmlFor="profile-avatar">
          Avatar key (optional)
          <input
            id="profile-avatar"
            type="text"
            value={avatarKey}
            maxLength={64}
            placeholder="e.g. sage-circle"
            onChange={(event) => setAvatarKey(event.target.value)}
            disabled={saving}
          />
        </label>
        <div className="admin-form__actions">
          <button className="admin-button" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save profile"}
          </button>
          <button
            className="admin-button admin-button--quiet"
            type="button"
            onClick={() => void signOut()}
            disabled={saving || signingOut}
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
        <p className="admin-muted">
          Initials are used for the avatar. Approved avatar keys are lowercase
          letters, numbers and hyphens; no remote image is fetched.
        </p>
      </form>

      {saveNotice ? (
        <div className="admin-notice" role="status">
          {saveNotice}
        </div>
      ) : null}
      {saveError ? (
        <div className="admin-inline-error" role="alert">
          <strong>Profile not saved</strong>
          <span>{saveError}</span>
        </div>
      ) : null}
      {signOutError ? (
        <div className="admin-inline-error" role="alert">
          <strong>Sign-out failed</strong>
          <span>{signOutError}</span>
        </div>
      ) : null}
      <p className="admin-muted">
        All authorized admins see the same clients, invitations and generation
        records. Your display name does not change historical attribution.
      </p>
    </section>
  );
}

function AccessProfile({ principal }: { principal: AccessModePrincipal }) {
  return (
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
          Only this short reference is shown. Use it if support needs to trace
          this Access identity.
        </p>
      </details>
      <p className="admin-muted">
        Account editing, sign-in, password reset and sign-out are not part of
        this interim Access-mode surface. All authorized admins see the same
        clients, invitations and generation records.
      </p>
    </section>
  );
}

export function ProfileView({ api }: { api: AdminApi }) {
  const [principal, setPrincipal] = useState<WorkspacePrincipal | null>(null);
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

  const accessPrincipal =
    principal?.authSource === "cloudflare-access" ? principal : null;
  const neonPrincipal = principal?.authSource === "neon" ? principal : null;

  return (
    <div className="admin-stack" id="profile-view">
      {accessPrincipal ? (
        <div className="admin-notice" role="status">
          <strong>Persistent account profiles are not enabled yet.</strong>
          <span>
            This is the current verified Cloudflare Access identity. It is
            read-only and is not a stored member profile.
          </span>
        </div>
      ) : null}

      {loading ? (
        <div className="admin-skeleton" aria-label="Loading account identity">
          <span />
          <span />
        </div>
      ) : error ? (
        <div className="admin-error" role="alert">
          <strong>The verified account could not be loaded.</strong>
          <span>{error}</span>
          <button
            className="admin-button admin-button--quiet"
            type="button"
            onClick={() => setRefreshToken((token) => token + 1)}
          >
            Retry identity
          </button>
        </div>
      ) : accessPrincipal ? (
        <AccessProfile principal={accessPrincipal} />
      ) : neonPrincipal ? (
        <NeonProfile
          api={api}
          principal={neonPrincipal}
          onPrincipal={(value) => setPrincipal(value)}
        />
      ) : null}
    </div>
  );
}
