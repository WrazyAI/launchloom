import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadReferenceDossier,
  referenceDossierPromptBlock,
} from "../scripts/reference-dossier.mjs";
import {
  assertModelPromptTextBudget,
  formatModelBoundContentShape,
} from "../scripts/author-prompt-budget.mjs";
import {
  omitDuplicateRouteDesignTemplates,
  creativeServicePageShape,
  creativeLocationPageShape,
} from "../scripts/production-experience-author.mjs";
import { typographyPalettePrompt } from "../scripts/creative-typography.mjs";
import {
  CLIENT_PALETTE_ROLE_CONTRACT,
  CLIENT_TYPOGRAPHY_CONTRACT,
  EARLY_CONVERSION_OUTPUT_CONTRACT,
  REFERENCE_PROVENANCE_OUTPUT_CONTRACT,
  referenceImplementationChecklist,
} from "../scripts/creative-authoring-output.mjs";
import { cacheableReferenceDna } from "../scripts/openrouter-client.mjs";
import { designAdherencePromptBlock } from "../scripts/design-adherence-guidance.mjs";
import { requestRepair } from "../scripts/creative-repair-loop.mjs";
import {
  promptImagePart,
  selectAuthorReferenceScreenshots,
} from "../scripts/prompt-evidence.mjs";

const adapter = vi.hoisted(() => vi.fn());
vi.mock("../scripts/openrouter-client.mjs", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../scripts/openrouter-client.mjs")
  >()),
  // Replaces the entire provider boundary: no credentials, HTTP or real model.
  openRouterChatCompletion: adapter,
}));

// Evaluate only the production CLI's pure function declarations, unchanged.
// Importing its entrypoint would invoke credential checks and CLI side effects.
// This verifies the actual serializer, rather than a test's reimplementation.
function authorPromptBuilders() {
  const file = "scripts/author-production-experiences.mjs";
  const source = fs.readFileSync(file, "utf8");
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const names = [
    "markerSlug",
    "authorSystemPrompt",
    "routePromptPrefix",
    "boundedFormatRepair",
    "routeUsesUtilityPanel",
    "leadFormPlacementInstruction",
    "stagePromptSuffix",
  ];
  const declarations = parsed.statements.filter(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.name &&
      names.includes(node.name.text),
  );
  expect(declarations).toHaveLength(names.length);
  return vm.runInNewContext(
    `${declarations.map((node) => node.getText(parsed)).join("\n")}\n({ authorSystemPrompt, routePromptPrefix, stagePromptSuffix })`,
    {
      referenceDossierPromptBlock,
      referenceImplementationChecklist,
      omitDuplicateRouteDesignTemplates,
      cacheableReferenceDna,
      designAdherencePromptBlock,
      formatModelBoundContentShape,
      typographyPalettePrompt,
      creativeServicePageShape,
      creativeLocationPageShape,
      CLIENT_PALETTE_ROLE_CONTRACT,
      CLIENT_TYPOGRAPHY_CONTRACT,
      EARLY_CONVERSION_OUTPUT_CONTRACT,
      REFERENCE_PROVENANCE_OUTPUT_CONTRACT,
    },
    { timeout: 1000 },
  );
}

const library = "data/reference-library/dossiers";
const productionIds = fs
  .readdirSync(library)
  .filter(
    (id) =>
      JSON.parse(
        fs.readFileSync(path.join(library, id, "manifest.json"), "utf8"),
      ).productionEligible,
  );
const stages = [
  "contract",
  "experience",
  "service",
  "location",
  "service-index",
  "styles",
  "motion",
];
const files = {
  experience: "export default function Experience(){return null;}",
  styles: ".hero{color:#222;}",
  motion: "export function mountExperienceMotion(){return ()=>{};}",
};

