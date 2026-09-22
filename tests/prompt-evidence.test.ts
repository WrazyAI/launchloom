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
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-prompt-test-"));
    const source = path.join(directory, "reference.png");
    await sharp({
      create: {
        width: 1920,
        height: 6832,
        channels: 3,
        background: { r: 18, g: 18, b: 18 },
      },
    }).png().toFile(source);

    const part = await promptImagePart(source);
    expect(part.type).toBe("image_url");
    expect(part.image_url.detail).toBe("low");
    expect(part.image_url.url.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(Buffer.from(part.image_url.url.split(",")[1], "base64").length).toBeLessThan(900_000);
  });

  it("transcodes A1 AVIF reference screenshots into actual JPEG evidence", async () => {
    const source = path.resolve(
      "data/inspiration-evidence/a1-gallery/craft-2025/desktop.avif",
    );

    const part = await promptImagePart(source);
    const bytes = Buffer.from(part.image_url.url.split(",")[1], "base64");

    expect(part.image_url.url.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  });

  it("keeps desktop and mobile evidence and drops redundant compact desktop", () => {
    expect(selectRepairScreenshots([
      "/tmp/candidate-desktop.png",
      "/tmp/candidate-compact.png",
      "/tmp/candidate-mobile.png",
    ])).toEqual([
      "/tmp/candidate-desktop.png",
      "/tmp/candidate-mobile.png",
    ]);
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
    expect(selectAuthorReferenceScreenshots(reference, { retry: true })).toEqual([
      reference.desktop,
    ]);
  });
});
