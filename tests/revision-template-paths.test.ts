import { expect, it } from "vitest";
import {
  revisionTemplatePaths,
  revisionTemplateWritePaths,
} from "../scripts/revision-template-paths.mjs";

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
  expect(paths.some((entry) => /[*?\[\]]/u.test(entry))).toBe(false);
  expect(paths.some((entry) => entry.endsWith("/**"))).toBe(false);
});

it("allows the legacy homepage only when social proof insertion can write it", () => {
  const withoutProof = revisionTemplateWritePaths({
    revisionReport: { operations: [] },
  });
  const withProof = revisionTemplateWritePaths({
    revisionReport: { operations: [{ kind: "set_social_proof" }] },
  });

  expect(withoutProof).toContain("src/layouts/SiteLayout.astro");
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
