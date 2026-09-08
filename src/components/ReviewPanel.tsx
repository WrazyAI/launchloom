import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";

const apiBase = (import.meta.env.PUBLIC_LAUNCHLOOM_API_URL || "").replace(
  /\/$/,
  "",
);
type ReviewStage = "developer" | "client";
type ReviewClaims = { stage?: ReviewStage; reviewerEmail?: string };

function claimsFrom(token: string): ReviewClaims {
  try {
    return JSON.parse(
      atob(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")),
    ) as ReviewClaims;
  } catch {
    return {};
  }
}

export default function ReviewPanel() {
  const [token, setToken] = useState("");
  const [claims, setClaims] = useState<ReviewClaims>({});
  const [comment, setComment] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState("");

  useEffect(() => {
    const value =
      new URLSearchParams(window.location.search).get("token") || "";
    setToken(value);
    setClaims(claimsFrom(value));
  }, []);

  const isDeveloper = claims.stage === "developer";
  const isClient = claims.stage === "client";
  const invitedEmail = claims.reviewerEmail || "the invited reviewer";

  async function submitFeedback(
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault();
    if (!token || !comment.trim() || !email.trim()) return;
    setState("Sending your note…");
    const response = await fetch(`${apiBase}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        comment,
        email,
        pageUrl: window.location.href,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setState(
      response.ok
        ? isDeveloper
          ? "Feedback sent. A fresh internal preview will follow."
          : "Feedback received. We’ll review it before publishing an update."
        : data.error || "We couldn’t save that note. Please try again.",
    );
    if (response.ok) setComment("");
  }

  async function approve() {
    if (!token) return;
    if (
      !window.confirm("Approve this exact preview and send it to the client?")
    )
      return;
    setState("Approving this version…");
    const response = await fetch(`${apiBase}/api/approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        email: claims.reviewerEmail || "",
        pageUrl: window.location.href,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setState(
      response.ok
        ? "Approved. The production site and client review email are being sent now."
        : data.error ||
            "Approval failed. Please use the latest developer link.",
    );
  }

  if (!token || (!isDeveloper && !isClient))
    return (
      <main className="review-shell">
        <p>This review link is invalid or has expired.</p>
      </main>
    );
  return (
    <main className="review-shell">
      <div className="review-card">
        <span className="eyebrow">
          {isDeveloper ? "Internal developer review" : "Client website review"}
        </span>
        <h1>
          {isDeveloper
            ? "Check this before the client sees it."
            : "Tell us what you’d like changed."}
        </h1>
        <p>
          {isDeveloper
            ? "Approve this exact preview to publish it and invite the client. Or leave feedback for another internal revision."
            : "Leave feedback in plain language. We’ll review it internally before any update is published."}
        </p>
        <form onSubmit={submitFeedback}>
          <label className="field">
            {isDeveloper ? "Developer review email" : "Your review email"}
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={invitedEmail}
            />
          </label>
          <label className="field">
            What should change?
            <textarea
              required
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="For example: Make the main headline more direct and make the phone number more prominent."
            />
          </label>
          <button className="button" type="submit">
            Send feedback
          </button>
        </form>
        {isDeveloper && (
          <>
            <div className="review-divider" />
            <h2>Ready for the client?</h2>
            <p>
              Approval publishes this exact preview, then sends the client their
              production review link.
            </p>
            <button
              className="button secondary"
              type="button"
              onClick={approve}
            >
              Approve &amp; send to client
            </button>
          </>
        )}
        {state && <p className="form-message success">{state}</p>}
      </div>
    </main>
  );
}
