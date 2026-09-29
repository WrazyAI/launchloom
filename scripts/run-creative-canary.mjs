import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildInspirationPack } from "./inspiration-registry.mjs";
import { enrichInspirationPack } from "./analyze-reference-dna.mjs";
import { runRenderedCreativeRepair } from "./run-rendered-creative-repair.mjs";
import { createReasoningPreflight } from "./reasoning-preflight-lib.mjs";

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
const out = path.resolve(root, args.out || "artifacts/creative-canary-reference-library");
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
    name: "Alder & Field Architecture",
    tagline: "Spaces that make room for living.",
    description:
      "A hypothetical architecture studio shaping warm, enduring interiors.",
    phone: "(503) 555-0186",
    email: "studio@alderfield.example",
    address: "Portland, Oregon",
    serviceAreas: ["Portland", "Lake Oswego"],
    primaryCta: "Start a design conversation",
  };
  config.industry = "architecture";
  config.businessKind = "architecture";
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
      "data/creative-assets/architecture-canary/hero-atrium.webp",
    ),
    photoTwo: await imageDataUri(
      "data/creative-assets/architecture-canary/ridge-house.webp",
    ),
    photoThree: await imageDataUri(
      "data/creative-assets/architecture-canary/project-mosaic.webp",
    ),
  };
  config.copy = {
    ...(config.copy || {}),
    heroKicker: "Architecture for everyday rituals",
    heroHeading: "Rooms that hold a life",
    heroBody: "A measured process for warm, enduring interiors.",
    servicesHeading: "Selected spaces",
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
  const compiledPack = buildInspirationPack(
    {
      seed: "architecture-reference-library-canary",
      industry: "architecture",
      styleTerms: [
        "McAlpine Sanctuary Index",
        "editorial",
        "architecture",
        "monumental serif",
        "vertical service index",
      ],
      styleText:
        "Use McAlpine Sanctuary Index mechanics: a full-bleed architectural opening, oversized restrained typography, a narrow project/service index, and a dark contact close. Do not reproduce source identity, source copy, source images, or trade dress.",
      recentReferenceIds: [],
      recentRouteSignatures: [],
    },
    baseRegistry,
  );
  const inspirationPack = await enrichInspirationPack(compiledPack);
  const architectureRoute = inspirationPack.routes.find(
    (route) => route.referenceDossier?.id === "lapa-mcalpine-sanctuary",
  );
  if (!architectureRoute)
    throw new Error("The controlled canary pack did not contain the selected architecture dossier.");
  const canaryDna = architectureRoute.referenceDna;
  const requiredCanarySections = [
    "architectural-opening",
    "presentation-frame",
    "vertical-index",
    "dark-navigation-contact",
  ];
  if (!requiredCanarySections.every((section) => canaryDna.sectionSequence.includes(section)))
    throw new Error("The selected architecture dossier does not preserve the canary's expected editorial section rhythm.");
  const requiredCanarySignatures = new Set(
    canaryDna.requiredSignatureElements.map((element) => element.id),
  );
  if (!["architectural-wordmark-scene", "presentation-frame", "vertical-chapter-index", "dark-contact-close"].every((id) => requiredCanarySignatures.has(id)))
    throw new Error("The selected architecture dossier is missing a required signature element.");
  if (!/reveal/iu.test(canaryDna.motion.primitive))
    throw new Error("The selected architecture dossier must define a purposeful reveal interaction.");

  const canaryConfigPath = path.join(out, "site.config.json");
  const inspirationPath = path.join(out, "inspiration-pack.json");
  const reasoningPreflightPath = path.join(out, "reasoning-preflight.json");
  const authoredRoot = path.join(out, "generated-experiences");
  await fs.writeFile(canaryConfigPath, `${JSON.stringify(canaryConfig, null, 2)}\n`);
  await fs.writeFile(
    inspirationPath,
    `${JSON.stringify(inspirationPack, null, 2)}\n`,
  );
  const creativeSession = await createReasoningPreflight({
    inspirationPack,
    mode: process.env.REASONING_PREFLIGHT_MODE || "shadow",
    model: process.env.REASONING_PREFLIGHT_MODEL || "jev-1.13.0",
    creativeModel: "openai/gpt-6-luna",
    sessionKey: "creative-canary-reference-library",
  });
  await fs.writeFile(
    reasoningPreflightPath,
    `${JSON.stringify(creativeSession, null, 2)}\n`,
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
      "--session",
      reasoningPreflightPath,
      "--failure-mode",
      "throw",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        CREATIVE_EXPERIENCE_MODEL: "openai/gpt-6-luna",
      },
      maxBuffer: 8 * 1024 * 1024,
    },
  );

  const entries = (
    await fs.readdir(authoredRoot, { withFileTypes: true })
  ).filter((entry) => entry.isDirectory() && /^candidate-[a-z]+$/u.test(entry.name));
  let architectureCandidate;
  for (const entry of entries) {
    const metadata = JSON.parse(
      await fs.readFile(
        path.join(authoredRoot, entry.name, "metadata.json"),
        "utf8",
      ),
    );
    if (metadata.referenceDna?.familyId === "lapa-mcalpine-sanctuary") {
      architectureCandidate = { directory: entry.name, metadata };
      break;
    }
  }
  if (!architectureCandidate)
    throw new Error("Luna did not produce the candidate assigned to the architecture dossier.");
  if (
    architectureCandidate.metadata.creativeManifest?.referenceDossier?.id !==
    architectureRoute.referenceDossier.id
  )
    throw new Error("The authored candidate lost its assigned architecture dossier binding.");
  if (
    architectureCandidate.metadata.creativeManifest?.referenceDossier?.id !==
    architectureRoute.referenceDossier.id
  )
    throw new Error("The authored candidate lost its assigned architecture dossier binding.");

  const isolatedRoot = path.join(out, "architecture-bakeoff-candidates");
  await fs.mkdir(isolatedRoot, { recursive: true });
  await fs.cp(
    path.join(authoredRoot, architectureCandidate.directory),
    path.join(isolatedRoot, architectureCandidate.directory),
    { recursive: true, force: true },
  );

  await fs.writeFile(configPath, `${JSON.stringify(canaryConfig, null, 2)}\n`);
  const repairResult = await runRenderedCreativeRepair({
    siteDir: siteRoot,
    candidatesDir: isolatedRoot,
    outDir: path.join(out, "creative-repair"),
    mode: "preview",
    model: "openai/gpt-6-luna",
    creativeSession,
    requireDiversity: false,
    visualGateScript: path.join(root, "scripts/visual-quality-gate.mjs"),
  });
  const bakeoffReport = repairResult.bakeoff;

  if (bakeoffReport.selectedCandidateId !== architectureCandidate.metadata.candidateId)
    throw new Error("The Luna-authored architecture candidate did not pass the rendered creative repair loop.");

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
      `The Luna-authored architecture canary failed final visual QA: ${visualMajors
        .map((item) => item.evidence || item.category)
        .join(" | ") || visualReport.audit?.verdict}`,
    );
  const screenshotsDir = repairResult.final.screenshotsDir;

  const candidateReport = bakeoffReport.candidates.find(
    (candidate) =>
      candidate.candidateId === architectureCandidate.metadata.candidateId,
  );
  const promotionReport = {
    version: 2,
    status: "passed",
    authorModel: architectureCandidate.metadata.model,
    reasoning: {
      effort: creativeSession.reasoningEffort,
      recommendedEffort: creativeSession.recommendedEffort,
      mode: creativeSession.mode,
      policyVersion: creativeSession.reasoningPolicyVersion,
      selectorModelVersion: creativeSession.selectorModelVersion,
    },
    selectedCandidateId: architectureCandidate.metadata.candidateId,
    familyId: architectureCandidate.metadata.familyId,
    referenceFamilyId: architectureCandidate.metadata.referenceFamilyId,
    referenceDossier:
      architectureCandidate.metadata.creativeManifest?.referenceDossier || null,
    renderer: selectedConfig.design.experience.renderer,
    noLegacyRenderer: true,
    referenceDna: architectureCandidate.metadata.referenceDna,
    renderedReferenceFidelity:
      candidateReport?.renderedReferenceFidelity || null,
    bakeoff: bakeoffReport,
    visualGate: visualReport,
    screenshots: ["desktop", "compact", "mobile"].map((name) =>
      path.join(
        screenshotsDir,
        `${architectureCandidate.metadata.candidateId}-${name}.png`,
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
