import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildInspirationPack } from "./inspiration-registry.mjs";
import { enrichInspirationPack } from "./analyze-reference-dna.mjs";
import { runRenderedCreativeRepair } from "./run-rendered-creative-repair.mjs";
import {
  loadA1ReferenceLibrary,
  mergeInspirationRegistries,
} from "./a1-reference-library.mjs";

const execFileAsync = promisify(execFile);

const args = Object.fromEntries(
  process.argv.slice(2).reduce(
    (pairs, value, index, all) =>
      index % 2 === 0
        ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]]
        : pairs,
    [],
  ),
);

const root = path.resolve(args.root || ".");
const out = path.resolve(root, args.out || "artifacts/creative-canary-kokoro");
const siteRoot = path.join(root, "templates/client-site");
const configPath = path.join(siteRoot, "src/site.config.json");
const selectedDir = path.join(siteRoot, "src/generated-experiences/selected");

if (!process.env.OPENROUTER_API_KEY)
  throw new Error("OPENROUTER_API_KEY is required for the model-authored creative canary.");

async function imageDataUri(relativePath) {
  return `data:image/webp;base64,${(
    await fs.readFile(path.join(root, relativePath))
  ).toString("base64")}`;
}

async function canaryConfigFrom(original) {
  const config = JSON.parse(original);
  config.business = {
    name: "Kokoro House Interiors",
    tagline: "Spaces that make room for living.",
    description:
      "A hypothetical architecture studio shaping warm, enduring interiors.",
    phone: "(503) 555-0186",
    email: "studio@kokoro-house.example",
    address: "Portland, Oregon",
    serviceAreas: ["Portland", "Lake Oswego"],
    primaryCta: "Start a design conversation",
  };
  config.industry = "architecture";
  config.businessKind = "interior design studio";
  config.services = [
    {
      name: "Residential interiors",
      slug: "residential-interiors",
      description:
        "Measured interior schemes for homes shaped around daily rituals.",
    },
    {
      name: "Hospitality spaces",
      slug: "hospitality-spaces",
      description:
        "Warm, durable environments for guests, teams, and shared moments.",
    },
    {
      name: "Material direction",
      slug: "material-direction",
      description:
        "A restrained palette of materials, lighting, and custom details.",
    },
  ];
  config.conversion = {
    faqs: [
      {
        question: "How does the first conversation work?",
        answer:
          "We review your space, priorities, and timing before suggesting a measured next step.",
      },
      {
        question: "Can you work with an existing home?",
        answer:
          "Yes. We begin with the architecture and routines already present, then shape the additions around them.",
      },
    ],
    process: [
      "Listen to the brief",
      "Shape the direction",
      "Document the details",
    ],
    quickAnswers: { enabled: false },
  };
  config.assets = {
    logo: "",
    photoOne: await imageDataUri(
      "data/inspiration-evidence/creative-probe-kokoro/assets/hero-atrium.webp",
    ),
    photoTwo: await imageDataUri(
      "data/inspiration-evidence/creative-probe-kokoro/assets/ridge-house.webp",
    ),
    photoThree: await imageDataUri(
      "data/inspiration-evidence/creative-probe-kokoro/assets/project-mosaic.webp",
    ),
  };
  config.copy = {
    ...(config.copy || {}),
    heroKicker: "Architecture for everyday rituals",
    heroHeading: "Rooms that hold a life",
    heroBody: "A measured process for warm, enduring interiors.",
    servicesHeading: "The Kokoro archive",
    contactHeading: "Begin with a conversation",
    imageChapterLabel: "Material, light, and the shape of a day",
    editorialIntro:
      "We make the quiet decisions visible: a threshold, a window seat, a room that keeps its promise.",
    processIntro:
      "A calm sequence keeps each decision clear from first conversation to final detail.",
  };
  return config;
}

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });

