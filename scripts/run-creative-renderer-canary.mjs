import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildCandidateManifest } from "./creative-compiler.mjs";
import { buildReferenceDna, validateReferenceDna } from "./reference-dna.mjs";
import { runCreativeBakeoff } from "./run-creative-bakeoff.mjs";
import { CREATIVE_CANARY_IMAGE_ASSETS } from "./creative-canary-reference.mjs";

const execFileAsync = promisify(execFile);

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 === 0 ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]] : pairs, []));
const root = path.resolve(args.root || ".");
const out = path.resolve(root, args.out || "artifacts/creative-canary-kokoro");
const imageDataUri = async (relativePath) =>
  `data:image/webp;base64,${(await fs.readFile(path.join(root, relativePath))).toString("base64")}`;
const canaryImages = {
  hero: await imageDataUri(CREATIVE_CANARY_IMAGE_ASSETS.hero),
  secondary: await imageDataUri(CREATIVE_CANARY_IMAGE_ASSETS.secondary),
  tertiary: await imageDataUri(CREATIVE_CANARY_IMAGE_ASSETS.tertiary),
};
const registry = JSON.parse(await fs.readFile(path.join(root, "data/inspiration-registry.json"), "utf8"));
const record = registry.records.find((item) => item.id === "kokoro-spatial-editorial");
if (!record) throw new Error("Kokoro canary reference is not registered.");
const referenceDna = validateReferenceDna(buildReferenceDna(record), { requireEvidence: true });
const route = {
  id: "kokoro-canary-route",
  label: "Kokoro editorial architecture canary",
  familyId: "editorial-monument",
  navigation: "whispered-corner-navigation",
  heroGeometry: "typographic-monument-with-central-portrait",
  servicePresentation: "magazine-ledger",
  sectionRhythm: "slow-cinematic-chapters",
  typographyCategory: "monumental-serif-with-script-accent",
  imageStrategy: "warm-architectural-tableaux",
  motionOpportunity: "masked-image-reveal",
  signature: "kokoro-canary-signature",
  referenceDna,
};
const manifest = buildCandidateManifest({
  candidate: { candidateId: "kokoro-canary" },
  route,
  model: "openai/gpt-6-luna",
  contentManifestDigest: "kokoro-canary-sealed-content",
  assets: ["content.hero.image", "content.hero.secondaryImage", "content.hero.tertiaryImage"],
});
const experience = `import { LeadForm } from "@launchloom/runtime";
export default function Experience({ content, runtime }) {
  const services = content.services || [];
  const faqs = content.faqs || [];
  return <main data-reference-family="kokoro-editorial-architecture" data-mobile-recomposition="single-column-editorial-chapters" data-motion-primitive="masked-image-reveal">
    <nav aria-label="Main navigation" data-navigation-geometry="quiet-corner-links"><a href="#services">Services</a><a href="#faqs">FAQs</a><a href="#contact">Contact</a></nav>
    <section data-reference-section="hero" data-hero data-hero-geometry="typographic-monument" data-reference-signature="editorial-monument"><p>{content.hero.kicker}</p><h1>{content.hero.heading}</h1><p>{content.hero.body}</p><a data-early-conversion data-cta-placement="after-hero-image" href="#contact">{content.hero.primaryLabel}</a>{content.hero.image ? <img src={content.hero.image} alt="Architectural service setting" /> : null}</section>
    <section data-reference-section="image-chapter"><p>{content.copy?.imageChapterLabel}</p>{content.hero.secondaryImage ? <img src={content.hero.secondaryImage} alt="A warm interior detail" /> : null}</section>
    <section data-reference-section="editorial-intro"><p>{content.copy?.editorialIntro}</p></section>
    <section data-reference-section="image-mosaic"><div>{content.hero.tertiaryImage ? <img src={content.hero.tertiaryImage} alt="Material detail" /> : null}</div></section>
    <section id="services" data-reference-section="magazine-archive" data-service-presentation="magazine-archive-ledger" data-reference-signature="magazine-archive"><h2>{content.copy?.servicesHeading || content.hero.heading}</h2>{services.map((service) => <article key={service.name}><h3>{service.name}</h3><p>{service.description}</p></article>)}</section>
    <section data-reference-section="closing-scene" data-reference-signature="closing-scene"><h2>{content.copy?.contactHeading || content.hero.heading}</h2><p>{content.copy?.processIntro}</p><ol>{(content.process || []).map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span><p>{step}</p></li>)}</ol></section>
    <section id="faqs" data-reference-section="faq">{faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</section>
    <section id="contact" data-reference-section="contact"><LeadForm content={content} runtime={runtime} /></section>
  </main>;
}`.replaceAll("—", "-");
const styles = `:root { --ll-creative-ink: #f6f1e7; --ll-creative-muted: #c6bba9; --ll-creative-accent: #a88745; }
[data-reference-family="kokoro-editorial-architecture"] { background:#151515; color:var(--ll-creative-ink); min-height:100vh; font-family:Georgia,serif; }
[data-reference-family="kokoro-editorial-architecture"] nav { position:fixed; inset:1rem 1.5rem auto; z-index:5; display:flex; justify-content:space-between; font:600 0.72rem/1.2 system-ui,sans-serif; text-transform:uppercase; letter-spacing:.12em; }
[data-reference-family="kokoro-editorial-architecture"] nav a { color:inherit; text-decoration:none; }
[data-reference-family="kokoro-editorial-architecture"] section { min-height:18vh; padding:2.5rem 10vw; display:grid; place-items:center; text-align:center; }
[data-reference-family="kokoro-editorial-architecture"] [data-reference-section="hero"] { box-sizing:border-box; height:100vh; min-height:0; overflow:hidden; align-content:center; gap:.75rem; padding:5rem 8vw 2rem; }
[data-reference-family="kokoro-editorial-architecture"] h1 { max-width:11ch; margin:0; font-size:clamp(4rem,11vw,11rem); line-height:.82; font-weight:400; letter-spacing:-.07em; }
[data-reference-family="kokoro-editorial-architecture"] h2 { max-width:16ch; margin:0; font-size:clamp(2.5rem,6vw,7rem); line-height:.9; font-weight:400; }
[data-reference-family="kokoro-editorial-architecture"] p { max-width:42rem; color:var(--ll-creative-muted); font:400 1rem/1.6 system-ui,sans-serif; }
[data-reference-family="kokoro-editorial-architecture"] [data-early-conversion] { display:inline-flex; align-items:center; justify-content:center; padding:.8rem 1.2rem; border:1px solid var(--ll-creative-accent); color:var(--ll-creative-ink); text-decoration:none; text-transform:uppercase; letter-spacing:.1em; font:600 .72rem/1 system-ui,sans-serif; }
[data-reference-family="kokoro-editorial-architecture"] img { width:min(70vw,32rem); max-height:30vh; object-fit:cover; margin:1rem auto; }
[data-reference-family="kokoro-editorial-architecture"] [data-reference-section="magazine-archive"] { display:block; text-align:left; }
[data-reference-family="kokoro-editorial-architecture"] [data-reference-section="magazine-archive"] article { display:flex; justify-content:space-between; gap:2rem; border-top:1px solid #4a4339; padding:1.5rem 0; }
[data-reference-family="kokoro-editorial-architecture"] [data-reference-section="magazine-archive"] h3 { margin:0; font-size:clamp(1.4rem,3vw,3rem); font-weight:400; }
[data-reference-family="kokoro-editorial-architecture"] [data-reference-section="closing-scene"] ol { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1rem; width:min(70rem,100%); margin:2rem auto 0; padding:0; list-style:none; text-align:left; }
[data-reference-family="kokoro-editorial-architecture"] [data-reference-section="closing-scene"] li { border-top:1px solid #4a4339; padding-top:.8rem; }
[data-reference-family="kokoro-editorial-architecture"] [data-reference-section="closing-scene"] li span { color:var(--ll-creative-accent); font:600 .72rem/1 system-ui,sans-serif; letter-spacing:.1em; }
@media (max-width:700px) { [data-reference-family="kokoro-editorial-architecture"] [data-reference-section="closing-scene"] ol { grid-template-columns:1fr; margin-top:1rem; } }
@media (max-width:700px) { [data-reference-family="kokoro-editorial-architecture"] nav { inset:.75rem; } [data-reference-family="kokoro-editorial-architecture"] section { min-height:0; padding:2rem 1.25rem; } [data-reference-family="kokoro-editorial-architecture"] [data-reference-section="hero"] { height:100svh; padding:4rem 1.25rem 1.5rem; } [data-reference-family="kokoro-editorial-architecture"] h1 { font-size:clamp(3.5rem,17vw,6rem); } [data-reference-family="kokoro-editorial-architecture"] [data-reference-section="magazine-archive"] article { display:block; } }`;
const motion = `export function mountExperienceMotion(runtime) { const reduced = Boolean(runtime?.reducedMotion) || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; if (reduced) return () => {}; const onScroll = () => document.documentElement.style.setProperty("--kokoro-reveal", String(Math.min(1, window.scrollY / 800))); window.addEventListener("scroll", onScroll, { passive: true }); onScroll(); return () => window.removeEventListener("scroll", onScroll); }`;
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, "candidate-a"), { recursive: true });
await fs.writeFile(path.join(out, "candidate-a/Experience.jsx"), `${experience}\n`);
await fs.writeFile(path.join(out, "candidate-a/styles.css"), `${styles}\n`);
await fs.writeFile(path.join(out, "candidate-a/motion.js"), `${motion}\n`);
await fs.writeFile(path.join(out, "candidate-a/metadata.json"), `${JSON.stringify({ ...manifest, creativeManifest: manifest }, null, 2)}\n`);
const siteRoot = path.join(root, "templates/client-site");
const configPath = path.join(siteRoot, "src/site.config.json");
const originalConfig = await fs.readFile(configPath, "utf8");
const selectedDir = path.join(siteRoot, "src/generated-experiences/selected");
const selectedBackup = path.join(out, "selected-backup");
await fs.rm(selectedBackup, { recursive: true, force: true });
try {
  await fs.cp(selectedDir, selectedBackup, { recursive: true, force: true });
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const canaryConfig = JSON.parse(originalConfig);
canaryConfig.business = {
  name: "Kokoro House Interiors",
  tagline: "Spaces that make room for living.",
  description: "A hypothetical architecture studio shaping warm, enduring interiors.",
  phone: "(503) 555-0186",
  email: "studio@kokoro-house.example",
  address: "Portland, Oregon",
  serviceAreas: ["Portland", "Lake Oswego"],
  primaryCta: "Start a design conversation",
};
canaryConfig.industry = "architecture";
canaryConfig.businessKind = "interior design studio";
canaryConfig.services = [
  {
    name: "Residential interiors",
    slug: "residential-interiors",
    description: "Measured interior schemes for homes shaped around daily rituals.",
  },
  {
    name: "Hospitality spaces",
    slug: "hospitality-spaces",
    description: "Warm, durable environments for guests, teams, and shared moments.",
  },
  {
    name: "Material direction",
    slug: "material-direction",
    description: "A restrained palette of materials, lighting, and custom details.",
  },
];
canaryConfig.conversion = {
  faqs: [
    { question: "How does the first conversation work?", answer: "We review your space, priorities, and timing before suggesting a measured next step." },
    { question: "Can you work with an existing home?", answer: "Yes. We begin with the architecture and routines already present, then shape the additions around them." },
  ],
  process: ["Listen to the brief", "Shape the direction", "Document the details"],
  quickAnswers: { enabled: false },
};
canaryConfig.assets = {
  logo: "",
  photoOne: canaryImages.hero,
  photoTwo: canaryImages.secondary,
  photoThree: canaryImages.tertiary,
};
canaryConfig.copy = {
  heroKicker: "Architecture for everyday rituals",
  heroHeading: "Rooms that hold a life",
  heroBody: "A measured process for warm, enduring interiors.",
  servicesHeading: "The Kokoro archive",
  contactHeading: "Begin with a conversation",
  imageChapterLabel: "Material, light, and the shape of a day",
  editorialIntro: "We make the quiet decisions visible: a threshold, a window seat, a room that keeps its promise.",
  processIntro: "A calm sequence keeps each decision clear from first conversation to final detail.",
};
try {
  await fs.writeFile(configPath, `${JSON.stringify(canaryConfig, null, 2)}\n`);
  var report = await runCreativeBakeoff({
    siteDir: siteRoot,
    candidatesDir: out,
    reportPath: path.join(out, "creative-bakeoff.json"),
    screenshotsDir: path.join(out, "screenshots"),
    preview: true,
    requireDiversity: false,
  });
} finally {
  await fs.writeFile(configPath, originalConfig);
  await fs.rm(selectedDir, { recursive: true, force: true });
  const selectedEntries = await fs.readdir(selectedBackup).catch(() => []);
  await fs.mkdir(selectedDir, { recursive: true });
  await Promise.all(selectedEntries.map((entry) => fs.cp(path.join(selectedBackup, entry), path.join(selectedDir, entry), { recursive: true, force: true })));
  await fs.rm(selectedBackup, { recursive: true, force: true });
}
canaryConfig.design = {
  ...(canaryConfig.design || {}),
  experience: {
    ...(canaryConfig.design?.experience || {}),
    renderer: "creative-candidate",
    candidateId: "kokoro-canary",
    familyId: referenceDna.familyId,
    fingerprint: "kokoro-canary-fingerprint",
    visualScore: report.candidates?.[0]?.visualScore || 0,
    distinctivenessScore: report.candidates?.[0]?.distinctivenessScore || 0,
  },
};
await fs.writeFile(path.join(out, "visual-gate-config.json"), `${JSON.stringify(canaryConfig, null, 2)}\n`);
const visualGateScreenshots = path.join(out, "visual-gate-screenshots");
await fs.mkdir(visualGateScreenshots, { recursive: true });
for (const [source, target] of [
  ["kokoro-canary-desktop.png", "desktop.png"],
  ["kokoro-canary-compact.png", "compact.png"],
  ["kokoro-canary-mobile.png", "mobile.png"],
]) {
  await fs.copyFile(path.join(out, "screenshots", source), path.join(visualGateScreenshots, target));
}
if (!process.env.OPENROUTER_API_KEY)
  throw new Error("OPENROUTER_API_KEY is required to complete the creative canary visual gate.");
await execFileAsync(process.execPath, [
  path.join(root, "scripts/visual-quality-gate.mjs"),
  "--mode",
  "plan",
  "--config",
  path.join(out, "visual-gate-config.json"),
  "--screenshots",
  visualGateScreenshots,
  "--report",
  path.join(out, "visual-gate-plan.json"),
], { cwd: root, env: process.env, maxBuffer: 4 * 1024 * 1024 });
const visualGateReport = JSON.parse(await fs.readFile(path.join(out, "visual-gate-plan.json"), "utf8"));
const visualGateMajorFindings = (visualGateReport.audit?.findings || []).filter((item) => ["critical", "major"].includes(item.severity));
if (visualGateReport.audit?.verdict !== "pass" || (visualGateReport.blockers || []).length || visualGateMajorFindings.length)
  throw new Error(`Kokoro canary visual gate failed: ${visualGateMajorFindings.map((item) => item.evidence || item.category).join(" | ") || visualGateReport.audit?.verdict || "unknown verdict"}`);
const promotionReport = {
  version: 1,
  status: report.selectedCandidateId ? "passed" : "failed",
  renderer: report.selectedCandidateId ? "creative-candidate" : null,
  selectedCandidateId: report.selectedCandidateId,
  familyId: referenceDna.familyId,
  noLegacyRenderer: report.selectedCandidateId ? true : null,
  referenceDna,
  visualGate: {
    ...report,
    screenshotAudit: visualGateReport,
  },
  visualGateReportPath: path.join(out, "visual-gate-plan.json"),
  screenshots: ["desktop", "compact", "mobile"].map((name) => path.join(out, "screenshots", `kokoro-canary-${name}.png`)),
};
await fs.writeFile(path.join(out, "promotion-report.json"), `${JSON.stringify(promotionReport, null, 2)}\n`);
console.log(JSON.stringify({ out, selectedCandidateId: report.selectedCandidateId, familyId: referenceDna.familyId, renderer: promotionReport.renderer, report: path.join(out, "promotion-report.json") }));
if (!report.selectedCandidateId) process.exitCode = 1;
