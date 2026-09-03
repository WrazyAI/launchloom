import { createHmac, timingSafeEqual } from "node:crypto";

export type ReviewTokenPayload = { repo: string; pr: number; headSha: string; siteId: string; clientEmail: string; expiresAt: number; allowedOrigins: string[] };

export function signReviewToken(payload: ReviewTokenPayload, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}

export function verifyReviewToken(token: string, secret: string) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) throw new Error("Invalid review token");
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("Invalid review token");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ReviewTokenPayload;
  if (!payload.repo || !payload.pr || !payload.headSha || !payload.siteId || !payload.clientEmail || !payload.allowedOrigins?.length || payload.expiresAt <= Date.now()) throw new Error("Expired or incomplete review token");
  return payload;
}
