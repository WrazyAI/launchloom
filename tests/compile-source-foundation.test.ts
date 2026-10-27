import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileSourceFoundation } from "../scripts/compile-source-foundation.mjs";
import { buildFoundationIndex } from "../scripts/compile-source-foundations.mjs";
import {
  createFoundationFixture,
  sampleFoundationHtml,
} from "./helpers/foundation-fixture";

const temporaryRoots: string[] = [];

function fixture(options = {}) {
  const created = createFoundationFixture(options);
  temporaryRoots.push(created.repositoryRoot);
  return created;
}

afterEach(() => {
  while (temporaryRoots.length) {
    const root = temporaryRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("source foundation compiler", () => {
  it("writes a renderable foundation with sealed slots and a scoped stylesheet", () => {
    const created = fixture();
    const outputDirectory = path.join(created.directory, "foundation");
    const templatePath = path.join(
      created.directory,
      "template",
      "source",
      "index.html",
    );
    const before = fs.readFileSync(templatePath);
    const result = compileSourceFoundation({
      repositoryRoot: created.repositoryRoot,
      dossierId: created.dossierId,
      outputDirectory,
      write: true,
    });
    expect(result.manifest.compatibility).toBe("renderable");
    expect(
      result.manifest.sections.map((section: any) => section.role),
    ).toEqual(
      expect.arrayContaining([
        "navigation",
        "hero",
        "portfolio",
        "faq",
        "contact",
        "footer",
      ]),
    );
    expect(result.manifest.slots.map((slot: any) => slot.id)).toEqual(
      expect.arrayContaining([
        "page.title",
        "navigation.brand",
        "hero.heading",
        "hero.body",
        "hero.primaryLabel",
        "hero.image",
        "services.heading",
        "services.items",
        "services.item.name",
        "services.item.description",
        "faq.heading",
        "faq.items",
        "faq.item.question",
        "faq.item.answer",
        "contact.heading",
        "contact.form",
        "footer.brand",
        "footer.credit",
      ]),
    );
    const html = fs.readFileSync(
      path.join(outputDirectory, "source", "index.html"),
      "utf8",
    );
    const css = fs.readFileSync(
      path.join(outputDirectory, "source", "styles.css"),
      "utf8",
    );
    expect(html).toContain("{{hero.heading}}");
    expect(html).toContain("{{services.item.name}}");
    expect(html).toContain("{{page.title}}");
    expect(html).toContain('id="contact"');
    expect(html).not.toContain("Project A");
    expect(html).not.toContain("Project B");
    expect(html).not.toContain("Sample Brand");
    expect(html).not.toContain("onclick=");
    expect(html).not.toContain("https://");
    expect(css).toContain(".xp-foundation");
    expect(
      fs.existsSync(path.join(outputDirectory, "source", "foundation.js")),
    ).toBe(true);
    expect(
      fs.readFileSync(
        path.join(outputDirectory, "source", "foundation.js"),
        "utf8",
      ),
    ).toContain("data-foundation-action");
    expect(
      fs.existsSync(path.join(outputDirectory, "source", "hero.webp")),
    ).toBe(false);
    expect(result.manifest.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "hero.webp",
          target: "template/source/hero.webp",
        }),
      ]),
    );
    expect(
      fs.readFileSync(path.join(outputDirectory, "README.md"), "utf8"),
    ).toContain("Template adapted from Sample reference");
    expect(fs.readFileSync(templatePath)).toEqual(before);
  });

  it("treats a remote asset removal as a safe normalization", () => {
    const created = fixture({
      html: sampleFoundationHtml().replace(
        '<img src="hero.webp" alt="Garden">',
        '<img src="https://cdn.example.test/remote.jpg" alt="Remote">',
      ),
    });
    const result = compileSourceFoundation({
      repositoryRoot: created.repositoryRoot,
      dossierId: created.dossierId,
      outputDirectory: path.join(created.directory, "foundation"),
      write: true,
    });
    expect(result.manifest.compatibility).toBe("renderable");
    expect(result.manifest.blockers).toEqual([]);
    expect(
      fs.readFileSync(
        path.join(created.directory, "foundation", "README.md"),
        "utf8",
      ),
    ).toContain("remote-image");
  });

  it("builds a complete index and fails check when the index is stale", () => {
    const created = fixture();
    const pendingPath = path.join(
      created.repositoryRoot,
      "data/reference-library/dossiers/pending-reference",
    );
    fs.mkdirSync(path.join(pendingPath, "template"), { recursive: true });
    fs.writeFileSync(
      path.join(pendingPath, "manifest.json"),
      JSON.stringify({
        id: "pending-reference",
        source: {
          name: "Pending reference",
          rights: "licensed",
          rightsEvidencePath: "rights/permission.md",
        },
      }),
    );
    const index = buildFoundationIndex({
      repositoryRoot: created.repositoryRoot,
      write: true,
    });
    expect(index.summary).toEqual({
      total: 2,
      renderable: 1,
      needsAdaptation: 0,
      blocked: 1,
    });
    expect(index.entries.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["sample-reference", "pending-reference"]),
    );
    const pending = index.entries.find(
      (entry) => entry.id === "pending-reference",
    );
    expect(pending?.compatibility).toBe("blocked");
    expect(pending?.blockers[0].code).toBe("template-pending");

    const indexPath = path.join(
      created.repositoryRoot,
      "data/reference-library/foundation-index.json",
    );
    const stored = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    stored.summary.renderable = 99;
    fs.writeFileSync(indexPath, `${JSON.stringify(stored, null, 2)}\n`);
    expect(() =>
      buildFoundationIndex({
        repositoryRoot: created.repositoryRoot,
        check: true,
      }),
    ).toThrow(/stale/iu);
  });
});
