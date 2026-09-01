import { createHmac } from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 === 0 ? [...pairs, [value.replace(/^--/, ""), all[index + 1]]] : pairs, []));
const secret = process.env.REVIEW_SIGNING_SECRET;
if (!secret) throw new Error("REVIEW_SIGNING_SECRET is required.");
const clientEmail = String(args.email || "").trim().toLowerCase();
if (!clientEmail) throw new Error("--email is required.");
const payload = { repo: args.repo, pr: Number(args.pr), headSha: args.sha, siteId: args.site, clientEmail, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14 };
const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
const base = (process.env.LAUNCHLOOM_PUBLIC_URL || "http://localhost:4321").replace(/\/$/, "");
const token = `${encoded}.${signature}`;
console.log(args["token-only"] === "true" ? token : `${base}/review?token=${token}`);
