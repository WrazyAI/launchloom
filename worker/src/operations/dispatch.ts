import type {
  DispatchDecision,
  DispatchOutcome,
  LeasedDispatch,
  OperationsStore,
} from "./contracts";
import { createOperationsStore, operationsDatabaseSql } from "./store";

type DispatchStore = Pick<OperationsStore, "leaseDispatch" | "recordDispatchResult">;
type Outcome = DispatchOutcome;
const MAX_RETRY_AFTER_SECONDS = 3600;

function boundedSeconds(value: number): number {
  return Math.min(MAX_RETRY_AFTER_SECONDS, Math.max(1, Math.trunc(value)));
}

/** Only a bounded integer is forwarded; malformed plugin input is ignored. */
function decision(value: Outcome | DispatchDecision): DispatchDecision {
  const valid = (outcome: string): outcome is Outcome =>
    ["accepted", "retryable", "unknown", "rejected"].includes(outcome);
  if (typeof value === "string") return { outcome: valid(value) ? value : "unknown" };
  if (!value || typeof value !== "object" || !valid(value.outcome))
    return { outcome: "unknown" };
  const result: DispatchDecision = { outcome: value.outcome };
  const retryAfterSeconds = value.retryAfterSeconds;
  if (
    typeof retryAfterSeconds === "number" &&
    Number.isSafeInteger(retryAfterSeconds) &&
    retryAfterSeconds >= 1
  )
    result.retryAfterSeconds = boundedSeconds(retryAfterSeconds);
  return result;

}
export type DispatchEnvironment = {
  OPERATIONS_DATABASE_URL?: string;
  OPERATIONS_DISPATCH_MODE?: string;
  OPERATIONS_CLAIM_GATE?: string;
  OPERATIONS_DISPATCH_REPOSITORY?: string;
  OPERATIONS_DISPATCH_WORKFLOW?: string;
  OPERATIONS_DISPATCH_REF?: string;
  GITHUB_ORG_TOKEN?: string;
};

/** Each SQL call commits before network I/O. A new instance resumes from DB state. */
export async function dispatchScheduled(deps: {
  store: DispatchStore;
  dispatch: (item: LeasedDispatch) => Promise<Outcome | DispatchDecision>;
  now?: () => number;
}): Promise<void> {
  const now = deps.now ?? Date.now;
  for (let i = 0; i < 10; i++) {
    const item = await deps.store.leaseDispatch(now());
    if (!item) return;
    let result: DispatchDecision;
    try {
      result = decision(await deps.dispatch(item));
    } catch {
      result = { outcome: "unknown" };
    }
    // If this fails, stop. The persisted gate decides whether an uncertain
    // outcome may be re-queued; it is never inferred from the HTTP response.
    await deps.store.recordDispatchResult(item.operationId, item.fence, {
      ...result,
      now: now(),
    });
  }
}

const HTTP_DATE_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;
const HTTP_DATE_MONTH_PATTERN = HTTP_DATE_MONTHS.join("|");
const HTTP_DATE_DAYS = "Mon|Tue|Wed|Thu|Fri|Sat|Sun";
const HTTP_DATE_LONG_DAYS =
  "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday";
const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const IMF_FIXDATE = new RegExp(
  `^(?:${HTTP_DATE_DAYS}), (?<day>0[1-9]|[12][0-9]|3[01]) (?<month>${HTTP_DATE_MONTH_PATTERN}) (?<year>[0-9]{4}) (?<hour>[01][0-9]|2[0-3]):(?<minute>[0-5][0-9]):(?<second>[0-5][0-9]) GMT$`,
  "u",
);
const RFC850_DATE = new RegExp(
  `^(?:${HTTP_DATE_LONG_DAYS}), (?<day>0[1-9]|[12][0-9]|3[01])-(?<month>${HTTP_DATE_MONTH_PATTERN})-(?<year>[0-9]{2}) (?<hour>[01][0-9]|2[0-3]):(?<minute>[0-5][0-9]):(?<second>[0-5][0-9]) GMT$`,
  "u",
);
const ASCTIME_DATE = new RegExp(
  `^(?:${HTTP_DATE_DAYS}) (?<month>${HTTP_DATE_MONTH_PATTERN}) (?<day> [0-9]|[0-9]{2}) (?<hour>[01][0-9]|2[0-3]):(?<minute>[0-5][0-9]):(?<second>[0-5][0-9]) (?<year>[0-9]{4})$`,
  "u",
);
const HTTP_DATE_FORMS = [
  { pattern: IMF_FIXDATE, twoDigitYear: false },
  { pattern: RFC850_DATE, twoDigitYear: true },
  { pattern: ASCTIME_DATE, twoDigitYear: false },
] as const;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function addUtcYears(milliseconds: number, years: number): number {
  const date = new Date(milliseconds);
  return Date.UTC(
    date.getUTCFullYear() + years,
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  );
}

