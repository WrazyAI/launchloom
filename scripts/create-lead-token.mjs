import { createHmac } from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 === 0 ? [...pairs, [value.replace(/^--/, ""), all[index + 1]]] : pairs, []));
const secret = process.env.LEAD_SIGNING_SECRET;
if (!secret) throw new Error("LEAD_SIGNING_SECRET is required.");
const recipient = String(args.recipient || "").trim();
const project = String(args.project || "").trim();
const allowedOrigins = String(args.origins || "").split(",").map((origin) => origin.trim().replace(/\/$/, "")).filter((origin) => /^https:\/\//.test(origin));
if (!project || !recipient || !allowedOrigins.length) throw new Error("--project, --recipient, and --origins are required.");
const encoded = Buffer.from(JSON.stringify({ project, recipient, allowedOrigins, issuedAt: Date.now() })).toString("base64url");
const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
console.log(`${encoded}.${signature}`);
