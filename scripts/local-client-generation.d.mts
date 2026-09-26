import type { NormalizedClientIntake, ClientIntakeV2Submission, ServiceRadius } from "../src/lib/client-intake-v2.mjs";

export const LOCAL_CLIENT_INTAKE_INVITE_TOKEN: "local-fixture-only";

export type LocalClientPipelineFixture = {
  key: string;
  visualKey: string;
  businessName: string;
  industry: string;
  address: string;
  primaryCity: string;
  services: string[];
  differentiators: string[];
  primaryCta: string;
  radius: string;
  serviceRadius: ServiceRadius;
  serviceRadiusMiles: number | null;
  coverage: string[];
  promise: string;
  description: string;
  brandColor: string;
  localFormIntake: true;
};

export declare function prepareLocalClientIntake(rawSubmission: Record<string, unknown>): {
  payload: ClientIntakeV2Submission;
  intake: NormalizedClientIntake;
  fixture: LocalClientPipelineFixture;
};
