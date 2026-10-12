import {
  parseWaitForPagesPreviewArgs,
  waitForPagesPreview,
} from "./pages-preview-readiness.mjs";

const args = parseWaitForPagesPreviewArgs(process.argv.slice(2));
const protectedPreview = args["protected-preview"] === true;
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
