/** Read-only Resend evidence. Delivery means receiving mail-server acceptance, not inbox placement. */
import { writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function validateRequests(input, now = Date.now()) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 2)
    throw new Error("invalid_requests");
  const projects = new Set(),
    names = new Set();
  for (const row of input) {
    if (
      !row ||
      typeof row !== "object" ||
      Object.keys(row).some(
        (key) =>
          ![
            "project",
            "testName",
            "submittedAt",
            "repo",
            "commit",
            "origin",
          ].includes(key),
      )
    )
      throw new Error("invalid_request");
    if (
      typeof row.project !== "string" ||
      !/^launchloom-[1-9]\d{0,9}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.project) ||
      row.project.length > 80
    )
      throw new Error("invalid_project");
    const prefix = `[LaunchLoom QA] ${row.project} `;
    if (
      typeof row.testName !== "string" ||
      row.testName.length > 160 ||
      !row.testName.startsWith(prefix) ||
      !/^[A-Za-z0-9_-]{8,40}$/.test(row.testName.slice(prefix.length))
    )
      throw new Error("invalid_qa_name");
    const time = Date.parse(row.submittedAt);
    if (
      typeof row.submittedAt !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(row.submittedAt) ||
      !Number.isFinite(time) ||
      time > now ||
      now - time > 24 * 60 * 60 * 1000
    )
      throw new Error("invalid_submission_time");
    if (row.repo !== undefined && row.repo !== `WrazyAI/${row.project}`)
      throw new Error("invalid_repo");
    if (
      row.commit !== undefined &&
      (typeof row.commit !== "string" || !/^[a-f0-9]{40}$/.test(row.commit))
    )
      throw new Error("invalid_commit");
    if (
      row.origin !== undefined &&
      row.origin !== `https://${row.project}.pages.dev`
    )
      throw new Error("invalid_origin");
    if (projects.has(row.project) || names.has(row.testName))
      throw new Error("duplicate_request");
    projects.add(row.project);
    names.add(row.testName);
  }
  return input;
}
function matches(email, row, recipient, now) {
  const created = Date.parse(email?.created_at);
  return (
    ID.test(email?.id) &&
    email.subject === `New website lead: ${row.testName}` &&
    Array.isArray(email.to) &&
    email.to.length === 1 &&
    email.to[0] === recipient &&
    (!email.cc || (Array.isArray(email.cc) && email.cc.length === 0)) &&
    (!email.bcc || (Array.isArray(email.bcc) && email.bcc.length === 0)) &&
    Number.isFinite(created) &&
    created >= Date.parse(row.submittedAt) &&
    created <= now + 30_000
  );
}
function bodyMatches(email, row) {
  // Existing renderer emits plain text. Missing text fails closed; HTML is never logged.
  if (typeof email.text !== "string") return false;
  const lines = email.text.replace(/\r\n/g, "\n").split("\n");
  return (
    lines.includes(`New enquiry for ${row.project}`) &&
    lines.includes(`Name: ${row.testName}`)
  );
}
/**
 * @param {unknown} input
 * @param {{recipient?: string, apiKey?: string, fetchImpl?: (url: string, options: RequestInit) => Promise<Response>, now?: () => number, pause?: (ms: number) => Promise<void>, budgetMs?: number, heartbeat?: (value: object) => void}} options
 */
