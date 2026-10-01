import { contrast, ensureContrast } from "./color-contrast.mjs";

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
  const { surfaces } = resolvePalette(input);
  return (
    Object.entries(surfaces)
      .map(([name, roles]) => {
        const declarations = Object.entries(roles)
          .map(
            ([role, value]) =>
              `--ll-${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${value};`,
          )
          .join("");
        return `[data-ll-surface="${name}"]{${declarations}background-color:var(--ll-surface);color:var(--ll-text);--ink:var(--ll-text);--muted:var(--ll-muted-text);--brand-ink:var(--ll-link);}`;
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
