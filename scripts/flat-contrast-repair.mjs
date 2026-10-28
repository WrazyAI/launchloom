import {
  ensureContrast,
  parseRgba,
  relativeLuminance,
  rgbHex,
} from "./color-contrast.mjs";

const OPAQUE_HEX = /^#[0-9a-f]{6}$/iu;
const TEXT_COLOR_DECLARATION =
  /(^|[;{\s])((?:-webkit-text-fill-color|color)\s*:\s*)(#[0-9a-f]{6})\b/giu;

function opaqueHex(value) {
  if (typeof value === "string" && OPAQUE_HEX.test(value.trim()))
    return value.trim().toLowerCase();
  const rgba = parseRgba(value);
  if (!rgba || rgba[3] !== 1) return "";
  return rgbHex(rgba);
}

/** Standard WCAG relative-luminance contrast for two opaque colors. */
export function wcagContrast(foreground, background) {
  const fg = parseRgba(foreground);
  const bg = parseRgba(background);
  if (!fg || !bg || fg[3] !== 1 || bg[3] !== 1) return Number.NaN;
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Nearest passing foreground for a flat text/background pair. Hue is retained
 * through the shared Oklab proof, so a muted green darkens instead of turning
 * neutral black.
 */
export function darkenToContrast(foreground, background, required = 4.5) {
  const current = wcagContrast(foreground, background);
  if (Number.isFinite(current) && current >= required)
    return rgbHex(parseRgba(foreground));
  return ensureContrast(foreground, background, required);
}

/**
 * Findings the bounded correction engine can repair deterministically: a
 * failing text color with one measured opaque background and no unresolved
 * paint issues. Variable photo backdrops and overlapping-surface findings are
 * deliberately excluded because a single static color cannot be proven
 * against them.
 */
export function parseFlatContrastFindings(findings = []) {
  const pairs = [];
  for (const finding of Array.isArray(findings) ? findings : []) {
    if (!finding || finding.status !== "fail") continue;
    if (finding.kind !== "text") continue;
    if (finding.variable === true) continue;
    if (Array.isArray(finding.issues) && finding.issues.length) continue;
    const backgrounds = Array.isArray(finding.backgrounds)
      ? finding.backgrounds
      : [];
    if (backgrounds.length !== 1) continue;
    const foreground = opaqueHex(finding.color ?? finding.foreground);
    const background = opaqueHex(finding.background ?? backgrounds[0]);
    if (!foreground || !background) continue;
    const required = Number(finding.minimum);
    if (!Number.isFinite(required) || required < 1 || required > 21) continue;
    pairs.push({
      route: String(finding.route || ""),
      viewport: String(finding.viewport || ""),
      state: String(finding.state || "default"),
      selector: String(finding.selector || ""),
      text: String(finding.text || ""),
      foreground,
      background,
      ratio: Number(finding.ratio),
      required,
    });
  }
  return pairs;
}

function replacementMap(pairs) {
  const replacements = new Map();
  const skipped = [];
  for (const pair of pairs || []) {
    const foreground = opaqueHex(pair?.foreground);
    const background = opaqueHex(pair?.background);
    const required = Number(pair?.required ?? 4.5);
    if (!foreground || !background || !Number.isFinite(required)) {
      skipped.push({
        foreground: pair?.foreground ?? "",
        reason: "not a flat opaque pair",
      });
      continue;
    }
    const replacement = darkenToContrast(foreground, background, required);
    if (replacement === foreground) continue;
    if (!replacements.has(foreground)) replacements.set(foreground, new Set());
    replacements.get(foreground).add(replacement);
  }
  const unique = new Map();
  for (const [foreground, values] of replacements) {
    if (values.size !== 1) {
      skipped.push({
        foreground,
        reason: "conflicting replacements for one authored token",
      });
      continue;
    }
    unique.set(foreground, [...values][0]);
  }
  return { replacements: unique, skipped };
}

/**
 * Replace only exact authored text-color declarations for flat failing pairs.
 * Background, border, and unrelated colors are untouched. A token that would
 * need different replacements on different surfaces, an absent token, or a
 * plan above the edit budget fails closed so the caller can defer to bounded
 * author repair.
 */
export function repairFlatContrastCss(css, pairs, { maxEdits = 32 } = {}) {
  const source = String(css ?? "");
  const { replacements, skipped } = replacementMap(pairs);
  if (!replacements.size) return { css: source, edits: [], skipped };
  const counts = new Map();
  // One pass over the source, so a replacement can never be re-read as
  // another token and cascaded into a different color.
  const output = source.replace(
    TEXT_COLOR_DECLARATION,
    (match, prefix, property, token) => {
      const foreground = String(token).toLowerCase();
      const replacement = replacements.get(foreground);
      if (!replacement) return match;
      counts.set(foreground, (counts.get(foreground) || 0) + 1);
      return `${prefix}${property}${replacement}`;
    },
  );
  const edits = [...replacements]
    .filter(([foreground]) => counts.has(foreground))
    .map(([foreground, replacement]) => ({
      foreground,
      replacement,
      count: counts.get(foreground),
    }));
  for (const [foreground] of replacements)
    if (!counts.has(foreground))
      skipped.push({ foreground, reason: "authored text color token absent" });
  const total = edits.reduce((sum, edit) => sum + edit.count, 0);
  if (!edits.length || total > maxEdits)
    return {
      css: source,
      edits: [],
      skipped: [
        ...skipped,
        ...(total > maxEdits
          ? [{ foreground: "*", reason: `edit budget ${maxEdits} exceeded` }]
          : []),
      ],
    };
  return { css: output, edits, skipped };
}
