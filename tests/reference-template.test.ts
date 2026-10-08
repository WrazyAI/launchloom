import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildReferenceTemplateIndex,
  listReferenceTemplateEntries,
  loadReferenceTemplate,
  referenceTemplateDigest,
  readReferenceTemplateIndex,
  validateReferenceTemplateRecord,
} from "../scripts/reference-template.mjs";

const temporaryRoots: string[] = [];

function sha256(value: string | Buffer) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createDossier(
  rights = "permission-cleared",
  manifestOverrides: Record<string, unknown> = {},
) {
  const repositoryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "launchloom-template-"),
  );
  temporaryRoots.push(repositoryRoot);
  const directory = path.join(repositoryRoot, "dossiers", "sample-reference");
  fs.mkdirSync(path.join(directory, "template", "source"), { recursive: true });
  fs.mkdirSync(path.join(directory, "rights"), { recursive: true });
  fs.writeFileSync(
    path.join(directory, "manifest.json"),
    JSON.stringify({
      id: "sample-reference",
      source: {
        name: "Sample reference",
        url: "https://example.test/",
        rights,
        ...(rights === "owned"
          ? {}
          : { rightsEvidencePath: "rights/permission.md" }),
      },
      ...manifestOverrides,
    }),
  );
  fs.writeFileSync(
    path.join(directory, "rights", "permission.md"),
    "# Permission\n\nRecorded clearance for template retention.\n",
  );
  fs.writeFileSync(
    path.join(directory, "rights", "template-extraction.md"),
    "# Template extraction rights record\n",
  );
  fs.writeFileSync(
    path.join(directory, "template", "source", "index.html"),
    "<!doctype html><html><body><h1>Sample</h1></body></html>\n",
  );
  return { repositoryRoot, directory };
}

function writeExtractionRecord(
  directory: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    schemaVersion: 1,
    dossierId: "sample-reference",
    status: "extracted",
    method: "live-site",
    source: {
      url: "https://example.test/",
      retrievedAt: "2026-10-08T00:00:00.000Z",
      attestationPath: "rights/template-extraction.md",
    },
    entrypoint: "source/index.html",
    files: [
      {
        path: "source/index.html",
        bytes: fs.statSync(
          path.join(directory, "template", "source", "index.html"),
        ).size,
        sha256: sha256(
          fs.readFileSync(
            path.join(directory, "template", "source", "index.html"),
          ),
        ),
      },
    ],
    excludedMedia: [],
    ...overrides,
  };
  const record = { ...base, digest: referenceTemplateDigest(base) };
  fs.writeFileSync(
    path.join(directory, "template", "extraction.json"),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  return record;
}

