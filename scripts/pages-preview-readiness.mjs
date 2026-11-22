function isAccessLogin(location) {
  return /(?:^|\/)cdn-cgi\/access\/login(?:\/|\?|$)/iu.test(
    String(location || ""),
  );
}

export function parseWaitForPagesPreviewArgs(argv = []) {
  const args = {};
  const valueFlags = new Set([
    "url",
    "timeout-seconds",
    "interval-seconds",
    "marker",
    "write-homepage-digest",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "");
    if (!token.startsWith("--"))
      throw new Error(`Unexpected argument: ${token || "<empty>"}`);
    const key = token.slice(2);
    if (key === "protected-preview") {
      const next = String(argv[index + 1] || "").toLowerCase();
      if (next === "true" || next === "false") {
        args[key] = next === "true";
        index += 1;
      } else args[key] = true;
      continue;
    }
    if (!valueFlags.has(key)) throw new Error(`Unknown option: ${token}`);
    const value = String(argv[index + 1] || "");
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${token}`);
    args[key] = value;
    index += 1;
  }
  return args;
}

/** @param {{status?: number, location?: string, protectedPreview?: boolean}} input */
export function classifyPagesPreviewResponse({
  status,
  location = "",
  protectedPreview = false,
} = {}) {
  const code = Number(status);
  if (code >= 200 && code < 300)
    return protectedPreview ? "unsafe-public" : "ready";
  if (
    protectedPreview &&
    ([401, 403].includes(code) ||
      (code >= 300 && code < 400 && isAccessLogin(location)))
  )
    return "access-challenge";
  return "retry";
}

/**
 * @param {{
 *   url: string,
 *   timeoutSeconds?: number,
 *   intervalSeconds?: number,
 *   protectedPreview?: boolean,
 *   marker?: string,
 *   send?: (url: URL, init: RequestInit) => Promise<Response>,
 *   wait?: (milliseconds: number) => Promise<void>,
 *   now?: () => number,
 *   onAttempt?: (message: string) => void
 *   onReadyHomepage?: (html: string) => void
 * }} input
 * @returns {Promise<{state: "ready" | "access-challenge", status: number}>}
 */
export async function waitForPagesPreview({
  url,
  timeoutSeconds = 600,
  intervalSeconds = 10,
  protectedPreview = false,
  marker = "",
  send = fetch,
  wait = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = () => Date.now(),
  onAttempt = () => {},
  onReadyHomepage,
} = {}) {
  const preview = String(url || "").trim();
  if (!preview) throw new Error("--url is required.");
  if (
    !Number.isInteger(timeoutSeconds) ||
    timeoutSeconds < 10 ||
    timeoutSeconds > 900
  )
    throw new Error("--timeout-seconds must be an integer from 10 to 900.");
  if (
    !Number.isInteger(intervalSeconds) ||
    intervalSeconds < 1 ||
    intervalSeconds > 60
  )
    throw new Error("--interval-seconds must be an integer from 1 to 60.");
  const parsed = new URL(preview);
  if (
    parsed.protocol !== "https:" ||
    !/^(?:[a-z0-9-]+\.)+[a-z0-9-]+\.pages\.dev$/iu.test(parsed.hostname)
  )
    throw new Error(
      "--url must be an HTTPS Cloudflare Pages preview hostname.",
    );

  const deadline = now() + timeoutSeconds * 1_000;
  let attempt = 0;
  let lastFailure = "not attempted";
  while (now() < deadline) {
    attempt += 1;
    try {
      const response = await send(parsed, {
        redirect: protectedPreview ? "manual" : "follow",
        signal: AbortSignal.timeout(15_000),
        headers: { "user-agent": "LaunchLoom-preview-readiness/1.0" },
      });
      const state = classifyPagesPreviewResponse({
        status: response.status,
        location: response.headers.get("location") || "",
        protectedPreview,
      });
      if (state === "ready") {
        if (!marker && !onReadyHomepage) return { state, status: response.status };
        const body = await response.text();
        if (body.includes(marker)) {
          onReadyHomepage?.(body);
          return { state, status: response.status };
        }
        lastFailure = "renderer marker missing";
      } else if (state === "access-challenge") {
        return { state, status: response.status };
      } else if (state === "unsafe-public") {
        throw new Error(
          `Protected Pages preview returned HTTP ${response.status} without an Access challenge. Refusing any client-content deployment.`,
        );
      } else {
        lastFailure = `HTTP ${response.status}`;
      }
    } catch (error) {
      if (
        error instanceof Error &&
        /without an Access challenge/iu.test(error.message)
      )
        throw error;
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    const remainingMs = Math.max(0, deadline - now());
    const remaining = Math.ceil(remainingMs / 1_000);
    onAttempt(
      `Preview is not ready yet (attempt ${attempt}: ${lastFailure}). Retrying for up to ${remaining}s.`,
    );
    if (remainingMs > 0) {
      const configuredMs = intervalSeconds * 1_000;
      const rampMs =
        attempt === 1
          ? Math.min(configuredMs, 2_000)
          : attempt === 2
            ? Math.min(configuredMs, 4_000)
            : configuredMs;
      await wait(Math.min(remainingMs, rampMs));
    }
  }
  throw new Error(
    `Cloudflare Pages preview did not become securely reachable within ${timeoutSeconds}s (${lastFailure}). No review email was sent.`,
  );
}
