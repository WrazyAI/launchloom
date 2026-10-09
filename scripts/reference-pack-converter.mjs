#!/usr/bin/env node
/**
 * Reference pack converter.
 *
 * Reads an extracted reference template (see scripts/reference-template.mjs)
 * and produces a deterministic conversion brief: document structure, section
 * inventory, palette and typography candidates, layout metrics, motion hints,
 * and the signature/prohibited patterns already recorded in the dossier.
 *
 * The brief is the starting point for authoring an internal experience pack.
 * It never writes pack code by itself; `--scaffold` emits starter files under
 * artifacts/reference-packs/ for review.
 *
 * Usage:
 *   node scripts/reference-pack-converter.mjs --dossier html5up-dental-dimension
 *   node scripts/reference-pack-converter.mjs --class licensed --write
 *   node scripts/reference-pack-converter.mjs --all --write --scaffold
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadReferenceTemplate,
  listReferenceTemplateEntries,
} from "./reference-template.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const SECTION_HINTS = [
  { key: "hero", pattern: /hero|masthead|opening|stage|banner/iu },
  {
    key: "services",
    pattern: /service|practice|treatment|menu|program|capabilit/iu,
  },
  { key: "about", pattern: /about|story|approach|philosoph|who-we|team/iu },
  { key: "process", pattern: /process|step|how-it-works|timeline/iu },
  {
    key: "proof",
    pattern: /proof|result|testimonial|review|credential|award|record/iu,
  },
  { key: "faq", pattern: /faq|question|accordion/iu },
  { key: "contact", pattern: /contact|enquir|inquir|book|consult|form/iu },
  { key: "coverage", pattern: /coverage|area|location|map|serving/iu },
  { key: "gallery", pattern: /gallery|work|project|portfolio|case-stud/iu },
];

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args[key] = next;
        index += 1;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function walkFiles(directory) {
  const results = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) results.push(full);
    }
  };
  visit(directory);
  return results;
}

function readTextFile(absolutePath, limit = 3_000_000) {
  const bytes = fs.readFileSync(absolutePath);
  if (bytes.length > limit) return null;
  return bytes.toString("utf8");
}

function stripTags(value) {
  return String(value || "")
    .replace(/<[^>]*>/gu, " ")
    .replace(/&[a-z#0-9]+;/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function collectMatches(text, pattern, limit = 40) {
  return [...text.matchAll(pattern)]
    .map((match) => match[1] ?? match[0])
    .filter(Boolean)
    .slice(0, limit);
}

export function analyzeHtml(html) {
  const headings = [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/giu)]
    .map((match) => ({
      level: Number(match[1]),
      text: stripTags(match[2]).slice(0, 120),
    }))
    .filter((heading) => heading.text)
    .slice(0, 60);
  const sections = [
    ...html.matchAll(
      /<(section|article|aside|header|footer|main)\b([^>]*)>/giu,
    ),
  ]
    .map((match) => {
      const attributes = match[2];
      const id = attributes.match(/\bid="([^"]*)"/iu)?.[1] || "";
      const className =
        attributes.match(/\bclass="([^"]*)"/iu)?.[1]?.split(/\s+/u)[0] || "";
      return {
        element: match[1].toLowerCase(),
        id: id.slice(0, 80),
        marker: (className || id).slice(0, 80),
      };
    })
    .slice(0, 80);
  const classes = new Set();
  for (const match of html.matchAll(/class="([^"]*)"/gu))
    for (const name of match[1].split(/\s+/u))
      if (name && classes.size < 400) classes.add(name);
  const ids = collectMatches(html, /\bid="([^"]+)"/gu, 80);
  const cssVariables = collectMatches(html, /--([a-z0-9-]{2,60})\s*:/giu, 120);
  const colors = [
    ...new Set(
      collectMatches(html, /(#[0-9a-f]{3,8}\b|rgba?\([^)]{3,60}\))/giu, 80).map(
        (value) => value.toLowerCase(),
      ),
    ),
  ];
  const fonts = collectMatches(
    html,
    /font-family\s*:\s*([^;"'}]{3,120})/giu,
    20,
  );
  const media = {
    images: [...html.matchAll(/<img\b/giu)].length,
    svgs: [...html.matchAll(/<svg\b/giu)].length,
    videos: [...html.matchAll(/<video\b/giu)].length,
  };
  const interactive = {
    details: [...html.matchAll(/<details\b/giu)].length,
    forms: [...html.matchAll(/<form\b/giu)].length,
    dialogs: [...html.matchAll(/<dialog\b/giu)].length,
    navs: [...html.matchAll(/<nav\b/giu)].length,
  };
  return {
    headings,
    sections,
    classNames: [...classes],
    ids,
    cssVariables: [...new Set(cssVariables)],
    colors: colors.slice(0, 60),
    fonts: [...new Set(fonts.map((font) => font.trim()))].slice(0, 20),
    media,
    interactive,
  };
}

export function analyzeCss(cssTexts) {
  const combined = cssTexts.join("\n");
  const mediaQueries = collectMatches(combined, /@media[^{]+/giu, 40).map(
    (query) => query.replace(/\s+/gu, " ").trim(),
  );
  const transitions = collectMatches(
    combined,
    /transition\s*:\s*([^;}]{3,120})/giu,
    40,
  );
  const animations = collectMatches(
    combined,
    /animation\s*:\s*([^;}]{3,120})/giu,
    40,
  );
  const grids = collectMatches(
    combined,
    /grid-template-columns\s*:\s*([^;}]{3,120})/giu,
    40,
  );
  const maxWidths = [
    ...new Set(
      collectMatches(combined, /max-width\s*:\s*([^;}]{2,60})/giu, 60),
    ),
  ];
  const colors = [
    ...new Set(
      collectMatches(
        combined,
        /(#[0-9a-f]{3,8}\b|rgba?\([^)]{3,60}\))/giu,
        120,
      ).map((value) => value.toLowerCase()),
    ),
  ];
  const fonts = collectMatches(
    combined,
    /font-family\s*:\s*([^;}]{3,120})/giu,
    40,
  );
  return {
    mediaQueries: [...new Set(mediaQueries)].slice(0, 20),
    transitions: [...new Set(transitions)].slice(0, 15),
    animations: [...new Set(animations)].slice(0, 15),
    gridTemplates: [...new Set(grids)].slice(0, 15),
    maxWidths: maxWidths.slice(0, 20),
    colors: colors.slice(0, 60),
    fonts: [...new Set(fonts.map((font) => font.trim()))].slice(0, 20),
  };
}

export function mapSections(structure) {
  const mapped = [];
  for (const section of structure.sections) {
    const haystack = `${section.marker} ${section.id || ""} ${section.element}`;
    const hint = SECTION_HINTS.find((entry) => entry.pattern.test(haystack));
    if (hint)
      mapped.push({ target: hint.key, source: section.marker || section.id });
  }
  const unique = [];
  for (const entry of mapped)
    if (!unique.some((item) => item.target === entry.target))
      unique.push(entry);
  return unique;
}

async function convertDossier(entry, options) {
  const template = loadReferenceTemplate(entry.dossierPath, {
    repositoryRoot: root,
  });
  if (!template || template.status !== "extracted")
    return {
      dossierId: entry.id,
      status: "skipped",
      reason: template?.reason || "No extracted template is available.",
    };
  const sourceRoot = path.join(template.absoluteDirectory, "source");
  const files = walkFiles(sourceRoot);
  const htmlFiles = files.filter((file) => /\.html?$/u.test(file));
  const cssFiles = files.filter((file) => file.endsWith(".css"));
  const entrypoint = path.join(template.absoluteDirectory, template.entrypoint);
  const html = readTextFile(entrypoint) || "";
  const cssTexts = cssFiles
    .map((file) => readTextFile(file))
    .filter((text) => typeof text === "string");
  const manifestPath = path.join(root, entry.dossierPath, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const dna = manifest.referenceDna || {};
  const brief = {
    schemaVersion: 1,
    dossierId: entry.id,
    sourceClass: entry.rights,
    sourceUrl: manifest.source?.url || null,
    templateDigest: template.digest,
    entrypoint: template.entrypoint,
    generatedAt: new Date().toISOString(),
    files: {
      html: htmlFiles.length,
      css: cssFiles.length,
      total: files.length,
    },
    structure: analyzeHtml(html),
    styles: analyzeCss(cssTexts),
    sectionMap: mapSections(analyzeHtml(html)),
    referenceSignatures: (dna.requiredSignatureElements || []).map(
      (item) => item.description || item.id,
    ),
    prohibitedPatterns: dna.prohibitedPatterns || [],
    proposedPack: {
      id: null,
      note: "Assign the pack id during authoring; the converter never registers packs.",
      hero: null,
      services: null,
      sectionOrder: null,
    },
  };
  if (options.write) {
    const target = path.join(root, entry.dossierPath, "pack-brief.json");
    await fsp.writeFile(target, `${JSON.stringify(brief, null, 2)}\n`);
  }
  if (options.scaffold && options.write) {
    const scaffoldRoot = path.join(root, "artifacts/reference-packs", entry.id);
    await fsp.mkdir(scaffoldRoot, { recursive: true });
    await fsp.writeFile(
      path.join(scaffoldRoot, "brief.json"),
      `${JSON.stringify(brief, null, 2)}\n`,
    );
    await fsp.writeFile(
      path.join(scaffoldRoot, "README.md"),
      scaffoldReadme(brief),
    );
  }
  return { dossierId: entry.id, status: "converted", brief };
}

function scaffoldReadme(brief) {
  const headingList = brief.structure.headings
    .slice(0, 12)
    .map(
      (heading) =>
        `${"#".repeat(Math.min(heading.level + 1, 6))} ${heading.text}`,
    )
    .join("\n");
  return `# ${brief.dossierId} pack scaffold

Generated from the extracted reference template (digest \`${brief.templateDigest}\`).

## Observed headings

${headingList || "No headings were found."}

## Section map

${brief.sectionMap.map((entry) => `- ${entry.target}: ${entry.source}`).join("\n") || "- No section markers were mapped."}

## Next steps

1. Author the adapter under \`templates/client-site/src/components/experiences/\`.
2. Register the pack with \`internalOnly: true\` until the attribution decision.
3. Add the demo entry, gate contract, and tests.
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const options = {
    write: args.write === true,
    scaffold: args.scaffold === true,
  };
  const entries = listReferenceTemplateEntries(root).filter(
    (entry) => entry.status === "extracted",
  );
  let selected = entries;
  if (args.dossier)
    selected = selected.filter((entry) => entry.id === args.dossier);
  else if (args.class)
    selected = selected.filter((entry) => entry.rights === args.class);
  const only = args.only
    ? new Set(
        String(args.only)
          .split(",")
          .map((value) => value.trim()),
      )
    : null;
  if (only) selected = selected.filter((entry) => only.has(entry.id));
  else if (!args.dossier && !args.class && args.all !== true) selected = [];
  if (args.limit) selected = selected.slice(0, Number(args.limit));
  if (!selected.length) {
    console.error(
      "No extracted dossiers matched. Use --dossier <id>, --class <rights>, or --all.",
    );
    process.exitCode = 1;
    return;
  }
  let converted = 0;
  let skipped = 0;
  for (const entry of selected) {
    const result = await convertDossier(entry, options);
    if (result.status === "converted") {
      converted += 1;
      console.log(
        `brief id=${entry.id} write=${options.write} sections=${result.brief.sectionMap.length} headings=${result.brief.structure.headings.length} colors=${result.brief.structure.colors.length}`,
      );
    } else {
      skipped += 1;
      console.log(`skipped id=${entry.id} reason=${result.reason}`);
    }
  }
  console.log(
    `reference_pack_converter done converted=${converted} skipped=${skipped} write=${options.write}`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(
      `reference_pack_converter_error ${String(error?.message || error).slice(0, 300)}`,
    );
    process.exitCode = 1;
  });
}
