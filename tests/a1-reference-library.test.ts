import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  mergeInspirationRegistries,
  normalizeA1ReferenceLibrary,
} from "../scripts/a1-reference-library.mjs";

const root = path.resolve(".");
const library = JSON.parse(
  fs.readFileSync("data/a1-reference-library.json", "utf8"),
);

describe("A1 reference library", () => {
  it("keeps local evidence and source provenance bounded", () => {
    const normalized = normalizeA1ReferenceLibrary(library, {
      repositoryRoot: root,
    });
    expect(normalized.source).toBe("A1 Gallery");
    expect(normalized.records).toHaveLength(5);
    for (const record of normalized.records) {
      expect(record.rights).toBe("reference-only");
      expect(record.screenshotPath).not.toMatch(/^https?:/iu);
      expect(fs.existsSync(path.resolve(record.screenshotPath))).toBe(true);
    }
  });

  it("rejects missing local screenshots instead of silently using prose-only evidence", () => {
    expect(() =>
      normalizeA1ReferenceLibrary(
        {
          ...library,
          records: [{ ...library.records[0], screenshotPath: "missing.avif" }],
        },
        { repositoryRoot: root },
      ),
    ).toThrow(/missing its local screenshot/iu);
  });

  it("preserves newer supplemental updatedAt timestamps", () => {
    const merged = mergeInspirationRegistries(
      { version: 1, updatedAt: "2026-09-20", records: [] },
      { version: 2, updatedAt: "2026-09-25", records: [] },
    );
    expect(merged.updatedAt).toBe("2026-09-25");
  });

  it("adds new A1 records without replacing canonical registry records", () => {
    const merged = mergeInspirationRegistries(
      { version: 1, updatedAt: "2026-09-20", records: [{ id: "canonical" }] },
      { version: 1, capturedAt: "2026-09-21", records: [{ id: "a1-new" }] },
    );
    expect(merged.records).toEqual([{ id: "canonical" }, { id: "a1-new" }]);
    expect(merged.updatedAt).toBe("2026-09-21");
  });
});
