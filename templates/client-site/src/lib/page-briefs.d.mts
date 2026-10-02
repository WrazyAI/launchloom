export type PageClaim = { text: string; evidenceIds: string[] };
export type PageBrief = {
  version: 1;
  routeId: string;
  pageType: string;
  path: string;
  mode: "supported" | "legacy";
  recipe: string;
  introduction: string;
  cardDescription: string;
  metadata: { title: string; description: string };
  sections: Array<{ kind: string; heading: string; items: PageClaim[] }>;
  faqs: Array<{ question: string; answer: string; evidenceIds: string[] }>;
  process: string[];
  related: Array<{
    routeId: string;
    name: string;
    path: string;
    reason: string;
    evidenceIds: string[];
  }>;
  media: Array<{
    src: string;
    alt: string;
    evidenceId: string;
    source: string;
    license: string;
    placement: string;
  }>;
  researchQuestions: Array<{ question: string; state: string; source: string }>;
  omissions: Array<{ field: string; reason: string }>;
  evidenceIds: string[];
  supportingBody: string;
  sourceContentVersion: number | null;
  ready: boolean;
  issues: string[];
};
export function compilePageBriefs(config?: any): {
  version: 1;
  briefs: PageBrief[];
  issues: string[];
  deferred: Array<{ routeId: string; state: string; reason: string }>;
};
export function pageBriefFor(config: any, routeId: string): PageBrief | null;
export function pageBriefReadiness(
  config: any,
):
  | { allowed: true }
  | { allowed: false; code: "page_content_required"; error: string };
export function supplementalSections(
  brief: PageBrief | null,
): PageBrief["sections"];
export function applyPageContentRevision(config: any, operation: any): boolean;
export function publicPageEvidence(
  config: any,
): Array<{ id: string; value: string; kind: string; routeIds: string[] }>;
export function pageBriefExpectedContent(brief: PageBrief | null): string[];
