/**
 * Self-hosted client font catalog.
 *
 * Generated client sites and the onboarding preview both read this module, so
 * every family ships with its woff2 files under /fonts/<id>/ and exposes a
 * local stack with system fallbacks. Remote font URLs stay banned.
 */

/** @typedef {{ weight: number, style: "normal" | "italic" }} FontFileSpec */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   category: "serif" | "display-serif" | "sans" | "display-sans" | "mono",
 *   stack: string,
 *   weights: number[],
 *   italic: boolean,
 *   pairingHints: string[],
 *   googleFamily: string,
 *   googleAxes: string,
 *   license: { name: string, url: string },
 * }} ClientFontFamily
 */

/** @type {ClientFontFamily[]} */
export const FONT_FAMILIES = Object.freeze([
  {
    id: "inter",
    name: "Inter",
    category: "sans",
    stack: '"Inter", "Segoe UI", Arial, sans-serif',
    weights: [400, 700],
    italic: true,
    pairingHints: ["source-serif", "newsreader", "fraunces"],
    googleFamily: "Inter",
    googleAxes: "ital,wght@0,400;0,700;1,400",
    license: { name: "OFL 1.1", url: "https://openfontlicense.org" },
  },
  {
    id: "source-serif",
    name: "Source Serif 4",
    category: "serif",
    stack: '"Source Serif 4", Charter, Georgia, serif',
    weights: [400, 700],
    italic: true,
    pairingHints: ["inter", "manrope", "archivo"],
    googleFamily: "Source Serif 4",
    googleAxes: "ital,wght@0,400;0,700;1,400",
    license: { name: "OFL 1.1", url: "https://openfontlicense.org" },
  },
  {
    id: "fraunces",
    name: "Fraunces",
    category: "display-serif",
    stack: '"Fraunces", Georgia, serif',
    weights: [400, 700],
    italic: true,
    pairingHints: ["inter", "manrope", "karla"],
    googleFamily: "Fraunces",
    googleAxes: "ital,wght@0,400;0,700;1,400",
    license: { name: "OFL 1.1", url: "https://openfontlicense.org" },
  },
  {
    id: "newsreader",
    name: "Newsreader",
    category: "display-serif",
    stack: '"Newsreader", Georgia, serif',
    weights: [400, 700],
    italic: true,
    pairingHints: ["inter", "libre-franklin"],
    googleFamily: "Newsreader",
    googleAxes: "ital,wght@0,400;0,700;1,400",
    license: { name: "OFL 1.1", url: "https://openfontlicense.org" },
  },
  {
    id: "cormorant-garamond",
    name: "Cormorant Garamond",
    category: "display-serif",
    stack: '"Cormorant Garamond", Garamond, "Palatino Linotype", serif',
    weights: [400, 700],
    italic: true,
    pairingHints: ["inter", "libre-franklin"],
    googleFamily: "Cormorant Garamond",
    googleAxes: "ital,wght@0,400;0,700;1,400",
    license: { name: "OFL 1.1", url: "https://openfontlicense.org" },
  },
  {
    id: "manrope",
    name: "Manrope",
    category: "sans",
    stack: '"Manrope", "Segoe UI", Arial, sans-serif',
    weights: [400, 700],
    italic: false,
    pairingHints: ["fraunces", "source-serif", "newsreader"],
    googleFamily: "Manrope",
    googleAxes: "wght@400;700",
    license: { name: "OFL 1.1", url: "https://openfontlicense.org" },
  },
  {
    id: "space-grotesk",
    name: "Space Grotesk",
    category: "display-sans",
    stack: '"Space Grotesk", "Century Gothic", Arial, sans-serif',
    weights: [400, 700],
    italic: false,
    pairingHints: ["source-serif", "newsreader"],
    googleFamily: "Space Grotesk",
    googleAxes: "wght@400;700",
    license: { name: "OFL 1.1", url: "https://openfontlicense.org" },
  },
  {
    id: "archivo",
    name: "Archivo",
    category: "sans",
    stack: '"Archivo", "Helvetica Neue", Arial, sans-serif',
    weights: [400, 700],
    italic: true,
    pairingHints: ["source-serif", "newsreader"],
    googleFamily: "Archivo",
    googleAxes: "ital,wght@0,400;0,700;1,400",
    license: { name: "OFL 1.1", url: "https://openfontlicense.org" },
  },
  {
    id: "barlow-condensed",
    name: "Barlow Condensed",
    category: "display-sans",
    stack: '"Barlow Condensed", "Arial Narrow", Impact, sans-serif',
    weights: [400, 700],
    italic: true,
    pairingHints: ["inter", "archivo"],
    googleFamily: "Barlow Condensed",
    googleAxes: "ital,wght@0,400;0,700;1,400",
    license: { name: "OFL 1.1", url: "https://openfontlicense.org" },
  },
  {
    id: "libre-franklin",
    name: "Libre Franklin",
    category: "sans",
    stack: '"Libre Franklin", "Franklin Gothic Medium", "Segoe UI", sans-serif',
    weights: [400, 700],
    italic: true,
    pairingHints: ["newsreader", "cormorant-garamond"],
    googleFamily: "Libre Franklin",
    googleAxes: "ital,wght@0,400;0,700;1,400",
    license: { name: "OFL 1.1", url: "https://openfontlicense.org" },
  },
  {
    id: "karla",
    name: "Karla",
    category: "sans",
    stack: '"Karla", "Trebuchet MS", "Segoe UI", sans-serif',
    weights: [400, 700],
    italic: true,
    pairingHints: ["fraunces", "source-serif"],
    googleFamily: "Karla",
    googleAxes: "ital,wght@0,400;0,700;1,400",
    license: { name: "OFL 1.1", url: "https://openfontlicense.org" },
  },
  {
    id: "ibm-plex-mono",
    name: "IBM Plex Mono",
    category: "mono",
    stack: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
    weights: [400, 700],
    italic: true,
    pairingHints: ["archivo", "space-grotesk"],
    googleFamily: "IBM Plex Mono",
    googleAxes: "ital,wght@0,400;0,700;1,400",
    license: { name: "OFL 1.1", url: "https://openfontlicense.org" },
  },
]);

