import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import {
  HeroImageEncodingError,
  HeroImageTooLargeError,
  HeroUploadError,
  MAX_HERO_BYTES,
  applyHeroFailure,
  buildAttemptTrackingPayload,
  encodeGenerationHero,
  safeHeroFailureMessage,
  uploadGenerationHero,
} from "../scripts/record-generation-event.mjs";

const baseAttemptArgs = {
  "run-id": "9001",
  "run-attempt": "1",
  profile: "full",
  "execution-status": "running",
  "delivery-status": "preview_ready",
  "observed-at": String(Date.now()),
  issue: "42",
  status: "preview_ready",
};

function heroCliArgs(port: number, heroFile: string): string[] {
  return [
    path.resolve("scripts/record-generation-event.mjs"),
    "--api",
    `http://127.0.0.1:${port}`,
    "--secret",
    "test-tracking-secret",
    "--action",
    "complete",
    "--run-id",
    "9001",
    "--run-attempt",
    "1",
    "--profile",
    "full",
    "--execution-status",
    "running",
    "--delivery-status",
    "preview_ready",
    "--observed-at",
    String(Date.now()),
    "--issue",
    "42",
    "--status",
    "preview_ready",
    "--hero",
    heroFile,
    "--completed-at",
    String(Date.now()),
  ];
}