export async function verifyDelivery(
  input,
  {
    recipient,
    apiKey,
    fetchImpl = fetch,
    now = Date.now,
    pause = sleep,
    budgetMs = 120_000,
    heartbeat = () => {},
  } = {},
) {
  const rows = validateRequests(input, now());
  if (
    typeof recipient !== "string" ||
    !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(recipient) ||
    !apiKey
  )
    throw new Error("missing_secure_configuration");
  if (!Number.isFinite(budgetMs) || budgetMs < 0 || budgetMs > 120_000)
    throw new Error("invalid_budget");
  const deadline = now() + budgetMs;
  let nextCall = now(),
    retryUntil = 0;
  const results = rows.map((row) => ({
    project: row.project,
    outcome: "not_verified",
    reason: "no_matching_email",
    source: "resend_get_email",
    scope: "receiving_provider_delivery_only",
  }));
  async function get(path) {
    const wait = Math.max(0, nextCall - now(), retryUntil - now());
    if (wait && now() + wait >= deadline)
      throw new Error("poll_budget_exhausted");
    if (wait) await pause(wait);
    nextCall = now() + (budgetMs ? 600 : 0);
    let response;
    try {
      response = await fetchImpl(`https://api.resend.com${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        redirect: "error",
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(10_000, budgetMs ? deadline - now() : 10_000)),
        ),
      });
    } catch {
      throw new Error("provider_unavailable");
    }
    if (response.status === 429) {
      const value = response.headers.get("retry-after");
      const seconds =
        value && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
      const delay =
        seconds === null
          ? Math.max(1000, Date.parse(value) - now() || 10_000)
          : seconds * 1000;
      retryUntil = now() + Math.max(1000, delay);
      throw new Error("provider_rate_limited");
    }
    if (!response.ok)
      throw new Error(
        [401, 403].includes(response.status)
          ? "provider_read_access_denied"
          : response.status === 404
            ? "provider_not_found"
            : "provider_unavailable",
      );
    try {
      return await response.json();
    } catch {
      throw new Error("invalid_provider_response");
    }
  }
  do {
    try {
      const records = [],
        seen = new Set();
      let after = "",
        complete = false;
      // Bounded pagination must finish before uniqueness can be asserted.
      for (let page = 0; page < 3; page++) {
        const list = await get(
          `/emails?limit=100${after ? `&after=${after}` : ""}`,
        );
        if (!Array.isArray(list.data) || typeof list.has_more !== "boolean")
          throw new Error("invalid_provider_response");
        for (const email of list.data) {
          if (!ID.test(email?.id) || seen.has(email.id))
            throw new Error("invalid_provider_response");
          seen.add(email.id);
          records.push(email);
        }
        if (!list.has_more) {
          complete = true;
          break;
        }
        after = list.data.at(-1)?.id;
        if (!after) throw new Error("invalid_provider_response");
      }
      if (!complete) throw new Error("listing_scope_incomplete");
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index],
          result = results[index];
        const found = records.filter((email) =>
          matches(email, row, recipient, now()),
        );
        result.outcome = "not_verified";
        result.reason =
          found.length > 1 ? "ambiguous_match" : "no_matching_email";
        delete result.providerId;
        delete result.providerEvent;
        delete result.createdAt;
        if (found.length !== 1) continue;
        const detail = await get(`/emails/${found[0].id}`);
        if (
          detail.id !== found[0].id ||
          !matches(detail, row, recipient, now()) ||
          !bodyMatches(detail, row)
        ) {
          result.reason = "detail_correlation_mismatch";
          continue;
        }
        result.providerId = detail.id;
        result.createdAt = new Date(
          Date.parse(detail.created_at),
        ).toISOString();
        const event = detail.last_event;
        const known = [
          "delivered",
          "opened",
          "clicked",
          "queued",
          "sent",
          "delivery_delayed",
          "bounced",
          "failed",
          "suppressed",
        ];
        result.providerEvent = known.includes(event) ? event : "unknown";
        result.outcome = ["delivered", "opened", "clicked"].includes(event)
          ? "delivered"
          : ["bounced", "failed", "suppressed"].includes(event)
            ? "failed"
            : "not_verified";
        result.reason =
          result.outcome === "delivered"
            ? "receiving_provider_accepted"
            : result.outcome === "failed"
              ? "provider_terminal_failure"
              : "no_delivery_event";
      }
    } catch (error) {
      for (const result of results) {
        result.outcome = "not_verified";
        result.reason = error.message;
        delete result.providerId;
        delete result.providerEvent;
        delete result.createdAt;
      }
      if (
        [
          "provider_read_access_denied",
          "invalid_provider_response",
          "listing_scope_incomplete",
        ].includes(error.message)
      )
        break;
    }
    heartbeat({
      checkedAt: new Date(now()).toISOString(),
      outcomes: results.map(({ project, outcome, reason }) => ({
        project,
        outcome,
        reason,
      })),
    });
    if (
      results.every((result) =>
        ["delivered", "failed"].includes(result.outcome),
      ) ||
      now() >= deadline
    )
      break;
    await pause(Math.min(10_000, deadline - now()));
  } while (now() < deadline);
  return {
    checkedAt: new Date(now()).toISOString(),
    evidenceBoundary:
      "Receiving provider acceptance only; inbox placement and human reading are unverified. No emails sent by this checker.",
    results,
  };
}
async function main() {
  let report;
  try {
    report = await verifyDelivery(
      JSON.parse(process.env.QA_REQUESTS_JSON || ""),
      {
        recipient: process.env.LAUNCHLOOM_INTERNAL_QA_RECIPIENT,
        apiKey: process.env.RESEND_API_KEY,
        heartbeat: (value) => console.log(JSON.stringify(value)),
      },
    );
  } catch {
    report = {
      results: [],
      outcome: "not_verified",
      reason: "invalid_input_or_secure_configuration",
    };
  }
  await mkdir("artifacts/internal-qa-delivery", { recursive: true });
  await writeFile(
    "artifacts/internal-qa-delivery/evidence.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
  if (
    !report.results.length ||
    report.results.some((result) => result.outcome !== "delivered")
  )
    process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
