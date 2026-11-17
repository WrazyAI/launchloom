import { useState } from "react";
import type { AttemptDetail } from "../lib/admin-contracts";
import { GenerationPreview, generationCaptureSrc } from "./GenerationPreview";

export function AttemptSitePreview({
  attempt,
  siteUrl,
  siteHref,
  focused,
  related,
}: {
  attempt: AttemptDetail;
  siteUrl: string | null;
  siteHref: string | null;
  focused: boolean;
  related: boolean;
}) {
  const [loaded, setLoaded] = useState<string | null>(null);
  const src = generationCaptureSrc(attempt);
  return (
    <section
      className="admin-attempt-view admin-capture"
      aria-labelledby="attempt-preview-title"
    >
      <header className="admin-view-heading">
        <p className="admin-view-kicker">Delivery evidence</p>
        <h3 id="attempt-preview-title">Site preview</h3>
        <p>
          {siteHref
            ? "Review the recorded capture here, or open the interactive site in a new tab."
            : "No interactive site link is recorded for this attempt."}
        </p>
      </header>
      <div className="admin-capture__actions">
        {siteHref ? (
          <a
            className="admin-button"
            href={siteHref}
            target="_blank"
            rel="noreferrer"
          >
            Visit site
          </a>
        ) : null}
        {src && loaded === src ? (
          <a
            className="admin-button admin-button--quiet"
            href={src}
            target="_blank"
            rel="noreferrer"
          >
            Open full-size capture
          </a>
        ) : null}
      </div>
      <figure className="admin-capture__figure">
        <div className="admin-browser">
          <div className="admin-browser__bar">
            <span className="admin-browser__dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="admin-capture__address">
              {siteUrl ? new URL(siteUrl).hostname : "Site capture"}
            </span>
            <span className="admin-capture__tag">Snapshot</span>
          </div>
          <div className="admin-browser__media">
            <GenerationPreview
              attempt={attempt}
              large
              onCaptureLoad={setLoaded}
            />
          </div>
        </div>
        <figcaption className="admin-sheet__notes">
          <strong>Generation screenshot.</strong>{" "}
          {focused
            ? "Captured for this attempt."
            : related
              ? "Issue capture, not this attempt's delivery."
              : "Issue capture; may predate later revisions."}
        </figcaption>
      </figure>
    </section>
  );
}
