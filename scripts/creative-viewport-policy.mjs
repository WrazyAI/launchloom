const belowFoldContinuation =
  /\b(?:continue(?:s|d|ing)?|extend(?:s|ed|ing)?)\b[^.!?]{0,100}\b(?:below\s+(?:the\s+)?(?:first\s+)?viewport|below[- ]the[- ]fold|beyond\s+the\s+first\s+viewport|past\s+the\s+first\s+viewport)\b/iu;

/**
 * A desktop opening may cross the first viewport only when the assigned DNA
 * explicitly describes that composition and the rendered opening image does
 * cross the same boundary. This exception never masks horizontal overflow,
 * browser errors, or unreadable/clipped visible content.
 * @param {{heroBottom?: number, viewportHeight?: number, openingImage?: {topRatio?: number, bottomRatio?: number}}} evidence
 * @param {{name?: string, height?: number}} viewport
 * @param {{heroGeometry?: {viewport?: string}} | null} [referenceDna=null]
 */
export function heroViewportFitFailure(
  evidence,
  viewport,
  referenceDna = null,
) {
  if (viewport?.name === "mobile") return null;
  const viewportHeight = Number(
    viewport?.height ?? evidence?.viewportHeight,
  );
  const heroBottom = Number(evidence?.heroBottom);
  if (
    !Number.isFinite(viewportHeight) ||
    !Number.isFinite(heroBottom) ||
    heroBottom <= viewportHeight + 1
  )
    return null;

  const viewportDescription = String(
    referenceDna?.heroGeometry?.viewport || "",
  );
  const imageBottomRatio = Number(evidence?.openingImage?.bottomRatio);
  const intentionallyContinues =
    belowFoldContinuation.test(viewportDescription) &&
    Number.isFinite(imageBottomRatio) &&
    imageBottomRatio > 1.001;
  return intentionallyContinues ? null : "hero exceeds desktop viewport";
}
