#!/usr/bin/env node
/**
 * Vendor the client font catalog as latin-subset woff2 files.
 *
 * Downloads from the Google Fonts CSS API into both the platform public dir
 * (onboarding previews) and the client template public dir (generated sites).
 * Idempotent: existing files are kept unless --force is passed.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FONT_FAMILIES,
  fontFilesFor,
} from "../templates/client-site/src/lib/font-catalog.mjs";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const force = process.argv.includes("--force");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  path.join(root, "public", "fonts"),
  path.join(root, "templates", "client-site", "public", "fonts"),
];

function googleFontsUrl(family) {
  const name = encodeURIComponent(family.googleFamily).replace(/%20/gu, "+");
  return `https://fonts.googleapis.com/css2?family=${name}:${family.googleAxes}&display=swap`;
}

/** Parse the latin @font-face blocks out of a Google Fonts stylesheet. */
function latinFaces(css) {
  const faces = [];
  const blockPattern =
    /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/gu;
  for (const match of css.matchAll(blockPattern)) {
    const label = match[1];
    if (label !== "latin" && label !== "latin-ext") continue;
    const body = match[2];
    const read = (property) =>
      new RegExp(`${property}\\s*:\\s*([^;]+);`, "u")
        .exec(body)?.[1]
        ?.trim() || "";
    const url = read("src").match(/url\(\s*["']?([^"')]+)["']?\s*\)/u)?.[1];
    if (!url) continue;
    faces.push({
      label,
      style: read("font-style") === "italic" ? "italic" : "normal",
      weight: Number.parseInt(read("font-weight"), 10) || 400,
      url,
    });
  }
  return faces;
}

async function download(url, destination) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok)
    throw new Error(`Font download failed (${response.status}): ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1024 || buffer.toString("ascii", 0, 4) !== "wOF2")
    throw new Error(`Font download is not a woff2 file: ${url}`);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, buffer);
  return buffer.length;
}

let downloaded = 0;
let skipped = 0;
for (const family of FONT_FAMILIES) {
  const response = await fetch(googleFontsUrl(family), {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok)
    throw new Error(
      `Google Fonts CSS failed for ${family.id}: ${response.status}`,
    );
  const faces = latinFaces(await response.text());
  for (const file of fontFilesFor(family)) {
    const face =
      faces.find(
        (item) =>
          item.label === "latin" &&
          item.weight === file.weight &&
          item.style === file.style,
      ) ||
      faces.find(
        (item) => item.weight === file.weight && item.style === file.style,
      );
    if (!face)
      throw new Error(
        `No latin woff2 for ${family.id} ${file.weight} ${file.style}`,
      );
    for (const target of targets) {
      const destination = path.join(
        target,
        family.id,
        path.basename(file.path),
      );
      if (!force && (await fs.access(destination).then(() => true, () => false))) {
        skipped += 1;
        continue;
      }
      const bytes = await download(face.url, destination);
      console.log(
        `${family.id}/${path.basename(file.path)} ${(bytes / 1024).toFixed(0)}KB`,
      );
      downloaded += 1;
    }
  }
}

console.log(
  `Vendored ${downloaded} font file(s), kept ${skipped} existing file(s).`,
);
