import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { loadReferenceDossier } from "../scripts/reference-dossier.mjs";

const root = path.resolve(".");

it("keeps every archived reference disabled in both the archive index and dossier manifest", () => {
  const archive = JSON.parse(
    fs.readFileSync(
      path.join(root, "data/reference-library/archive-index.json"),
      "utf8",
    ),
  );
  expect(archive.entries).toHaveLength(35);

  for (const record of archive.entries) {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(root, record.dossierPath, "manifest.json"),
        "utf8",
      ),
    );
    expect(manifest.id, record.id).toBe(record.id);
    expect(record.referenceName, record.id).toBe(manifest.referenceName);
    expect(record.sourceUrl, record.id).toBe(manifest.source.url);
    expect(record.rights, record.id).toBe(manifest.source.rights);
    expect(record.productionEligible, record.id).toBe(false);
    expect(manifest.productionEligible, record.id).toBe(false);
  }
});

it.each(["web-dental-dentologie", "web-dental-vivid-specialized"])(
  "keeps %s as a complete canonical archive dossier, not a production reference",
  (id) => {
    const archive = JSON.parse(
      fs.readFileSync(
        path.join(root, "data/reference-library/archive-index.json"),
        "utf8",
      ),
    );
    const record = archive.entries.find((entry: { id: string }) => entry.id === id);
    expect(record).toBeDefined();
    expect(record.productionEligible).toBe(false);

    const dossier = loadReferenceDossier(record.dossierPath);
    expect(dossier.id).toBe(id);
    expect(dossier.productionEligible).toBe(false);
    expect(dossier.source.rights).toBe("permission-cleared");
    expect(dossier.evidence.desktop.fullPage).toBe(true);
    expect(dossier.evidence.mobile.fullPage).toBe(true);
    expect(dossier.designPrompt.length).toBeGreaterThan(900);
  },
);
