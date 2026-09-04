import config from "../site.config.json";

export type Service = { name: string; description: string; slug: string };
export type Location = { name: string; slug: string; description?: string };
export type SiteConfig = {
  preset: "wellness" | "home-services";
  industry?: string;
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
  };
  style: { primaryColor: string; tone: string };
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
  };
  assetReport?: {
    used: Array<{ asset: string; placement: string; source: string }>;
    skipped: Array<{ asset: string; reason: string }>;
  };
  qualityReport?: {
    score: number;
    issues: string[];
    refined: boolean;
  };
  lead?: { apiUrl: string; token: string };
};

export default config as SiteConfig;

export const phoneHref = (phone: string) =>
  `tel:${phone.replace(/[^+\d]/g, "")}`;
