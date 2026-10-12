// Explicit source-reuse decisions, not a wildcard based on untrusted metadata.
const spicerIds = new Set([
  "spicer-accountant-deadline-calendar",
  "spicer-auto-repair-digital-inspection",
  "spicer-barber-walk-in-queue",
  "spicer-gym-timetable-first",
  "spicer-hair-salon-stylist-menu",
  "spicer-landscaping-season-wheel",
  "spicer-law-firm-results-ledger",
  "spicer-med-spa-treatment-menu",
  "spicer-plumber-dispatch-console",
  "spicer-roofing-storm-response",
]);
export function sourceAttribution(id) {
  return spicerIds.has(id)
    ? {
        label: "Template adapted from Spicer Designs",
        href: "https://www.spicerdesigns.com",
        license: "CC-BY-4.0",
      }
    : null;
}
