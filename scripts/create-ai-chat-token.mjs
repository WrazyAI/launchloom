import fs from "node:fs/promises";
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
const secret = process.env.LEAD_SIGNING_SECRET;
if (!secret) throw new Error("LEAD_SIGNING_SECRET is required.");
const project = String(args.project || "").trim();
const file = String(args.file || "").trim();
const allowedOrigins = String(args.origins || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter((origin) => /^https:\/\//.test(origin));
if (!project || !file || !allowedOrigins.length)
  throw new Error("--project, --file, and --origins are required.");

const config = JSON.parse(await fs.readFile(file, "utf8"));
const clean = (value, limit = 500) =>
  String(value || "")
    .replace(/—/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
const context = {
  business: {
    name: clean(config.business?.name, 160),
    description: clean(config.business?.description, 800),
    phone: clean(config.business?.phone, 80),
    hours: clean(config.business?.hours, 160),
    offer: clean(config.business?.offer, 300),
    serviceAreas: (config.business?.serviceAreas || [])
      .map((item) => clean(item, 120))
      .filter(Boolean)
      .slice(0, 12),
    primaryCta: clean(config.business?.primaryCta, 120),
  },
  services: (config.services || [])
    .map((service) => ({
      name: clean(service?.name, 120),
      description: clean(service?.description, 500),
    }))
    .filter((service) => service.name)
    .slice(0, 12),
  faqs: (config.conversion?.faqs || [])
    .map((faq) => ({
      question: clean(faq?.question, 180),
      answer: clean(faq?.answer, 600),
    }))
    .filter((faq) => faq.question && faq.answer)
    .slice(0, 8),
  differentiators: (config.differentiators || [])
    .map((item) => clean(item, 180))
    .filter(Boolean)
    .slice(0, 6),
};
if (
  !context.business.name ||
  (!context.services.length && !context.faqs.length)
)
  throw new Error(
    "AI chat requires a business name and verified site context.",
  );
const encoded = Buffer.from(
  JSON.stringify({
    project,
    allowedOrigins,
    context,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 366 * 24 * 60 * 60_000,
  }),
).toString("base64url");
const signature = createHmac("sha256", secret)
  .update(encoded)
  .digest("base64url");
console.log(`${encoded}.${signature}`);
