import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import sharp from "sharp";
import {
  collectIframeFailures,
  collectImageDiagnostics,
  captureReferenceScreenshots,
  fitCaptureToViewportWidth,
  fullPageFramePlan,
} from "../scripts/capture-reference-screenshots.mjs";

describe("reference screenshot resource diagnostics", () => {
  it("separates confirmed broken images from unresolved image states", () => {
    const diagnostics = collectImageDiagnostics([
      {
        alt: "loaded image",
        src: "/loaded.png",
        currentSrc: "/loaded.png",
        complete: true,
        naturalWidth: 120,
      },
      {
        alt: "broken image",
        src: "/missing.png",
        currentSrc: "/missing.png",
        complete: true,
        naturalWidth: 0,
      },
      {
        alt: "empty source",
        src: "",
        currentSrc: "",
        complete: true,
        naturalWidth: 0,
      },
      {
        alt: "still loading",
        src: "/slow.png",
        currentSrc: "/slow.png",
        complete: false,
        naturalWidth: 0,
      },
      {
        alt: "no selected source",
        src: "/lazy.png",
        currentSrc: "",
        complete: false,
        naturalWidth: 0,
      },
    ]);

    expect(diagnostics.brokenImages).toEqual(["/missing.png"]);
    expect(diagnostics.unresolvedImages).toEqual([
      expect.objectContaining({
        alt: "empty source",
        src: "",
        reasons: ["empty-src", "empty-current-src"],
      }),
      expect.objectContaining({
        alt: "still loading",
        src: "/slow.png",
        reasons: ["incomplete-load"],
      }),
      expect.objectContaining({
        alt: "no selected source",
        src: "/lazy.png",
        reasons: ["empty-current-src", "incomplete-load"],
      }),
    ]);
  });

  it("records concise iframe failure text while omitting healthy frames and query secrets", () => {
    const diagnostics = collectIframeFailures([
      {
        url: "https://player.example.test/video/42?session=do-not-record",
        title: "Story player",
        bodyText:
          "We couldn't verify the security of your connection.\nAccess to this content has been restricted.",
      },
      {
        url: "https://player.example.test/video/43?session=healthy",
        title: "Healthy player",
        bodyText: "A short film about the studio.",
      },
    ]);

    expect(diagnostics).toEqual([
      {
        url: "https://player.example.test/video/42",
        title: "Story player",
        failureText:
          "We couldn't verify the security of your connection. Access to this content has been restricted.",
      },
    ]);
  });

  it("includes image and iframe failure diagnostics in the capture record", async () => {
    const server = createServer((request, response) => {
      if (request.url === "/missing.png") {
        response.writeHead(404, { "content-type": "image/png" });
        response.end("missing");
        return;
      }
      if (request.url?.startsWith("/story")) {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(
          `<!doctype html><title>Story frame</title><body>We couldn't verify the security of your connection. Access to this content has been restricted.</body>`,
        );
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><title>Reference fixture</title><body>
        <img alt="confirmed missing image" src="/missing.png">
        <img alt="empty image source" src="">
        <iframe title="Story" src="/story?session=secret"></iframe>
      </body>`);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Capture test server did not bind.");
    const outputDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "reference-capture-diagnostics-test-"),
    );
    try {
      const record = await captureReferenceScreenshots({
        url: `http://127.0.0.1:${address.port}/`,
        outputDirectory,
      });

      expect(record.captures.desktop.brokenImages).toContain(
        `http://127.0.0.1:${address.port}/missing.png`,
      );
      expect(record.captures.desktop.unresolvedImages).toEqual([
        expect.objectContaining({
          alt: "empty image source",
          reasons: expect.arrayContaining(["empty-src"]),
        }),
      ]);
      expect(record.captures.desktop.iframeFailures).toEqual([
        {
          url: `http://127.0.0.1:${address.port}/story`,
          title: "Story frame",
          failureText:
            "We couldn't verify the security of your connection. Access to this content has been restricted.",
        },
      ]);
    } finally {
      await fs.rm(outputDirectory, { recursive: true, force: true });
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }, 20_000);
});

describe("full-page reference screenshot stitching plan", () => {
  it("covers every document pixel exactly once after overlap crops", () => {
    const height = 19_050;
    const viewportHeight = 844;
    const frames = fullPageFramePlan({ height, viewportHeight, overlap: 120 });

    expect(frames[0]).toMatchObject({ scrollTop: 0, cropTop: 0, stitchTop: 0 });
    expect(frames.at(-1)!.stitchTop + frames.at(-1)!.copyHeight).toBe(height);
    for (let index = 1; index < frames.length; index += 1) {
      const previous = frames[index - 1];
      expect(frames[index].stitchTop).toBe(
        previous.stitchTop + previous.copyHeight,
      );
    }
    expect(
      frames.every(
        (frame) => frame.cropTop + frame.copyHeight <= viewportHeight,
      ),
    ).toBe(true);
    expect(
      frames.every((frame) => frame.scrollTop <= height - viewportHeight),
    ).toBe(true);
  });

  it("keeps a one-viewport mobile page as a valid full-page capture", () => {
    expect(fullPageFramePlan({ height: 844, viewportHeight: 844 })).toEqual([
      { scrollTop: 0, cropTop: 0, stitchTop: 0, copyHeight: 844 },
    ]);
  });

  it("rejects invalid dimensions and overlaps that cannot produce progress", () => {
    expect(() => fullPageFramePlan({ height: 0, viewportHeight: 844 })).toThrow(
      /positive integers/iu,
    );
    expect(() =>
      fullPageFramePlan({ height: 2_000, viewportHeight: 844, overlap: 844 }),
    ).toThrow(/smaller than the viewport/iu);
  });

  it("crops one-pixel document overflow back to the requested capture viewport", async () => {
    const source = await sharp({
      create: { width: 391, height: 3, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const normalized = await fitCaptureToViewportWidth(source, 390);

    expect((await sharp(normalized).metadata()).width).toBe(390);
  });

  it("fails rather than enlarging a capture narrower than its viewport", async () => {
    const source = await sharp({
      create: { width: 389, height: 3, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();

    await expect(fitCaptureToViewportWidth(source, 390)).rejects.toThrow(
      /narrower than .*viewport/iu,
    );
  });

  it("waits for scroll-triggered content before stitching custom scrollers", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><html><head><style>
        html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
        #scroll-root { position: fixed; top: 100px; left: 0; right: 0; bottom: 0; overflow-y: auto; background: white; }
        .scene { height: 100vh; display: grid; place-items: center; font: 30px sans-serif; }
        #delayed { background: rgb(220, 0, 0); color: white; padding: 12px; opacity: 0; }
        #delayed.visible { opacity: 1; }
      </style></head><body><main id="scroll-root">
        <section class="scene">Opening scene</section>
        <section class="scene"><p id="delayed">Scroll revealed content</p></section>
        <section class="scene">Closing scene</section>
      </main><script>
        let scheduled = false;
        document.querySelector('#scroll-root').addEventListener('scroll', () => {
          if (scheduled) return;
          scheduled = true;
          setTimeout(() => document.querySelector('#delayed').classList.add('visible'), 500);
        });
      </script></body></html>`);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Capture test server did not bind.");
    const outputDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "reference-capture-test-"),
    );
    try {
      const record = await captureReferenceScreenshots({
        url: `http://127.0.0.1:${address.port}/`,
        outputDirectory,
      });
      expect(record.captures.mobile.captureMethod).toBe(
        "playwright-scrolled-viewport-stitch-v1",
      );
      const { data, info } = await sharp(
        path.join(outputDirectory, "mobile.png"),
      )
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let redPixels = 0;
      let firstRedRow = info.height;
      for (let row = 0; row < info.height; row += 1)
        for (let column = 0; column < info.width; column += 1) {
          const index = (row * info.width + column) * 3;
          if (
            data[index] > 200 &&
            data[index + 1] < 40 &&
            data[index + 2] < 40
          ) {
            redPixels += 1;
            firstRedRow = Math.min(firstRedRow, row);
          }
        }
      expect(redPixels).toBeGreaterThan(100);
      expect(firstRedRow).toBeGreaterThanOrEqual(1_200);
      expect(firstRedRow).toBeLessThan(1_300);
    } finally {
      await fs.rm(outputDirectory, { recursive: true, force: true });
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }, 45_000);
});
