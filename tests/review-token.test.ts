import { describe, expect, it } from "vitest";
import { signReviewToken, verifyReviewToken } from "../netlify/functions/_shared/review-token";

const secret = "test-secret";
const payload = { repo: "WrazyAI/example", pr: 3, headSha: "abc123", siteId: "site-id", clientEmail: "client@example.com", expiresAt: Date.now() + 60_000 };

describe("review tokens", () => {
  it("verifies a token signed for the current review", () => {
    expect(verifyReviewToken(signReviewToken(payload, secret), secret)).toMatchObject(payload);
  });

  it("rejects a modified token", () => {
    const token = signReviewToken(payload, secret);
    expect(() => verifyReviewToken(`${token}x`, secret)).toThrow("Invalid review token");
  });

  it("rejects expired tokens", () => {
    const token = signReviewToken({ ...payload, expiresAt: Date.now() - 1 }, secret);
    expect(() => verifyReviewToken(token, secret)).toThrow("Expired or incomplete review token");
  });
});
