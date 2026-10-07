import {
  contrast,
  ensureContrast,
  parseRgba,
  rgbHex,
} from "./color-contrast.mjs";

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

function rgbToHsl([red, green, blue]) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;
  if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
  else if (max === g) hue = ((b - r) / delta + 2) / 6;
  else hue = ((r - g) / delta + 4) / 6;
  return [hue, saturation, lightness];
}

function hslToRgb([hue, saturation, lightness]) {
  if (saturation === 0) {
    const channel = Math.round(lightness * 255);
    return [channel, channel, channel];
  }
  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const channel = (offset) => {
    let t = offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [channel(hue + 1 / 3), channel(hue), channel(hue - 1 / 3)].map(
    (value) => Math.round(value * 255),
  );
}

/** Rotate a color's hue while keeping its saturation and lightness. */
export function rotateHue(color, degrees) {
  const parsed = parseRgba(color);
  if (!parsed) throw new Error("rotateHue requires a parseable color");
  const [hue, saturation, lightness] = rgbToHsl(parsed);
  const rotated = (((hue + degrees / 360) % 1) + 1) % 1;
  return rgbHex(hslToRgb([rotated, saturation, lightness]));
}

/**
 * Deterministic complementary choices for the onboarding accent picker. The
 * client can adopt one or pick a custom color; every adopted color is then
 * contrast-repaired by resolvePalette.
 */
export function suggestAccentColors(primaryColor) {
  const base = safeHex(primaryColor, "#205d51");
  return [180, 150, 30].map((degrees) => rotateHue(base, degrees));
}

export function readableOn(color) {
  return contrast("#ffffff", color) >= contrast("#000000", color)
    ? "#ffffff"
    : "#000000";
}

function readableAccent(primary, surface) {
  return ensureContrast(primary, surface);
}

function readableSurface(color) {
  let candidate = color;
  let foreground = readableOn(candidate);
  if (contrast(foreground, candidate) >= 4.5)
    return { color: candidate, foreground };
  const target = foreground === "#ffffff" ? "#000000" : "#ffffff";
  for (let weight = 0.05; weight <= 1; weight += 0.05) {
    candidate = mix(color, target, weight);
    foreground = readableOn(candidate);
    if (contrast(foreground, candidate) >= 4.5)
      return { color: candidate, foreground };
  }
  return { color: "#111315", foreground: "#ffffff" };
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
  const inkColor = ensureContrast(
    safeHex(input.inkColor, surfaceIsDark ? "#f7f7f2" : "#14201d"),
    surfaceColor,
  );
  const heroColor = safeHex(
    input.heroColor,
    surfaceIsDark ? mix(surfaceColor, "#ffffff", 0.05) : "#e8eee5",
  );
  const mutedColor = ensureContrast(
    safeHex(input.mutedColor, mix(inkColor, surfaceColor, 0.38)),
    surfaceColor,
  );
  const lineColor = safeHex(input.lineColor, mix(inkColor, surfaceColor, 0.8));
  const exceptionallyBright = contrast("#000000", primaryColor) >= 10;
  const requestedBrandSurfaceColor = safeHex(
    input.brandSurfaceColor,
    exceptionallyBright ? mix(primaryColor, "#111315", 0.84) : primaryColor,
  );
  const brandSurface = readableSurface(requestedBrandSurfaceColor);
  const accentColor = safeHex(input.accentColor, "");
  // Light pack and inner-page bands that sit below the page canvas. Repair the
  // accent against the darkest of them so one variant stays readable on the
  // guide canvas, service canvas and contact band, and the tinted hero mixes.
  const lightBandSurfaces = [
    ...(readableOn(surfaceColor) === "#000000" ? [surfaceColor] : []),
    "#f7f5ee",
    "#f6f3eb",
    "#e7e2d7",
    "#eef1ea",
    mix(brandSurface.color, "#f7f4ec", 0.91),
    mix(primaryColor, "#f1eee5", 0.91),
  ];
  const darkestLightBand = lightBandSurfaces.reduce((darkest, candidate) =>
    contrast("#000000", candidate) < contrast("#000000", darkest)
      ? candidate
      : darkest,
  );
  // The accent is optional: absent it, sites keep exactly the palette shape
  // they had before. When a client adopts one, text on the accent fill and
  // accent-colored text on the page surface are both contrast-repaired, and
  // each recurring accent surface (hero, brand, dark bands, light pack bands)
  // gets a readable variant so secondary marks stay legible wherever they land.
  const accent = accentColor
    ? {
        accentColor,
        accentTextColor: ensureContrast(accentColor, surfaceColor),
        accentContrastColor: readableOn(accentColor),
        accentMarkColor: ensureContrast(accentColor, surfaceColor, 3),
        accentTextHero: ensureContrast(accentColor, heroColor),
        accentTextBrand: ensureContrast(accentColor, brandSurface.color),
        accentTextDark: ensureContrast(accentColor, "#14201d"),
        accentTextLightBand: ensureContrast(accentColor, darkestLightBand),
      }
    : {};

  const palette = {
    primaryColor,
    contrastColor: readableOn(primaryColor),
    brandTextColor: readableAccent(primaryColor, surfaceColor, inkColor),
    brandSurfaceColor: brandSurface.color,
    brandSurfaceTextColor: brandSurface.foreground,
    surfaceColor,
    heroColor,
    inkColor,
    mutedColor,
    lineColor,
    ...accent,
  };
  /** @type {Record<string, {surface:string,text:string,mutedText:string,link:string,action:string,onAction:string,border:string,focus:string}>} */
  const surfaces = {};
  const defaults = {
    page: surfaceColor,
    light: "#f8f6f0",
    dark: "#14201d",
    hero: heroColor,
    brand: brandSurface.color,
    nav: surfaceColor,
    contact: "#ece7dc",
    footer: "#17251f",
    cardHover: "#e6efe5",
  };
  for (const [name, fallback] of Object.entries(defaults)) {
    const requested = input.surfaces?.[name] || {};
    const surface = ["page", "hero", "brand"].includes(name)
      ? fallback
      : safeHex(requested.surface, fallback);
    const text = ensureContrast(safeHex(requested.text, inkColor), surface);
    surfaces[name] = {
      surface,
      text,
      mutedText: ensureContrast(
        safeHex(requested.mutedText, mutedColor),
        surface,
      ),
      link: ensureContrast(primaryColor, surface),
      action: primaryColor,
      onAction: readableOn(primaryColor),
      border: ensureContrast(safeHex(requested.border, lineColor), surface, 3),
      focus: ensureContrast(primaryColor, surface, 3),
    };
  }
  return { ...palette, surfaces };
}

export function semanticColorCss(input = {}) {
  const palette = resolvePalette(input);
  const { surfaces } = palette;
  const accentColor = palette.accentColor;
  return (
    Object.entries(surfaces)
      .map(([name, roles]) => {
        const declarations = Object.entries(roles)
          .map(
            ([role, value]) =>
              `--ll-${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${value};`,
          )
          .join("");
        // Re-derive the accent for this surface so accent marks stay
        // readable wherever a client accent lands (fills need 3:1, text 4.5:1).
        const accentDeclarations = accentColor
          ? `--ll-accent:${ensureContrast(accentColor, roles.surface, 3)};--ll-accent-text:${ensureContrast(accentColor, roles.surface)};`
          : "";
        return `[data-ll-surface="${name}"]{${declarations}${accentDeclarations}background-color:var(--ll-surface);color:var(--ll-text);--ink:var(--ll-text);--muted:var(--ll-muted-text);--brand-ink:var(--ll-link);}`;
      })
      .join("\n") +
    `
[data-ll-surface] :where(p,h1,h2,h3,h4,h5,h6,li,label,legend,small){color:inherit;}
[data-ll-surface] [data-ll-muted]{color:var(--ll-muted-text);}
[data-ll-surface] :where(a){color:var(--ll-link);}
[data-ll-surface] [data-ll-action]{background-color:var(--ll-action);color:var(--ll-on-action);}
[data-ll-surface] :where(a,button,input,textarea,select):focus-visible{outline:2px solid var(--ll-focus);outline-offset:3px;}
[data-ll-surface] :is(input,textarea,select){border-color:var(--ll-border);}
`
  );
}
