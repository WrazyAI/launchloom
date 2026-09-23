import { createHmac } from "node:crypto";

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
const secret = process.env.REVIEW_SIGNING_SECRET;
if (!secret) throw new Error("REVIEW_SIGNING_SECRET is required.");
const stage =
  args.stage === "developer" || args.stage === "client" ? args.stage : "";
if (!stage) throw new Error("--stage must be developer or client.");
const reviewerEmail = String(args.email || "")
  .trim()
  .toLowerCase();
const clientEmail = String(args["client-email"] || "")
  .trim()
  .toLowerCase();
const creativeRepairSessionId = String(args["creative-repair-session"] || "")
  .trim()
  .toLowerCase();
const previewUrl = String(args["preview-url"] || "").trim();
const base = (
  process.env.LAUNCHLOOM_PLATFORM_URL || "https://launchloom.wrazyos.com"
).replace(/\/$/, "");
if (!reviewerEmail || !clientEmail)
  throw new Error("--email and --client-email are required.");
const allowedOrigins = String(args.origins || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter((origin) => /^https:\/\//.test(origin));
if (stage === "developer" && !allowedOrigins.includes(base))
  allowedOrigins.push(base);
if (!allowedOrigins.length) throw new Error("--origins is required.");
if (creativeRepairSessionId && stage !== "developer")
  throw new Error("Creative repair sessions require a developer review link.");
if (creativeRepairSessionId && !/^[a-f0-9]{32}$/u.test(creativeRepairSessionId))
  throw new Error("--creative-repair-session must be a 32-character hex ID.");
if (previewUrl) {
  const previewOrigin = new URL(previewUrl).origin;
  if (!allowedOrigins.includes(previewOrigin))
    throw new Error("--preview-url must use one of --origins.");
}
const payload = {
  stage,
  repo: args.repo,
  siteId: args.site,
  reviewerEmail,
  clientEmail,
  feedbackIssue: Number(args["feedback-issue"]),
  allowedOrigins,
  ...(previewUrl ? { previewUrl } : {}),
  ...(creativeRepairSessionId ? { creativeRepairSessionId } : {}),
  ...(stage === "developer" ? { pr: Number(args.pr), headSha: args.sha } : {}),
  expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14,
};
if (stage === "developer" && (!payload.pr || !payload.headSha))
  throw new Error("Developer links require --pr and --sha.");
if (!payload.feedbackIssue)
  throw new Error("All review links require --feedback-issue.");
const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
const signature = createHmac("sha256", secret)
  .update(encoded)
  .digest("base64url");
const token = `${encoded}.${signature}`;
console.log(
  args["token-only"] === "true" ? token : `${base}/review?token=${token}`,
);
