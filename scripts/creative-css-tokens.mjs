/**
 * Return live CSS custom-property declarations while ignoring block comments.
 * Keeping declaration parsing shared prevents the namespacer and fidelity
 * validator from disagreeing about which candidate-owned tokens exist.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function cssCustomPropertyDeclarations(source) {
  const css = String(source || "");
  const declarationSource = css.replace(
    /\/\*[\s\S]*?\*\//gu,
    (comment) => comment.replace(/[^\n]/gu, " "),
  );
  return [
    ...declarationSource.matchAll(
      /(?:^|[;{])\s*(--[A-Za-z][\w-]*)\s*:/gu,
    ),
  ].map((match) => match[1]);
}
