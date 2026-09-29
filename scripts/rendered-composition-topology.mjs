const area = (rect) => Math.max(0, Number(rect?.width) || 0) * Math.max(0, Number(rect?.height) || 0);

export const CSS_IMAGE_URL_PATTERN = /url\s*\(/iu;

function intersectionArea(left, right) {
  const width = Math.max(
    0,
    Math.min(left.right, right.right) - Math.max(left.left, right.left),
  );
  const height = Math.max(
    0,
    Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top),
  );
  return width * height;
}

function box(rect) {
  if (!rect) return null;
  const left = Number(rect.left) || 0;
  const top = Number(rect.top) || 0;
  const width = Number(rect.width) || 0;
  const height = Number(rect.height) || 0;
  return { left, top, right: left + width, bottom: top + height, width, height };
}

/**
 * Verify the measured copy/media relationship for a rendered hero. Authored
 * data attributes only locate the regions; their declared topology is never
 * treated as evidence.
 */
export function validateRenderedCompositionTopology(
  topology,
  evidence,
  { viewportKind = "desktop" } = {},
) {
  const expectedHero = String(
    viewportKind === "mobile"
      ? topology?.mobileHero || "unclassified"
      : topology?.hero || "unclassified",
  );
  if (expectedHero === "unclassified")
    return {
      pass: true,
      skipped: true,
      expectedHero,
      viewportKind,
      findings: [],
      reason: "No normalized hero topology is available; screenshot fidelity remains authoritative.",
    };

  const hero = box(evidence?.hero);
  const copies = (Array.isArray(evidence?.copy) ? evidence.copy : [])
    .map(box)
    .filter((rect) => rect && rect.width >= 24 && rect.height >= 20);
  const media = (Array.isArray(evidence?.media) ? evidence.media : [])
    .map((item) => ({
      container: box(item?.container),
      visuals: (Array.isArray(item?.visuals) ? item.visuals : [])
        .map(box)
        .filter((rect) => rect && rect.width >= 16 && rect.height >= 16),
    }))
    .filter((item) => item.visuals.length);
  const visualRects = media.flatMap((item) => item.visuals);
  const findings = [];
  const add = (code, message) => findings.push({ code, severity: "critical", message });

  if (!hero || hero.width < 100 || hero.height < 100)
    add("hero-geometry-missing", "Rendered hero geometry could not be measured.");
  if (copies.length !== 1)
    add("hero-copy-region", "Rendered hero must expose exactly one measurable copy region.");

  if (hero && copies.length === 1) {
    const copy = copies[0];
    const copyArea = area(copy);
    const heroArea = area(hero);
    const mediaCoverage = Math.min(
      1,
      visualRects.reduce((total, rect) => total + area(rect), 0) / Math.max(1, heroArea),
    );
    const overlapRatio = visualRects.reduce(
      (total, rect) => total + intersectionArea(copy, rect),
      0,
    ) / Math.max(1, copyArea);
    const horizontalOverlapRatio = visualRects.length
      ? Math.max(
          ...visualRects.map((rect) =>
            Math.max(0, Math.min(copy.right, rect.right) - Math.max(copy.left, rect.left)) /
              Math.max(1, Math.min(copy.width, rect.width)),
          ),
        )
      : 0;
    const horizontalCenterDistance = visualRects.length
      ? Math.max(
          ...visualRects.map((rect) =>
            Math.abs((copy.left + copy.right) / 2 - (rect.left + rect.right) / 2),
          ),
        )
      : 0;
    const verticalCenterDistance = visualRects.length
      ? Math.max(
          ...visualRects.map((rect) =>
            Math.abs((copy.top + copy.bottom) / 2 - (rect.top + rect.bottom) / 2),
          ),
        )
      : 0;

    if (expectedHero === "split-media") {
      if (!visualRects.length || mediaCoverage < 0.12)
        add("split-media-missing-image", "Split-media topology requires a substantial visible hero image.");
      if (
        visualRects.length &&
        (horizontalOverlapRatio > 0.2 || horizontalCenterDistance < hero.width * 0.16)
      )
        add("split-media-relationship", "Hero copy and image are not arranged as distinct adjacent fields.");
    } else if (expectedHero === "media-overlay") {
      if (!visualRects.length || mediaCoverage < 0.35)
        add("media-overlay-image", "Media-overlay topology requires an image field occupying a substantial part of the hero.");
      if (visualRects.length && overlapRatio < 0.35)
        add("media-overlay-relationship", "Hero copy does not overlap the assigned media field.");
    } else if (expectedHero === "modular-image-field") {
      if (visualRects.length < 2)
        add("modular-media-count", "Modular-image topology requires at least two visible hero image windows.");
    } else if (expectedHero === "image-led-stage") {
      if (!visualRects.length || mediaCoverage < 0.3)
        add("image-led-stage-area", "Image-led topology requires the hero image to occupy a substantial visual area.");
      if (
        visualRects.length &&
        !visualRects.some((rect) => rect.top <= copy.top + hero.height * 0.15)
      )
        add("image-led-stage-order", "The image does not lead the hero composition as assigned.");
    } else if (expectedHero === "type-led-statement") {
      if (mediaCoverage > 0.35)
        add("type-led-media-dominance", "Type-led topology is dominated by a hero image instead of the statement.");
    } else if (expectedHero === "utility-panel") {
      if (Number(evidence?.utilityCount) < 1)
        add("utility-panel-missing", "Utility-panel topology requires a visible search, booking, or enquiry control in the hero.");
    } else if (expectedHero === "centered-field") {
      const centerRatio = ((copy.left + copy.right) / 2 - hero.left) / hero.width;
      if (centerRatio < 0.3 || centerRatio > 0.7)
        add("centered-copy-position", "Hero copy is not centered within the assigned opening field.");
    } else if (expectedHero === "editorial-stack") {
      if (!visualRects.length || verticalCenterDistance < hero.height * 0.18)
        add("editorial-stack-relationship", "Hero copy and media are not arranged as separate vertical editorial layers.");
    }
  }

  return {
    pass: findings.length === 0,
    skipped: false,
    expectedHero,
    viewportKind,
    findings,
    measured: {
      copyRegionCount: copies.length,
      visibleMediaPanelCount: media.length,
      visibleMediaImageCount: visualRects.length,
      hero: hero ? { width: hero.width, height: hero.height } : null,
    },
  };
}
