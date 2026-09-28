import { describe, expect, it } from "vitest";
import {
  assertRevisionChangedPathsAllowed,
  buildRevisionAllowedPaths,
} from "../scripts/revision-change-scope.mjs";

describe("revision change scope", () => {
  it("allows only the config, synchronized template files, and revision instructions by default", () => {
    const allowed = buildRevisionAllowedPaths({
      templateFiles: [
        "components/Header.astro",
        "pages/index.astro",
        "layouts/SiteLayout.astro",
      ],
    });

    expect(allowed).toEqual([
      "AGENTS.md",
      "docs/site-generation-guidelines.md",
      "src/components/Header.astro",
      "src/layouts/SiteLayout.astro",
      "src/pages/index.astro",
      "src/site.config.json",
    ]);
    expect(allowed).not.toContain(
      "src/generated-experiences/selected/Experience.jsx",
    );
  });

  it("adds the selected candidate bundle only when repair identity matches", () => {
    const allowed = buildRevisionAllowedPaths({
      templateFiles: [],
      creativeSourceRepairRequired: true,
      creativeSourceRepairVerified: { pass: true, candidateId: "candidate-a" },
      selectedCandidateId: "candidate-a",
    });

    expect(allowed).toContain(
      "src/generated-experiences/selected/Experience.jsx",
    );
    expect(allowed).toContain("src/generated-experiences/selected/styles.css");
    expect(allowed).toContain("src/generated-experiences/selected/motion.js");
    expect(allowed).toContain(
      "src/generated-experiences/selected/manifest.json",
    );
  });

  it("does not unlock creative files for a bare or mismatched verification receipt", () => {
    const bareReceipt = buildRevisionAllowedPaths({
      templateFiles: [],
      creativeSourceRepairRequired: true,
      creativeSourceRepairVerified: { pass: true },
    });
    const mismatchedReceipt = buildRevisionAllowedPaths({
      templateFiles: [],
      creativeSourceRepairRequired: true,
      creativeSourceRepairVerified: { pass: true, candidateId: "candidate-a" },
      selectedCandidateId: "candidate-b",
    });

    expect(bareReceipt).not.toContain(
      "src/generated-experiences/selected/Experience.jsx",
    );
    expect(mismatchedReceipt).not.toContain(
      "src/generated-experiences/selected/Experience.jsx",
    );
  });

  it("does not unlock creative files when the current revision does not require a creative repair", () => {
    const allowed = buildRevisionAllowedPaths({
      templateFiles: [],
      creativeSourceRepairRequired: false,
      creativeSourceRepairVerified: { pass: true, candidateId: "candidate-a" },
      selectedCandidateId: "candidate-a",
    });

    expect(allowed).not.toContain(
      "src/generated-experiences/selected/Experience.jsx",
    );
  });

  it("accepts a changed-file set contained by exact allowlist entries", () => {
    expect(
      assertRevisionChangedPathsAllowed(
        ["src/site.config.json", "src/components/Header.astro"],
        ["src/site.config.json", "src/components/Header.astro"],
      ),
    ).toEqual(["src/components/Header.astro", "src/site.config.json"]);
  });

  it("rejects changed files outside the declared revision scope", () => {
    expect(() =>
      assertRevisionChangedPathsAllowed(
        ["src/site.config.json", "src/pages/contact.astro"],
        ["src/site.config.json"],
      ),
    ).toThrow(/out-of-scope revision paths: src\/pages\/contact\.astro/iu);
  });

  it("rejects traversal and absolute paths in allowlists or diffs", () => {
    expect(() =>
      buildRevisionAllowedPaths({
        templateFiles: ["../../.github/workflows/x.yml"],
      }),
    ).toThrow(/unsafe revision path/iu);
    expect(() =>
      assertRevisionChangedPathsAllowed(["/tmp/outside"], ["/tmp/outside"]),
    ).toThrow(/unsafe revision path/iu);
  });

  it("rejects whitespace-normalized filenames instead of matching the allowlist", () => {
    expect(() =>
      assertRevisionChangedPathsAllowed(["AGENTS.md "], ["AGENTS.md"]),
    ).toThrow(/unsafe revision path/iu);
  });
});
