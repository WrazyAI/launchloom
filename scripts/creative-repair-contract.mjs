/** Shared immutable repair limits; these are unchanged acceptance boundaries. */
export const REPAIR_FILE_ORDER = Object.freeze(["experience", "styles", "motion"]);
export const REPAIR_INNER_PAGE_KEYS = Object.freeze(["servicePage", "locationPage", "servicesIndexPage"]);
export const REPAIR_EDITABLE_FILE_NAMES = Object.freeze([...REPAIR_FILE_ORDER, ...REPAIR_INNER_PAGE_KEYS]);
export const MAX_REPAIR_EDITS = 12;
export const MAX_REPAIR_EDIT_FRAGMENT_CHARS = 6_000;
export const MAX_REPAIR_PATCH_TEXT_CHARS = 24_000;
export const MAX_REPAIR_FILE_SOURCE_CHARS = 80_000;

/** Reserve the worst-case literal cost for each opt-in request edit. */
export function buildSpanRequestBudget(catalog) {
  if (catalog?.version !== 1 || !Array.isArray(catalog.spans) || !catalog.spans.length)
    throw new Error("Request budget requires a non-empty version1 catalog.");
  let maxFindChars = 0;
  for (const span of catalog.spans) {
    if (typeof span?.find !== "string" || !span.find.length || span.find.length > MAX_REPAIR_EDIT_FRAGMENT_CHARS)
      throw new Error("Request budget contains an invalid source window.");
    maxFindChars = Math.max(maxFindChars, span.find.length);
  }
  return {
    maxFindChars,
    maxReplacementChars: MAX_REPAIR_EDIT_FRAGMENT_CHARS,
    maxEdits: Math.min(MAX_REPAIR_EDITS, Math.floor(MAX_REPAIR_PATCH_TEXT_CHARS / (maxFindChars + MAX_REPAIR_EDIT_FRAGMENT_CHARS))),
    maxPatchChars: MAX_REPAIR_PATCH_TEXT_CHARS,
    unit: "utf16-code-units",
  };
}
