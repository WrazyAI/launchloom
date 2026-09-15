import type { APIRoute } from "astro";

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const review = import.meta.env.PUBLIC_REVIEW_MODE === "true";
  const configured = site?.href || "https://example.pages.dev/";
  const sitemap = new URL("sitemap.xml", configured).href;
  return new Response(
    review
      ? "User-agent: *\nAllow: /\n"
      : `User-agent: *\nAllow: /\nSitemap: ${sitemap}\n`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
};
