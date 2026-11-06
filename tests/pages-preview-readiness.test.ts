import { describe, expect, it } from "vitest";
import {
  parseWaitForPagesPreviewArgs,
  waitForPagesPreview,
} from "../scripts/pages-preview-readiness.mjs";

const url = "https://review-initial.example.pages.dev";

function response(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html" },
  });
}

describe("pages preview readiness marker", () => {
  it("accepts a 2xx response containing the expected renderer marker", async () => {
    await expect(
      waitForPagesPreview({
        url,
        marker: 'data-creative-host="true"',
        send: async () => response('<html data-creative-host="true"></html>'),
        now: () => 0,
      }),
    ).resolves.toEqual({ state: "ready", status: 200 });
  });

  it("retries and fails when the marker is missing", async () => {
    let calls = 0;
    const now = () => (calls++ < 2 ? 0 : 10_001);
    await expect(
      waitForPagesPreview({
        url,
        marker: 'data-creative-host="true"',
        timeoutSeconds: 10,
        send: async () => response("<html></html>"),
        wait: async () => {},
        now,
        onAttempt: () => {},
      }),
    ).rejects.toThrow(/renderer marker missing/u);
  });

  it("keeps the existing 2xx behavior without a marker", async () => {
    await expect(
      waitForPagesPreview({
        url,
        send: async () => response("<html></html>"),
        now: () => 0,
      }),
    ).resolves.toEqual({ state: "ready", status: 200 });
  });

  it("parses --marker as a value option", () => {
    expect(
      parseWaitForPagesPreviewArgs([
        "--url",
        url,
        "--marker",
        'data-experience-pack="x"',
      ]),
    ).toMatchObject({ marker: 'data-experience-pack="x"' });
    expect(() => parseWaitForPagesPreviewArgs(["--marker"])).toThrow(
      /Missing value/u,
    );
  });
});