/**
 * RFC 9110 5.6.7: an rfc850-date two-digit year that appears to be more than 50
 * years in the future means the most recent past year with those digits. The
 * window is compared on the full timestamp, not just the year, so a date one day
 * past the boundary already rolls back. A year from the current century that is
 * more than 50 years behind rolls forward: 00 in 2099 is 2100, not a stale 2000.
 */
function resolveTwoDigitYear(
  twoDigit: number,
  date: { month: number; day: number; hour: number; minute: number; second: number },
  nowMs: number,
): number {
  const currentYear = new Date(nowMs).getUTCFullYear();
  const candidate = Math.floor(currentYear / 100) * 100 + twoDigit;
  const at = (year: number) =>
    Date.UTC(year, date.month, date.day, date.hour, date.minute, date.second);
  if (at(candidate) > addUtcYears(nowMs, 50)) return candidate - 100;
  if (at(candidate) < addUtcYears(nowMs, -50)) return candidate + 100;
  return candidate;
}

/**
 * Retry-After dates must be one of the three HTTP-date forms. JavaScript's
 * Date.parse accepts ISO and prose-like dates and silently normalizes impossible
 * calendar days, so the components are matched and validated here instead. The
 * year is resolved before the calendar check so a rolled-over 29 February is
 * measured against the year that will actually be used.
 */
function httpDateMilliseconds(value: string, nowMs: number): number | undefined {
  for (const form of HTTP_DATE_FORMS) {
    const groups = form.pattern.exec(value)?.groups;
    if (!groups) continue;
    const { day, month, year, hour, minute, second } = groups;
    if (
      day === undefined || month === undefined || year === undefined ||
      hour === undefined || minute === undefined || second === undefined
    )
      continue;
    const monthIndex = HTTP_DATE_MONTHS.indexOf(
      month as (typeof HTTP_DATE_MONTHS)[number],
    );
    if (monthIndex < 0) return undefined;
    const dayOfMonth = Number(day.trim());
    const hours = Number(hour);
    const minutes = Number(minute);
    const seconds = Number(second);
    const fullYear = form.twoDigitYear
      ? resolveTwoDigitYear(Number(year), {
        month: monthIndex,
        day: dayOfMonth,
        hour: hours,
        minute: minutes,
        second: seconds,
      }, nowMs)
      : Number(year);
    // Date.UTC remaps years 0..99 to the 1900s, so require a real calendar year.
    if (!Number.isInteger(fullYear) || fullYear < 100 || fullYear > 9999)
      return undefined;
    const daysInMonth =
      monthIndex === 1 && isLeapYear(fullYear)
        ? 29
        : DAYS_PER_MONTH[monthIndex];
    if (dayOfMonth < 1 || dayOfMonth > daysInMonth) return undefined;
    return Date.UTC(fullYear, monthIndex, dayOfMonth, hours, minutes, seconds);
  }
  return undefined;
}

function retryAfterSeconds(
  value: string | null,
  nowMs: number,
): number | undefined {
  if (!value) return undefined;
  const text = value.trim();
  if (!text) return undefined;
  if (/^[0-9]{1,6}$/u.test(text)) {
    const seconds = Number(text);
    return seconds >= 1 ? boundedSeconds(seconds) : undefined;
  }
  const when = httpDateMilliseconds(text, nowMs);
  if (when === undefined) return undefined;
  const seconds = Math.ceil((when - nowMs) / 1000);
  return seconds >= 1 ? boundedSeconds(seconds) : undefined;
}

function resetSeconds(
  value: string | null,
  nowMs: number,
): number | undefined {
  if (!value || !/^[0-9]{1,12}$/u.test(value.trim())) return undefined;
  const seconds = Math.ceil(Number(value.trim()) - nowMs / 1000);
  return seconds >= 1 ? boundedSeconds(seconds) : undefined;
}

function zeroRemaining(value: string | null): boolean {
  if (value === null || !/^[0-9]+$/u.test(value.trim())) return false;
  return Number(value.trim()) === 0;
}

