import config from "../site.config.json";

export type Service = { name: string; description: string; slug: string };
export type Location = { name: string; slug: string; description?: string };
export type SiteConfig = {
  preset: "wellness" | "home-services";
  business: { name: string; tagline: string; description: string; phone: string; email: string; address: string; serviceAreas: string[]; hours: string; primaryCta: string; offer?: string; domain?: string; leadEmail: string };
  style: { primaryColor: string; tone: string };
  services: Service[];
  differentiators: string[];
  locations: Location[];
  images: { hero: string; secondary: string };
};

export default config as SiteConfig;

export const phoneHref = (phone: string) => `tel:${phone.replace(/[^+\d]/g, "")}`;