const originalConfig = await fs.readFile(configPath, "utf8");
const selectedBackup = path.join(out, "selected-backup");
await fs.rm(selectedBackup, { recursive: true, force: true });
try {
  await fs.cp(selectedDir, selectedBackup, { recursive: true, force: true });
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

try {
  const canaryConfig = await canaryConfigFrom(originalConfig);
  const baseRegistry = JSON.parse(
    await fs.readFile(path.join(root, "data/inspiration-registry.json"), "utf8"),
  );
  const a1Path = path.join(root, "data/a1-reference-library.json");
  const registry = await fs.access(a1Path).then(
    async () => mergeInspirationRegistries(
      baseRegistry,
      await loadA1ReferenceLibrary(a1Path, { repositoryRoot: root }),
    ),
    () => baseRegistry,
  );
  const compiledPack = buildInspirationPack(
    {
      seed: "kokoro-model-canary",
      industry: "architecture",
      styleTerms: [
        "kokoro",
        "editorial",
        "architecture",
        "monumental serif",
        "magazine archive",
      ],
      recentReferenceIds: [],
      recentRouteSignatures: [],
    },
    registry,
  );
  const inspirationPack = await enrichInspirationPack(compiledPack);
  const kokoroRoute = inspirationPack.routes.find(
    (route) =>
      route.referenceDna?.familyId === "kokoro-editorial-architecture",
  );
  if (!kokoroRoute)
    throw new Error("The controlled canary pack did not contain the Kokoro reference route.");

  const canaryConfigPath = path.join(out, "site.config.json");
  const inspirationPath = path.join(out, "inspiration-pack.json");
  const authoredRoot = path.join(out, "generated-experiences");
  await fs.writeFile(canaryConfigPath, `${JSON.stringify(canaryConfig, null, 2)}\n`);
  await fs.writeFile(
    inspirationPath,
    `${JSON.stringify(inspirationPack, null, 2)}\n`,
  );

  await execFileAsync(
    process.execPath,
    [
      path.join(root, "scripts/author-production-experiences.mjs"),
      "--config",
      canaryConfigPath,
      "--inspiration",
      inspirationPath,
      "--out",
      authoredRoot,
      "--failure-mode",
      "throw",
    ],
    {
      cwd: root,
      env: process.env,
      maxBuffer: 8 * 1024 * 1024,
    },
  );

  const entries = (
    await fs.readdir(authoredRoot, { withFileTypes: true })
  ).filter((entry) => entry.isDirectory() && /^candidate-[a-z]+$/u.test(entry.name));
  let kokoroCandidate;
  for (const entry of entries) {
    const metadata = JSON.parse(
      await fs.readFile(
        path.join(authoredRoot, entry.name, "metadata.json"),
        "utf8",
      ),
    );
    if (
      metadata.referenceFamilyId ===
      "kokoro-editorial-architecture"
    ) {
      kokoroCandidate = { directory: entry.name, metadata };
      break;
    }
  }
  if (!kokoroCandidate)
    throw new Error("Luna did not produce the controlled Kokoro candidate.");

  const isolatedRoot = path.join(out, "kokoro-bakeoff-candidates");
  await fs.mkdir(isolatedRoot, { recursive: true });
  await fs.cp(
    path.join(authoredRoot, kokoroCandidate.directory),
    path.join(isolatedRoot, kokoroCandidate.directory),
    { recursive: true, force: true },
  );

  await fs.writeFile(configPath, `${JSON.stringify(canaryConfig, null, 2)}\n`);
  const repairResult = await runRenderedCreativeRepair({
    siteDir: siteRoot,
    candidatesDir: isolatedRoot,
    outDir: path.join(out, "creative-repair"),
    mode: "preview",
    requireDiversity: false,
    visualGateScript: path.join(root, "scripts/visual-quality-gate.mjs"),
  });
  const bakeoffReport = repairResult.bakeoff;

  if (bakeoffReport.selectedCandidateId !== kokoroCandidate.metadata.candidateId)
    throw new Error("The Luna-authored Kokoro candidate did not pass the rendered creative repair loop.");

  const selectedConfig = JSON.parse(await fs.readFile(configPath, "utf8"));
  if (selectedConfig.design?.experience?.renderer !== "creative-candidate")
    throw new Error("The canary did not select the creative-candidate renderer.");

  const visualReport = repairResult.visualGate;
  const visualMajors = (visualReport.audit?.findings || []).filter((item) =>
    ["critical", "major"].includes(item.severity),
  );
  if (
    visualReport.audit?.verdict !== "pass" ||
    visualMajors.length ||
    (visualReport.blockers || []).length
  )
    throw new Error(
      `The Luna-authored Kokoro canary failed final visual QA: ${visualMajors
        .map((item) => item.evidence || item.category)
        .join(" | ") || visualReport.audit?.verdict}`,
    );
  const screenshotsDir = repairResult.final.screenshotsDir;

  const candidateReport = bakeoffReport.candidates.find(
    (candidate) =>
      candidate.candidateId === kokoroCandidate.metadata.candidateId,
  );
  const promotionReport = {
    version: 2,
    status: "passed",
    authorModel: kokoroCandidate.metadata.model,
    selectedCandidateId: kokoroCandidate.metadata.candidateId,
    familyId: kokoroCandidate.metadata.familyId,
    referenceFamilyId: kokoroCandidate.metadata.referenceFamilyId,
    renderer: selectedConfig.design.experience.renderer,
    noLegacyRenderer: true,
    referenceDna: kokoroCandidate.metadata.referenceDna,
    renderedReferenceFidelity:
      candidateReport?.renderedReferenceFidelity || null,
    bakeoff: bakeoffReport,
    visualGate: visualReport,
    screenshots: ["desktop", "compact", "mobile"].map((name) =>
      path.join(
        screenshotsDir,
        `${kokoroCandidate.metadata.candidateId}-${name}.png`,
      ),
    ),
  };
  await fs.writeFile(
    path.join(out, "promotion-report.json"),
    `${JSON.stringify(promotionReport, null, 2)}\n`,
  );
  console.log(
    JSON.stringify({
      out,
      selectedCandidateId: promotionReport.selectedCandidateId,
      referenceFamilyId: promotionReport.referenceFamilyId,
      renderer: promotionReport.renderer,
      renderedReferenceScore:
        promotionReport.renderedReferenceFidelity?.score || 0,
      report: path.join(out, "promotion-report.json"),
    }),
  );
} finally {
  await fs.writeFile(configPath, originalConfig);
  await fs.rm(selectedDir, { recursive: true, force: true });
  const backupEntries = await fs.readdir(selectedBackup).catch(() => []);
  await fs.mkdir(selectedDir, { recursive: true });
  await Promise.all(
    backupEntries.map((entry) =>
      fs.cp(
        path.join(selectedBackup, entry),
        path.join(selectedDir, entry),
        { recursive: true, force: true },
      ),
    ),
  );
}
