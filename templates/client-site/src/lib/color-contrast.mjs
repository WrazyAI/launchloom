// WCAG 2.2 relative luminance. Unknown colors are unresolved, never black.
const clamp = (n, max = 1) => Math.max(0, Math.min(max, n));
export function parseRgba(value) {
  const input = String(value || "")
    .trim()
    .toLowerCase();
  if (input === "transparent") return [0, 0, 0, 0];
  if (input === "black") return [0, 0, 0, 1];
  if (input === "white") return [255, 255, 255, 1];
  const hex = input.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/);
  if (hex) {
    const raw =
      hex[1].length < 5 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4]
      .map((i) => parseInt(raw.slice(i, i + 2), 16))
      .concat(raw.length === 8 ? parseInt(raw.slice(6), 16) / 255 : 1);
  }
  const rgb = input.match(/^(rgba?|color)\((.*)\)$/);
  if (!rgb) return null;
  const srgb = rgb[1] === "color";
  if (srgb && !rgb[2].startsWith("srgb ")) return null;
  const parts = rgb[2]
    .replace(/^srgb\s+/, "")
    .split(/[\s,/]+/)
    .filter(Boolean);
  if (
    parts.length < 3 ||
    parts.length > 4 ||
    parts.some((p) => !/^[+-]?(?:\d*\.)?\d+%?$/.test(p))
  )
    return null;
  const channels = parts
    .slice(0, 3)
    .map((p) =>
      clamp(parseFloat(p) * (p.endsWith("%") ? 2.55 : srgb ? 255 : 1), 255),
    );
  return channels.concat(
    parts[3]
      ? clamp(parseFloat(parts[3]) / (parts[3].endsWith("%") ? 100 : 1))
      : 1,
  );
}
export function parseCssColor(value) {
  return parseRgba(value)?.slice(0, 3).map(Math.round) || [];
}
export function composite(foreground, background) {
  if (!foreground || !background || background[3] !== 1) return null;
  return foreground
    .slice(0, 3)
    .map((c, i) => c * foreground[3] + background[i] * (1 - foreground[3]))
    .concat(1);
}
export function relativeLuminance(rgb) {
  if (!rgb || rgb.length < 3) return NaN;
  return rgb
    .slice(0, 3)
    .map((c) => c / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
}
export function contrast(first, second, backdrop) {
  const fg = parseRgba(first),
    bg = parseRgba(second);
  const base = backdrop ? parseRgba(backdrop) : null;
  const opaqueBg = bg?.[3] === 1 ? bg : composite(bg, base);
  const opaqueFg = composite(fg, opaqueBg);
  if (!opaqueBg || !opaqueFg) return NaN;
  const a = relativeLuminance(opaqueFg),
    b = relativeLuminance(opaqueBg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
export const rgbHex = (rgb) =>
  `#${rgb
    .slice(0, 3)
    .map((c) => Math.round(clamp(c, 255)).toString(16).padStart(2, "0"))
    .join("")}`;

// CSS Color 4 Oklab matrices. Search lightness, retain hue, reduce chroma only
// when needed to fit sRGB. Final acceptance uses quantized WCAG contrast.
export function toOklab(color) {
  const rgba = parseRgba(color);
  if (!rgba || rgba[3] !== 1)
    throw new Error("An opaque sRGB color is required");
  const [r, g, b] = rgba
    .slice(0, 3)
    .map((c) => c / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function fromLab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
function atLightness(lab, L) {
  let low = 0,
    high = 1;
  const fits = (rgb) => rgb.every((c) => c >= -1e-7 && c <= 1.0000001);
  if (!fits(fromLab([L, lab[1], lab[2]]))) {
    for (let i = 0; i < 25; i++) {
      const mid = (low + high) / 2;
      if (fits(fromLab([L, lab[1] * mid, lab[2] * mid]))) low = mid;
      else high = mid;
    }
  } else low = 1;
  return rgbHex(
    fromLab([L, lab[1] * low, lab[2] * low]).map(
      (c) =>
        255 *
        (c <= 0.0031308 ? 12.92 * c : 1.055 * clamp(c) ** (1 / 2.4) - 0.055),
    ),
  );
}
export function ensureContrast(color, background, minimum = 4.5) {
  if (!Number.isFinite(minimum) || minimum < 1 || minimum > 21)
    throw new Error("Invalid contrast threshold");
  if (contrast(color, background) >= minimum) return rgbHex(parseRgba(color));
  const lab = toOklab(color);
  toOklab(background);
  const candidates = [];
  for (const end of [0, 1]) {
    if (contrast(atLightness(lab, end), background) < minimum) continue;
    let failing = lab[0],
      passing = end;
    for (let i = 0; i < 30; i++) {
      const mid = (failing + passing) / 2;
      if (contrast(atLightness(lab, mid), background) >= minimum) passing = mid;
      else failing = mid;
    }
    candidates.push(atLightness(lab, passing));
  }
  if (!candidates.length)
    throw new Error("No readable foreground at requested threshold");
  return candidates.sort((a, b) => {
    const distance = (color) =>
      toOklab(color).reduce((s, c, i) => s + (c - lab[i]) ** 2, 0);
    return distance(a) - distance(b);
  })[0];
}