beforeEach(() => {
  adapter.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network is forbidden in provider-free verification");
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("provider-free reference prompt integration", () => {
  it("covers exactly the existing 96 production dossiers", () => {
    expect(productionIds).toHaveLength(96);
  });
  it.each(productionIds)(
    "serializes %s exactly through all seven actual author prompt builders",
    (id) => {
      const builders = authorPromptBuilders();
      const dossier = loadReferenceDossier(`${library}/${id}`);
      expect(dossier.productionEligible).toBe(true);
      const request = {
        route: {
          id,
          familyId: dossier.familyId,
          referenceDna: dossier.referenceDna,
          referenceDossier: dossier,
          evidence: [],
          compositionTopology: dossier.referenceDna.compositionTopology,
        },
        contentTokens: ["content.hero.heading", "content.hero.primaryLabel"],
        contentShape: {
          hero: {
            heading: "Sealed fixture heading",
            primaryLabel: "Request a consultation",
          },
        },
        visualBrief: { tone: "Preserve the assigned route" },
        rules: "Use sealed facts only.",
        designContract: "Fixture contract from the prior stage.",
        experienceSource: files.experience,
      };
      for (const stage of stages) {
        const input = { ...request, stage };
        const prefix = builders.routePromptPrefix(input);
        const serializedRoute = JSON.parse(
          prefix.split("\n\nSEALED CONTENT SHAPE\n")[0].slice("ROUTE\n".length),
        );
        expect(serializedRoute.referenceDossier, `${id}/${stage}`).toBe(
          referenceDossierPromptBlock(dossier),
        );
        expect(serializedRoute.referenceDossier, id).toContain(
          dossier.designPrompt,
        );
        expect(serializedRoute.referenceDna.compositionTopology, id).toEqual(
          dossier.referenceDna.compositionTopology,
        );
        assertModelPromptTextBudget([
          { type: "text", text: builders.authorSystemPrompt(input) },
          { type: "text", text: prefix },
          { type: "text", text: builders.stagePromptSuffix(input) },
        ]);
      }
      // A retry must keep the same dossier, not truncate it to make room.
      const retry = builders.routePromptPrefix({
        ...request,
        stage: "styles",
        validationError: "Fixture error",
        previousSource: files.styles,
      });
      expect(
        JSON.parse(retry.split("\n\nSEALED CONTENT SHAPE\n")[0].slice(6))
          .referenceDossier,
      ).toBe(referenceDossierPromptBlock(dossier));
      expect(adapter).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    "web-architecture-studio-peake",
    "web-hvac-city-wide-austin",
    "colorlib-fixwell-quote-desk",
  ])(
    "keeps %s's exact brief and both real screenshots through repair with an in-memory adapter",
    async (id) => {
      const dossier = loadReferenceDossier(`${library}/${id}`);
      adapter.mockImplementation(async () =>
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(files) },
            },
          ],
        }),
      );
      const result = await requestRepair({
        model: "local-fixture",
        referenceDossier: dossier,
        referenceDna: dossier.referenceDna,
        files,
        findings: ["reference composition review"],
        screenshots: [],
        logger: () => {},
      });
      expect(result).toEqual(files);
      expect(adapter).toHaveBeenCalledTimes(1);
      const body = adapter.mock.calls[0][0].body;
      const parts = body.messages.find(
        (message: any) => message.role === "user",
      ).content;
      const text = parts
        .filter((part: any) => part.type === "text")
        .map((part: any) => part.text)
        .join("\n");
      expect(text).toContain(referenceDossierPromptBlock(dossier));
      const images = parts.filter((part: any) => part.type === "image_url");
      expect(images).toHaveLength(2);
      const paths = selectAuthorReferenceScreenshots(
        {
          desktop: dossier.referenceDna.evidence.desktopScreenshot.path,
          mobile: dossier.referenceDna.evidence.mobileScreenshot.path,
        },
        { retry: true },
      );
      expect(paths).toHaveLength(2);
      for (let index = 0; index < paths.length; index += 1) {
        const actual = await promptImagePart(path.resolve(paths[index]), {
          detail: "high",
        });
        expect(images[index].image_url.url).toBe(actual.image_url.url);
      }
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("fails closed on missing reference evidence before reaching even the in-memory adapter", async () => {
    const dossier = loadReferenceDossier(
      `${library}/web-architecture-studio-peake`,
    );
    const referenceDna = structuredClone(dossier.referenceDna);
    referenceDna.evidence.desktopScreenshot.path =
      "data/reference-library/does-not-exist.png";
    delete referenceDna.evidence.desktopScreenshot.absolutePath;
    await expect(
      requestRepair({
        model: "local-fixture",
        referenceDossier: dossier,
        referenceDna,
        files,
        findings: [],
        screenshots: [],
        logger: () => {},
      }),
    ).rejects.toThrow(/reference evidence/i);
    expect(adapter).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
