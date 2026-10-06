import { expect, it } from "vitest";
import {
  revisionTemplatePaths,
  revisionTemplateWritePaths,
} from "../scripts/revision-template-paths.mjs";

it("authorizes exact self-hosted font assets required by the migrated layout", async () => {
  const { fontFaceCss } =
    await import("../templates/client-site/src/lib/font-catalog.mjs");
  const allowed = revisionTemplateWritePaths({});
  for (const match of fontFaceCss().matchAll(/url\("([^"]+)"\)/gu))
    expect(allowed).toContain("public" + match[1]);
  expect(allowed).toContain("public/fonts/LICENSES.md");
  expect(allowed).not.toContain("public/fonts/**");
});

it("includes every shared template write destination without granting directory scopes", () => {
  const paths = revisionTemplatePaths({});

  expect(paths).toEqual(
    expect.arrayContaining([
      "src/components/LeadForm.astro",
      "src/components/ReviewBanner.astro",
      "src/pages/robots.txt.ts",
      "src/pages/sitemap.xml.ts",
    ]),
  );
  expect(paths.some((entry) => /[*?]/u.test(entry))).toBe(false);
  expect(paths.some((entry) => entry.endsWith("/**"))).toBe(false);
});

it("syncs the quick-answer layout runtime with conversion-feature revisions", () => {
  const conversionPaths = revisionTemplatePaths({
    revisionReport: { operations: [{ kind: "set_conversion_feature" }] },
  });
  const directionsPaths = revisionTemplatePaths({
    business: { primaryCta: "Get directions" },
  });

  for (const paths of [conversionPaths, directionsPaths])
    expect(paths).toEqual(
      expect.arrayContaining([
        "src/components/QuickAnswers.astro",
        "src/lib/quick-answers-layout.mjs",
        "src/lib/quick-answers-layout.d.mts",
        "src/styles/site.css",
      ]),
    );
});

it("allows the legacy homepage only when social proof insertion can write it", () => {
  const withoutProof = revisionTemplateWritePaths({
    revisionReport: { operations: [] },
  });
  const withProof = revisionTemplateWritePaths({
    revisionReport: { operations: [{ kind: "set_social_proof" }] },
  });

  expect(withoutProof).toContain("src/layouts/SiteLayout.astro");
  expect(withoutProof).toContain(".launchloom/revision-template-baseline.json");
  expect(withoutProof).not.toContain("src/pages/index.astro");
  expect(withProof).toContain("src/pages/index.astro");
});

it("allows exactly the feedback replacements named by set_image operations", () => {
  const paths = revisionTemplateWritePaths({
    revisionReport: {
      operations: [
        {
          kind: "set_image",
          target: "hero",
          path: "/images/feedback/hero-0123456789ab.webp",
        },
        {
          kind: "set_image",
          target: "logo",
          path: "/images/generated/logo-old.webp",
        },
        {
          kind: "set_image",
          target: "team",
          path: "/images/feedback/team-../../escape.webp",
        },
      ],
    },
  });

  expect(paths).toContain("public/images/feedback/hero-0123456789ab.webp");
  expect(paths).not.toContain("public/images/generated/logo-old.webp");
  expect(paths.some((entry) => entry.includes("escape"))).toBe(false);
});

it("refreshes paired surface owners and math together for a palette revision", () => {
  const paths = revisionTemplatePaths({
    revisionReport: { operations: [{ kind: "set_color_palette" }] },
  });
  expect(paths).toEqual(
    expect.arrayContaining([
      "src/lib/color-contrast.mjs",
      "src/lib/color-policy.mjs",
      "src/components/Header.astro",
      "src/components/Footer.astro",
      "src/components/PageSections.astro",
      "src/pages/contact/[...page].astro",
      "src/pages/services/[slug].astro",
      "src/pages/locations/[slug].astro",
    ]),
  );
});
