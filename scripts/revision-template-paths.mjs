// One source of truth for files the revision synchronizer copies from templates.
export function revisionTemplatePaths(config) {
  const operations = config.revisionReport?.operations || [];
  const kinds = new Set(operations.map((operation) => operation.kind));
  const files = new Set([
    "components/LeadForm.astro",
    "components/ReviewBanner.astro",
    "pages/robots.txt.ts",
    "pages/sitemap.xml.ts",
  ]);
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
    ])
      files.add(relative);
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
  return [...files].map((relative) => `src/${relative}`);
}

// Besides copied template files, the synchronizer may migrate the existing
// canonical expression in SiteLayout and insert legacy social-proof markup.
// Keep those exact secondary destinations in the machine-enforced write set.
// Feedback replacements are committed beside generated imagery. Only the exact
// files named by this revision's set_image operations are writable.
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

export function revisionTemplateWritePaths(config) {
  const files = new Set(revisionTemplatePaths(config));
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
