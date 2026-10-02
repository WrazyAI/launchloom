export type CoverageRadiusSelection = "10" | "20" | "30" | "50" | "50+";

export type CoveragePoint = { latitude: number; longitude: number };

export type CoverageProviderPlace = {
  id: string;
  name: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  label: string;
};

export type CoverageCandidate = CoverageProviderPlace & { distanceMiles: number };

export type CoverageSearchCenter = CoveragePoint & {
  radiusMeters: number;
  kind: "primary" | "satellite";
};

export type CoverageReferencePayload = {
  v: number;
  p: string;
  i: string;
  pc: string;
  pid: string;
  cc: string;
  rs: CoverageRadiusSelection;
  r: number;
  s: string;
  t: number;
  tr: 0 | 1;
  pa: 0 | 1;
  n: Array<[string, string, string]>;
};

export type CoverageSelection =
  | { status: "confirmed"; reference: string; selectedIds: string[]; manualAreas?: string[]; reason: "" }
  | {
      status: "primary_city_only";
      reference: "";
      selectedIds: [];
      reason: "provider_failure" | "ambiguous_city" | "unresolved_city";
    };

export type CoverageConfirmation = {
  status: "confirmed" | "primary_city_only" | "legacy_unconfirmed";
  source: string;
  reason?: string;
  primaryCity: string;
  radiusSelection: CoverageRadiusSelection;
  radiusMiles: number;
  candidateCount: number;
  selectedCount: number;
  selectedIds: string[];
  manualAreas?: string[];
  truncated: boolean;
  partial: boolean;
  referenceHash?: string;
  confirmedAt?: number | null;
};

export declare const COVERAGE_SOURCE: string;
export declare const COVERAGE_FALLBACK_SOURCE: string;
export declare const COVERAGE_REFERENCE_VERSION: number;
export declare const COVERAGE_REFERENCE_PURPOSE: string;
export declare const COVERAGE_REFERENCE_MAX_LENGTH: number;
export declare const MAX_COVERAGE_CANDIDATES: number;
export declare const MAX_ADDITIONAL_PLACES: number;
export declare const EARTH_RADIUS_MILES: number;
export declare const SERVICE_RADIUS_OPTIONS: readonly string[];
export declare const BOUNDED_50_PLUS_WARNING: string;
export declare const TRUNCATED_WARNING: string;
export declare const PARTIAL_WARNING: string;
export declare const EMPTY_WARNING: string;

export declare class CoverageContractError extends Error {
  code: string;
  constructor(code: string, message: string);
}

export declare function boundedRadiusSelection(
  selection: unknown,
): CoverageRadiusSelection | null;

export declare function boundedRadiusMiles(selection: unknown): number | null;

export declare function milesBetween(first: CoveragePoint, second: CoveragePoint): number;

export declare function destinationPoint(
  center: CoveragePoint,
  distanceMeters: number,
  bearingDegrees: number,
): CoveragePoint;

export declare function coverageSearchCenters(
  primary: CoveragePoint,
  serviceRadius: unknown,
):
  | {
      selection: CoverageRadiusSelection;
      miles: number;
      radiusMeters: number;
      centers: CoverageSearchCenter[];
    }
  | null;

export declare function coveragePlaceLabel(name: string, state: string): string;

export declare function normalizeCoveragePlace(raw: unknown): CoverageProviderPlace | null;

export declare function collectCoverageCandidates(input: {
  primary: CoveragePoint & { name: string; placeId?: string; state?: string };
  searches: Array<{ places?: unknown[]; failed?: boolean; truncated?: boolean }>;
  radiusMiles: number;
  maxCandidates?: number;
}): {
  candidates: CoverageCandidate[];
  truncated: boolean;
  failedCenters: number;
  partial: boolean;
};

export declare function createCoverageReferencePayload(input: {
  inviteId: string;
  primary: { name: string; state: string; country: string; placeId: string };
  radiusSelection: CoverageRadiusSelection;
  radiusMiles: number;
  candidates: Array<Pick<CoverageCandidate, "id" | "name" | "state">>;
  truncated: boolean;
  partial: boolean;
  issuedAt: number;
}): CoverageReferencePayload;

export declare function signCoverageReference(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string>;

export declare function verifyCoverageReference(
  token: unknown,
  secret: string,
): Promise<CoverageReferencePayload | null>;

export declare function parseCoverageSelection(value: unknown): CoverageSelection | null;

export declare function deriveCoverageConfirmation(input: {
  selection: CoverageSelection;
  reference: CoverageReferencePayload | null;
  primaryCity: string;
  serviceRadius: string;
  coverageAreas: string[];
  referenceHash: string;
}):
  | { ok: true; coverageAreas: string[]; confirmation: CoverageConfirmation }
  | { ok: false; code: string; message: string };
