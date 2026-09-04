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
const project = String(args.project || "").trim();
const placeId = String(args.placeId || "").trim();
const allowedOrigins = String(args.origins || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter((origin) => /^https:\/\//.test(origin));
if (!secret) throw new Error("REVIEW_SIGNING_SECRET is required.");
if (!project || !placeId || !allowedOrigins.length)
  throw new Error("--project, --placeId, and --origins are required.");
const encoded = Buffer.from(
  JSON.stringify({
    project,
    placeId,
    allowedOrigins,
    expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1_000,
  }),
).toString("base64url");
console.log(
  `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`,
);
