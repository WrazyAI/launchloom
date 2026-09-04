const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, index, all) =>
        index % 2 === 0
          ? [...pairs, [value.replace(/^--/, ""), all[index + 1]]]
          : pairs,
      [],
    ),
);

const preview = String(args.url || "").trim();
const timeoutSeconds = Number.parseInt(
  String(args["timeout-seconds"] || "600"),
  10,
);
const intervalSeconds = Number.parseInt(
  String(args["interval-seconds"] || "10"),
  10,
);

if (!preview) throw new Error("--url is required.");
if (
  !Number.isInteger(timeoutSeconds) ||
  timeoutSeconds < 10 ||
  timeoutSeconds > 900
) {
  throw new Error("--timeout-seconds must be an integer from 10 to 900.");
}
if (
  !Number.isInteger(intervalSeconds) ||
  intervalSeconds < 1 ||
  intervalSeconds > 60
) {
  throw new Error("--interval-seconds must be an integer from 1 to 60.");
}

const parsed = new URL(preview);
if (
  parsed.protocol !== "https:" ||
  !/^(?:[a-z0-9-]+\.)+[a-z0-9-]+\.pages\.dev$/i.test(parsed.hostname)
) {
  throw new Error("--url must be an HTTPS Cloudflare Pages preview hostname.");
}

const deadline = Date.now() + timeoutSeconds * 1_000;
let attempt = 0;
let lastFailure = "not attempted";

while (Date.now() < deadline) {
  attempt += 1;
  try {
    const response = await fetch(parsed, {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: { "user-agent": "LaunchLoom-preview-readiness/1.0" },
    });
    if (response.ok) {
      console.log(`preview_ready=${parsed.origin}`);
      process.exit(0);
    }
    lastFailure = `HTTP ${response.status}`;
  } catch (error) {
    lastFailure = error instanceof Error ? error.message : String(error);
  }

  const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1_000));
  console.log(
    `Preview is not securely reachable yet (attempt ${attempt}: ${lastFailure}). Retrying for up to ${remaining}s.`,
  );
  if (Date.now() < deadline) {
    await new Promise((resolve) =>
      setTimeout(resolve, intervalSeconds * 1_000),
    );
  }
}

throw new Error(
  `Cloudflare Pages preview did not become securely reachable within ${timeoutSeconds}s (${lastFailure}). No review email was sent.`,
);
