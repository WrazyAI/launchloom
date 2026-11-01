import { describe, expect, it, vi } from "vitest";
import {
  MAX_CLIENT_IMAGE_CACHE_ENTRIES,
  MAX_CLIENT_IMAGE_SNAPSHOTS,
  isClientImageSnapshotUrl,
  snapshotClientImages,
} from "../scripts/client-image-snapshots.mjs";

const url =
  "https://assets.launchloom.wrazyos.com/intakes/synthetic/photo.webp";
const otherUrl =
  "https://assets.launchloom.wrazyos.com/intakes/synthetic/other.webp";
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=",
  "base64",
);

describe("sealed client image snapshots", () => {
  it("accepts only exact sealed intake raster URLs", () => {
    expect(isClientImageSnapshotUrl(url)).toBe(true);
    for (const rejected of [
      "https://evil.test/intakes/synthetic/photo.webp",
      "http://assets.launchloom.wrazyos.com/intakes/synthetic/photo.webp",
      "https://assets.launchloom.wrazyos.com/client-replacements/synthetic/photo.webp",
      "https://assets.launchloom.wrazyos.com/intakes/synthetic/photo.svg",
      `${url}?visitor=private`,
      `${url}#fragment`,
      "https://user:pass@assets.launchloom.wrazyos.com/intakes/synthetic/photo.webp",
      "https://assets.launchloom.wrazyos.com/intakes/../photo.webp",
    ])
      expect(isClientImageSnapshotUrl(rejected), rejected).toBe(false);
  });

  it("snapshots only exact approved URLs and reuses retained bytes", async () => {
    const calls: string[] = [];
    const retrieve: typeof fetch = async (input) => {
      calls.push(String(input));
      return new Response(image, { headers: { "content-type": "image/png" } });
    };
    const cache = new Map();
    const content = {
      hero: { image: url },
      brand: { logo: url },
      ignored: ["https://evil.test/photo.png", `${url}?visitor=private`],
    };
    const snapshots = await snapshotClientImages(content, { retrieve, cache });
    expect([...snapshots.keys()]).toEqual([url]);
    expect(snapshots.get(url)?.body).toEqual(image);
    await snapshotClientImages(content, { retrieve, cache });
    expect(calls).toEqual([url]);
  });

  it("requests redirects as errors and rejects redirect responses", async () => {
    const options: RequestInit[] = [];
    const retrieve: typeof fetch = async (_input, init) => {
      options.push(init || {});
      return new Response(null, {
        status: 302,
        headers: { location: "https://evil.test/redirected.webp" },
      });
    };
    await expect(
      snapshotClientImages({ hero: { image: url } }, { retrieve }),
    ).rejects.toThrow(/302/u);
    expect(options).toEqual([
      expect.objectContaining({ redirect: "error" }),
    ]);
  });

  it.each(["text/html", "image/svg+xml"])(
    "rejects %s payloads rather than accepting a non-raster snapshot",
    async (mime) => {
      await expect(
        snapshotClientImages(
          { hero: { image: url } },
          {
            retrieve: async () =>
              new Response("not a raster", {
                headers: { "content-type": mime },
              }),
          },
        ),
      ).rejects.toThrow(/raster/u);
    },
  );

  it("rejects an image above the per-image byte cap", async () => {
    await expect(
      snapshotClientImages(
        { hero: { image: url } },
        {
          retrieve: async () =>
            new Response(Buffer.alloc(5 * 1024 * 1024 + 1), {
              headers: { "content-type": "image/png" },
            }),
        },
      ),
    ).rejects.toThrow(/size limit/u);
  });

  it("rejects a set above the aggregate byte cap", async () => {
    const urls = Array.from(
      { length: 5 },
      (_, index) =>
        `https://assets.launchloom.wrazyos.com/intakes/synthetic/set-${index}.webp`,
    );
    const fourMegabytes = Buffer.alloc(4 * 1024 * 1024 + 1);
    await expect(
      snapshotClientImages(
        { images: urls },
        {
          retrieve: async () =>
            new Response(fourMegabytes, {
              headers: { "content-type": "image/webp" },
            }),
        },
      ),
    ).rejects.toThrow(/set exceeds size limit/u);
  });

  it("bounds the number of snapshots requested for one content manifest", async () => {
    const urls = Array.from(
      { length: MAX_CLIENT_IMAGE_SNAPSHOTS + 1 },
      (_, index) =>
        `https://assets.launchloom.wrazyos.com/intakes/synthetic/many-${index}.webp`,
    );
    const retrieve = vi.fn(async () => {
      throw new Error("must not fetch when the request set is unbounded");
    });
    await expect(
      snapshotClientImages({ images: urls }, { retrieve }),
    ).rejects.toThrow(/Too many sealed client images/u);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("bounds the shared cache and evicts the oldest retained image", async () => {
    const cache = new Map();
    const retrieve: typeof fetch = async () =>
      new Response(image, { headers: { "content-type": "image/png" } });
    for (let index = 0; index < MAX_CLIENT_IMAGE_CACHE_ENTRIES + 1; index++) {
      const current = `https://assets.launchloom.wrazyos.com/intakes/synthetic/cache-${index}.webp`;
      await snapshotClientImages({ hero: { image: current } }, { retrieve, cache });
    }
    expect(cache.size).toBe(MAX_CLIENT_IMAGE_CACHE_ENTRIES);
    expect(
      cache.has(
        "https://assets.launchloom.wrazyos.com/intakes/synthetic/cache-0.webp",
      ),
    ).toBe(false);
  });

  it("rejects a poisoned cached entry instead of trusting caller bytes", async () => {
    const cache = new Map([
      [url, { body: Buffer.from("not an image"), contentType: "text/html" }],
    ]);
    await expect(
      snapshotClientImages(
        { hero: { image: url } },
        {
          retrieve: async () => {
            throw new Error("must not accept invalid cached bytes");
          },
          cache,
        },
      ),
    ).rejects.toThrow(/Invalid retained client-image snapshot/u);
  });

  it("rejects unsuccessful downloads rather than hiding missing client imagery", async () => {
    await expect(
      snapshotClientImages(
        { hero: { image: url } },
        {
          retrieve: async () => new Response("", { status: 403 }),
        },
      ),
    ).rejects.toThrow(/403/u);
  });

  it("does not retain or return a second arbitrary URL from a valid payload", async () => {
    const snapshots = await snapshotClientImages(
      { hero: { image: url }, other: otherUrl },
      {
        retrieve: async (input) =>
          String(input) === url
            ? new Response(image, { headers: { "content-type": "image/png" } })
            : new Response(image, { headers: { "content-type": "image/png" } }),
      },
    );
    expect([...snapshots.keys()]).toEqual([url, otherUrl]);
    expect(snapshots.get(url)?.body).toEqual(image);
  });
});
