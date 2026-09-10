import { contrast } from "./color-contrast.mjs";

const HEX = /^#[0-9a-f]{6}$/i;

function safeHex(value, fallback) {
  const candidate = String(value || "")
    .trim()
    .toLowerCase();
  return HEX.test(candidate) ? candidate : fallback;
}

function channels(hex) {
  return [1, 3, 5].map((index) =>
    Number.parseInt(hex.slice(index, index + 2), 16),
  );
}

function mix(first, second, secondWeight) {
  const left = channels(first);
  const right = channels(second);
  return `#${left
    .map((channel, index) =>
      Math.round(channel * (1 - secondWeight) + right[index] * secondWeight)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function readableOn(color) {
  return contrast("#ffffff", color) >= contrast("#000000", color)
    ? "#ffffff"
    : "#000000";
}

function readableAccent(primary, surface, ink) {
  if (contrast(primary, surface) >= 4.5) return primary;
  for (let weight = 0.15; weight <= 1; weight += 0.05) {
    const candidate = mix(primary, ink, weight);
    if (contrast(candidate, surface) >= 4.5) return candidate;
  }
  return ink;
}

/**
 * Keeps the submitted brand color intact for bounded accents and actions, then
 * derives separate tokens for text and large color fields. This prevents vivid
 * colors from becoming unreadable text or a full viewport of visual glare.
 */
export function resolvePalette(input = {}) {
  const primaryColor = safeHex(input.primaryColor, "#205d51");
  const surfaceColor = safeHex(input.surfaceColor, "#f8f6f0");
  const surfaceIsDark = readableOn(surfaceColor) === "#ffffff";
  const inkColor = safeHex(
    input.inkColor,
    surfaceIsDark ? "#f7f7f2" : "#14201d",
  );
  const heroColor = safeHex(
    input.heroColor,
    surfaceIsDark ? mix(surfaceColor, "#ffffff", 0.05) : "#e8eee5",
  );
  const mutedColor = safeHex(
    input.mutedColor,
    mix(inkColor, surfaceColor, 0.38),
  );
  const lineColor = safeHex(input.lineColor, mix(inkColor, surfaceColor, 0.8));
  const exceptionallyBright = contrast("#000000", primaryColor) >= 10;
  const brandSurfaceColor = safeHex(
    input.brandSurfaceColor,
    exceptionallyBright ? mix(primaryColor, "#111315", 0.84) : primaryColor,
  );

  return {
    primaryColor,
    contrastColor: readableOn(primaryColor),
    brandTextColor: readableAccent(primaryColor, surfaceColor, inkColor),
    brandSurfaceColor,
    brandSurfaceTextColor: readableOn(brandSurfaceColor),
    surfaceColor,
    heroColor,
    inkColor,
    mutedColor,
    lineColor,
  };
}
