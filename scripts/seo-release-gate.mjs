import { pageBriefReadiness, pageBriefFor, pageBriefExpectedContent } from "../templates/client-site/src/lib/page-briefs.mjs";
import {
  compileRouteInventory,
  approvedRoutes,
} from "../templates/client-site/src/lib/route-inventory.mjs";
import { businessFactReadiness } from "../templates/client-site/src/lib/business-facts.mjs";
import { seoResearchReadiness } from "../templates/client-site/src/lib/seo-readiness.mjs";
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
const decodeHtmlText = (value = "") =>
  value.replace(
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
      return (
        {
          amp: "&",
          AMP: "&",
          lt: "<",
          LT: "<",
          gt: ">",
          GT: ">",
          quot: '"',
          QUOT: '"',
          apos: "'",
        }[named] || entity
      );
    },
  );
const textWords = (html) =>
  html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, " ")
    .replace(/<[^>]*>/gu, " ")
    .replace(/&[a-z0-9#]+;/giu, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean).length;

export async function checkSeoRelease({ mode, config, dist, origin = "" }) {
  const failures = [];
  const pages = pageBriefReadiness(config);
  if (mode === "production" && !pages.allowed) failures.push(pages.error);
  const facts = businessFactReadiness(config);
  if (mode === "production" && !facts.allowed) failures.push(facts.error);
  if (
    config.business?.addressVisibility === "private" &&
    [
      config.business.address,
      config.business.placeId,
      config.business.googleMapsUrl,
    ].some(Boolean)
  )
    failures.push(
      "Private location fields remain in the public site configuration.",
    );
  if (!["review", "production"].includes(mode))
    return ["SEO release mode must be review or production."];
  const originUrl = mode === "production" ? new URL(origin) : null;
  if (
    originUrl &&
    (originUrl.protocol !== "https:" ||
      !originUrl.hostname.endsWith(".pages.dev"))
  )
    failures.push(
      "Production origin must be the approved HTTPS Pages hostname.",
    );
  // New intakes always carry at least a baseline dossier. Absence denotes an
  // approved pre-research legacy site, retained by the worker readiness policy.
  if (
    mode === "production" &&
    config.seoResearch &&
    !seoResearchReadiness(config).allowed
  )
    failures.push(
      "SEO research is incomplete; production publishing is blocked.",
    );

  const inventory = compileRouteInventory(config);
  if (mode === "production")
    failures.push(
      ...inventory.issues.map((issue) => `Route inventory: ${issue}`),
    );
  const records = approvedRoutes(inventory, {
    production: mode === "production",
  });
  const routes = records.map((record) => record.path);
  const expected = originUrl
    ? records
        .filter((record) => record.discovery.sitemap)
        .map((record) => new URL(record.path, originUrl).href)
    : [];
  const sitemap = await fs
    .readFile(path.join(dist, "sitemap.xml"), "utf8")
    .catch(() => "");
  const robots = await fs
    .readFile(path.join(dist, "robots.txt"), "utf8")
    .catch(() => "");
  if (
    !/^User-agent: \*$/mu.test(robots) ||
    !/^Allow: \/$/mu.test(robots) ||
    /^Disallow: \/$/mu.test(robots)
  )
    failures.push(
      "robots.txt must permit crawling so review noindex is observable and production can be indexed.",
    );
  if (mode === "production") {
    const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(
      (match) => match[1],
    );
    if (
      listed.length !== expected.length ||
      expected.some((url) => !listed.includes(url)) ||
      listed.some((url) => !expected.includes(url))
    )
      failures.push(
        "sitemap.xml does not list exactly the canonical production routes.",
      );
    if (!robots.includes(`Sitemap: ${new URL("/sitemap.xml", originUrl).href}`))
      failures.push("robots.txt does not point to the production sitemap.");
  }

  for (const route of routes) {
    const file = path.join(dist, route.slice(1), "index.html");
    const html = await fs.readFile(file, "utf8").catch(() => "");
    if (!html) {
      failures.push(`${route}: rendered route is missing.`);
      continue;
    }
    if (html.includes("—"))
      failures.push(`${route}: rendered page contains a prohibited em dash.`);
    const brief = pageBriefFor(config, records.find(record=>record.path===route)?.id);
    if (brief?.mode === "supported") {
      const bodyText = decodeHtmlText(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu," ").replace(/<[^>]*>/gu," ")).replace(/\s+/gu," ");
      for(const value of pageBriefExpectedContent(brief))if(!bodyText.includes(value.replace(/\s+/gu," ")))failures.push(`${route}: supported page brief content is missing from initial HTML.`);
      for(const media of brief.media)if(!tags(html,"img").some(tag=>attribute(tag,"src")===media.src&&decodeHtmlText(attribute(tag,"alt"))===media.alt))failures.push(`${route}: supported page media is missing from initial HTML.`);
      if(decodeHtmlText(attribute(meta(html,"description")||"","content"))!==brief.metadata.description)failures.push(`${route}: supported page metadata differs from the brief.`);
    }
    const title = decodeHtmlText(
      html.match(/<title>([^<]+)<\/title>/iu)?.[1],
    ).trim();
    const description = attribute(meta(html, "description") || "", "content");
    if (
      !title ||
      title.length < 10 ||
      !title.includes(config.business?.name || "")
    )
      failures.push(
        `${route}: descriptive business-specific title is missing.`,
      );
    if (!description || description.length < 35)
      failures.push(`${route}: useful meta description is missing.`);
    if (route !== "/" && textWords(html) < 80)
      failures.push(
        `${route}: service or location page is too thin to publish.`,
      );
    const robotsMeta = attribute(meta(html, "robots") || "", "content") || "";
    const robotsDirectives = new Set(
      robotsMeta
        .toLowerCase()
        .split(/[,\s]+/u)
        .filter(Boolean),
    );
    const link = attribute(canonical(html) || "", "href");
    if (mode === "review") {
      if (!robotsDirectives.has("noindex"))
        failures.push(`${route}: review page is not marked noindex.`);
    } else {
      const indexable = records.find((record) => record.path === route)
        ?.discovery.indexable;
      if (indexable && robotsDirectives.has("noindex"))
        failures.push(`${route}: production page is marked noindex.`);
      if (!indexable && !robotsDirectives.has("noindex"))
        failures.push(`${route}: nonindexable route is missing noindex.`);
      if (link !== new URL(route, originUrl).href)
        failures.push(
          `${route}: canonical URL does not match the approved production origin.`,
        );
    }
    const json = html.match(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/iu,
    )?.[1];
    let data;
    try {
      data = JSON.parse(json);
    } catch {
      failures.push(`${route}: LocalBusiness JSON-LD is missing or invalid.`);
    }
    if (data) {
      if (
        data.name !== config.business?.name ||
        data.telephone !== (config.business?.phone || undefined) ||
        data.email !== (config.business?.email || undefined) ||
        data.address !== (config.business?.address || undefined) ||
        JSON.stringify(data.areaServed || []) !==
          JSON.stringify(config.business?.serviceAreas || [])
      )
        failures.push(
          `${route}: structured business facts differ from the approved configuration.`,
        );
      if (mode === "production" && data.url !== new URL(route, originUrl).href)
        failures.push(`${route}: structured-data URL differs from canonical.`);
    }
  }
  // An explicit inventory must describe the complete public build, including omissions.
  if (inventory.mode === "explicit") {
    const built = [];
    async function walk(directory) {
      for (const entry of await fs.readdir(directory, {
        withFileTypes: true,
      })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(file);
        else if (entry.name.endsWith(".html")) built.push(file);
      }
    }
    await walk(dist);
    const incoming = new Set(["/"]);
    const htmlByPath = new Map();
    for (const file of built) {
      const relative = path.relative(dist, file).split(path.sep).join("/");
      if (relative === "404.html") continue;
      const pathname =
        relative === "index.html"
          ? "/"
          : "/" + relative.replace(/index\.html$/u, "");
      if (!routes.includes(pathname))
        failures.push(
          `${pathname}: unapproved or omitted route returned content.`,
        );
      htmlByPath.set(pathname, await fs.readFile(file, "utf8"));
    }
    for (const [pathname, html] of htmlByPath) {
      for (const tag of tags(html, "a")) {
        const href = decodeHtmlText(attribute(tag, "href") || "");
        if (
          !href ||
          (/^(?:tel:|mailto:|https?:\/\/|\/\/)/iu.test(href) &&
            !href.startsWith(origin))
        )
          continue;
        let target;
        try {
          target = new URL(
            href,
            new URL(pathname, origin || "https://review.invalid"),
          );
        } catch {
          failures.push(`${pathname}: invalid internal link ${href}.`);
          continue;
        }
        if (
          target.origin !== new URL(origin || "https://review.invalid").origin
        )
          continue;
        if (/\.[a-z0-9]+$/iu.test(target.pathname)) continue; // assets, not page routes
        const targetPath = target.pathname.endsWith("/")
          ? target.pathname
          : target.pathname + "/";
        if (!routes.includes(targetPath)) {
          failures.push(`${pathname}: unresolved internal link ${href}.`);
          continue;
        }
        if (targetPath !== pathname) incoming.add(targetPath);
        if (target.hash) {
          const targetHtml = htmlByPath.get(targetPath) || "";
          const ids = tags(targetHtml, "[a-z][a-z0-9:-]*").map((tag) =>
            attribute(tag, "id"),
          );
          let anchor;
          try {
            anchor = decodeURIComponent(target.hash.slice(1));
          } catch {
            anchor = null;
          }
          if (!ids.includes(anchor))
            failures.push(`${pathname}: unresolved internal anchor ${href}.`);
        }
      }
    }
    for (const route of routes)
      if (!incoming.has(route))
        failures.push(`${route}: rendered route is orphaned.`);
  }
  return [...new Set(failures)];
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .reduce(
        (pairs, value, index, all) =>
          index % 2 === 0
            ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]]
            : pairs,
        [],
      ),
  );
  if (
    !args.config ||
    !args.dist ||
    !args.mode ||
    (args.mode === "production" && !args.origin)
  )
    throw new Error(
      "Usage: seo-release-gate.mjs --mode review|production --config file --dist dir [--origin https://project.pages.dev]",
    );
  const config = JSON.parse(
    await fs.readFile(path.resolve(args.config), "utf8"),
  );
  const failures = await checkSeoRelease({
    mode: args.mode,
    config,
    dist: path.resolve(args.dist),
    origin: args.origin,
  });
  if (failures.length) {
    failures.forEach((failure) =>
      console.error(`SEO release blocked: ${failure}`),
    );
    process.exitCode = 1;
  } else console.log(`SEO ${args.mode} release gate passed.`);
}
