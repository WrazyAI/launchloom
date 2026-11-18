/**
 * Normalise model-authored repair replacement text.
 *
 * Repair models occasionally wrap a complete replacement in markdown: a fenced
 * block, or a single code span around the whole value. Applied verbatim into a
 * stylesheet that produces an invalid parse (`<css input>:1049:1: Unexpected }`
 * in run 44159137692), which rejects an otherwise correct repair.
 *
 * Only a stylesheet is unwrapped. A backtick at both ends of a JSX replacement
 * is a legitimate template literal and must be kept.
 */

const FENCED = /^\s*```[a-z0-9-]*\r?\n([\s\S]*?)\r?\n```\s*$/iu;

/**
 * @param {unknown} value
 * @param {string} [file] candidate file key, e.g. "styles"
 * @returns {string}
 */
export function normalizeRepairReplacementText(value, file) {
  let text = String(value ?? "");
  const fenced = text.match(FENCED);
  if (fenced) return fenced[1];
  if (
    file === "styles" &&
    text.length >= 2 &&
    text.startsWith("`") &&
    text.endsWith("`") &&
    !text.startsWith("``")
  )
    text = text.slice(1, -1);
  return text;
}