describe("generation hero encoding", () => {
  it("encodes a screenshot as a bounded WebP", async () => {
    const input = await sharp({
      create: {
        width: 1600,
        height: 900,
        channels: 3,
        background: { r: 229, g: 232, b: 223 },
      },
    })
      .png()
      .toBuffer();

    const result = await encodeGenerationHero(input);

    expect(result.bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(result.bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(result.width).toBe(1280);
    expect(result.bytes.length).toBeLessThanOrEqual(MAX_HERO_BYTES);
    expect(result.attempts).toHaveLength(1);
    await expect(sharp(result.bytes).metadata()).resolves.toMatchObject({
      format: "webp",
      width: 1280,
    });
  });

  it("retries at a lower width and quality before accepting a bounded hero", async () => {
    const seen: Array<{ width: number; quality: number }> = [];
    const result = await encodeGenerationHero(Buffer.from("source"), {
      maxBytes: 1_800_000,
      encode: async (
        _input: Buffer,
        attempt: { width: number; quality: number },
      ) => {
        seen.push(attempt);
        return Buffer.alloc(attempt.width === 1280 ? 2_000_000 : 1_500_000);
      },
    });

    expect(seen.map((attempt) => attempt.width)).toEqual([1280, 1024]);
    expect(result.width).toBe(1024);
    expect(result.quality).toBe(62);
    expect(result.bytes.length).toBe(1_500_000);
    expect(result.attempts).toHaveLength(2);
  });

  it("throws a typed size error after the bounded ladder", async () => {
    const seen: Array<{ width: number; quality: number }> = [];
    const error = await encodeGenerationHero(Buffer.from("source"), {
      maxBytes: 100,
      encode: async (
        _input: Buffer,
        attempt: { width: number; quality: number },
      ) => {
        seen.push(attempt);
        return Buffer.alloc(101);
      },
    }).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(HeroImageTooLargeError);
    expect(error).toMatchObject({
      code: "hero_too_large",
      maxBytes: 100,
    });
    expect((error as HeroImageTooLargeError).attempts).toHaveLength(3);
    expect(seen).toHaveLength(3);
  });

  it("rejects an empty encode result instead of uploading nothing", async () => {
    await expect(
      encodeGenerationHero(Buffer.from("source"), {
        encode: async () => Buffer.alloc(0),
      }),
    ).rejects.toBeInstanceOf(HeroImageEncodingError);
  });
});

describe("generation hero upload", () => {
  it("posts the bounded WebP with the tracking secret and generation id", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "launchloom-hero-"));
    const heroFile = path.join(directory, "desktop.png");
    await writeFile(heroFile, Buffer.from("source"));
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    try {
      const result = await uploadGenerationHero({
        api: "https://api.example.test",
        secret: "test-tracking-secret",
        generationId: "issue:42",
        heroFile,
        fetchImpl,
        encode: async () => Buffer.from("webp"),
      });

      expect(result).toMatchObject({
        bytes: 4,
        width: 1280,
        quality: 72,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe(
        "https://api.example.test/api/internal/generations/hero?id=issue%3A42",
      );
      expect(init).toMatchObject({
        method: "POST",
        headers: {
          Authorization: "Bearer test-tracking-secret",
          "Content-Type": "image/webp",
        },
      });
      expect(Buffer.from(init.body as Uint8Array).toString()).toBe("webp");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("throws a typed upload error for a rejected request", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "launchloom-hero-"));
    const heroFile = path.join(directory, "desktop.png");
    await writeFile(heroFile, Buffer.from("source"));
    try {
      const error = await uploadGenerationHero({
        api: "https://api.example.test",
        secret: "test-tracking-secret",
        generationId: "issue:42",
        heroFile,
        fetchImpl: async () => new Response("unavailable", { status: 503 }),
        encode: async () => Buffer.from("webp"),
      }).catch((failure: unknown) => failure);

      expect(error).toBeInstanceOf(HeroUploadError);
      expect(error).toMatchObject({
        code: "hero_upload_rejected",
        status: 503,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("hero failure status", () => {
  it("turns a preview_ready result into attention with a bounded reason", () => {
    const adjusted = applyHeroFailure(
      baseAttemptArgs,
      new HeroUploadError(503),
    ) as {
      status: string;
      "delivery-status": string;
      failure?: string;
    };

    expect(adjusted).toMatchObject({
      status: "attention",
      "delivery-status": "attention",
    });
    expect(adjusted.failure).toContain(
      "Generation thumbnail upload failed: Hero upload was rejected (503).",
    );
    const attempt = buildAttemptTrackingPayload(adjusted, []);
    expect(attempt?.observation).toMatchObject({
      deliveryStatus: "attention",
      failure: {
        summary: expect.stringContaining("Generation thumbnail upload failed"),
      },
    });
  });

  it("treats a complete action without an explicit status as preview_ready", () => {
    const adjusted = applyHeroFailure(
      { ...baseAttemptArgs, status: "", action: "complete" },
      new HeroUploadError(503),
    ) as { status: string };
    expect(adjusted.status).toBe("attention");
  });

  it("does not expose arbitrary encoder errors in the ledger or step summary", () => {
    expect(
      safeHeroFailureMessage(
        new Error("sharp failed at /private/client/screenshot.png"),
      ),
    ).toBe("Hero image could not be encoded or uploaded.");
  });

  it("never demotes failed or published states", () => {
    for (const status of ["failed", "published"])
      expect(
        (
          applyHeroFailure(
            { ...baseAttemptArgs, status },
            new HeroUploadError(503),
          ) as { status: string }
        ).status,
      ).toBe(status);
  });

  it("records attention and exits nonzero when the CLI hero upload fails", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "launchloom-hero-"));
    const heroFile = path.join(directory, "desktop.png");
    const heroPng = await sharp({
      create: {
        width: 320,
        height: 200,
        channels: 3,
        background: { r: 229, g: 232, b: 223 },
      },
    })
      .png()
      .toBuffer();
    await writeFile(heroFile, heroPng);
    const summaryFile = path.join(directory, "summary.md");
    await writeFile(summaryFile, "");
    const captured: Array<{ path: string; body: unknown }> = [];
    const server = http.createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      const requestPath = request.url || "";
      const isHero = requestPath.startsWith("/api/internal/generations/hero");
      captured.push({
        path: requestPath,
        body: isHero ? body.length : JSON.parse(body),
      });
      if (isHero) {
        response.writeHead(503, { "Content-Type": "text/plain" });
        response.end("unavailable");
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end("{}");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    try {
      const child = spawn(process.execPath, heroCliArgs(port, heroFile), {
        cwd: process.cwd(),
        env: {
          ...process.env,
          GITHUB_REPOSITORY: "WrazyAI/launchloom",
          GITHUB_STEP_SUMMARY: summaryFile,
        },
      });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      const [code] = await once(child, "close");
      expect(code).toBe(1);
      const summary = await readFile(summaryFile, "utf8");
      expect(summary).toContain("Generation thumbnail failed");
      expect(summary).toContain("Hero upload was rejected (503).");
      expect(summary).not.toContain(directory);
      expect(summary).not.toMatch(/sam@example|Harbor Plumbing|555-0100/iu);

      const attempt = captured.find(
        (entry) => entry.path === "/api/internal/generation-attempts",
      )?.body as { observation?: Record<string, unknown> } | undefined;
      expect(attempt?.observation).toMatchObject({
        deliveryStatus: "attention",
        failure: {
          summary: expect.stringContaining(
            "Generation thumbnail upload failed",
          ),
        },
      });

      const legacy = captured.find(
        (entry) => entry.path === "/api/internal/generations",
      )?.body as { generation?: Record<string, unknown> } | undefined;
      expect(legacy?.generation).toMatchObject({
        status: "attention",
        failureReason: expect.stringContaining(
          "Generation thumbnail upload failed",
        ),
      });
      expect(
        captured.some((entry) =>
          entry.path.startsWith("/api/internal/generations/hero"),
        ),
      ).toBe(true);
      expect(stderr).toContain("generation_thumbnail=failed");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("uploads a real WebP and records preview_ready on the CLI success path", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "launchloom-hero-"));
    const heroFile = path.join(directory, "desktop.png");
    const heroPng = await sharp({
      create: {
        width: 320,
        height: 200,
        channels: 3,
        background: { r: 229, g: 232, b: 223 },
      },
    })
      .png()
      .toBuffer();
    await writeFile(heroFile, heroPng);
    const captured: Array<{ path: string; body?: unknown; raw?: Buffer }> = [];
    const server = http.createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const raw = Buffer.concat(chunks);
      const requestPath = request.url || "";
      const isHero = requestPath.startsWith("/api/internal/generations/hero");
      captured.push({
        path: requestPath,
        body: isHero ? undefined : JSON.parse(raw.toString() || "{}"),
        raw: isHero ? raw : undefined,
      });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end("{}");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    try {
      const child = spawn(process.execPath, heroCliArgs(port, heroFile), {
        cwd: process.cwd(),
        env: {
          ...process.env,
          GITHUB_REPOSITORY: "WrazyAI/launchloom",
          GITHUB_STEP_SUMMARY: "",
        },
      });
      let stdout = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      const [code] = await once(child, "close");
      expect(code).toBe(0);

      const hero = captured.find((entry) =>
        entry.path.startsWith("/api/internal/generations/hero"),
      );
      expect(hero?.raw?.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(hero?.raw?.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(stdout).toContain("hero=uploaded:");
      expect(stdout).toContain("status=preview_ready");

      const attempt = captured.find(
        (entry) => entry.path === "/api/internal/generation-attempts",
      )?.body as { observation?: Record<string, unknown> } | undefined;
      expect(attempt?.observation).toMatchObject({
        deliveryStatus: "preview_ready",
      });

      const legacy = captured.find(
        (entry) => entry.path === "/api/internal/generations",
      )?.body as { generation?: Record<string, unknown> } | undefined;
      expect(legacy?.generation).toMatchObject({ status: "preview_ready" });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });
});
