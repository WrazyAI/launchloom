export type FactState =
  "confirmed" | "missing-deferrable" | "contradictory" | "launch-blocking";
export type FactSummary = {
  key: string;
  state: FactState;
  source: string;
  publicDisplay: boolean;
  requirements: string[];
  reason: string;
};
export type FactReadiness = {
  version: 1;
  launchReady: boolean;
  addressVisibility: "public" | "private";
  facts: FactSummary[];
};
export type FactBrief = Omit<FactReadiness, "facts"> & {
  facts: Array<FactSummary & { value: string | string[] }>;
};
export function factText(value: unknown, limit?: number): string;
export function addressVisibility(value?: unknown): "public" | "private";
export function compileFactBrief(intake?: Record<string, unknown>): FactBrief;
export function factReadinessSummary(
  brief: FactBrief | FactReadiness,
): FactReadiness;
export function businessFactReadiness(config: {
  business?: Record<string, any>;
  services?: unknown;
  factReadiness?: unknown;
}):
  | { allowed: true }
  | { allowed: false; code: "business_facts_required"; error: string };
export function publicGenerationIntake<T extends Record<string, any>>(
  intake?: T,
): T & {
  factReadiness: FactReadiness;
  addressVisibility: "public" | "private";
};
export function publicBusiness<T extends Record<string, any>>(
  business?: T,
): T & { address: string; addressVisibility: "public" | "private" };

export function redactPrivateLocation<T>(
  value: T,
  intake?: Record<string, any>,
): T;

export function normalizeResearchLanguageCode(value: unknown): string;
