import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  captureEvidence,
  replaceArchiveDossierFiles,
  indexArchiveEntries,
  replaceArchiveScreenshots,
} from "../scripts/materialize-a1-archive-dossiers.mjs";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("archive screenshot materialization", () => {
  it("rejects captures whose final page redirects to another origin", () => {
    expect(() =>
      captureEvidence(
        { id: "approved-source", sourceUrl: "https://approved.example/design/" },
        {
          sourceUrl: "https://approved.example/design/",
          captures: {
            desktop: {
              httpStatus: 200,
              fullPage: true,
              url: "https://approved.example/design/",
              finalUrl: "https://unapproved.example/copy/",
              viewport: { width: 1440, height: 900 },
              image: { width: 1440, height: 5000 },
            },
          },
        },
        "desktop",
      ),
    ).toThrow(/approved-source.*final URL origin/iu);
  });

  it("requires the captured request URL itself to match the declared source", () => {
    expect(() =>
      captureEvidence(
        { id: "approved-source", sourceUrl: "https://approved.example/design/" },
        {
          sourceUrl: "https://approved.example/design/",
          captures: {
            desktop: {
              httpStatus: 200,
              fullPage: true,
              url: "https://approved.example/other-page/",
              finalUrl: "https://approved.example/other-page/",
              viewport: { width: 1440, height: 900 },
              image: { width: 1440, height: 5000 },
            },
          },
        },
        "desktop",
      ),
    ).toThrow(/approved-source.*requested URL/iu);
  });

  it("accepts same-origin final URLs while retaining the existing source URL check", () => {
    expect(
      captureEvidence(
        { id: "approved-source", sourceUrl: "https://approved.example/design/" },
        {
          sourceUrl: "https://approved.example/design/",
          captures: {
            desktop: {
              httpStatus: 200,
              fullPage: true,
              url: "https://approved.example/design/",
              finalUrl: "https://approved.example/design/finished/",
              viewport: { width: 1440, height: 900 },
              image: { width: 1440, height: 5000 },
            },
          },
        },
        "desktop",
      ),
    ).toMatchObject({ path: "screenshots/desktop.png", capture: "full-page" });
  });

  it("reports missing image dimensions as an invalid capture instead of throwing", () => {
    expect(() =>
      captureEvidence(
        { id: "approved-source", sourceUrl: "https://approved.example/design/" },
        {
          sourceUrl: "https://approved.example/design/",
          captures: {
            desktop: {
              httpStatus: 200,
              fullPage: true,
              url: "https://approved.example/design/",
              finalUrl: "https://approved.example/design/",
              viewport: { width: 1440, height: 900 },
            },
          },
        },
        "desktop",
      ),
    ).toThrow(/invalid desktop screenshot dimensions/iu);
  });

  it("rejects duplicate archive ids even when their names differ", () => {
    expect(() =>
      indexArchiveEntries([
        { id: "same-reference", name: "First name" },
        { id: "same-reference", name: "Second name" },
      ]),
    ).toThrow(/duplicate archive dossier id.*same-reference/iu);
  });

  it("creates a new screenshot hierarchy and backs up only captures already present", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "archive-screenshots-"));
    roots.push(root);
    const dossierDirectory = path.join(root, "dossiers", "new-reference");
    const captureDirectory = path.join(root, "capture");
    const backupDirectory = path.join(root, "backup", "new-reference");
    await fs.mkdir(captureDirectory, { recursive: true });
    await fs.writeFile(path.join(captureDirectory, "desktop.png"), "desktop-v1");
    await fs.writeFile(path.join(captureDirectory, "mobile.png"), "mobile-v1");

    await replaceArchiveScreenshots({
      dossierDirectory,
      captureDirectory,
      backupDirectory,
    });

    const screenshotsDirectory = path.join(dossierDirectory, "screenshots");
    expect(await fs.readFile(path.join(screenshotsDirectory, "desktop.png"), "utf8")).toBe("desktop-v1");
    expect(await fs.readFile(path.join(screenshotsDirectory, "mobile.png"), "utf8")).toBe("mobile-v1");
    await expect(fs.access(path.join(backupDirectory, "desktop.png"))).rejects.toMatchObject({ code: "ENOENT" });

    await fs.writeFile(path.join(screenshotsDirectory, "desktop.png"), "old-desktop");
    await fs.writeFile(path.join(screenshotsDirectory, "mobile.png"), "old-mobile");
    await fs.writeFile(path.join(captureDirectory, "desktop.png"), "desktop-v2");
    await fs.writeFile(path.join(captureDirectory, "mobile.png"), "mobile-v2");

    await replaceArchiveScreenshots({
      dossierDirectory,
      captureDirectory,
      backupDirectory,
    });

    expect(await fs.readFile(path.join(backupDirectory, "desktop.png"), "utf8")).toBe("old-desktop");
    expect(await fs.readFile(path.join(backupDirectory, "mobile.png"), "utf8")).toBe("old-mobile");
    expect(await fs.readFile(path.join(screenshotsDirectory, "desktop.png"), "utf8")).toBe("desktop-v2");
    expect(await fs.readFile(path.join(screenshotsDirectory, "mobile.png"), "utf8")).toBe("mobile-v2");
  });

  it("restores the previous dossier if a staged directory swap fails", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "archive-dossier-transaction-"));
    roots.push(root);
    const dossierDirectory = path.join(root, "dossiers", "existing-reference");
    const backupDirectory = path.join(root, "backups", "existing-reference");
    await fs.mkdir(path.join(dossierDirectory, "screenshots"), { recursive: true });
    await fs.writeFile(path.join(dossierDirectory, "screenshots/desktop.png"), "old-image");
    await fs.writeFile(path.join(dossierDirectory, "manifest.json"), "old-manifest");
    let renameCalls = 0;

    await expect(
      replaceArchiveDossierFiles({
        dossierDirectory,
        backupDirectory,
        files: [
          { path: "screenshots/desktop.png", content: "new-image" },
          { path: "manifest.json", content: "new-manifest" },
        ],
        renameImpl: async (
          source: Parameters<typeof fs.rename>[0],
          destination: Parameters<typeof fs.rename>[1],
        ) => {
          renameCalls += 1;
          if (renameCalls === 2) throw new Error("injected staged-swap failure");
          await fs.rename(source, destination);
        },
      }),
    ).rejects.toThrow(/injected staged-swap failure/iu);

    expect(await fs.readFile(path.join(dossierDirectory, "screenshots/desktop.png"), "utf8")).toBe("old-image");
    expect(await fs.readFile(path.join(dossierDirectory, "manifest.json"), "utf8")).toBe("old-manifest");
    expect(await fs.readFile(path.join(backupDirectory, "manifest.json"), "utf8")).toBe("old-manifest");
  });
});
