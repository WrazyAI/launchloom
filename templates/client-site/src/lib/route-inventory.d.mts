export type RouteRecord = {
  id: string;
  pageType: string;
  title: string;
  path: string;
  source: string;
  target: string | null;
  visitorQuestion: string;
  intentCluster: string | null;
  admissionRequirements: string[];
  approval: {
    status: "proposed" | "approved" | "deferred" | "omitted";
    requestedStatus: string;
    reason: string;
    evidence: unknown[];
  };
  discovery: {
    navigation: string;
    internalLinks: string[];
    sitemap: boolean;
    indexable: boolean;
    previewOnly: boolean;
  };
  canonical: { origin: string; path: string };
  acceptanceChecks: string[];
  delivery: { generated: boolean; rendered: boolean; verified: boolean };
};
export type RouteInventory = {
  version: 1;
  mode: "legacy" | "explicit";
  records: RouteRecord[];
  issues: string[];
  redirectProposal: unknown[];
  domainTransition: unknown;
};
export type RoutePolicy = {
  version: 1;
  decisions: Array<{
    id?: string;
    pageType: string;
    target?: string;
    status: "proposed" | "approved" | "deferred" | "omitted";
    reason?: string;
    evidence?: unknown[];
    admission?: {
      services: string[];
      visitorNeed: string;
      distinctValue: string;
      localFacts: Array<{ value: string; provenance: string; source: string }>;
    };
    indexable?: boolean;
    previewOnly?: boolean;
    navigation?: string;
    internalLinks?: string[];
  }>;
  existingUrls?: Array<string | { url: string; routeId?: string }>;
};
export function normalizeRoutePath(value: unknown): string;
export function compileRouteInventory(config?: any): RouteInventory;
export function approvedRoutes(
  inventory: RouteInventory,
  options?: { production?: boolean },
): RouteRecord[];
export function routeReadiness(
  config: any,
):
  | { allowed: true }
  | { allowed: false; code: "route_approval_required"; error: string };
export function routeHref(
  inventory: RouteInventory,
  path: string,
  fallback?: string,
): string;
export function routeLinkedContent<T>(
  config: T,
  options?: { production?: boolean },
): T;

export function productionRouteMode(
  environment?: Record<string, unknown>,
): boolean;
