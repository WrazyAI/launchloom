import { describe, expect, it } from "vitest";
import { missingRequiredHeroImagery } from "../scripts/creative-asset-readiness.mjs";

const route = {
  id: "route-01",
  referenceDna: {
    compositionTopology: { hero: "image-led-field" },
    imageTreatment: { mode: "wide finished-surface photography" },
  },
};

const assets = {
  skipped: [
    {
      placement: "hero",
      reason: "Failed to subscribe to fal-ai: HTTP 403",
    },
    {
      placement: "secondary",
      reason: "Failed to subscribe to fal-ai: HTTP 403",
    },
  ],
};

describe("creative hero imagery readiness", () => {
  it("fails fast when an image-led route has no hero and the provider was blocked", () => {
    expect(
      missingRequiredHeroImagery({
        config: { images: {} },
        inspiration: { routes: [route] },
        assets,
      }),
    ).toEqual({
      routeIds: ["route-01"],
      reason:
        "hero: Failed to subscribe to fal-ai: HTTP 403; secondary: Failed to subscribe to fal-ai: HTTP 403",
    });
  });

  it("allows a configured client or generated hero", () => {
    expect(
      missingRequiredHeroImagery({
        config: { images: { hero: "/images/generated/hero.webp" } },
        inspiration: { routes: [route] },
        assets,
      }),
    ).toBeNull();
    expect(
      missingRequiredHeroImagery({
        config: { images: {}, assets: { photoOne: "/images/client.webp" } },
        inspiration: { routes: [route] },
        assets,
      }),
    ).toBeNull();
    expect(
      missingRequiredHeroImagery({
        config: {
          images: {},
          creativeAssets: {
            "route-01": { hero: "/images/routes/route-01.webp" },
          },
        },
        inspiration: { routes: [route] },
        assets,
      }),
    ).toBeNull();
  });

  it("allows an image-independent reference without a hero", () => {
    expect(
      missingRequiredHeroImagery({
        config: { images: {} },
        inspiration: {
          routes: [
            {
              id: "type-led",
              referenceDna: {
                compositionTopology: { hero: "type-led-statement" },
                imageTreatment: { mode: "without photography" },
              },
            },
          ],
        },
        assets,
      }),
    ).toBeNull();
  });
});
