import { createHmac, timingSafeEqual } from "node:crypto";

type ReviewTokenBase = {
  repo: string;
  siteId: string;
  reviewerEmail: string;
  clientEmail: string;
  feedbackIssue: number;
  expiresAt: number;
  allowedOrigins: string[];
};

export type ReviewTokenPayload =
  | (ReviewTokenBase & { stage: "developer"; pr: number; headSha: string })
  | (ReviewTokenBase & { stage: "client" });

export function signReviewToken(payload: ReviewTokenPayload, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}

export function verifyReviewToken(token: string, secret: string) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) throw new Error("Invalid review token");
  const expected = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    throw new Error("Invalid review token");
  const payload = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  ) as ReviewTokenPayload;
  const baseValid = payload.stage === "developer" || payload.stage === "client";
  const developerValid =
    payload.stage !== "developer" || Boolean(payload.pr && payload.headSha);
  if (
    !baseValid ||
    !developerValid ||
    !payload.repo ||
    !payload.siteId ||
    !payload.reviewerEmail ||
    !payload.clientEmail ||
    !payload.feedbackIssue ||
    !payload.allowedOrigins?.length ||
    payload.expiresAt <= Date.now()
  )
    throw new Error("Expired or incomplete review token");
  return payload;
}
