import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { execute } = vi.hoisted(() => ({
  execute: vi.fn<(file: string, args?: readonly string[]) => string>(
    () => "signed-token",
  ),
}));
vi.mock("node:child_process", () => ({ execFileSync: execute }));
const project = "launchloom-14-test";
let calls: Array<{ url: string; method: string }>;
function setup(reachable: boolean, delivered = false) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: any = {}) => {
      calls.push({ url, method: options.method || "GET" });
      if (url.includes("pages.dev")) {
        if (!reachable) throw new Error("TLS unavailable");
        return new Response('<aside id="ll-review"></aside>');
      }
      let data: any = {};
      if (url.includes("search/issues"))
        data = {
          items: [
            {
              repository_url: `https://api.github.com/repos/WrazyAI/${project}`,
              number: 2,
              created_at: "2026-01-01",
            },
          ],
        };
      else if (url.includes("/pulls/"))
        data = {
          number: 2,
          head: { ref: "review/initial", sha: "abc" },
          body: "<!-- launchloom-feedback-inbox:1 -->",
        };
      else if (url.includes("/contents/"))
        data = {
          content: Buffer.from(
            JSON.stringify({
              business: { name: "Test business", email: "client@example.com" },
            }),
          ).toString("base64"),
        };
      else if (url.includes("/comments?"))
        data = delivered
          ? [{ body: "<!-- launchloom-initial-email:abc -->" }]
          : [];
      return Response.json(data);
    }),
  );
}
beforeEach(() => {
  vi.resetModules();
  execute.mockClear();
  calls = [];
  for (const key of [
    "GITHUB_ORG_TOKEN",
    "REVIEW_SIGNING_SECRET",
    "RESEND_API_KEY",
    "LAUNCHLOOM_FROM_EMAIL",
    "LAUNCHLOOM_DEVELOPER_EMAIL",
  ])
    vi.stubEnv(key, "test");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("retains pending delivery without sending while preview TLS is unavailable", async () => {
  setup(false);
  await import("../scripts/recover-preview-delivery.mjs");
  expect(execute).not.toHaveBeenCalled();
  expect(calls.some((c) => c.method === "DELETE")).toBe(false);
});
it("recovers the signed email after preview availability without rebuilding", async () => {
  setup(true);
  await import("../scripts/recover-preview-delivery.mjs");
  expect(execute.mock.calls).toHaveLength(2);
  expect(execute.mock.calls[1]?.[1]).toContain("--idempotency-key");
  expect(calls.some((c) => c.method === "DELETE")).toBe(true);
});
it("clears an already delivered record without emailing again", async () => {
  setup(true, true);
  await import("../scripts/recover-preview-delivery.mjs");
  expect(execute).not.toHaveBeenCalled();
  expect(calls.some((c) => c.method === "DELETE")).toBe(true);
});
