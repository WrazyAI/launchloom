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
  preset: "wellness" | "home-services";
  industry?: string;
  businessKind?: string;
  business: {
    name: string;
    tagline: string;
    description: string;
    phone: string;
    email: string;
    address: string;
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
    primaryColor: string;
    tone: string;
    preference?: string;
    visualDirection?: string;
    showBrandName?: boolean;
    surfaceColor?: string;
    heroColor?: string;
    inkColor?: string;
    mutedColor?: string;
    lineColor?: string;
    contrastColor?: string;
    brandTextColor?: string;
    brandSurfaceColor?: string;
    brandSurfaceTextColor?: string;
  };
  services: Service[];
  seoPageMap?: SeoPageMap[];
  differentiators: string[];
  locations: Location[];
  blogArticles?: BlogArticle[];
  images: { hero?: string; secondary?: string; tertiary?: string };
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
      familyId?: string;
      referenceFamilyId?: string;
      referenceDnaVersion?: number | null;
      contractHash?: string;
      visualScore?: number;
      distinctivenessScore?: number;
      candidatePackIds?: string[];
      avoidPackIds?: string[];
      selectionMode?: "internal-bakeoff" | "requested" | "legacy" | "creative-bakeoff";
      fingerprint?: string;
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
    validatedQueries: Array<SeoKeyword & { query?: string; searchVolume?: number | null }>;
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
    completeness?: Record<string, unknown>;
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

const site = config as SiteConfig;

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
