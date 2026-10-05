// One source of truth for files the revision synchronizer copies from templates.
import {
  FONT_FAMILIES,
  fontFilesFor,
} from "../templates/client-site/src/lib/font-catalog.mjs";

export function revisionFontAssetPaths() {
  return [
    "public/fonts/LICENSES.md",
    ...FONT_FAMILIES.flatMap((family) =>
      fontFilesFor(family).map((file) => "public" + file.path),
    ),
  ];
}

export function revisionTemplatePaths(config) {
  const operations = config.revisionReport?.operations || [];
  const kinds = new Set(operations.map((operation) => operation.kind));
  const files = new Set([
    "components/LeadForm.astro",
    "components/ReviewBanner.astro",
    "lib/seo-readiness.mjs",
    "lib/seo-readiness.d.mts",
    "lib/business-facts.mjs",
    "lib/business-facts.d.mts",
    "lib/page-briefs.mjs",
    "lib/page-briefs.d.mts",
    "lib/font-catalog.mjs",
    "lib/font-catalog.d.mts",
    "components/PageBriefSections.tsx",
    "lib/creative-runtime.tsx",
    "styles/site.css",
    "components/ServiceCandidateHost.tsx",
    "components/LocationCandidateHost.tsx",
    "lib/route-inventory.mjs",
    "lib/route-inventory.d.mts",
    "lib/site.ts",
    "components/Header.astro",
    "components/Footer.astro",
    "components/PageSections.astro",
    "components/DesignFamilySections.astro",
    "components/experiences/EditorialFolioExperience.astro",
    "components/experiences/GuidedConversationExperience.astro",
    "components/experiences/ServiceLedExperience.astro",
    "pages/404.astro",
    "pages/about/[...page].astro",
    "pages/contact/[...page].astro",
    "pages/services/[...overview].astro",
    "pages/services/[slug].astro",
    "pages/locations/[slug].astro",
    "pages/blog/[...slug].astro",
    "pages/[support].astro",
    "pages/robots.txt.ts",
    "pages/sitemap.xml.ts",
  ]);
  if (config.routePolicy !== undefined) files.add("layouts/SiteLayout.astro");
  if (config.design?.experience?.packId) {
    for (const relative of [
      "components/ExperiencePage.astro",
      "components/experiences/EditorialFolioExperience.astro",
      "components/experiences/ExperienceMediaRail.astro",
      "components/experiences/GuidedConversationExperience.astro",
      "components/experiences/ServiceLedExperience.astro",
      "components/Header.astro",
      "components/Footer.astro",
      "components/LocationMap.astro",
      "components/SocialProof.astro",
      "pages/index.astro",
      "pages/services/[slug].astro",
      "pages/locations/[slug].astro",
      "lib/experience-pack.ts",
      "lib/site.ts",
      "styles/experience-packs.css",
    ])
      files.add(relative);
  }
  if (
    String(config.business?.primaryCta || "")
      .trim()
      .toLowerCase() === "get directions"
  ) {
    for (const relative of [
      "components/LocationMap.astro",
      "components/PageSections.astro",
      "components/QuickAnswers.astro",
      "components/ExitOffer.astro",
      "components/Footer.astro",
      "lib/site.ts",
      "styles/site.css",
    ])
      files.add(relative);
  }
  if (kinds.has("set_social_proof"))
    for (const relative of [
      "components/SocialProof.astro",
      "styles/site.css",
      "lib/site.ts",
    ])
      files.add(relative);
  if (kinds.has("show_brand_name"))
    for (const relative of [
      "components/Header.astro",
      "components/Footer.astro",
      "styles/site.css",
      "lib/site.ts",
    ])
      files.add(relative);
  if (kinds.has("set_color_palette"))
    for (const relative of [
      "layouts/SiteLayout.astro",
      "styles/site.css",
      "lib/site.ts",
      "components/Header.astro",
      "components/Footer.astro",
      "components/PageSections.astro",
      "pages/contact/[...page].astro",
      "pages/services/[slug].astro",
      "pages/locations/[slug].astro",
    ])
      files.add(relative);
  if (
    config.design?.experience?.renderer === "creative-candidate" &&
    kinds.has("set_color_palette")
  ) {
    files.add("components/CreativeExperience.astro");
    files.add("lib/creative-palette-bindings.mjs");
  }
  if (kinds.has("set_conversion_feature"))
    for (const relative of [
      "components/QuickAnswers.astro",
      "components/ExitOffer.astro",
      "layouts/SiteLayout.astro",
      "lib/page-recipe.ts",
      "lib/design-variants.ts",
      "lib/site.ts",
      "styles/site.css",
    ])
      files.add(relative);
  if (
    operations.some(
      (operation) =>
        operation.kind === "set_copy" &&
        ["heroHeading", "heroBody"].includes(operation.field),
    )
  ) {
    files.add("components/PageSections.astro");
    files.add("lib/site.ts");
  }
  if (
    [...kinds].some((kind) =>
      [
        "set_section_enabled",
        "reorder_section",
        "set_section_variant",
        "set_design_treatment",
      ].includes(kind),
    )
  ) {
    for (const relative of [
      "components/PageSections.astro",
      "components/SocialProof.astro",
      "pages/index.astro",
      "lib/page-recipe.ts",
      "lib/design-variants.ts",
      "lib/site.ts",
      "styles/site.css",
    ])
      files.add(relative);
  }
  if (files.has("layouts/SiteLayout.astro")) {
    files.add("lib/color-policy.mjs");
    files.add("lib/color-contrast.mjs");
  }
  return [...files].map((relative) => `src/${relative}`);
}

// Besides copied template files, the synchronizer may migrate the existing
// canonical expression in SiteLayout and insert legacy social-proof markup.
// Keep those exact secondary destinations in the machine-enforced write set.
// Feedback replacements are committed beside generated imagery. Only the exact
// files named by this revision's set_image operations are writable.
export const REVISION_TEMPLATE_BASELINE_PATH =
  ".launchloom/revision-template-baseline.json";

export function revisionAssetWritePaths(config) {
  return (config.revisionReport?.operations || [])
    .filter(
      (operation) =>
        operation.kind === "set_image" &&
        typeof operation.path === "string" &&
        /^\/images\/feedback\/[a-z0-9-]+\.webp$/u.test(operation.path),
    )
    .map((operation) => `public${operation.path}`);
}

export const retiredRouteTemplatePaths = [
  "src/pages/about.astro",
  "src/pages/contact.astro",
  "src/pages/services/index.astro",
];

export function revisionTemplateWritePaths(config) {
  const files = new Set(revisionTemplatePaths(config));
  for (const relative of revisionFontAssetPaths()) files.add(relative);
  for (const relative of retiredRouteTemplatePaths) files.add(relative);
  files.add(REVISION_TEMPLATE_BASELINE_PATH);
  files.add("src/layouts/SiteLayout.astro");
  if (
    (config.revisionReport?.operations || []).some(
      (operation) => operation.kind === "set_social_proof",
    )
  )
    files.add("src/pages/index.astro");
  for (const asset of revisionAssetWritePaths(config)) files.add(asset);
  return [...files].sort();
}
