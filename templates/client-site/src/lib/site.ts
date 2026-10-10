import { compilePageBriefs } from "./page-briefs.mjs";
import { resolvePageRecipe } from "./page-recipe";
import {
  compileRouteInventory,
  approvedRoutes,
  productionRouteMode,
} from "./route-inventory.mjs";
import { publicBusiness } from "./business-facts.mjs";
import config from "../site.config.json";

export type Service = {
  name: string;
  description: string;
  slug: string;
  decisionSupport?: {
    scope?: string;
    nextStep?: string;
    preparation?: string;
  };
};
export type Location = {
  name: string;
  slug: string;
  description?: string;
  localNote?: string;
};
export type SeoKeyword = {
  keyword: string;
  volume?: number | null;
  kd?: number | null;
  cpc?: number | null;
  competition?: number | null;
  intent?: string | null;
  provenance: string;
  metricSources?: Record<string, string | null>;
};
export type SeoPageType =
  | "home"
  | "services-hub"
  | "service"
  | "location"
  | "about"
  | "contact"
  | "blog-index"
  | "blog-opportunity";
export type SeoPageMap = {
  id: string;
  pageType: SeoPageType;
  title: string;
  slug: string;
  service?: string;
  location?: string;
  primaryKeyword?: SeoKeyword;
  supportingKeywords: SeoKeyword[];
  fanOutQuestions: string[];
  priority: "high" | "medium" | "low";
  evidence: unknown[];
  renderWhenArticlesExist?: boolean;
  localFacts?: Array<{ value: string; provenance: string }>;
};
export type BlogArticle = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  body: string;
};
export type PageSectionType =
  | "hero"
  | "trust"
  | "services"
  | "about"
  | "process"
  | "social-proof"
  | "gallery"
  | "coverage"
  | "faq"
  | "contact";
export type PageSection = {
  id: string;
  type: PageSectionType;
  variant: string;
};
export type PageRecipe =
  "care-editorial" | "local-trades" | "general-editorial";
export type DesignComposition =
  | "split"
  | "asymmetric"
  | "centered"
  | "full-bleed"
  | "magazine"
  | "framed"
  | "stacked"
  | "sidebar"
  | "mosaic";
export type DesignTypography =
  | "editorial"
  | "sans"
  | "strong"
  | "refined-serif"
  | "humanist"
  | "geometric"
  | "heritage"
  | "modern-serif"
  | "industrial"
  | "condensed"
  | "soft-sans";
export type DesignFamily =
  | "classic"
  | "image-mosaic"
  | "cinematic-premium"
  | "atmospheric-editorial"
  | "project-showcase"
  | "studio-minimal";
export type ExperiencePackId =
  | "cinematic-narrative"
  | "bold-utility"
  | "kinetic-poster"
  | "editorial-folio"
  | "guided-conversation"
  | "service-led";
