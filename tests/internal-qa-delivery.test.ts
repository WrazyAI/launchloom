import { expect, it } from "vitest";
import {
  validateRequests,
  verifyDelivery,
} from "../scripts/verify-internal-qa-delivery.mjs";
const now = Date.parse("2026-10-05T12:00:00.000Z");
const request = {
  project: "launchloom-101-qa-trades",
  testName: "[LaunchLoom QA] launchloom-101-qa-trades abcdef12",
  submittedAt: "2026-10-05T11:59:00.000Z",
};
const recipient = "qa@example.invalid";
const email = {
  id: "11111111-1111-4111-8111-111111111111",
  to: [recipient],
  cc: [],
  bcc: [],
  subject: `New website lead: ${request.testName}`,
  created_at: "2026-10-05 11:59:02.000+00",
  last_event: "delivered",
  text: `NEW WEBSITE ENQUIRY\n\nNew enquiry for ${request.project}\n\nName: ${request.testName}\nPhone: Synthetic\nEmail: synthetic@example.invalid\n\nMESSAGE\nLaunchLoom QA synthetic test.`,
};
async function run(
  list: any[] = [email],
  detail: any = email,
  status = 200,
  hasMore = false,
) {
  const calls: any[] = [];
  const result = await verifyDelivery([request], {
    recipient,
    apiKey: "secret",
    now: () => now,
    budgetMs: 0,
    fetchImpl: async (url: string, options: any) => {
      calls.push({ url, method: options.method });
      return new Response(
        JSON.stringify(
          url.includes("?") ? { data: list, has_more: hasMore } : detail,
        ),
        { status },
      );
    },
  });
  expect(
    calls.every(
      (c) =>
        c.method === "GET" && c.url.startsWith("https://api.resend.com/emails"),
    ),
  ).toBe(true);
  expect(JSON.stringify(result)).not.toContain(recipient);
  expect(JSON.stringify(result)).not.toContain(request.testName);
  expect(JSON.stringify(result)).not.toContain("synthetic@example.invalid");
  return result.results[0];
}
it("accepts only bounded, recent, correlated QA requests", () => {
  expect(validateRequests([request], now)).toHaveLength(1);
  for (const changes of [
    { project: "foreign" },
    { testName: "real person" },
    { submittedAt: "2020-01-01T00:00:00Z" },
    { submittedAt: "2026-10-05T12:01:00.000Z" },
    { origin: "https://evil.invalid" },
    { extra: "bad" },
  ])
    expect(() => validateRequests([{ ...request, ...changes }], now)).toThrow();
  expect(() => validateRequests([request, request], now)).toThrow();
  expect(() => validateRequests([request, request, request], now)).toThrow();
});
it.each(["delivered", "opened", "clicked"])(
  "proves receiving-provider delivery on %s only after exact detail matching",
  async (event) =>
    expect((await run([email], { ...email, last_event: event })).outcome).toBe(
      "delivered",
    ),
);
it.each(["queued", "sent", "delivery_delayed", "unknown", null])(
  "does not equate %s or HTTP200 with delivery",
  async (event) =>
    expect((await run([email], { ...email, last_event: event })).outcome).toBe(
      "not_verified",
    ),
);
it.each(["bounced", "failed", "suppressed"])(
  "reports terminal failure %s",
  async (event) =>
    expect((await run([email], { ...email, last_event: event })).outcome).toBe(
      "failed",
    ),
);
it("ignores wrong recipient, stale and wrong subject records", async () => {
  for (const changes of [
    { to: ["other@example.invalid"] },
    { created_at: "2026-10-05T11:58:00Z" },
    { subject: "unrelated" },
    { to: [recipient, "other@example.invalid"] },
    { cc: ["other@example.invalid"] },
  ])
    expect((await run([{ ...email, ...changes }])).outcome).toBe(
      "not_verified",
    );
});
it("fails closed for mismatched retrieved recipient, ID, project and name", async () => {
  for (const changes of [
    { to: ["other@example.invalid"] },
    { id: "22222222-2222-4222-8222-222222222222" },
    {
      text: email.text.replace(
        `New enquiry for ${request.project}`,
        "New enquiry for foreign",
      ),
    },
    {
      text: email.text.replace(
        `Name: ${request.testName}`,
        "Name: someone else",
      ),
    },
  ])
    expect((await run([email], { ...email, ...changes })).outcome).toBe(
      "not_verified",
    );
});
it("does not prove ambiguous or unavailable delivery", async () => {
  expect(
    (
      await run([
        email,
        { ...email, id: "22222222-2222-4222-8222-222222222222" },
      ])
    ).reason,
  ).toBe("ambiguous_match");
  expect((await run([])).outcome).toBe("not_verified");
  for (const status of [401, 403, 404, 429, 500])
    expect((await run([email], email, status)).outcome).toBe("not_verified");
});
it("polls sent to delivered within the bounded deadline with sanitized heartbeat", async () => {
  let clock = now,
    reads = 0;
  const beats: any[] = [];
  const result = await verifyDelivery([request], {
    recipient,
    apiKey: "secret",
    now: () => clock,
    budgetMs: 12000,
    pause: async (ms: number) => {
      clock += ms;
    },
    heartbeat: (value: any) => beats.push(value),
    fetchImpl: async (url: string) => {
      const data = url.includes("?")
        ? { data: [email], has_more: false }
        : { ...email, last_event: ++reads === 1 ? "sent" : "delivered" };
      return new Response(JSON.stringify(data));
    },
  });
  expect(result.results[0].outcome).toBe("delivered");
  expect(clock - now).toBeLessThanOrEqual(12000);
  expect(JSON.stringify(beats)).not.toContain(recipient);
  expect(beats[0].outcomes[0].outcome).toBe("not_verified");
});
it("honors Retry-After without exceeding the deadline or emitting provider errors", async () => {
  let clock = now;
  const times: number[] = [];
  const result = await verifyDelivery([request], {
    recipient,
    apiKey: "secret",
    now: () => clock,
    budgetMs: 12000,
    pause: async (ms: number) => {
      clock += ms;
    },
    fetchImpl: async () => {
      times.push(clock);
      return new Response("secret contact provider message", {
        status: 429,
        headers: { "retry-after": "60" },
      });
    },
  });
  expect(times).toHaveLength(1);
  expect(clock - now).toBeLessThanOrEqual(12000);
  expect(result.results[0].outcome).toBe("not_verified");
  expect(JSON.stringify(result)).not.toContain("secret");
});
it("fails closed when pagination cannot establish uniqueness", async () =>
  expect((await run([email], email, 200, true)).outcome).toBe("not_verified"));
it("checks recipient identity again after list success when detail is unavailable", async () => {
  const result = await verifyDelivery([request], {
    recipient,
    apiKey: "secret",
    now: () => now,
    budgetMs: 0,
    fetchImpl: async (url: string) =>
      url.includes("?")
        ? new Response(JSON.stringify({ data: [email], has_more: false }))
        : new Response("{}", { status: 404 }),
  });
  expect(result.results[0]).toMatchObject({
    outcome: "not_verified",
    reason: "provider_not_found",
  });
});
