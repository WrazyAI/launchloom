import {execFileSync} from "node:child_process";
import { describe, expect, it } from "vitest";
import { signReviewToken, verifyReviewToken } from "../src/lib/review-token";

const secret = "test-secret";
const payload = {
  stage: "developer" as const,
  repo: "WrazyAI/example",
  pr: 3,
  headSha: "abc123",
  siteId: "site-id",
  reviewerEmail: "david@maigreeks.com",
  clientEmail: "client@example.com",
  feedbackIssue: 12,
  allowedOrigins: ["https://example.pages.dev"],
  expiresAt: Date.now() + 60_000,
};

describe("review tokens", () => {
  it("verifies a token signed for the current review", () => {
    expect(
      verifyReviewToken(signReviewToken(payload, secret), secret),
    ).toMatchObject(payload);
  });

  it("rejects a modified token", () => {
    const token = signReviewToken(payload, secret);
    expect(() => verifyReviewToken(`${token}x`, secret)).toThrow(
      "Invalid review token",
    );
  });

  it("rejects expired tokens", () => {
    const token = signReviewToken(
      { ...payload, expiresAt: Date.now() - 1 },
      secret,
    );
    expect(() => verifyReviewToken(token, secret)).toThrow(
      "Expired or incomplete review token",
    );
  });
  it.each([undefined,'a'.repeat(40)])('retains an optional published commit in new client review links (%s)',(sha)=>{
    const args=['scripts/create-review-link.mjs','--stage','client','--repo','WrazyAI/fixture','--site','fixture','--email','client@example.test','--client-email','client@example.test','--feedback-issue','8','--origins','https://fixture.pages.dev','--token-only','true'];
    if(sha)args.push('--sha',sha);
    const token=execFileSync(process.execPath,args,{encoding:'utf8',env:{...process.env,REVIEW_SIGNING_SECRET:secret}}).trim();
    const claims=verifyReviewToken(token,secret);
    expect(claims.stage).toBe('client');
    expect(claims.headSha).toBe(sha);
  });

});
