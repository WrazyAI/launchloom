import { describe, expect, it } from "vitest";
import {
  pagesDeploymentId,
  pagesDeploymentUrl,
} from "../scripts/pages-deployment.mjs";
import { buildPreviewDeliveryPayload } from "../scripts/publish-preview-delivery.mjs";

describe("Pages deployment identity", () => {
  it("extracts the immutable deployment URL and id", () => {
    const output =
      "✨ Deployment complete! Take a peek over at https://4c1e9a2b.launchloom-bhl.pages.dev\n✨ Deployment alias URL: https://short.launchloom-bhl.pages.dev";
    expect(pagesDeploymentUrl(output)).toBe(
      "https://4c1e9a2b.launchloom-bhl.pages.dev",
    );
    expect(
      pagesDeploymentId("https://4c1e9a2b.launchloom-bhl.pages.dev"),
    ).toBe("4c1e9a2b");
  });

  it("rejects branch aliases and non-Pages hosts", () => {
    expect(() =>
      pagesDeploymentId("https://review-initial.launchloom-bhl.pages.dev"),
    ).toThrow(/alias/u);
    expect(() =>
      pagesDeploymentId("https://review-diagnostic.launchloom-bhl.pages.dev"),
    ).toThrow(/alias/u);
    expect(() => pagesDeploymentId("https://example.com")).toThrow(/Pages/u);
  });

  it("rejects output without exactly one deployment URL", () => {
    expect(() => pagesDeploymentUrl("Upload pending https://wrong.pages.dev")).toThrow(
      /deployment/u,
    );
  });

  it("builds the delivery receipt and rejects mismatched hosts", () => {
    const payload = buildPreviewDeliveryPayload({
      repo: "WrazyAI/example-client",
      attempt: "attempt-1",
      project: "example",
      pr: "9",
      sha: "a".repeat(40),
      log: "Deployment complete! https://4c1e9a2b.example.pages.dev",
    });
    expect(payload).toMatchObject({
      repository: "WrazyAI/example-client",
      deploymentId: "4c1e9a2b",
      previewUrl: "https://4c1e9a2b.example.pages.dev",
    });
    expect(() =>
      buildPreviewDeliveryPayload({
        repo: "WrazyAI/example-client",
        attempt: "attempt-1",
        project: "example",
        pr: "9",
        sha: "a".repeat(40),
        log: "Deployment complete! https://other.example.pages.dev",
      }),
    ).toThrow(/alias|deployment/u);
  });
});
