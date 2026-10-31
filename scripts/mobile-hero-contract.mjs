/**
 * Mobile opening contract for routes whose reference leads with a media field
 * rather than a pure type or quote desk. The desktop composition may be tall,
 * but the mobile first viewport still has to show the media and the action.
 */

export const MOBILE_HERO_MEDIA_MIN_VISIBLE = 200;

const MEDIA_TOPOLOGIES = new Set([
  "split-media",
  "image-led-stage",
  "media-overlay",
]);

export function routeRequiresMobileMedia(route = {}) {
  const topology =
    route.compositionTopology || route.referenceDna?.compositionTopology || {};
  const family = String(
    route.familyId || route.referenceDna?.familyId || "",
  )
    .trim()
    .toLowerCase();
  const hero = String(topology.hero || "")
    .trim()
    .toLowerCase();
  return family === "typographic-poster" || MEDIA_TOPOLOGIES.has(hero);
}

export function mobileHeroFitContract(request = {}) {
  if (!routeRequiresMobileMedia(request.route || {})) return "";
  return `
MOBILE HERO FIT CONTRACT
At 390x844 the opening must show the primary action and a substantial media or diagnostic field.
- Keep at least ${MOBILE_HERO_MEDIA_MIN_VISIBLE}px of the hero media or diagnostic field visible inside the first viewport.
- Do not push the media below the copy. Put the media first, beside the copy, or compress the header and copy so the field starts above the fold.
- Keep the primary action visible at 390x844. Never hide the media or shrink it to a thin strip to make the copy fit.
`;
}
