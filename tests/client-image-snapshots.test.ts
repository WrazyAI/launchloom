import { describe, expect, it } from "vitest";
import { snapshotClientImages } from "../scripts/client-image-snapshots.mjs";

const url =
  "https://assets.launchloom.wrazyos.com/intakes/synthetic/photo.webp";
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=",
  "base64",
);
describe("sealed client image snapshots", () => {
  it("snapshots only exact approved asset URLs and reuses retained bytes", async () => {
    const calls: string[] = [];
    const retrieve: typeof fetch = async (input) => {
      calls.push(String(input));
      return new Response(image, { headers: { "content-type": "image/png" } });
    };
    const cache = new Map();
    const content = {
      hero: { image: url },
      brand: { logo: url },
      ignored: ["https://evil.test/photo.png", url + "?visitor=private"],
    };
    const snapshots = await snapshotClientImages(content, { retrieve, cache });
    expect([...snapshots.keys()]).toEqual([url]);
    expect(snapshots.get(url)?.body).toEqual(image);
    await snapshotClientImages(content, { retrieve, cache });
    expect(calls).toEqual([url]);
  });
  it.each(["text/html", "image/svg+xml"])(
    "rejects %s payloads",
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
      ).rejects.toThrow(/image/);
    },
  );
  it("rejects unsuccessful downloads rather than hiding missing client imagery", async () => {
    await expect(
      snapshotClientImages(
        { hero: { image: url } },
        {
          retrieve: async () => new Response("", { status: 403 }),
        },
      ),
    ).rejects.toThrow(/403/);
  });
});
