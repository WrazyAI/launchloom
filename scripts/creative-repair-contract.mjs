/** Shared immutable repair limits; these are unchanged acceptance boundaries. */
export const REPAIR_FILE_ORDER = Object.freeze(["experience", "styles", "motion"]);
export const REPAIR_INNER_PAGE_KEYS = Object.freeze(["servicePage", "locationPage", "servicesIndexPage"]);
export const REPAIR_EDITABLE_FILE_NAMES = Object.freeze([...REPAIR_FILE_ORDER, ...REPAIR_INNER_PAGE_KEYS]);
export const MAX_REPAIR_EDITS = 12;
export const MAX_REPAIR_EDIT_FRAGMENT_CHARS = 6_000;
export const MAX_REPAIR_PATCH_TEXT_CHARS = 24_000;
export const MAX_REPAIR_FILE_SOURCE_CHARS = 80_000;
