/**
 * Selects contextual service links without inventing relationships.
 * Evidence-backed links take precedence; otherwise, show a short directory of
 * the business's other confirmed services so visitors can keep navigating.
 */
export function selectServicePageLinks(
  services,
  currentSlug,
  evidencedRelated = [],
) {
  const otherServices = (Array.isArray(services) ? services : []).filter(
    (service) =>
      service &&
      typeof service.slug === "string" &&
      service.slug !== currentSlug &&
      typeof service.name === "string",
  );
  const paths = new Set(
    (Array.isArray(evidencedRelated) ? evidencedRelated : [])
      .map((item) => item?.path)
      .filter((path) => typeof path === "string"),
  );
  const evidenced = otherServices.filter((service) =>
    paths.has(`/services/${service.slug}/`),
  );
  return (evidenced.length ? evidenced : otherServices).slice(0, 3);
}
