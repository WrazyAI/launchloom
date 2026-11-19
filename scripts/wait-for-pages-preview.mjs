import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import {
  parseWaitForPagesPreviewArgs,
  waitForPagesPreview,
} from "./pages-preview-readiness.mjs";

const args = parseWaitForPagesPreviewArgs(process.argv.slice(2));
const protectedPreview = args["protected-preview"] === true;
let homepageDigest;
const result = await waitForPagesPreview({
  url: args.url,
  timeoutSeconds: Number.parseInt(String(args["timeout-seconds"] || "600"), 10),
  intervalSeconds: Number.parseInt(
    String(args["interval-seconds"] || "10"),
    10,
  ),
  protectedPreview,
  marker: String(args.marker || ""),
  onReadyHomepage: args["write-homepage-digest"]
    ? (html) => {
        homepageDigest = createHash("sha256").update(html).digest("hex");
      }
    : undefined,
  onAttempt: (message) => console.log(message),
});
if (homepageDigest) {
  try {
    await writeFile(String(args["write-homepage-digest"]), homepageDigest, {
      mode: 0o600,
    });
  } catch {
    console.warn("Could not save preview homepage digest.");
  }
}
console.log(
  result.state === "access-challenge"
    ? `preview_access_challenge=${result.status}`
    : `preview_ready=${new URL(args.url).origin}`,
);
