import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const attribute = (tag, name) => {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "iu"),
  );
  return match?.[1] ?? match?.[2];
};
const tags = (html, name) =>
  [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "giu"))].map(
    (match) => match[0],
  );
const meta = (html, name) =>
  tags(html, "meta").find((tag) => attribute(tag, "name") === name);
const canonical = (html) =>
  tags(html, "link").find((tag) => attribute(tag, "rel") === "canonical");
const decodeHtmlText = (value = "") => value.replace(
  /&(?:#(\d+)|#[xX]([\da-fA-F]+)|(amp|AMP|lt|LT|gt|GT|quot|QUOT|apos));/gu,
  (entity, decimal, hexadecimal, named) => {
    const codePoint = decimal
      ? Number.parseInt(decimal, 10)
      : hexadecimal
        ? Number.parseInt(hexadecimal, 16)
        : null;
    if (codePoint !== null)
      return codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    return {
      amp: "&", AMP: "&",
      lt: "<", LT: "<",
      gt: ">", GT: ">",
      quot: '"', QUOT: '"',
      apos: "'",
    }[named] || entity;
  },
);
const textWords = (html) =>
  html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, " ")
    .replace(/<[^>]*>/gu, " ")
    .replace(/&[a-z0-9#]+;/giu, " ")
    .trim()
    .split(/\s+/u).filter(Boolean).length;

export async function checkSeoRelease({ mode, config, dist, origin = "" }) {
  const failures = [];
  if (!["review", "production"].includes(mode))
    return ["SEO release mode must be review or production."];
  const originUrl = mode === "production" ? new URL(origin) : null;
  if (originUrl && (originUrl.protocol !== "https:" || !originUrl.hostname.endsWith(".pages.dev")))
    failures.push("Production origin must be the approved HTTPS Pages hostname.");
  // New intakes always carry at least a baseline dossier. Absence denotes an
  // approved pre-research legacy site, retained by the worker readiness policy.
  if (mode === "production" && config.seoResearch &&
      (config.seoResearch.mode !== "researched" || config.seoResearch.publishReady !== true))
    failures.push("SEO research is incomplete; production publishing is blocked.");

  const routes = [
    "/",
    ...(config.services || []).map((service) => `/services/${service.slug}/`),
    ...(config.industry === "home-services"
      ? (config.locations?.length ? config.locations : (config.business?.serviceAreas || []).map((name) => ({
          slug: name.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/(^-|-$)/gu, ""),
        }))).map((location) => `/locations/${location.slug}/`)
      : []),
  ];
  const expected = originUrl ? routes.map((route) => new URL(route, originUrl).href) : [];
  const sitemap = await fs.readFile(path.join(dist, "sitemap.xml"), "utf8").catch(() => "");
  const robots = await fs.readFile(path.join(dist, "robots.txt"), "utf8").catch(() => "");
  if (!/^User-agent: \*$/mu.test(robots) || !/^Allow: \/$/mu.test(robots) || /^Disallow: \/$/mu.test(robots))
    failures.push("robots.txt must permit crawling so review noindex is observable and production can be indexed.");
  if (mode === "production") {
    const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
    if (listed.length !== expected.length || expected.some((url) => !listed.includes(url)) ||
        listed.some((url) => !expected.includes(url)))
      failures.push("sitemap.xml does not list exactly the canonical production routes.");
    if (!robots.includes(`Sitemap: ${new URL("/sitemap.xml", originUrl).href}`))
      failures.push("robots.txt does not point to the production sitemap.");
  }

  for (const route of routes) {
    const file = path.join(dist, route.slice(1), "index.html");
    const html = await fs.readFile(file, "utf8").catch(() => "");
    if (!html) { failures.push(`${route}: rendered route is missing.`); continue; }
    if (html.includes("—"))
      failures.push(`${route}: rendered page contains a prohibited em dash.`);
    const title = decodeHtmlText(
      html.match(/<title>([^<]+)<\/title>/iu)?.[1],
    ).trim();
    const description = attribute(meta(html, "description") || "", "content");
    if (!title || title.length < 10 || !title.includes(config.business?.name || ""))
      failures.push(`${route}: descriptive business-specific title is missing.`);
    if (!description || description.length < 35)
      failures.push(`${route}: useful meta description is missing.`);
    if (route !== "/" && textWords(html) < 80)
      failures.push(`${route}: service or location page is too thin to publish.`);
    const robotsMeta = attribute(meta(html, "robots") || "", "content") || "";
    const robotsDirectives = new Set(
      robotsMeta.toLowerCase().split(/[,\s]+/u).filter(Boolean),
    );
    const link = attribute(canonical(html) || "", "href");
    if (mode === "review") {
      if (!robotsDirectives.has("noindex"))
        failures.push(`${route}: review page is not marked noindex.`);
    } else {
      if (robotsDirectives.has("noindex"))
        failures.push(`${route}: production page is marked noindex.`);
      if (link !== new URL(route, originUrl).href)
        failures.push(`${route}: canonical URL does not match the approved production origin.`);
    }
    const json = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/iu)?.[1];
    let data;
    try { data = JSON.parse(json); } catch { failures.push(`${route}: LocalBusiness JSON-LD is missing or invalid.`); }
    if (data) {
      if (data.name !== config.business?.name || data.telephone !== (config.business?.phone || undefined) ||
          data.email !== (config.business?.email || undefined) ||
          data.address !== (config.business?.address || undefined) ||
          JSON.stringify(data.areaServed || []) !== JSON.stringify(config.business?.serviceAreas || []))
        failures.push(`${route}: structured business facts differ from the approved configuration.`);
      if (mode === "production" && data.url !== new URL(route, originUrl).href)
        failures.push(`${route}: structured-data URL differs from canonical.`);
    }
  }
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) =>
    index % 2 === 0 ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]] : pairs, []));
  if (!args.config || !args.dist || !args.mode || (args.mode === "production" && !args.origin))
    throw new Error("Usage: seo-release-gate.mjs --mode review|production --config file --dist dir [--origin https://project.pages.dev]");
  const config = JSON.parse(await fs.readFile(path.resolve(args.config), "utf8"));
  const failures = await checkSeoRelease({ mode: args.mode, config, dist: path.resolve(args.dist), origin: args.origin });
  if (failures.length) {
    failures.forEach((failure) => console.error(`SEO release blocked: ${failure}`));
    process.exitCode = 1;
  } else console.log(`SEO ${args.mode} release gate passed.`);
}
