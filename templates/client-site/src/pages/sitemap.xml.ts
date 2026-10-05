import type { APIRoute } from "astro";
import { routeInventory } from "../lib/site";

export const prerender = true;

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const GET: APIRoute = ({ site }) => {
  const configured = site?.href || "https://example.pages.dev/";
  const review =
    import.meta.env.PUBLIC_REVIEW_MODE === "true" ||
    import.meta.env.PUBLIC_CREATIVE_DIAGNOSTIC === "true";
  const paths = review
    ? []
    : routeInventory.records
        .filter((route) => route.discovery.sitemap)
        .map((route) => route.path);
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