/**
 * Reads only documented delay headers. A valid retry-after is a rate-limit
 * signal on its own (secondary limits). x-ratelimit-reset is trusted only with a
 * numeric zero remaining count; GitHub sends a reset header on ordinary 403s
 * too. Empty/malformed values establish nothing and fall back to the persisted
 * exponential backoff. The longer valid delay wins.
 */
function rateLimitSignal(
  headers: Headers,
  nowMs: number,
  status: 403 | 429,
): { limited: boolean; delay?: number } {
  const retryAfter = retryAfterSeconds(headers.get("retry-after"), nowMs);
  const reset = resetSeconds(headers.get("x-ratelimit-reset"), nowMs);
  if (status === 429) {
    const delays = [retryAfter, reset].filter(
      (value): value is number => value !== undefined,
    );
    return {
      limited: true,
      ...(delays.length ? { delay: Math.max(...delays) } : {}),
    };
  }
  if (retryAfter !== undefined) {
    return {
      limited: true,
      delay: Math.max(retryAfter, reset ?? 0),
    };
  }
  if (zeroRemaining(headers.get("x-ratelimit-remaining")) && reset !== undefined) {
    return { limited: true, delay: reset };
  }
  return { limited: false };
}

export function githubDispatcher(
  target: { repository: string; workflow: string; ref: string; token: string },
  send: typeof fetch = fetch,
  clock: () => number = Date.now,
): (item: LeasedDispatch) => Promise<Outcome | DispatchDecision> {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/u.test(target.repository) ||
    [".", ".."].includes(target.repository.split("/")[1]) ||
    !/^[A-Za-z0-9_-]+\.ya?ml$/u.test(target.workflow) ||
    !target.ref || target.ref.length > 200 || /[\u0000-\u0020\u007f]/u.test(target.ref) || !target.token
  )
    throw new Error("Operations dispatch target is not configured.");
  return async (item) => {
    const response = await send(`https://api.github.com/repos/${target.repository}/actions/workflows/${target.workflow}/dispatches`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${target.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "LaunchLoom-Operations",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: target.ref,
        inputs: {
          operation_id: item.payload.operationId,
          request_id: item.payload.requestId,
          attempt_id: item.payload.attemptId,
        },
      }),
    });
    // Do not parse/log provider bodies. New APIs return run details with 200;
    // older 204 responses supply none. Neither grants execution ownership.
    const headers = response.headers;
    await response.body?.cancel();
    if (response.status === 200 || response.status === 204) return "accepted";
    if (response.status === 429) {
      const signal = rateLimitSignal(headers, clock(), 429);
      return signal.delay === undefined
        ? "retryable"
        : { outcome: "retryable", retryAfterSeconds: signal.delay };
    }
    if (response.status === 403) {
      const signal = rateLimitSignal(headers, clock(), 403);
      if (signal.limited) {
        return signal.delay === undefined
          ? "retryable"
          : { outcome: "retryable", retryAfterSeconds: signal.delay };
      }
    }
    // A plain 403 is an authorization failure, not a proven temporary limit.
    if ([400, 401, 403, 404, 422].includes(response.status)) return "rejected";
    // Even a server error can follow acceptance. Only the persisted gate may
    // decide whether an uncertain result is safely replayable.
    return "unknown";
  };
}

export async function scheduledOperations(env: DispatchEnvironment): Promise<void> {
  // Both explicit opt-ins are required. Task 4 must prove the pre-side-effect
  // authenticated claim gate before an operator may enable either setting.
  if (env.OPERATIONS_DISPATCH_MODE !== "claim-gated-v1" || env.OPERATIONS_CLAIM_GATE !== "verified-v1") return;
  if (!env.OPERATIONS_DATABASE_URL) throw new Error("Operations dispatch storage is not configured.");
  const dispatch = githubDispatcher({
    repository: env.OPERATIONS_DISPATCH_REPOSITORY ?? "",
    workflow: env.OPERATIONS_DISPATCH_WORKFLOW ?? "",
    ref: env.OPERATIONS_DISPATCH_REF ?? "",
    token: env.GITHUB_ORG_TOKEN ?? "",
  });
  await dispatchScheduled({
    // Both flags above prove the operator has enabled the verified claim gate.
    // Uncertain dispatch may replay only then: a duplicate GitHub run exits
    // before side effects unless it wins the atomic claim election.
    store: createOperationsStore(operationsDatabaseSql(env.OPERATIONS_DATABASE_URL), {
      uncertainDispatchRetry: true,
    }),
    dispatch,
  });
}
