import { createHmac, timingSafeEqual } from "node:crypto";

export type ReviewTokenPayload = {
  repo: string;
  pr: number;
  headSha: string;
  siteId: string;
  expiresAt: number;
};

function encode(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function decode<T>(input: string): T {
  return JSON.parse(Buffer.from(input, "base64url").toString("utf8")) as T;
}

function signature(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function signReviewToken(payload: ReviewTokenPayload, secret = process.env.REVIEW_SIGNING_SECRET) {
  if (!secret) throw new Error("REVIEW_SIGNING_SECRET is not configured.");
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifyReviewToken(token: string, secret = process.env.REVIEW_SIGNING_SECRET): ReviewTokenPayload {
  if (!secret) throw new Error("REVIEW_SIGNING_SECRET is not configured.");
  const [encoded, supplied] = token.split(".");
  if (!encoded || !supplied) throw new Error("Malformed review token.");
  const expected = signature(encoded, secret);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    throw new Error("Invalid review token.");
  }
  const payload = decode<ReviewTokenPayload>(encoded);
  if (!payload.repo || !payload.pr || !payload.headSha || !payload.siteId || payload.expiresAt < Date.now()) {
    throw new Error("Expired or incomplete review token.");
  }
  return payload;
}
