function isAccessLogin(location) {
  return /(?:^|\/)cdn-cgi\/access\/login(?:\/|\?|$)/iu.test(
    String(location || ""),
  );
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
 *   send?: (url: URL, init: RequestInit) => Promise<Response>,
 *   wait?: (milliseconds: number) => Promise<void>,
 *   now?: () => number,
 *   onAttempt?: (message: string) => void
 * }} input
 * @returns {Promise<{state: "ready" | "access-challenge", status: number}>}
 */
export async function waitForPagesPreview({
  url,
  timeoutSeconds = 600,
  intervalSeconds = 10,
  protectedPreview = false,
  send = fetch,
  wait = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = () => Date.now(),
  onAttempt = () => {},
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
      if (state === "ready") return { state, status: response.status };
      if (state === "access-challenge")
        return { state, status: response.status };
      if (state === "unsafe-public")
        throw new Error(
          `Protected Pages preview returned HTTP ${response.status} without an Access challenge. Refusing any client-content deployment.`,
        );
      lastFailure = `HTTP ${response.status}`;
    } catch (error) {
      if (
        error instanceof Error &&
        /without an Access challenge/iu.test(error.message)
      )
        throw error;
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    const remaining = Math.max(0, Math.ceil((deadline - now()) / 1_000));
    onAttempt(
      `Preview is not ready yet (attempt ${attempt}: ${lastFailure}). Retrying for up to ${remaining}s.`,
    );
    if (now() < deadline) await wait(intervalSeconds * 1_000);
  }
  throw new Error(
    `Cloudflare Pages preview did not become securely reachable within ${timeoutSeconds}s (${lastFailure}). No review email was sent.`,
  );
}
