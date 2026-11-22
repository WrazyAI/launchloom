import crypto from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BUCKET,
  hydrateReferenceAssets,
  uploadReferenceAssets,
  verifyReferenceAssets,
} from "../scripts/sync-reference-assets.mjs";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((dir) => fsp.rm(dir, { recursive: true, force: true })),
  );
});

async function makeTempDir(prefix: string) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

function sha256(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

describe("sync-reference-assets (Cloudflare R2 offload)", () => {
  it("uploads unique PNGs, skips existing R2 keys, writes manifest, and hydrates via cache and R2", async () => {
    const root = await makeTempDir("ll-r2-repo-");
    const cacheDir = await makeTempDir("ll-r2-cache-");

    const desktopA = Buffer.from("fake-png-desktop-alpha-1234567890");
    const mobileA = Buffer.from("fake-png-mobile-alpha-1234567890");
    // Identical bytes to desktopA to verify content-addressed deduplication
    const desktopB = Buffer.from(desktopA);
    const contactSheet = Buffer.from("fake-png-contact-sheet-abcdef");

    const relPaths = [
      ["data/reference-library/dossiers/alpha/screenshots/desktop.png", desktopA],
      ["data/reference-library/dossiers/alpha/screenshots/mobile.png", mobileA],
      ["data/reference-library/dossiers/beta/screenshots/desktop.png", desktopB],
      ["data/reference-library/core-collection-hero-contact-sheet.png", contactSheet],
    ] as const;

    for (const [rel, data] of relPaths) {
      const abs = path.join(root, rel);
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, data);
    }

    // Seed one object as already present in R2 to confirm upload skip
    const r2Store = new Map<string, Buffer>([
      [`v1/sha256/${sha256(mobileA)}.png`, mobileA],
    ]);
    const putKeys: string[] = [];
    const getKeys: string[] = [];

    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method || "GET";
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer test-cf-token",
      );
      if (method === "GET" && url.pathname.endsWith("/objects")) {
        return new Response(
          JSON.stringify({
            success: true,
            result: [...r2Store.keys()].map((key) => ({ key })),
            result_info: { is_truncated: false },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      const match = url.pathname.match(/\/objects\/(.+)$/u);
      const key = match ? decodeURIComponent(match[1]) : "";
      if (method === "PUT") {
        putKeys.push(key);
        const body = Buffer.from(init?.body as Uint8Array);
        r2Store.set(key, body);
        return new Response(JSON.stringify({ success: true, result: { key } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (method === "GET") {
        getKeys.push(key);
        const stored = r2Store.get(key);
        if (!stored) return new Response("Not Found", { status: 404 });
        return new Response(new Uint8Array(stored), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      return new Response("Method Not Allowed", { status: 405 });
    });

    const env = {
      CLOUDFLARE_ACCOUNT_ID: "acct-123",
      CLOUDFLARE_API_TOKEN: "test-cf-token",
    };

    const pushResult = await uploadReferenceAssets({
      root,
      env,
      allowDotEnv: false,
      fetchImpl: fetchImpl as typeof fetch,
      sleep: async () => {},
    });

    expect(pushResult).toMatchObject({
      total: 4,
      uniqueKeys: 3, // desktopA === desktopB deduplicated
      uploaded: 2, // mobileA was already in R2
      skipped: 1,
    });
    expect(putKeys).toHaveLength(2);

    const manifestPath = path.join(
      root,
      "data/reference-library/r2-asset-manifest.json",
    );
    const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
    expect(manifest.bucket).toBe(DEFAULT_BUCKET);
    expect(manifest.assets).toHaveLength(4);

    // Verify existing files pass verification
    await expect(verifyReferenceAssets({ root })).resolves.toEqual({
      total: 4,
      verified: 4,
    });

    // Remove all local PNGs to simulate a clean git checkout without PNGs
    for (const [rel] of relPaths) {
      await fsp.rm(path.join(root, rel));
    }

    // Hydrate from R2 (populates cacheDir + writes files)
    const pull1 = await hydrateReferenceAssets({
      root,
      cacheDir,
      env,
      allowDotEnv: false,
      fetchImpl: fetchImpl as typeof fetch,
      sleep: async () => {},
    });
    expect(pull1).toMatchObject({
      total: 4,
      present: 0,
      cached: 0,
      downloaded: 4,
    });
    // desktopA and desktopB share the same key so concurrent download deduplicates to 3 GETs
    expect(getKeys).toHaveLength(3);
    await expect(verifyReferenceAssets({ root })).resolves.toEqual({
      total: 4,
      verified: 4,
    });

    // Second pull with files already present does zero network and zero cache copies
    const pull2 = await hydrateReferenceAssets({
      root,
      cacheDir,
      env: {},
      allowDotEnv: false,
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(pull2).toMatchObject({
      total: 4,
      present: 4,
      cached: 0,
      downloaded: 0,
    });

    // Delete workspace files again; hydrate purely from cacheDir WITHOUT any Cloudflare credentials
    for (const [rel] of relPaths) {
      await fsp.rm(path.join(root, rel));
    }
    const pullFromCache = await hydrateReferenceAssets({
      root,
      cacheDir,
      env: {},
      allowDotEnv: false,
      fetchImpl: vi.fn(() => {
        throw new Error("network should not be called on cache hit");
      }) as unknown as typeof fetch,
    });
    expect(pullFromCache).toMatchObject({
      total: 4,
      present: 0,
      cached: 4,
      downloaded: 0,
    });
    await expect(verifyReferenceAssets({ root })).resolves.toEqual({
      total: 4,
      verified: 4,
    });
  });

  it("fails closed on SHA-256 mismatch and retries transient 503 responses", async () => {
    const root = await makeTempDir("ll-r2-integrity-");
    const expected = Buffer.from("expected-valid-png-bytes");
    const rel = "data/reference-library/dossiers/test/screenshots/desktop.png";
    const manifestPath = path.join(
      root,
      "data/reference-library/r2-asset-manifest.json",
    );
    await fsp.mkdir(path.dirname(manifestPath), { recursive: true });
    await fsp.writeFile(
      manifestPath,
      JSON.stringify({
        version: 1,
        bucket: DEFAULT_BUCKET,
        keyPrefix: "v1/sha256",
        assets: [
          {
            path: rel,
            sha256: sha256(expected),
            bytes: expected.byteLength,
            key: `v1/sha256/${sha256(expected)}.png`,
            contentType: "image/png",
          },
        ],
      }),
    );

    // Corrupted response must fail closed without writing destination
    const corruptFetch = vi.fn(
      async () =>
        new Response(new Uint8Array(Buffer.from("corrupted-bytes-12345678")), {
          status: 200,
        }),
    );
    await expect(
      hydrateReferenceAssets({
        root,
        cacheDir: "",
        env: { CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "t" },
        allowDotEnv: false,
        fetchImpl: corruptFetch as typeof fetch,
        sleep: async () => {},
      }),
    ).rejects.toThrow(/Integrity check failed/u);
    await expect(fsp.access(path.join(root, rel))).rejects.toThrow();

    // Transient 503 followed by 200 succeeds
    let attempts = 0;
    const flakyFetch = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) return new Response("unavailable", { status: 503 });
      return new Response(new Uint8Array(expected), { status: 200 });
    });
    const res = await hydrateReferenceAssets({
      root,
      cacheDir: "",
      env: { CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "t" },
      allowDotEnv: false,
      fetchImpl: flakyFetch as typeof fetch,
      sleep: async () => {},
    });
    expect(attempts).toBe(2);
    expect(res.downloaded).toBe(1);
    await expect(verifyReferenceAssets({ root })).resolves.toEqual({
      total: 1,
      verified: 1,
    });
  });
});
