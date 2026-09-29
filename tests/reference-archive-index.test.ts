import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const root = path.resolve(".");

it("keeps every archived reference disabled in both the archive index and dossier manifest", () => {
  const archive = JSON.parse(
    fs.readFileSync(
      path.join(root, "data/reference-library/archive-index.json"),
      "utf8",
    ),
  );

  for (const record of archive.entries) {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(root, record.dossierPath, "manifest.json"),
        "utf8",
      ),
    );
    expect(manifest.id, record.id).toBe(record.id);
    expect(record.productionEligible, record.id).toBe(false);
    expect(manifest.productionEligible, record.id).toBe(false);
  }
});
