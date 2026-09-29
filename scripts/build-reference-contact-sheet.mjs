import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { escapeXmlText } from "./svg-text.mjs";

const root = path.resolve(import.meta.dirname, "..");
const corePath = path.join(root, "data/reference-library/core-collection.json");
const outputPath = path.join(root, "data/reference-library/core-collection-hero-contact-sheet.png");
const core = JSON.parse(await fs.readFile(corePath, "utf8"));
const ids = core.niches.flatMap((niche) => niche.referenceIds);
const columns = 6;
const rows = Math.ceil(ids.length / columns);
const cellWidth = 240;
const imageHeight = 142;
const labelHeight = 32;
const gap = 12;
const padding = 16;
const canvasWidth = padding * 2 + columns * cellWidth + (columns - 1) * gap;
const canvasHeight = padding * 2 + rows * (imageHeight + labelHeight) + (rows - 1) * gap;
const composites = [];

for (let index = 0; index < ids.length; index += 1) {
  const id = ids[index];
  const directory = path.join(root, "data/reference-library/dossiers", id);
  const manifest = JSON.parse(await fs.readFile(path.join(directory, "manifest.json"), "utf8"));
  const desktopPath = path.join(directory, manifest.evidence.desktop.path);
  const metadata = await sharp(desktopPath).metadata();
  const viewportHeight = manifest.evidence.desktop.viewport.height;
  const cropHeight = Math.min(metadata.height || viewportHeight, viewportHeight);
  const image = await sharp(desktopPath)
    .extract({ left: 0, top: 0, width: metadata.width, height: cropHeight })
    .resize(cellWidth, imageHeight, { fit: "cover", position: "top" })
    .png()
    .toBuffer();
  const shortName = escapeXmlText(String(manifest.referenceName || id).slice(0, 37));
  const x = padding + (index % columns) * (cellWidth + gap);
  const y = padding + Math.floor(index / columns) * (imageHeight + labelHeight + gap);
  const labelSvg = Buffer.from(
    `<svg width="${cellWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f7f5ef"/><text x="8" y="13" font-family="Arial,sans-serif" font-size="10" font-weight="700" fill="#202521">${escapeXmlText(id.slice(0, 38))}</text><text x="8" y="27" font-family="Arial,sans-serif" font-size="10" fill="#4c514d">${shortName}</text></svg>`,
  );
  composites.push({ input: image, left: x, top: y });
  composites.push({ input: labelSvg, left: x, top: y + imageHeight });
}

await sharp({
  create: {
    width: canvasWidth,
    height: canvasHeight,
    channels: 3,
    background: "#e9e6de",
  },
})
  .composite(composites)
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(`contact_sheet=${path.relative(root, outputPath)} references=${ids.length} dimensions=${canvasWidth}x${canvasHeight}`);
