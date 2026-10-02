import { MAX_COVERAGE_CANDIDATES, boundedRadiusMiles, boundedRadiusSelection } from "../src/lib/coverage-contract.mjs";
import { parseServiceAreas } from "./service-area-input.mjs";

// This reads canonical issue JSON after Worker signature verification. Never
// accept a discovery result or a raw browser selection as confirmed coverage.
export function confirmedCoverageFromIntake(intake = {}) {
  const confirmation = intake.coverageConfirmation;
  if (!confirmation || (confirmation.status === "legacy_unconfirmed" && String(intake.intakeVersion) !== "2")) return null;
  if (!["confirmed", "primary_city_only", "legacy_unconfirmed"].includes(confirmation.status))
    throw new Error("Invalid persisted coverage confirmation.");
  const primaryCity = parseServiceAreas(intake.primaryCity, { limit: 1 })[0] || "";
  const areas = parseServiceAreas(intake.coverageAreas, { limit: MAX_COVERAGE_CANDIDATES + 2 });
  const radius = boundedRadiusSelection(String(intake.serviceRadius ?? ""));
  if (!primaryCity || confirmation.primaryCity !== primaryCity || confirmation.radiusSelection !== radius ||
      !radius || areas.length > MAX_COVERAGE_CANDIDATES + 1 || areas[0] !== primaryCity ||
      confirmation.selectedCount !== areas.length - 1 ||
      (confirmation.status !== "confirmed" && areas.length !== 1))
    throw new Error("Persisted coverage does not match the confirmed city, radius, and selection.");
  return {
    primaryCity,
    coverageAreas: areas,
    serviceRadiusMiles: boundedRadiusMiles(radius),
    coverageConfirmation: confirmation,
    coverageEvidence: { source: confirmation.status === "confirmed" ? "client_confirmed_coverage" : confirmation.status === "primary_city_only" ? "client_confirmed_primary_city_only" : "legacy_unconfirmed", lookups: 0, confirmation },
    warnings: [
      ...(confirmation.partial ? ["The confirmed list came from a partial city lookup; only the selected cities are researched."] : []),
      ...(confirmation.truncated ? ["The city provider truncated discovery; only the selected cities are researched."] : []),
      ...(confirmation.status === "legacy_unconfirmed" ? ["This older intake has no confirmed nearby-city selection; coverage stays primary-city-only."] : []),
    ],
  };
}

export function applyCoverageEnrichment(intake, enrichment = {}) {
  const confirmed = confirmedCoverageFromIntake(intake);
  const selected = confirmed || enrichment;
  return {
    ...intake,
    ...(Array.isArray(selected.coverageAreas) ? { coverageAreas: selected.coverageAreas } : {}),
    coverageEvidence: selected.coverageEvidence,
    coverageWarnings: selected.warnings || [],
  };
}
