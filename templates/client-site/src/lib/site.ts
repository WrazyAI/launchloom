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
    showBrandName?: boolean;
    surfaceColor?: string;
    heroColor?: string;
    inkColor?: string;
    mutedColor?: string;
    lineColor?: string;
    contrastColor?: string;
  };
  services: Service[];
  differentiators: string[];
  locations: Location[];
  images: { hero?: string; secondary?: string };
  assets?: {
    logo?: string;
    photoOne?: string;
    photoTwo?: string;
    photoThree?: string;
    teamPhoto?: string;
  };
  copy?: {
    heroKicker?: string;
    servicesHeading?: string;
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
    sections: PageSection[];
    treatment?: {
      density?: "compact" | "balanced" | "spacious";
      typography?: "editorial" | "sans" | "strong";
    };
  };
  assetReport?: {
    used: Array<{
      asset: string;
      placement: string;
      source: string;
      provider?: string;
      creator?: string;
      sourceUrl?: string;
      license?: string;
      subject?: string;
    }>;
    skipped: Array<{ asset: string; reason: string }>;
  };
  qualityReport?: {
    score: number;
    issues: string[];
    refined: boolean;
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

export default config as SiteConfig;

export const phoneHref = (phone: string) =>
  `tel:${phone.replace(/[^+\d]/g, "")}`;
