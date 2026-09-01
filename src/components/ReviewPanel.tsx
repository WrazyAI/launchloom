import { useEffect, useState } from "react";
import type { FormEvent } from "react";

export default function ReviewPanel() {
  const [token, setToken] = useState("");
  const [comment, setComment] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState("");

  useEffect(() => setToken(new URLSearchParams(window.location.search).get("token") || ""), []);

  async function submitFeedback(event: FormEvent) {
    event.preventDefault();
    if (!token || !comment.trim() || !email.trim()) return;
    setState("Sending your note…");
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, comment, email, pageUrl: document.referrer || window.location.href }),
    });
    setState(response.ok ? "Added to the next revision." : "We couldn’t save that note. Please try again.");
    if (response.ok) setComment("");
  }

  async function approve() {
    if (!token || !window.confirm("Approve this exact preview for publishing?")) return;
    setState("Approving this version…");
    const response = await fetch("/api/approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await response.json().catch(() => ({}));
    setState(response.ok ? "Approved. Your site is publishing now." : data.error || "Approval failed. Please ask your LaunchLoom contact for a fresh link.");
  }

  if (!token) return <main className="review-shell"><p>This review link is missing its secure token.</p></main>;
  return <main className="review-shell"><div className="review-card"><span className="eyebrow">LaunchLoom review</span><h1>Make this site yours.</h1><p>Leave feedback in plain language. We’ll group your notes into one clean revision.</p><form onSubmit={submitFeedback}><label className="field">Your review email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="The email this preview was sent to" /></label><label className="field">What should change?<textarea required value={comment} onChange={(event) => setComment(event.target.value)} placeholder="For example: Use ‘same-day garage door repair’ in the headline and make the phone number more prominent." /></label><button className="button" type="submit">Send feedback</button></form><div className="review-divider" /><h2>Happy with this version?</h2><p>Approval publishes this exact preview. A newer revision will require a new approval link.</p><button className="button secondary" type="button" onClick={approve}>Approve & publish</button>{state && <p className="form-message success">{state}</p>}</div></main>;
}
