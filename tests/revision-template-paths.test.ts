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
