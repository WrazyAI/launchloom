import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { referenceTemplateDigest } from "../scripts/reference-template.mjs";
import { normalizeFoundationSource } from "../scripts/foundation-source.mjs";

const temporaryRoots: string[] = [];

function sha256(value: string | Buffer) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createTemplate({
  html,
  css = ".hero{color:#16241a}",
  js = "document.querySelector('button')?.addEventListener('click', () => {});\n",
}: {
  html: string;
  css?: string;
  js?: string;
}) {
  const repositoryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "launchloom-foundation-"),
  );
  temporaryRoots.push(repositoryRoot);
  const dossierPath = "data/reference-library/dossiers/sample-reference";
  const directory = path.join(repositoryRoot, dossierPath);
  fs.mkdirSync(path.join(directory, "template", "source"), { recursive: true });
  fs.mkdirSync(path.join(directory, "rights"), { recursive: true });
  fs.writeFileSync(
    path.join(directory, "manifest.json"),
    JSON.stringify({
      id: "sample-reference",
      source: {
        name: "Sample reference",
        url: "https://example.test/",
        rights: "licensed",
        rightsEvidencePath: "rights/permission.md",
      },
    }),
  );
  fs.writeFileSync(
    path.join(directory, "rights", "permission.md"),
    "# Permission\n",
  );
  fs.writeFileSync(
    path.join(directory, "rights", "template-extraction.md"),
    "# Template extraction rights record\n",
  );
  const files = new Map<string, Buffer>([
    ["source/index.html", Buffer.from(html)],
    ["source/styles.css", Buffer.from(css)],
    ["source/app.js", Buffer.from(js)],
    ["source/hero.webp", Buffer.from("local-image-bytes")],
  ]);
  for (const [relative, bytes] of files) {
    const target = path.join(directory, "template", relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  const record: Record<string, unknown> = {
    schemaVersion: 1,
    dossierId: "sample-reference",
    status: "extracted",
    method: "zip-download",
    source: {
      url: "https://example.test/",
      retrievedAt: "2026-10-08T00:00:00.000Z",
      attestationPath: "rights/template-extraction.md",
      rightsEvidencePath: "rights/permission.md",
      licenseEvidencePath: "rights/permission.md",
    },
    entrypoint: "source/index.html",
    files: [...files.entries()].map(([relative, bytes]) => ({
      path: relative,
      bytes: bytes.length,
      sha256: sha256(bytes),
    })),
    excludedMedia: [],
  };
  record.digest = referenceTemplateDigest(record);
  fs.writeFileSync(
    path.join(directory, "template", "extraction.json"),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  return { repositoryRoot, dossierPath, directory, record };
}

afterEach(() => {
  while (temporaryRoots.length) {
    const root = temporaryRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("foundation source normalization", () => {
  it("copies local assets and removes remote or unsafe dependencies", () => {
    const fixture = createTemplate({
      html: `<!doctype html>
<html>
  <head>
    <link rel="stylesheet" href="styles.css">
    <link rel="stylesheet" href="https://cdn.example.test/remote.css">
    <script src="https://cdn.example.test/remote.js"></script>
    <script src="app.js"></script>
    <script>fetch("https://api.example.test/leads")</script>
  </head>
  <body>
    <img src="hero.webp" alt="Local">
    <img src="https://cdn.example.test/remote.jpg" alt="Remote">
    <form action="https://forms.example.test/submit"><input></form>
    <div style="background:url(https://cdn.example.test/bg.jpg)">x</div>
  </body>
</html>`,
      css: `@import url("https://fonts.example.test/font.css");
@font-face { font-family: "Remote"; src: url(https://fonts.example.test/font.woff2); }
.hero { background: url(hero.webp); }
.remote { background: url(https://cdn.example.test/bg.jpg); }`,
    });
    const outputDirectory = path.join(
      fixture.repositoryRoot,
      "data/reference-library/dossiers/sample-reference/foundation",
    );
    const result = normalizeFoundationSource({
      repositoryRoot: fixture.repositoryRoot,
      dossierPath: fixture.dossierPath,
      outputDirectory,
    });
    const html = fs.readFileSync(
      path.join(outputDirectory, "source", "index.html"),
      "utf8",
    );
    const css = fs.readFileSync(
      path.join(outputDirectory, "source", "styles.css"),
      "utf8",
    );
    expect(html).not.toContain("https://");
    expect(css).not.toContain("https://");
    expect(html).toContain("hero.webp");
    expect(css).toContain("url(hero.webp)");
    expect(fs.existsSync(path.join(outputDirectory, "source", "app.js"))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(outputDirectory, "source", "hero.webp")),
    ).toBe(true);
    expect(result.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining([
        "remote-stylesheet",
        "remote-script",
        "network-script",
        "remote-image",
        "remote-form-action",
        "remote-font",
        "remote-import",
        "remote-css-url",
      ]),
    );
    expect(result.sourceDigest).toBe(fixture.record.digest);
    expect(result.compatibility).toBe("needs-adaptation");
  });

  it("leaves a clean local template renderable", () => {
    const fixture = createTemplate({
      html: `<!doctype html>
<html>
  <head><link rel="stylesheet" href="styles.css"><script src="app.js"></script></head>
  <body><img src="hero.webp" alt="Local"><a href="#contact">Contact</a></body>
</html>`,
      css: ".hero { background: url(hero.webp); }",
    });
    const outputDirectory = path.join(
      fixture.repositoryRoot,
      "data/reference-library/dossiers/sample-reference/foundation",
    );
    const result = normalizeFoundationSource({
      repositoryRoot: fixture.repositoryRoot,
      dossierPath: fixture.dossierPath,
      outputDirectory,
    });
    expect(result.blockers).toEqual([]);
    expect(result.compatibility).toBe("renderable");
    expect(result.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "hero.webp", required: false }),
      ]),
    );
  });

  it("does not modify the retained template bytes", () => {
    const fixture = createTemplate({
      html: "<!doctype html><html><body><h1>Sample</h1></body></html>",
    });
    const templatePath = path.join(
      fixture.repositoryRoot,
      fixture.dossierPath,
      "template",
      "source",
      "index.html",
    );
    const before = fs.readFileSync(templatePath);
    normalizeFoundationSource({
      repositoryRoot: fixture.repositoryRoot,
      dossierPath: fixture.dossierPath,
      outputDirectory: path.join(
        fixture.repositoryRoot,
        fixture.dossierPath,
        "foundation",
      ),
    });
    expect(fs.readFileSync(templatePath)).toEqual(before);
  });
});
