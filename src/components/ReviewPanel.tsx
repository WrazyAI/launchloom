import { useEffect, useState } from "react";
import ClientFeedbackForm from "./ClientFeedbackForm";
import type { ClientSubmitResult } from "./ClientFeedbackForm";
import FeedbackParts from "./FeedbackParts";
import type { FeedbackSubmitResult } from "./FeedbackParts";
import { FindingSeverityBadge } from "./FindingSeverityBadge";

const apiBase = (import.meta.env.PUBLIC_LAUNCHLOOM_API_URL || "").replace(
  /\/$/,
  "",
);
const reviewEmailPlaceholder = "your-email@domain.com";
type ReviewStage = "developer" | "client";
type ReviewClaims = {
  stage?: ReviewStage;
  reviewerEmail?: string;
  previewUrl?: string;
  creativeRepairSessionId?: string;
};
type RepairFinding = {
  category: string;
  severity: "critical" | "major" | "minor" | "info";
  evidence: string;
  recommendation?: string;
};
type RepairSession = {
  sessionId: string;
  status:
    "available" | "dispatching" | "queued" | "running" | "completed" | "failed";
  attemptConsumed: boolean;
  candidateId: string;
  repairAvailable: boolean;
  previewUrl: string | null;
  findings: RepairFinding[];
  resultPreviewUrl: string | null;
  resultReviewUrl: string | null;
  outcome: string | null;
  failure: string | null;
  humanDisposition: "accepted-with-feedback" | "override-publish" | null;
  reviewQueue?: "clear" | "revision_in_progress" | "revision_queue_halted";
};

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
  const [email, setEmail] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [state, setState] = useState("");
  const [sending, setSending] = useState(false);
  const [repair, setRepair] = useState<RepairSession | null>(null);
  const [repairLoading, setRepairLoading] = useState(false);

  useEffect(() => {
    const value =
      new URLSearchParams(window.location.search).get("token") || "";
    setToken(value);
    setClaims(claimsFrom(value));
    setPageUrl(window.location.href);
  }, []);

  const isDeveloper = claims.stage === "developer";
  const isClient = claims.stage === "client";
  const hasCreativeRepair = Boolean(claims.creativeRepairSessionId);
  const invitedEmail = claims.reviewerEmail || "the invited reviewer";

  async function refreshCreativeRepair() {
    if (!token || !claims.creativeRepairSessionId) return;
    const response = await fetch(`${apiBase}/api/creative-repair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        action: "status",
        pageUrl: window.location.href,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as RepairSession & {
      error?: string;
    };
    if (!response.ok)
      throw new Error(data.error || "The quality check status is unavailable.");
    setRepair(data);
  }

  useEffect(() => {
    if (!token || !claims.creativeRepairSessionId) return;
    let cancelled = false;
    setRepairLoading(true);
    void refreshCreativeRepair()
      .catch((error) => {
        if (!cancelled)
          setState(
            error instanceof Error
              ? error.message
              : "The quality check status is unavailable.",
          );
      })
      .finally(() => {
        if (!cancelled) setRepairLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, claims.creativeRepairSessionId]);

  useEffect(() => {
    if (
      !repair ||
      !["dispatching", "queued", "running"].includes(repair.status)
    )
      return undefined;
    const timer = window.setInterval(() => {
      void refreshCreativeRepair().catch((error) =>
        setState(
          error instanceof Error
            ? error.message
            : "We could not refresh the quality check.",
        ),
      );
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [token, claims.creativeRepairSessionId, repair?.status]);

  async function startFinalRepair() {
    if (!token || !repair || sending) return;
    if (email.trim().toLowerCase() !== invitedEmail.toLowerCase()) {
      setState("Enter the developer email that received this review link.");
      return;
    }
    setSending(true);
    setState("Asking for the final fix…");
    try {
      const response = await fetch(`${apiBase}/api/creative-repair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          action: "retry",
          email,
          pageUrl: window.location.href,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        status?: RepairSession["status"];
        attemptConsumed?: boolean;
      };
      if (!response.ok)
        throw new Error(data.error || "The final fix could not be started.");
      setRepair({
        ...repair,
        status: data.status || "queued",
        attemptConsumed: true,
        repairAvailable: false,
      });
      setState(
        "Queued. The site will be checked again before a new preview is shared.",
      );
    } catch (error) {
      setState(
        error instanceof Error
          ? error.message
          : "The final fix could not be started.",
      );
      void refreshCreativeRepair().catch(() => undefined);
    } finally {
      setSending(false);
    }
  }

  function feedbackSubmitted(result: FeedbackSubmitResult) {
    if (!result.ok) {
      setState(result.error || "We couldn’t save that note. Please try again.");
      return;
    }
    setState(
      result.queueStatus === "queued"
        ? "Queued. Your request will start after the current update."
        : hasCreativeRepair
          ? "Saved as the starting point. Your changes are being applied; the client has not received this version."
          : isDeveloper
            ? "Feedback sent. A fresh internal preview will follow."
            : "Feedback received. We’ll review it before publishing an update.",
    );
    if (hasCreativeRepair && repair)
      setRepair({
        ...repair,
        humanDisposition: "accepted-with-feedback",
        repairAvailable: false,
        reviewQueue: "revision_in_progress",
      });
  }

  function clientSubmitted(result: ClientSubmitResult) {
    if (!result.ok) {
      setState(result.error || "We couldn’t save that note. Please try again.");
      return;
    }
    setState(
      result.queueStatus === "queued"
        ? "Queued. Your request will start after the current update."
        : "Feedback received. We’ll review it before publishing an update.",
    );
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
            ? "Approve this exact preview to publish it and invite the client. Or send changes for another internal update."
            : "Request a small correction such as a logo, photo, color, contact detail, or wording change. You can upload a new image or create one."}
        </p>
        {hasCreativeRepair && (
          <section
            className="creative-repair-panel"
            aria-labelledby="creative-repair-title"
          >
            <div className="review-divider" />
            <h2 id="creative-repair-title">Quality check</h2>
            <p>
              This preview did not pass all of our automatic quality checks.
              Review the notes and send your changes, or ask for one final
              automatic fix. Nothing is sent to the client without your
              separate approval.
            </p>
            {repairLoading && <p role="status">Loading the quality notes…</p>}
            {repair && (
              <>
                {repair.previewUrl && (
                  <p>
                    <a
                      className="diagnostic-preview-link"
                      href={`${repair.previewUrl}${repair.previewUrl.includes("?") ? "&" : "?"}review=${encodeURIComponent(token)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open the internal preview
                      <svg
                        aria-hidden="true"
                        focusable="false"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path d="M7 17 17 7M8 7h9v9" />
                      </svg>
                    </a>
                    <span> (not for the client)</span>
                  </p>
                )}
                {repair.findings.length > 0 ? (
                  <ul className="creative-repair-findings">
                    {repair.findings.map((finding, index) => (
                      <li key={`${finding.category}-${index}`}>
                        <div className="creative-repair-finding-heading">
                          <strong>
                            {finding.category.replace(/[-_]/gu, " ")}
                          </strong>
                          <FindingSeverityBadge severity={finding.severity} />
                        </div>
                        <span>{finding.evidence}</span>
                        {finding.recommendation && (
                          <small>{finding.recommendation}</small>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    No detailed notes were available. The fix will use the
                    saved report.
                  </p>
                )}
                {isDeveloper && repair.previewUrl && (
                  <FeedbackParts
                    apiBase={apiBase}
                    endpoint={`${apiBase}/api/creative-repair`}
                    creative
                    token={token}
                    email={email}
                    onEmailChange={setEmail}
                    pageUrl={pageUrl}
                    submitLabel="Send these changes"
                    onSubmitted={feedbackSubmitted}
                  />
                )}
                {isDeveloper &&
                  repair.status === "available" &&
                  repair.repairAvailable &&
                  !repair.previewUrl && (
                    <label className="field">
                      Developer review email to request the final repair
                      <input
                        required
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder={reviewEmailPlaceholder}
                      />
                    </label>
                  )}
                {repair.status === "available" && repair.repairAvailable && (
                  <button
                    className="button"
                    type="button"
                    disabled={
                      sending ||
                      email.trim().toLowerCase() !== invitedEmail.toLowerCase()
                    }
                    onClick={startFinalRepair}
                  >
                    Fix the listed issues (one last try)
                  </button>
                )}
                {["dispatching", "queued", "running"].includes(
                  repair.status,
                ) && (
                  <p role="status">
                    The final fix is{" "}
                    {repair.status === "running" ? "running" : "queued"}. This
                    page will update when the checks finish.
                  </p>
                )}
                {repair.status === "completed" && (
                  <div role="status">
                    <p>
                      {repair.outcome === "passed"
                        ? "The final fix passed our checks. It is ready for you to review, not for the client yet."
                        : "The final fix finished, but some checks still need attention. We will not run another automatic fix."}
                    </p>
                    {repair.resultPreviewUrl && (
                      <p>
                        <a
                          href={repair.resultPreviewUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {repair.outcome === "passed"
                            ? "Open the updated preview"
                            : "Open the final internal preview"}
                        </a>
                      </p>
                    )}
                    {repair.resultReviewUrl && (
                      <p>
                        <a href={repair.resultReviewUrl}>
                          Open the updated review
                        </a>
                      </p>
                    )}
                  </div>
                )}
                {repair.status === "failed" && (
                  <p role="status">
                    The final fix did not finish:{" "}
                    {repair.failure ||
                      "It stopped before producing a result."}{" "}
                    You cannot retry it from this link.
                  </p>
                )}
              </>
            )}
          </section>
        )}
        {claims.previewUrl && !hasCreativeRepair && (
          <p>
            <a href={claims.previewUrl} target="_blank" rel="noreferrer">
              Open the reviewed website preview
            </a>
          </p>
        )}
        {!hasCreativeRepair &&
          (isDeveloper ? (
            <FeedbackParts
              apiBase={apiBase}
              endpoint={`${apiBase}/api/feedback`}
              token={token}
              email={email}
              onEmailChange={setEmail}
              pageUrl={pageUrl}
              submitLabel="Send feedback"
              onSubmitted={feedbackSubmitted}
            />
          ) : (
            <ClientFeedbackForm
              apiBase={apiBase}
              token={token}
              email={email}
              onEmailChange={setEmail}
              pageUrl={pageUrl}
              onSubmitted={clientSubmitted}
            />
          ))}
        {isDeveloper && !hasCreativeRepair && (
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
        {state && (
          <p className="form-message success" role="status">
            {state}
          </p>
        )}
      </div>
    </main>
  );
}
