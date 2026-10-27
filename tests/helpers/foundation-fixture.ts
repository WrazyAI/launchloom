import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { referenceTemplateDigest } from "../../scripts/reference-template.mjs";

function sha256(value: Buffer) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function createFoundationFixture({
  id = "sample-reference",
  html = sampleFoundationHtml(),
  css = ".hero { color: #16241a; }",
  js = "document.querySelector('button')?.addEventListener('click', () => {});\n",
  status = "extracted",
} = {}) {
  const repositoryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "launchloom-foundation-fixture-"),
  );
  const dossierPath = `data/reference-library/dossiers/${id}`;
  const directory = path.join(repositoryRoot, dossierPath);
  fs.mkdirSync(path.join(directory, "template", "source"), { recursive: true });
  fs.mkdirSync(path.join(directory, "rights"), { recursive: true });
  fs.writeFileSync(
    path.join(directory, "manifest.json"),
    JSON.stringify({
      id,
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
    "# Permission\n\nCC BY 4.0 evidence.\n",
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
  if (status === "extracted") {
    const record: Record<string, unknown> = {
      schemaVersion: 1,
      dossierId: id,
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
  }
  return { repositoryRoot, dossierId: id, dossierPath, directory };
}

export function sampleFoundationHtml() {
  return `<!doctype html>
<html>
  <head>
    <title>Sample Brand</title>
    <meta name="description" content="Source demo description.">
    <link rel="stylesheet" href="styles.css">
    <script src="app.js"></script>
  </head>
  <body>
    <nav><a href="/">Sample Brand</a><a href="#work">Work</a><a href="#faq">FAQ</a></nav>
    <header>
      <h1>Yards that look designed</h1>
      <p>One crew, one point of contact.</p>
      <a href="#estimate">Request an estimate</a>
      <button onclick="document.querySelector('#panel').hidden = false">Show</button>
      <img src="hero.webp" alt="Garden">
    </header>
    <section id="work">
      <h2>Our own work</h2>
      <p>Drawn from measured plans.</p>
      <article><h3>Project A</h3><p>Scope A</p></article>
      <article><h3>Project B</h3><p>Scope B</p></article>
    </section>
    <section id="faq">
      <h2>Questions before the first visit</h2>
      <details><summary>Do you design?</summary><p>Yes, design and build.</p></details>
      <details><summary>How far do you travel?</summary><p>Local routes only.</p></details>
    </section>
    <footer>© Sample Brand. Demo content.</footer>
  </body>
</html>`;
}