export const FONT_FAMILY_IDS = Object.freeze(
  FONT_FAMILIES.map((family) => family.id),
);

const FAMILY_BY_ID = new Map(
  FONT_FAMILIES.map((family) => [family.id, family]),
);

const DEFAULT_HEADING = "fraunces";
const DEFAULT_BODY = "inter";

/** @param {string} id */
export function fontFamilyById(id) {
  return FAMILY_BY_ID.get(String(id || "").trim()) || null;
}

/**
 * Resolve a family id to a local stack, falling back to a system stack when
 * the id is unknown or absent.
 * @param {string} id
 * @param {string} [fallback]
 */
export function fontStackFor(id, fallback = '"Inter", "Segoe UI", Arial, sans-serif') {
  return fontFamilyById(id)?.stack || fallback;
}

/**
 * @typedef {{ weight: number, style: "normal" | "italic" }} FontVariant
 */

/**
 * Local font file paths for a family. Files are vendored by
 * `scripts/vendor-brand-fonts.mjs` from the Google Fonts CSS API.
 * @param {ClientFontFamily} family
 * @returns {Array<FontVariant & { path: string }>}
 */
export function fontFilesFor(family) {
  const files = [];
  for (const weight of family.weights) {
    files.push({
      weight,
      style: "normal",
      path: `/fonts/${family.id}/${family.id}-${weight}.woff2`,
    });
  }
  if (family.italic)
    files.push({
      weight: 400,
      style: "italic",
      path: `/fonts/${family.id}/${family.id}-400-italic.woff2`,
    });
  return files;
}

/** @font-face CSS for every catalog family. */
export function fontFaceCss() {
  return FONT_FAMILIES.flatMap((family) =>
    fontFilesFor(family).map(
      (file) =>
        `@font-face{font-family:"${family.name}";font-style:${file.style};font-weight:${file.weight};font-display:swap;src:url("${file.path}") format("woff2");}`,
    ),
  ).join("\n");
}

/**
 * Curated pairings shown first in the onboarding picker.
 * @type {ReadonlyArray<{ id: string, label: string, heading: string, body: string }>}
 */
export const RECOMMENDED_PAIRINGS = Object.freeze([
  {
    id: "editorial-contrast",
    label: "Editorial contrast",
    heading: "fraunces",
    body: "inter",
  },
  {
    id: "classic-authority",
    label: "Classic authority",
    heading: "source-serif",
    body: "manrope",
  },
  {
    id: "quiet-professional",
    label: "Quiet professional",
    heading: "newsreader",
    body: "libre-franklin",
  },
  {
    id: "modern-studio",
    label: "Modern studio",
    heading: "space-grotesk",
    body: "inter",
  },
  {
    id: "warm-neighbourly",
    label: "Warm and neighbourly",
    heading: "karla",
    body: "archivo",
  },
  {
    id: "bold-dispatch",
    label: "Bold dispatch",
    heading: "barlow-condensed",
    body: "inter",
  },
]);

/**
 * Resolve the client's font pairing from a style object.
 *
 * Explicit, known ids win. A single explicit side pairs with a curated
 * partner. When neither side is chosen, `id` fields stay null and the site
 * keeps its recipe-driven typography.
 *
 * @param {{ headingFont?: string, bodyFont?: string }} [style]
 */
export function resolveFontPairing(style = {}) {
  let heading = fontFamilyById(style.headingFont)?.id || null;
  let body = fontFamilyById(style.bodyFont)?.id || null;
  if (heading && !body)
    body =
      fontFamilyById(heading)?.pairingHints?.find((id) => fontFamilyById(id))
        ?.id || DEFAULT_BODY;
  if (body && !heading)
    heading = fontFamilyById(body)?.pairingHints?.find((id) => fontFamilyById(id))
      ?.id || DEFAULT_HEADING;
  if (!heading && !body) return { heading: null, body: null, headingStack: "", bodyStack: "" };
  return {
    heading,
    body,
    headingStack: fontStackFor(heading, fontStackFor(DEFAULT_HEADING)),
    bodyStack: fontStackFor(body, fontStackFor(DEFAULT_BODY)),
  };
}