export type SiteConfig = {
  pipelineTest?: {
    version: 1;
    profile: "seo-only" | "creative-only" | "full-preview";
    testOnly: true;
    sourceSha: string;
    runId: string;
  };
  pageContent?: Record<string, any>;
  pageEvidence?: Array<Record<string, any>>;
  pageBriefs?: ReturnType<typeof compilePageBriefs>;
  routePolicy?: import("./route-inventory.mjs").RoutePolicy;
  routeInventory?: import("./route-inventory.mjs").RouteInventory;
  supportingPages?: Record<
    string,
    { title?: string; body: string; reviewed: boolean; source: string }
  >;
  excludedServices?: string[];
  factReadiness?: import("./business-facts.mjs").FactReadiness;
  preset: "wellness" | "home-services";
  industry?: string;
  businessKind?: string;
  demoNotice?: string;
  business: {
    name: string;
    tagline: string;
    description: string;
    phone: string;
    email: string;
    address: string;
    addressVisibility?: "public" | "private";
    serviceAreas: string[];
    primaryCity?: string;
    serviceRadiusMiles?: number | "50+" | null;
    hours: string;
    primaryCta: string;
    offer?: string;
    domain?: string;
    leadEmail: string;
    placeId?: string;
    googleMapsUrl?: string;
  };
  style: {
    surfaces?: Record<
      string,
      {
        surface: string;
        text: string;
        mutedText: string;
        link: string;
        action: string;
        onAction: string;
        border: string;
        focus: string;
      }
    >;
    primaryColor: string;
    tone: string;
    preference?: string;
    visualDirection?: string;
    showBrandName?: boolean;
    surfaceColor?: string;
    creativeColorOverrides?: Record<
      string,
      { variable: string; value: string }
    >;
    heroColor?: string;
    inkColor?: string;
    mutedColor?: string;
    lineColor?: string;
    contrastColor?: string;
    brandTextColor?: string;
    brandSurfaceColor?: string;
    brandSurfaceTextColor?: string;
    headingFont?: string;
    bodyFont?: string;
    accentColor?: string;
    accentTextColor?: string;
    accentContrastColor?: string;
  };
  services: Service[];
  seoPageMap?: SeoPageMap[];
  differentiators: string[];
  locations: Location[];
  blogArticles?: BlogArticle[];
  images: { hero?: string; secondary?: string; tertiary?: string };
  creativeAssets?: Record<
    string,
    { hero?: string; secondary?: string; tertiary?: string }
  >;
  assets?: {
    logo?: string;
    photoOne?: string;
    photoTwo?: string;
    photoThree?: string;
    teamPhoto?: string;
  };
  copy?: {
    heroKicker?: string;
    heroHeading?: string;
    heroBody?: string;
    servicesHeading?: string;
    servicesIntro?: string;
    aboutKicker?: string;
    aboutHeading?: string;
    aboutBody?: string;
    contactKicker?: string;
    contactHeading?: string;
    processKicker?: string;
    processHeading?: string;
    faqKicker?: string;
    faqHeading?: string;
    formIntro?: string;
  };
  leadForm?: {
    enabled: boolean;
    recipient: string;
    submitLabel: string;
    consent: string;
    privacyHref?: string;
    successMessage: string;
    errorMessage: string;
    unconfiguredMessage: string;
    confirmVisitor: boolean;
    qualification: Array<{
      name: string;
      label: string;
      placeholder: string;
      options: string[];
    }>;
    qualifier: { enabled: boolean; heading: string; intro: string };
  };
  conversion?: {
    layout: "editorial-authority" | "local-proof" | "product-clarity";
    qualification?: Array<{
      name: string;
      label: string;
      placeholder: string;
      options: string[];
    }>;
    process?: string[];
    faqs?: Array<{ question: string; answer: string }>;
    guidedQualifier?: {
      enabled: boolean;
      heading: string;
      intro: string;
    };
    quickAnswers?: {
      enabled: boolean;
      label: string;
      greeting: string;
      items: Array<{ question: string; answer: string }>;
      ctaLabel: string;
      ctaTarget: string;
    };
    aiChat?: {
      enabled: boolean;
      label: string;
      greeting: string;
      disclaimer: string;
      apiUrl: string;
      token: string;
    };
    exitOffer?: {
      enabled: boolean;
      eyebrow: string;
      heading: string;
      body: string;
      ctaLabel: string;
      ctaTarget: string;
    };
  };
  design?: {
    recipe: PageRecipe;
    variantId?: string;
    sections: PageSection[];
    treatment?: {
      density?: "compact" | "balanced" | "spacious";
      typography?: DesignTypography;
    };
    experience?: {
      packId?: ExperiencePackId | string;
      variantId?: string;
      blueprintVersion?: 2;
      renderer?: "reviewed-pack" | "creative-candidate" | "legacy" | string;
      candidateId?: string;
      routeId?: string;
      familyId?: string;
      referenceFamilyId?: string;
      referenceDnaVersion?: number | null;
      contractHash?: string;
      visualScore?: number;
      distinctivenessScore?: number;
      candidatePackIds?: string[];
      avoidPackIds?: string[];
      selectionMode?:
        | "internal-bakeoff"
        | "requested"
        | "legacy"
        | "creative-bakeoff"
        | "creative-diagnostic";
      fingerprint?: string;
      servicePage?: boolean;
      locationPage?: boolean;
      servicesIndex?: boolean;
    };
  };
  assetReport?: {
    used: Array<{
      asset: string;
      placement: string;
      source: string;
      provider?: string;
      model?: string;
      creator?: string;
      sourceUrl?: string;
      license?: string;
      subject?: string;
      promptHash?: string;
      requestId?: string;
      sha256?: string;
      generatedAt?: string;
      width?: number;
      height?: number;
    }>;
    skipped: Array<{ asset: string; reason: string }>;
  };
  qualityReport?: {
    score: number;
    issues: string[];
    refined: boolean;
  };
  seoResearch?: {
    version: number;
    mode: "researched" | "context-only" | "baseline";
    publishReady: boolean;
    metricLocation?: string;
    labsMetricLocation?: string;
    validatedQueries: Array<
      SeoKeyword & { query?: string; searchVolume?: number | null }
    >;
    customerQuestions: string[];
    copyVocabulary: string[];
    pageDecisions: Array<{
      type: "service" | "location";
      title: string;
      reason?: string;
      provenance: string;
    }>;
    pageMap?: SeoPageMap[];
    competitors?: Array<Record<string, unknown>>;
    questionEvidence?: Array<Record<string, unknown>>;
    fanOutQuestionGroups?: Array<Record<string, unknown>>;
    blogOpportunities?: Array<Record<string, unknown>>;
    quickWins?: Array<Record<string, unknown>>;
    marketSnapshot?: Record<string, unknown>;
    coverageAreas?: string[];
    coverageConfirmation?: Record<string, unknown>;
    coverageResearch?: {
      version: number;
      areas: string[];
      complete: boolean;
      approvalPolicy: "primary-city" | "all-confirmed-cities";
      cities: Array<{
        city: string;
        status: "complete" | "partial" | "pending";
        research: Record<string, unknown> | null;
        reason?: string;
      }>;
    };
    completeness?: Record<string, unknown>;
    fallbackSearch?: Record<string, unknown>;
    externalSearchEvidence?: Array<Record<string, unknown>>;
    prohibitedClaims: string[];
    evidence: Array<Record<string, unknown>>;
    cost: { tasks: number; usd: number; limitUsd: number };
    warnings: string[];
  };
  socialProof?: {
    source: "google_reviews" | "verified_differentiators";
    heading: string;
    intro: string;
    points: string[];
    fallback?: {
      source: "verified_differentiators";
      heading: string;
      intro: string;
      points: string[];
    };
    google?: { apiUrl: string; token: string };
  };
  revisionReport?: {
    feedback: string[];
    operations: Array<{ kind: string }>;
    expectedArtifacts: Array<{ type: string; marker?: string; field?: string }>;
    results?: Array<{
      feedbackIndex: number;
      status: "fulfilled" | "partial" | "manual";
      unresolved: string[];
      operationKinds: string[];
    }>;
  };
  lead?: { apiUrl: string; token: string };
};

