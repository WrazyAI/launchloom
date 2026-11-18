import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isReviewedStockImageUrl,
  materializeStockImages,
  stockImageExtension,
} from "../scripts/materialize-stock-images.mjs";

describe("reviewed stock image localization", () => {
  it("recognizes only the reviewed stock image host", () => {
    expect(
      isReviewedStockImageUrl(
        "https://images.unsplash.com/photo-1543333995-a78aea2eee50?auto=format",
      ),
    ).toBe(true);
    expect(
      isReviewedStockImageUrl("https://example.com/photo-1543333995.jpg"),
    ).toBe(false);
    expect(isReviewedStockImageUrl("not a url")).toBe(false);
  });

  it("chooses a safe local extension from the response type", () => {
    expect(stockImageExtension("image/webp; charset=binary")).toBe("webp");
    expect(stockImageExtension("image/avif")).toBe("avif");
    expect(stockImageExtension("image/png")).toBe("png");
    expect(stockImageExtension("image/jpeg")).toBe("jpg");
    expect(
      stockImageExtension("", "https://images.unsplash.com/photo.jpg"),
    ).toBe("jpg");
  });

  it("downloads reviewed images and rewrites only their config entries", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "stock-images-"));
    try {
      await fs.mkdir(path.join(root, "src"), { recursive: true });
      await fs.writeFile(
        path.join(root, "src/site.config.json"),
        JSON.stringify({
          business: { name: "Example" },
          images: {
            hero: "https://images.unsplash.com/photo-1543333995?auto=format",
            secondary: "/images/local-secondary.png",
            logo: "https://example.com/logo.png",
          },
        }),
      );
      const calls: string[] = [];
      const result = await materializeStockImages({
        site: root,
        fetchImpl: async (url) => {
          calls.push(String(url));
          return new Response(Buffer.from("image-bytes"), {
            status: 200,
            headers: { "content-type": "image/webp" },
          });
        },
      });
      expect(result.localized).toBe(1);
      expect(calls).toHaveLength(1);
      const config = JSON.parse(
        await fs.readFile(path.join(root, "src/site.config.json"), "utf8"),
      );
      expect(config.images.hero).toMatch(
        /^\/images\/stock\/hero-[a-f0-9]{12}\.webp$/u,
      );
      expect(config.images.secondary).toBe("/images/local-secondary.png");
      expect(config.images.logo).toBe("https://example.com/logo.png");
      expect(
        await fs.readFile(
          path.join(root, "public", config.images.hero.replace(/^\//u, "")),
          "utf8",
        ),
      ).toBe("image-bytes");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
