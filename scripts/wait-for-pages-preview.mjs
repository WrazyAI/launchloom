import { waitForPagesPreview } from "./pages-preview-readiness.mjs";

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

const protectedPreview = Object.hasOwn(args, "protected-preview");
const result = await waitForPagesPreview({
  url: args.url,
  timeoutSeconds: Number.parseInt(String(args["timeout-seconds"] || "600"), 10),
  intervalSeconds: Number.parseInt(String(args["interval-seconds"] || "10"), 10),
  protectedPreview,
  onAttempt: (message) => console.log(message),
});
console.log(
  result.state === "access-challenge"
    ? `preview_access_challenge=${result.status}`
    : `preview_ready=${new URL(args.url).origin}`,
);