afterEach(() => {
  while (temporaryRoots.length) {
    const root = temporaryRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("reference templates", () => {
  it("validates and loads a complete extracted template", () => {
    const { repositoryRoot, directory } = createDossier();
    writeExtractionRecord(directory);
    const loaded = loadReferenceTemplate("dossiers/sample-reference", {
      repositoryRoot,
    });
    expect(loaded).not.toBeNull();
    if (!loaded) throw new Error("expected a loaded reference template");
    expect(loaded.status).toBe("extracted");
    expect(loaded.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(loaded.files).toHaveLength(1);
    expect(loaded.entrypoint).toBe("source/index.html");
  });

  it("rejects a retained file whose bytes no longer match the record", () => {
    const { directory } = createDossier();
    writeExtractionRecord(directory);
    fs.writeFileSync(
      path.join(directory, "template", "source", "index.html"),
      "<!doctype html><html><body><h1>Change</h1></body></html>\n",
    );
    expect(() =>
      validateReferenceTemplateRecord(
        JSON.parse(
          fs.readFileSync(
            path.join(directory, "template", "extraction.json"),
            "utf8",
          ),
        ),
        {
          dossierDirectory: directory,
          dossierId: "sample-reference",
          dossierRights: "permission-cleared",
        },
      ),
    ).toThrow(/SHA-256/u);
  });

  it("rejects an entrypoint that is not part of the retained files", () => {
    const { directory } = createDossier();
    writeExtractionRecord(directory, { entrypoint: "source/missing.html" });
    expect(() =>
      validateReferenceTemplateRecord(
        JSON.parse(
          fs.readFileSync(
            path.join(directory, "template", "extraction.json"),
            "utf8",
          ),
        ),
        {
          dossierDirectory: directory,
          dossierId: "sample-reference",
          dossierRights: "permission-cleared",
        },
      ),
    ).toThrow(/entrypoint/u);
  });

  it("keeps live-site extraction limited to HTML and CSS assets", () => {
    const { directory } = createDossier();
    fs.writeFileSync(
      path.join(directory, "template", "source", "app.js"),
      "console.log('not retained');\n",
    );
    writeExtractionRecord(directory, {
      files: [
        {
          path: "source/app.js",
          bytes: fs.statSync(
            path.join(directory, "template", "source", "app.js"),
          ).size,
          sha256: sha256(
            fs.readFileSync(
              path.join(directory, "template", "source", "app.js"),
            ),
          ),
        },
      ],
      entrypoint: "source/app.js",
    });
    expect(() =>
      validateReferenceTemplateRecord(
        JSON.parse(
          fs.readFileSync(
            path.join(directory, "template", "extraction.json"),
            "utf8",
          ),
        ),
        {
          dossierDirectory: directory,
          dossierId: "sample-reference",
          dossierRights: "permission-cleared",
        },
      ),
    ).toThrow(/not an allowed/u);
  });

  it("requires a reason for any non-extracted status", () => {
    const { directory } = createDossier();
    const record = {
      schemaVersion: 1,
      dossierId: "sample-reference",
      status: "failed",
      method: "live-site",
      source: {
        url: "https://example.test/",
        retrievedAt: "2026-10-08T00:00:00.000Z",
        attestationPath: "rights/template-extraction.md",
      },
    };
    expect(() =>
      validateReferenceTemplateRecord(record, {
        dossierDirectory: directory,
        dossierId: "sample-reference",
        dossierRights: "permission-cleared",
      }),
    ).toThrow(/reason/u);
  });

  it("requires local rights attestation for cleared references", () => {
    const { directory } = createDossier();
    writeExtractionRecord(directory, {
      source: {
        url: "https://example.test/",
        retrievedAt: "2026-10-08T00:00:00.000Z",
      },
    });
    expect(() =>
      validateReferenceTemplateRecord(
        JSON.parse(
          fs.readFileSync(
            path.join(directory, "template", "extraction.json"),
            "utf8",
          ),
        ),
        {
          dossierDirectory: directory,
          dossierId: "sample-reference",
          dossierRights: "permission-cleared",
        },
      ),
    ).toThrow(/attestation/u);
  });

  it("rejects file paths that escape the template folder", () => {
    const { directory } = createDossier();
    writeExtractionRecord(directory, {
      files: [
        {
          path: "source/../../outside.html",
          bytes: 1,
          sha256: sha256("x"),
        },
      ],
    });
    expect(() =>
      validateReferenceTemplateRecord(
        JSON.parse(
          fs.readFileSync(
            path.join(directory, "template", "extraction.json"),
            "utf8",
          ),
        ),
        {
          dossierDirectory: directory,
          dossierId: "sample-reference",
          dossierRights: "permission-cleared",
        },
      ),
    ).toThrow(/inside|under/u);
  });

  it("detects a digest that does not cover the retained record", () => {
    const { directory } = createDossier();
    const record = writeExtractionRecord(directory);
    const source = record.source as { url: string };
    source.url = "https://changed.example.test/";
    fs.writeFileSync(
      path.join(directory, "template", "extraction.json"),
      `${JSON.stringify(record, null, 2)}\n`,
    );
    expect(() =>
      validateReferenceTemplateRecord(record, {
        dossierDirectory: directory,
        dossierId: "sample-reference",
        dossierRights: "permission-cleared",
      }),
    ).toThrow(/digest/u);
  });

  it("keeps digests stable regardless of file ordering", () => {
    const { directory } = createDossier();
    fs.writeFileSync(
      path.join(directory, "template", "source", "extra.css"),
      "body { color: #111; }\n",
    );
    const files = [
      {
        path: "source/index.html",
        bytes: fs.statSync(
          path.join(directory, "template", "source", "index.html"),
        ).size,
        sha256: sha256(
          fs.readFileSync(
            path.join(directory, "template", "source", "index.html"),
          ),
        ),
      },
      {
        path: "source/extra.css",
        bytes: fs.statSync(
          path.join(directory, "template", "source", "extra.css"),
        ).size,
        sha256: sha256(
          fs.readFileSync(
            path.join(directory, "template", "source", "extra.css"),
          ),
        ),
      },
    ];
    const forward = referenceTemplateDigest({
      dossierId: "sample-reference",
      status: "extracted",
      method: "live-site",
      source: { url: "https://example.test/" },
      entrypoint: "source/index.html",
      files,
    });
    const reversed = referenceTemplateDigest({
      dossierId: "sample-reference",
      status: "extracted",
      method: "live-site",
      source: { url: "https://example.test/" },
      entrypoint: "source/index.html",
      files: [...files].reverse(),
    });
    expect(forward).toBe(reversed);
  });

  it("keeps the committed library index consistent with retained templates", () => {
    const root = path.resolve(".");
    const entries = listReferenceTemplateEntries(root);
    const index = readReferenceTemplateIndex(root);
    expect(index).not.toBeNull();
    if (!index) throw new Error("expected a committed template index");
    expect(entries.length).toBeGreaterThan(0);
    expect(index.entries.length).toBe(entries.length);
    const expected = buildReferenceTemplateIndex(entries, {
      updatedAt: index.updatedAt,
    });
    expect(index.entries).toEqual(expected.entries);
    expect(index.summary).toEqual(expected.summary);
    for (const entry of entries) {
      if (entry.status === "extracted") {
        expect(entry.digest).toMatch(/^[a-f0-9]{64}$/u);
        expect(entry.fileCount).toBeGreaterThan(0);
      } else {
        expect(entry.reason).toBeTruthy();
      }
    }
  });
});
