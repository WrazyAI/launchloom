import type {
  CoverageConfirmation,
  CoverageSelection,
} from "./coverage-contract.mjs";

export type ServiceRadius = 10 | 20 | 30 | 50 | "50+";

export type NormalizedClientIntake = Record<string, unknown> & {
  version: 2;
  legacy: boolean;
  submissionId: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  services: string[];
  confirmedServices: string[];
  primaryCity: string;
  serviceRadius: ServiceRadius | null;
  coverageAreas: string[];
  /**
   * Parsed client confirmation input. Null for legacy v1 and for v2 intakes
   * that predate the coverage-confirmation form contract.
   */
  coverageSelection: CoverageSelection | null;
  /**
   * Server-derived provenance. Null only for a v2 confirmed selection before
   * the Worker verifies the signed coverage reference.
   */
  coverageConfirmation: CoverageConfirmation | null;
  confirmation: { businessFactsAndAssetRights: true };
};

export type ClientIntakeV2Metadata = {
  submissionId: string;
  inviteToken: string;
  assets?: Record<string, string>;
};

export type ClientIntakeV2Submission = Record<string, unknown> & {
  intakeVersion: "2";
  submissionId: string;
  inviteToken: string;
  assets: Record<string, string>;
};

export declare const CLIENT_INTAKE_V2_FORM_FIELDS: readonly string[];
export declare const CLIENT_INTAKE_V2_FILE_FIELDS: readonly string[];
export declare const CLIENT_INTAKE_V2_SUBMISSION_FIELDS: readonly string[];
export declare const CLIENT_INTAKE_V2_ISSUE_FIELDS: readonly string[];

export declare function createClientIntakeV2Submission(
  formFields: Record<string, unknown>,
  metadata: ClientIntakeV2Metadata,
): ClientIntakeV2Submission;

export declare function normalizeClientIntake(
  raw: Record<string, unknown>,
): NormalizedClientIntake;