const site = {
  ...config,
  business: publicBusiness(config.business),
} as SiteConfig;

// Always compile from current content/policy; stored reports cannot authorize routes.
export const routeInventory = compileRouteInventory(site);
export const pageBriefs = compilePageBriefs(site);
export const routePageBrief = (routeId: string) =>
  pageBriefs.briefs.find(
    (brief) =>
      brief.routeId === routeId.trim().toLowerCase().replace(/\s+/gu, " "),
  ) || null;
export const renderedRoutes = approvedRoutes(routeInventory, {
  production: productionRouteMode(import.meta.env),
});
export const routeIsRendered = (path: string) =>
  renderedRoutes.some((route) => route.path === path);
export const pageHref = (path: string, fallback = "/") =>
  routeIsRendered(path) ? path : fallback;
export const homeSectionHref = (type: string) => {
  const section = resolvePageRecipe(site).sections.find(
    (section) => section.type === type,
  );
  const hasAuthoredExperience = Boolean(
    site.design?.experience?.packId ||
    site.design?.experience?.renderer === "creative-candidate",
  );
  const id = hasAuthoredExperience
    ? type === "faq"
      ? "faqs"
      : type
    : section?.id;
  return id ? `/#${id}` : "/";
};
export const serviceHref = (slug: string) =>
  pageHref(`/services/${slug}/`, homeSectionHref("services"));
export const approvedServices = site.services.filter((service) =>
  routeIsRendered(`/services/${service.slug}/`),
);
site.locations = site.locations.filter((location) =>
  routeIsRendered(`/locations/${location.slug}/`),
);
export const footerRoutes = renderedRoutes.filter(
  (route) => route.discovery.navigation === "footer",
);
export const headerRoutes = renderedRoutes.filter(
  (route) => route.discovery.navigation === "header",
);
export default site;

export const phoneHref = (phone: string) =>
  `tel:${phone.replace(/[^+\d]/g, "")}`;

export const isDirectionsPrimary = () =>
  site.business.primaryCta.trim().toLowerCase() === "get directions";

export const hasExactStreetAddress = (address: string) =>
  /(?:^|,\s*)\d+[a-z]?\s+[a-z]/i.test(address.trim());

export const hasExactBusinessLocation = () =>
  Boolean(site.business.placeId?.trim()) ||
  hasExactStreetAddress(site.business.address);

export const shouldShowLocationMap = () =>
  isDirectionsPrimary() && hasExactBusinessLocation();

export const contactSectionHref = (pathname = "/") => {
  const id =
    (site.design?.experience?.packId
      ? "contact"
      : site.design?.sections.find((section) => section.type === "contact")
          ?.id) || "contact";
  return pathname === "/" ? `#${id}` : `/#${id}`;
};

export const primaryCtaHref = (pathname = "/") => {
  if (shouldShowLocationMap())
    return pathname === "/" ? "#location" : "/#location";
  if (isDirectionsPrimary() && site.business.address.trim())
    return directionsHref();
  return contactSectionHref(pathname);
};

export const directionsHref = () => {
  const params = new URLSearchParams({
    api: "1",
    query:
      site.business.address.trim() || site.business.name.trim() || "business",
  });
  if (site.business.placeId?.trim())
    params.set("query_place_id", site.business.placeId.trim());
  return `https://www.google.com/maps/search/?${params.toString()}`;
};

export const mapEmbedHref = () => {
  const query =
    site.business.address.trim() ||
    `place_id:${site.business.placeId?.trim() || ""}`;
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
};
