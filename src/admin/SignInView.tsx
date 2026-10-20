import { useEffect, useRef, useState } from "react";
import type { AdminApi } from "./api";
import { requestErrorMessage } from "./format";

const DEFAULT_RETURN_PATH = "/admin/onboarding-invites";
const MAX_RETURN_LENGTH = 2_048;
const MAX_TOKEN_LENGTH = 200;
const ENROLLMENT_TOKEN = /^[A-Za-z0-9_-]{20,200}$/u;

type Stage =
  | "checking"
  | "form"
  | "accepting"
  | "uncertain"
  | "mismatch"
  | "used"
  | "expired"
  | "failed";

function safeReturnPath(value: string | null): string {
  if (!value || value.length > MAX_RETURN_LENGTH) return DEFAULT_RETURN_PATH;
  if (!value.startsWith("/admin/") || value.startsWith("//"))
    return DEFAULT_RETURN_PATH;
  if (/[\u0000-\u001f\u007f\\#]/u.test(value)) return DEFAULT_RETURN_PATH;
  try {
    const url = new URL(value, "https://admin.invalid");
    if (url.origin !== "https://admin.invalid") return DEFAULT_RETURN_PATH;
    if (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/"))
      return DEFAULT_RETURN_PATH;
    return `${url.pathname}${url.search}`;
  } catch {
    return DEFAULT_RETURN_PATH;
  }
}

function safeToken(value: string | null): string | null {
  if (!value || value.length > MAX_TOKEN_LENGTH) return null;
  return ENROLLMENT_TOKEN.test(value) ? value : null;
}

/**
 * Read the enrollment bearer once, then remove it from the visible address and
 * current history entry. It is never written to storage, logs or analytics.
 */
function readAndScrubEnrollment(): { token: string | null; returnTo: string } {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/u, ""));
  const token =
    safeToken(hash.get("enroll")) ||
    safeToken(hash.get("enrollment")) ||
    safeToken(url.searchParams.get("enrollment"));
  const returnTo = safeReturnPath(
    url.searchParams.get("returnTo") || hash.get("returnTo"),
  );
  if (hash.has("enroll") || hash.has("enrollment") || hash.has("returnTo"))
    url.hash = "";
  url.searchParams.delete("enrollment");
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}`,
  );
  return { token, returnTo };
}

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

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null
    ? (error as { code?: unknown }).code
    : undefined;
}

function errorStatus(error: unknown) {
  return typeof error === "object" && error !== null
    ? (error as { status?: unknown }).status
    : undefined;
}

export function SignInView({ api }: { api: AdminApi }) {
  const [stage, setStage] = useState<Stage>("checking");
  const [token, setToken] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState(DEFAULT_RETURN_PATH);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkingAgain, setCheckingAgain] = useState(false);
  const inFlight = useRef(false);
  const loginRequest = useRef(0);
  const returnToRef = useRef(DEFAULT_RETURN_PATH);
  const capturedRef = useRef<{ token: string | null; returnTo: string } | null>(
    null,
  );

  useEffect(() => {
    document.title = "Sign in | LaunchLoom";
  }, []);

  function goToWorkspace() {
    window.location.assign(returnToRef.current);
  }

  async function claimEnrollment(value: string) {
    setStage("accepting");
    setError(null);
    try {
      await api.acceptEnrollment(value);
      goToWorkspace();
    } catch (failure) {
      if (isAmbiguous(failure)) {
        setStage("uncertain");
        setError(
          "The invitation could not be confirmed. It may already be claimed. Do not retry blindly: open the workspace or ask an owner to check membership.",
        );
        return;
      }
      const code = errorCode(failure);
      if (code === "email_mismatch") {
        setStage("mismatch");
        setError(
          "This invitation belongs to a different verified email. Sign in with the address that received it.",
        );
        return;
      }
      if (code === "enrollment_used" || errorStatus(failure) === 409) {
        setStage("used");
        setError(
          "This invitation has already been used. Ask an owner for a new one.",
        );
        return;
      }
      if (code === "expired" || errorStatus(failure) === 410) {
        setStage("expired");
        setError("This invitation has expired. Ask an owner for a new one.");
        return;
      }
      setStage("failed");
      setError(requestErrorMessage(failure));
    }
  }

  async function checkExistingSession(value: string | null) {
    const requestId = ++loginRequest.current;
    setStage("checking");
    setError(null);
    try {
      await api.getMe();
      if (loginRequest.current !== requestId) return;
      if (value) await claimEnrollment(value);
      else goToWorkspace();
    } catch (failure) {
      if (loginRequest.current !== requestId) return;
      setStage("form");
      if (errorStatus(failure) !== 401)
        setNotice(
          "This browser is signed in, but the account could not open the workspace. Sign in with an authorized account or retry the session check.",
        );
    }
  }

  useEffect(() => {
    const captured = capturedRef.current ?? readAndScrubEnrollment();
    capturedRef.current = captured;
    returnToRef.current = captured.returnTo;
    setToken(captured.token);
    setReturnTo(captured.returnTo);
    void checkExistingSession(captured.token);
    // The enrollment bearer is read exactly once for this page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitSignIn(event: { preventDefault(): void }) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.signIn(email, password);
      if (result.user && result.user.emailVerified !== true) {
        setError(
          "Verify your email before signing in. Check your inbox for the verification message.",
        );
        return;
      }
      setPassword("");
      if (token) await claimEnrollment(token);
      else goToWorkspace();
    } catch (failure) {
      if (isAmbiguous(failure)) {
        setError(
          "Sign-in could not be confirmed. Your entries were kept. Check the connection before trying again.",
        );
      } else {
        setError(requestErrorMessage(failure));
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  async function submitReset(event: { preventDefault(): void }) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await api.requestPasswordReset(email);
      setResetSent(true);
      setNotice(
        "If that email has an account, a password reset message is on its way. Return to sign in once you have a new password.",
      );
    } catch (failure) {
      setResetSent(false);
      setError(requestErrorMessage(failure));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  async function tryDifferentAccount() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await api.signOut();
      setStage("form");
      setEmail("");
      setPassword("");
      setNotice(
        "Sign in with the verified email address that received the invitation. The invitation is still held in this tab only.",
      );
    } catch (failure) {
      setError(requestErrorMessage(failure));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  function resetSessionCheck() {
    if (checkingAgain) return;
    setCheckingAgain(true);
    setNotice(null);
    void checkExistingSession(token).finally(() => setCheckingAgain(false));
  }

  const accepting = stage === "accepting";
  const blocked =
    stage === "uncertain" || stage === "used" || stage === "expired";

  return (
    <main className="admin-auth">
      <div className="admin-auth__card">
        <p className="admin-eyebrow">LaunchLoom</p>
        <h1>Sign in to operations</h1>
        <p>
          Use your approved LaunchLoom admin account. Membership is checked on
          every request.
        </p>

        {token ? (
          <div className="admin-notice" role="status">
            <strong>Invitation ready to accept</strong>
            <span>
              Sign in with the email address that received this invitation. The
              link was removed from the browser address before this form was
              shown and is held in this tab only.
            </span>
          </div>
        ) : null}

        {stage === "checking" ? (
          <div className="admin-skeleton" aria-label="Checking your session">
            <span />
            <span />
          </div>
        ) : null}

        {stage === "accepting" ? (
          <div className="admin-notice" role="status">
            <strong>Accepting your invitation</strong>
            <span>
              Keep this tab open while LaunchLoom verifies the invitation and
              your verified email.
            </span>
          </div>
        ) : null}

        {notice ? (
          <div className="admin-notice" role="status">
            <span>{notice}</span>
          </div>
        ) : null}

        {error ? (
          <div className="admin-inline-error" role="alert">
            <strong>
              {stage === "uncertain"
                ? "Invitation not confirmed"
                : stage === "mismatch"
                  ? "Different email address"
                  : stage === "used"
                    ? "Invitation already used"
                    : stage === "expired"
                      ? "Invitation expired"
                      : "Sign-in failed"}
            </strong>
            <span>{error}</span>
          </div>
        ) : null}

        {stage === "uncertain" ? (
          <div className="admin-form__actions">
            <a className="admin-button" href={returnTo}>
              Open workspace
            </a>
            <span className="admin-muted">
              Do not open the invitation link again. Ask an owner to verify
              membership before another invitation is issued.
            </span>
          </div>
        ) : null}

        {stage === "mismatch" ? (
          <div className="admin-form__actions">
            <button
              className="admin-button"
              type="button"
              onClick={() => void tryDifferentAccount()}
              disabled={submitting}
            >
              Try a different account
            </button>
            <a className="admin-link-button" href={returnTo}>
              Continue to workspace
            </a>
          </div>
        ) : null}

        {!accepting &&
        !blocked &&
        stage !== "checking" &&
        stage !== "mismatch" ? (
          resetMode ? (
            <form className="admin-form" onSubmit={submitReset}>
              <label
                className="admin-field admin-field--wide"
                htmlFor="reset-email"
              >
                Email address
                <input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  disabled={submitting}
                />
              </label>
              <div className="admin-form__actions">
                <button
                  className="admin-button"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? "Sending..." : "Send reset link"}
                </button>
                <button
                  className="admin-link-button"
                  type="button"
                  onClick={() => {
                    setResetMode(false);
                    setResetSent(false);
                    setNotice(null);
                    setError(null);
                  }}
                  disabled={submitting}
                >
                  Back to sign in
                </button>
              </div>
              <p className="admin-muted">
                Password reset uses the email address on the account. This form
                never reveals whether an address has an account.
              </p>
            </form>
          ) : (
            <form className="admin-form" onSubmit={submitSignIn}>
              <label
                className="admin-field admin-field--wide"
                htmlFor="signin-email"
              >
                Email address
                <input
                  id="signin-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  disabled={submitting}
                />
              </label>
              <label
                className="admin-field admin-field--wide"
                htmlFor="signin-password"
              >
                Password
                <input
                  id="signin-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  disabled={submitting}
                />
              </label>
              <div className="admin-form__actions">
                <button
                  className="admin-button"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? "Signing in..." : "Sign in"}
                </button>
                <button
                  className="admin-link-button"
                  type="button"
                  onClick={() => {
                    setResetMode(true);
                    setResetSent(false);
                    setNotice(null);
                    setError(null);
                  }}
                  disabled={submitting}
                >
                  Forgot your password?
                </button>
              </div>
              {resetSent ? (
                <p className="admin-muted" role="status">
                  A reset message was requested. No other account detail is
                  shown here.
                </p>
              ) : null}
              <p className="admin-auth__note">
                Google sign-in is not available yet. Email and password are the
                supported sign-in method for this workspace.
              </p>
            </form>
          )
        ) : null}

        {stage === "form" ? (
          <p className="admin-muted">
            <button
              className="admin-link-button"
              type="button"
              onClick={resetSessionCheck}
              disabled={checkingAgain}
            >
              {checkingAgain ? "Checking session..." : "Check session again"}
            </button>
          </p>
        ) : null}
      </div>
    </main>
  );
}
