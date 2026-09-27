import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  promptImagePart,
  selectAuthorReferenceScreenshots,
  selectRepairScreenshots,
} from "../scripts/prompt-evidence.mjs";

describe("prompt evidence", () => {
  it("bounds a long full-page screenshot while preserving multimodal context", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-prompt-test-"),
    );
    const source = path.join(directory, "reference.png");
    await sharp({
      create: {
        width: 1920,
        height: 6832,
        channels: 3,
        background: { r: 18, g: 18, b: 18 },
      },
    })
      .png()
      .toFile(source);

    const part = await promptImagePart(source);
    expect(part.type).toBe("image_url");
    expect(part.image_url.detail).toBe("low");
    expect(part.image_url.url.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(
      Buffer.from(part.image_url.url.split(",")[1], "base64").length,
    ).toBeLessThan(900_000);
  });

  it("crops a full-page reference to its recorded viewport before sending visual evidence", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-viewport-crop-"),
    );
    const source = path.join(directory, "reference-full-page.png");
    await sharp({
      create: {
        width: 1920,
        height: 6832,
        channels: 3,
        background: { r: 18, g: 18, b: 18 },
      },
    })
      .png()
      .toFile(source);

    const part = await promptImagePart(source, {
      detail: "high",
      crop: { left: 0, top: 0, width: 1920, height: 1080 },
    } as any);
    const prepared = sharp(
      Buffer.from(part.image_url.url.split(",")[1], "base64"),
    );
    const metadata = await prepared.metadata();

    expect(part.image_url.detail).toBe("high");
    expect({ width: metadata.width, height: metadata.height }).toEqual({
      width: 1200,
      height: 675,
    });
  });

  it("transcodes A1 AVIF reference screenshots into actual JPEG evidence", async () => {
    const source = path.resolve(
      "data/reference-library/dossiers/a1-craft-collage-field/screenshots/gallery-preview.avif",
    );

    const part = await promptImagePart(source);
    const bytes = Buffer.from(part.image_url.url.split(",")[1], "base64");

    expect(part.image_url.url.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  });

  it("keeps desktop and mobile evidence and drops redundant compact desktop", () => {
    expect(
      selectRepairScreenshots([
        "/tmp/candidate-desktop.png",
        "/tmp/candidate-compact.png",
        "/tmp/candidate-mobile.png",
      ]),
    ).toEqual(["/tmp/candidate-desktop.png", "/tmp/candidate-mobile.png"]);
  });

  it("keeps both reference screenshots on first pass and only desktop bitmap on retries", () => {
    const reference = {
      desktop: "/tmp/reference-desktop.png",
      mobile: "/tmp/reference-mobile.png",
    };

    expect(selectAuthorReferenceScreenshots(reference)).toEqual([
      reference.desktop,
      reference.mobile,
    ]);
    expect(
      selectAuthorReferenceScreenshots(reference, { retry: true }),
    ).toEqual([reference.desktop]);
  });
});
