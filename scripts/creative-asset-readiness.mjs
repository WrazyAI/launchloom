/**
 * Detect an image-required creative route before authoring when neither the
 * client configuration nor the generated asset pass supplied a hero image.
 * Missing generated assets otherwise surface much later as empty media frames
 * and burn the rendered repair budget.
 *
 * @param {{config: Record<string, any>, inspiration: Record<string, any>, assets?: Record<string, any> | null}} input
 */
export function missingRequiredHeroImagery({ config, inspiration, assets }) {
  const routeHero = Object.values(config?.creativeAssets || {}).some(
    (entry) => String(entry?.hero || "").trim(),
  );
  const hero = String(
    config?.images?.hero || config?.assets?.photoOne || "",
  ).trim();
  if (hero || routeHero) return null;
  const routes = Array.isArray(inspiration?.routes)
    ? inspiration.routes
    : Array.isArray(inspiration)
      ? inspiration
      : [];
  const requiredRoutes = routes.filter((route) => {
    const dna = route?.referenceDna || route?.dna;
    if (!dna) return false;
    const treatment = String(dna?.imageTreatment?.mode || "");
    return (
      dna?.compositionTopology?.hero !== "type-led-statement" &&
      !/without photography|image[- ]independent/iu.test(treatment)
    );
  });
  if (!requiredRoutes.length) return null;
  const skipped = Array.isArray(assets?.skipped) ? assets.skipped : [];
  const details = skipped
    .map((entry) => {
      const placement = String(entry?.placement || "image");
      const reason = String(entry?.reason || "no usable image").trim();
      return `${placement}: ${reason}`;
    })
    .filter(Boolean)
    .slice(0, 4);
  return {
    routeIds: requiredRoutes
      .map((route) => String(route?.id || route?.routeId || "").trim())
      .filter(Boolean),
    reason: details.length
      ? details.join("; ")
      : "no approved hero image was generated or configured",
  };
}
