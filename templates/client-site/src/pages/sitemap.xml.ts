import type { APIRoute } from "astro";
import siteConfig from "../lib/site";

export const prerender = true;

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const GET: APIRoute = ({ site }) => {
  const configured = siteConfig.business.domain
    ? `https://${siteConfig.business.domain.replace(/^https?:\/\//u, "").replace(/\/$/u, "")}/`
    : site?.href || "https://example.pages.dev/";
  const paths = [
    "/",
    ...siteConfig.services.map((service) => `/services/${service.slug}/`),
    ...(siteConfig.industry === "home-services"
      ? siteConfig.locations.map((location) => `/locations/${location.slug}/`)
      : []),
  ];
  const urls = paths
    .map(
      (pathname) =>
        `<url><loc>${escapeXml(new URL(pathname, configured).href)}</loc></url>`,
    )
    .join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
};
