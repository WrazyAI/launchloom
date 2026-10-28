/**
 * Route-scoped hero-card contract for image-led references that float the
 * promise group in the photograph's negative space. A large bordered card is
 * a fidelity failure only for those routes; split, utility-panel, text-led,
 * stacked, and explicitly framed references may legitimately frame their copy.
 */

const FLOATING_TOPOLOGIES = new Set(["media-overlay"]);
const NON_FLOATING_TOPOLOGIES = new Set([
  "split-media",
  "utility-panel",
  "type-led-statement",
  "editorial-stack",
  "image-led-stage",
  "modular-image-field",
  "centered-field",
]);

export const HERO_CARD_THRESHOLDS = {
  // The observed failure card covers 19.8% of the desktop hero area but
  // 57.6% of its height, so height is the discriminating desktop signal.
  desktopArea: 0.3,
  desktopHeight: 0.55,
  mobileArea: 0.35,
};

function geometryText(route = {}) {
  const routeGeometry =
    typeof route.heroGeometry === "string"
      ? route.heroGeometry
      : route.heroGeometry?.mode || "";
  return String(
    routeGeometry || route.referenceDna?.heroGeometry?.mode || "",
  )
    .trim()
    .toLowerCase();
}

function explicitlyFramed(geometry) {
  // A reference that names its own frame keeps that frame.
  if (
    /\b(?:bordered|framed|boxed|translucent|console|card|panel)\b/u.test(
      geometry,
    )
  )
    return true;
  // The image may lead while the copy follows below or beside it. That is a
  // stacked composition, not a floating headline over the media.
  return (
    /\b(?:image|photo|photograph|media)\b[^.]*\b(?:above|below|beneath|beside|adjacent)\b/u.test(
      geometry,
    ) ||
    /\b(?:copy|text|headline|promise)\b[^.]*\b(?:below|beneath|beside|adjacent|under)\b/u.test(
      geometry,
    )
  );
}

export function routeRequiresFloatingHeroCopy(route = {}) {
  const topology =
    route.compositionTopology || route.referenceDna?.compositionTopology || {};
  const hero = String(topology.hero || "")
    .trim()
    .toLowerCase();
  const relation = String(topology.mediaRelation || "")
    .trim()
    .toLowerCase();
  const geometry = geometryText(route);
  if (explicitlyFramed(geometry)) return false;
  if (NON_FLOATING_TOPOLOGIES.has(hero)) return false;
  if (FLOATING_TOPOLOGIES.has(hero))
    return !relation || relation === "copy-over-media";
  if (!geometry) return false;
  if (
    /\b(?:below|beneath|above|beside|adjacent|stacked|under|split|side-by-side|utility panel|form panel|text-led|type-led)\b/u.test(
      geometry,
    )
  )
    return false;
  return /\b(?:copy|headline|promise|text)\b[^.]*\b(?:over|overlay|floating|inside)\b/u.test(
    geometry,
  );
}

function percent(value) {
  const number = Number(value);
  return `${Math.round((Number.isFinite(number) ? number : 0) * 100)}%`;
}

/**
 * Returns a fidelity finding when an image-led floating-copy route renders its
 * promise group as a large bordered or opaque card. Compact scrims behind text
 * only, and cards on routes that legitimately frame their copy, pass.
 */
export function heroCardCoverageFinding(
  evidence = {},
  { mobile = false, requiresFloatingCopy = false } = {},
) {
  if (!requiresFloatingCopy) return "";
  const hasBorder = evidence.heroCopyHasBorder === true;
  const hasOpaqueBackground = evidence.heroCopyHasOpaqueBackground === true;
  if (!hasBorder && !hasOpaqueBackground) return "";
  const mobileArea =
    Number(evidence.heroCopyMobileAreaRatio) ||
    Number(evidence.heroCopyAreaRatio);
  const area = mobile ? mobileArea : Number(evidence.heroCopyAreaRatio);
  const height = Number(evidence.heroCopyHeightRatio);
  const width = Number(evidence.heroCopyWidthRatio);
  const large = mobile
    ? area > HERO_CARD_THRESHOLDS.mobileArea
    : area > HERO_CARD_THRESHOLDS.desktopArea ||
      height > HERO_CARD_THRESHOLDS.desktopHeight;
  if (!large) return "";
  const treatment = hasBorder ? "bordered card" : "opaque card";
  return `hero copy is a large ${treatment} covering ${percent(area)} of the hero area (${percent(width)} width, ${percent(height)} height); the assigned image-led reference floats the headline in the image's negative space. Replace the card with a floating promise group over a compact scrim.`;
}
