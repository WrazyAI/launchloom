/**
 * Prompt contract for routes whose assigned hero is an image-led stage.
 * Returns an empty string for text-led or non-image routes.
 */
export function imageOverlayHeroContract(request = {}) {
  const archetype = String(request.route?.heroArchetype || "").trim();
  const geometry = String(request.route?.heroGeometry || "").trim();
  const text = `${archetype} ${geometry}`.toLowerCase();
  if (!/image|photo|photograph|full-bleed|cinematic|overlay/u.test(text))
    return "";
  return `
IMAGE-OVERLAY HERO CONTRACT
The assigned hero is an image-led stage. Do not render the hero image as a narrow banner above a separate copy field.
- Make the hero media fill the hero stage: use a full-stage container (absolute inset or a full-stage grid) with object-fit: cover, and place the promise group over the image or on a solid/scrim panel inside the stage.
- Keep the header plus hero within 1536x864, 1366x768, and 390x844. At 390x844, the primary and secondary actions must both be visible.
- Group the secondary action with the primary action; do not leave it as a bare underlined word at the fold.
- If the hero copy cannot fit over the image, reduce the copy or use a compact scrim; never shrink the image into a band.
`;
}
