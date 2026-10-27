import fs from "node:fs";
import path from "node:path";
import { parseHTML } from "linkedom";
import { buildFoundationManifest } from "./foundation-schema.mjs";
import { scopeFoundationCss } from "./foundation-css.mjs";
import {
  applyFoundationThemeCss,
  applyFoundationThemeHtml,
} from "./foundation-theme.mjs";
import { detectFoundationSections } from "./foundation-sections.mjs";
import { extractFoundationInteractions } from "./foundation-interactions.mjs";
import { normalizeFoundationSource } from "./foundation-source.mjs";

function walk(directory) {
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(
          `Foundation output must not contain a symlink: ${full}.`,
        );
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  visit(directory);
  return files.sort((left, right) => left.localeCompare(right));
}

function uniqueBlockers(blockers) {
  const seen = new Set();
  return blockers.filter((blocker) => {
    const key = `${blocker.code}|${blocker.message}|${blocker.selector || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function licenseName(manifest) {
  const source = manifest?.source || {};
  const evidence = `${source.license || ""} ${source.rightsEvidence || ""}`;
  const match = evidence.match(
    /\b(?:CC BY [\d.]+|CC0(?: [\d.]+)?|MIT|Apache-?[\d.]+|BSD-[\d.]+)\b/iu,
  );
  return source.license || match?.[0] || source.rights || "Licensed reference";
}

export function foundationLicenseFor(manifest) {
  const source = manifest?.source || {};
  return {
    name: licenseName(manifest),
    ...(source.url ? { url: source.url } : {}),
    credit: `Template adapted from ${source.name || manifest?.id || "reference source"}`,
  };
}

function readDossierManifest(repositoryRoot, dossierId) {
  const manifestPath = path.join(
    repositoryRoot,
    "data/reference-library/dossiers",
    dossierId,
    "manifest.json",
  );
  if (!fs.existsSync(manifestPath))
    throw new Error(`Dossier manifest is missing: ${manifestPath}.`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!manifest || typeof manifest !== "object")
    throw new Error(`Dossier manifest is invalid: ${manifestPath}.`);
  return manifest;
}

function bindGlobalSlots(html, slots) {
  const { document } = parseHTML(html);
  let changed = false;
  const title = document.querySelector("title");
  if (title) {
    title.textContent = "{{page.title}}";
    slots.push({
      id: "page.title",
      selector: "title",
      kind: "text",
      contentPath: "brand.name",
      required: true,
    });
    changed = true;
  }
  for (const meta of document.querySelectorAll('meta[name="description"]'))
    meta.setAttribute("content", "");
  return changed ? document.toString() : html;
}

function removeSourceForms(html) {
  const { document } = parseHTML(html);
  const forms = [...document.querySelectorAll("form")];
  for (const form of forms) form.remove();
  return {
    html: forms.length ? document.toString() : html,
    removed: forms.length,
  };
}

function scopeInlineStyles(html) {
  const { document } = parseHTML(html);
  let changed = false;
  for (const style of document.querySelectorAll("style")) {
    const source = style.textContent || "";
    if (!source.trim()) continue;
    const scoped = scopeFoundationCss(source);
    style.textContent = applyFoundationThemeCss(scoped.css);
    changed = true;
  }
  return changed ? document.toString() : html;
}

function ensureFoundationScript(html, script) {
  if (!script) return html;
  if (/foundation\.js/iu.test(html)) return html;
  if (/<\/body>/iu.test(html))
    return html.replace(
      /<\/body>/iu,
      '<script src="foundation.js" defer></script></body>',
    );
  return `${html}\n<script src="foundation.js" defer></script>`;
}

function writeReadme({ manifest, dossierManifest, outputDirectory }) {
  const source = dossierManifest.source || {};
  const blockers = manifest.blockers.length
    ? manifest.blockers
        .map(
          (blocker) =>
            `- \`${blocker.code}\`: ${blocker.message}${blocker.selector ? ` (\`${blocker.selector}\`)` : ""}`,
        )
        .join("\n")
    : "- None.";
  const readme = `# Source foundation: ${manifest.id}

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: \`${manifest.dossierId}\`
- Source: ${source.name || "Unknown source"}
- Source URL: ${source.url || "Not recorded"}
- Rights: \`${manifest.sourceClass}\`
- License: ${manifest.license.name}
- Credit: ${manifest.license.credit}
- Source digest: \`${manifest.sourceDigest}\`
- Entrypoint: \`${manifest.entrypoint}\`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: \`${manifest.compatibility}\`
- Sections: ${manifest.sections.length}
- Content slots: ${manifest.slots.length}
- Interactions: ${manifest.interactions.length}

Blockers:

${blockers}

## Files

- \`manifest.json\`: source digest, section map, content slots, assets,
  interactions, license, and blockers.
- \`source/\`: normalized HTML, scoped CSS, local scripts, and reference assets.
- \`source/foundation.js\`: extracted safe interactions, when present.

## Use

1. Read the manifest and the source files.
2. Bind every required slot to sealed client content.
3. Replace reference-only assets with approved client or contextual assets.
4. Adapt the sections marked \`needs-adaptation\`.
5. Render and verify at desktop, compact desktop, and mobile widths.
6. Keep the license credit visible when the license requires it.

Generated with \`scripts/compile-source-foundation.mjs\`.
`;
  fs.writeFileSync(path.join(outputDirectory, "README.md"), readme);
}

export function compileSourceFoundation({
  repositoryRoot = process.cwd(),
  dossierId,
  outputDirectory,
  write = true,
}) {
  if (!dossierId) throw new Error("A dossier id is required.");
  const dossierPath = `data/reference-library/dossiers/${dossierId}`;
  const dossierManifest = readDossierManifest(repositoryRoot, dossierId);
  const output = path.resolve(
    outputDirectory || path.join(repositoryRoot, dossierPath, "foundation"),
  );
  const normalized = normalizeFoundationSource({
    repositoryRoot,
    dossierPath,
    outputDirectory: output,
  });
  const entrypointPath = path.join(output, normalized.template.entrypoint);
  if (!fs.existsSync(entrypointPath))
    throw new Error(`Foundation entrypoint is missing: ${entrypointPath}.`);
  const license = foundationLicenseFor(dossierManifest);

  let html = fs.readFileSync(entrypointPath, "utf8");
  const sections = detectFoundationSections({
    html,
    dossierId,
    license,
  });
  const globalHtml = bindGlobalSlots(sections.html, sections.slots);
  const sourceForms = removeSourceForms(globalHtml);
  html = applyFoundationThemeHtml(scopeInlineStyles(sourceForms.html));
  const interactions = extractFoundationInteractions({
    html,
    sourceDirectory: path.join(output, "source"),
  });
  html = ensureFoundationScript(interactions.html, interactions.script);
  fs.writeFileSync(entrypointPath, html);
  if (interactions.script) {
    fs.writeFileSync(
      path.join(output, "source", "foundation.js"),
      interactions.script,
    );
  }

  const cssBlockers = [];
  for (const file of walk(path.join(output, "source"))) {
    if (!/\.css$/iu.test(file)) continue;
    const scoped = scopeFoundationCss(fs.readFileSync(file, "utf8"));
    fs.writeFileSync(file, applyFoundationThemeCss(scoped.css));
    cssBlockers.push(...scoped.blockers);
  }

  const interactionsById = new Map();
  const removedFormSources = new Set(["form", 'input[type="range"]']);
  for (const interaction of [
    ...sections.interactions,
    ...interactions.interactions,
  ]) {
    if (sourceForms.removed && removedFormSources.has(interaction.source))
      continue;
    if (!interactionsById.has(interaction.id))
      interactionsById.set(interaction.id, interaction);
  }
  if (!interactionsById.has("contact-form"))
    interactionsById.set("contact-form", {
      id: "contact-form",
      source: "#contact",
      primitive: "shared-lead-form",
      reducedMotion: "static form",
    });

  const blockers = uniqueBlockers([
    ...normalized.blockers,
    ...sections.blockers,
    ...(sourceForms.removed
      ? [
          {
            code: "source-form-removed",
            message: `Removed ${sourceForms.removed} source form(s); the shared lead form is the only conversion path.`,
          },
        ]
      : []),
    ...interactions.blockers,
    ...cssBlockers,
  ]);
  const manifest = buildFoundationManifest({
    schemaVersion: 1,
    id: dossierId,
    dossierId,
    sourceDigest: normalized.sourceDigest,
    entrypoint: normalized.template.entrypoint,
    sourceClass: dossierManifest.source?.rights || "licensed",
    license,
    sections: sections.sections,
    slots: sections.slots,
    assets: normalized.assets,
    interactions: [...interactionsById.values()],
    preservedMechanics: [
      "section-order",
      "css-system",
      "image-roles",
      "native-interactions",
    ],
    prohibitedSourceMaterial: [
      "brand",
      "copy",
      "prices",
      "reviews",
      "project-names",
      "people",
      "source-images",
      "demo-facts",
    ],
    compatibility: blockers.length ? "needs-adaptation" : "renderable",
    blockers,
  });

  if (write) {
    fs.writeFileSync(
      path.join(output, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    writeReadme({ manifest, dossierManifest, outputDirectory: output });
  }

  return {
    manifest,
    outputDirectory: output,
    dossierManifest,
    html,
    blockers,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const dossierId = args.dossier || args._?.[0];
  if (!dossierId) {
    console.error(
      "Usage: node scripts/compile-source-foundation.mjs --dossier <id> [--out <dir>] [--write]",
    );
    process.exit(2);
  }
  try {
    const result = compileSourceFoundation({
      dossierId,
      outputDirectory: args.out,
      write: Boolean(args.write),
    });
    console.log(
      JSON.stringify(
        {
          dossierId,
          outputDirectory: result.outputDirectory,
          compatibility: result.manifest.compatibility,
          sections: result.manifest.sections.length,
          slots: result.manifest.slots.length,
          interactions: result.manifest.interactions.length,
          blockers: result.manifest.blockers,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      `foundation_compile_failed dossier=${dossierId} reason=${String(error?.message || error)}`,
    );
    process.exit(1);
  }
}
