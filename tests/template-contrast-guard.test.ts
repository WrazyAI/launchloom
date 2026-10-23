import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("generated-site contrast and navigation guards", () => {
  it("provides a proving surface for service-support copy", () => {
    const css = fs.readFileSync(
      "templates/client-site/src/styles/site.css",
      "utf8",
    );
    expect(css).toContain("[data-service-support]");
    expect(css).toContain("isolation: isolate");
    expect(css).toContain("background: inherit");
  });

  it("keeps the service breadcrumb on the real services hub route", () => {
    const page = fs.readFileSync(
      "templates/client-site/src/pages/services/[slug].astro",
      "utf8",
    );
    expect(page).toContain('href="/services/"');
    expect(page).not.toContain('pageHref("/services/"');
  });

  it("tells the author to keep a visible route link and a proving surface", () => {
    const author = fs.readFileSync(
      "scripts/author-production-experiences.mjs",
      "utf8",
    );
    expect(author).toContain(
      "Keep at least one visible route link to the services hub (/services/)",
    );
    expect(author).toContain(
      "must have a proving solid surface or a strong scrim",
    );
  });
});
