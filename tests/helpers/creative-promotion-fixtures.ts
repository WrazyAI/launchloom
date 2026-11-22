import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildCandidateManifest } from "../../scripts/creative-compiler.mjs";
import { buildReferenceDna } from "../../scripts/reference-dna.mjs";

export const tempRoots: string[] = [];

export const validServicePage = `import { LeadForm } from "@launchloom/runtime";
export default function ServicePage({ content, runtime, service }) {
  return <main data-service-page data-service-slug={service.slug}>
    <nav aria-label="Main navigation"><a href="/">{content.brand.name}</a><a href="#contact">{content.hero.primaryLabel}</a></nav>
    <section data-service-hero><h1>{service.name}</h1><p>{service.description}</p></section>
    <section data-service-support><p>{service.support.scope}</p><p>{service.support.preparation}</p><p>{service.support.nextStep}</p></section>
    <section data-service-related><ul>{service.related.map((item) => <li key={item.slug}><a href={\`/services/\${item.slug}/\`}>{item.name}</a></li>)}</ul></section>
    {service.process.length > 0 && <ol>{service.process.map((step) => <li key={step}>{step}</li>)}</ol>}
    {service.faqs.length > 0 && <section>{service.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</section>}
    <section id="contact" data-ll-surface="page"><LeadForm content={content} runtime={runtime} /></section>
  </main>;
}`;

export const validLocationPage = `import { LeadForm } from "@launchloom/runtime";
export default function LocationPage({ content, runtime, location }) {
  return <main data-location-page data-location-slug={location.slug}>
    <nav aria-label="Main navigation"><a href="/">{content.brand.name}</a><a href="#contact">{content.hero.primaryLabel}</a></nav>
    <section data-location-hero><h1>{location.name}</h1><p>{location.description}</p></section>
    <section data-location-coverage><p>{location.localNote}</p></section>
    <section data-location-related><ul>{location.services.map((item) => <li key={item.slug}><a href={\`/services/\${item.slug}/\`}>{item.name}</a></li>)}{location.otherAreas.map((area) => <li key={area.slug}><a href={\`/locations/\${area.slug}/\`}>{area.name}</a></li>)}</ul></section>
    <section id="contact" data-ll-surface="page"><LeadForm content={content} runtime={runtime} /></section>
  </main>;
}`;

export const validServicesIndexPage = `import { LeadForm } from "@launchloom/runtime";
export default function ServicesIndexPage({ content, runtime }) {
  return <main data-services-index>
    <nav aria-label="Main navigation"><a href="/">{content.brand.name}</a><a href="#contact">{content.hero.primaryLabel}</a></nav>
    <section data-services-index-hero><h1>{content.copy.servicesHeading || content.hero.heading}</h1><p>{content.copy.servicesIntro}</p></section>
    <section data-services-index-list><ul>{content.services.map((item) => <li key={item.slug}><a href={\`/services/\${item.slug}/\`}>{item.name}</a></li>)}</ul></section>
    <section id="contact" data-ll-surface="page"><LeadForm content={content} runtime={runtime} /></section>
  </main>;
}`;

export async function makeTemplateCopy(configOverrides = {}) {
  // Keep the copy inside the repository so Node and Vite resolve dependencies
  // through the root node_modules on CI, where the template has no install of
  // its own. node_modules/.cache is ignored by git.
  const cacheRoot = path.join(
    path.resolve("."),
    "node_modules/.cache/launchloom-test-sites",
  );
  await fs.mkdir(cacheRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(cacheRoot, "site-"));
  tempRoots.push(root);
  await fs.cp(path.resolve("templates/client-site"), root, {
    recursive: true,
    filter: (source) =>
      !source.includes(`${path.sep}node_modules`) &&
      !source.includes(`${path.sep}dist`) &&
      !source.includes(`${path.sep}.astro`),
  });
  const templateNodeModules = path.resolve(
    "templates/client-site/node_modules",
  );
  if (
    await fs
      .access(templateNodeModules)
      .then(() => true)
      .catch(() => false)
  ) {
    await fs.symlink(
      templateNodeModules,
      path.join(root, "node_modules"),
      "dir",
    );
  }
  const configPath = path.join(root, "src/site.config.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  // Promotion fixtures must be wholly owned and offline. The template's
  // example remote photographs are not browser-test evidence or client assets.
  for (const [role, image] of Object.entries(config.images || {})) {
    if (typeof image !== "string" || !/^https?:/iu.test(image)) continue;
    const name = `creative-test-${role}.svg`;
    await fs.mkdir(path.join(root, "public/images"), { recursive: true });
    await fs.writeFile(path.join(root, "public/images", name),
      '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="960"><rect width="1280" height="960" fill="#456a60"/></svg>');
    config.images[role] = `/images/${name}`;
  }
  await fs.writeFile(configPath,
    `${JSON.stringify({ ...config, ...configOverrides }, null, 2)}\n`);
  return root;
}

export async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-creative-"));
  tempRoots.push(root);
  await fs.mkdir(path.join(root, "candidate-a"), { recursive: true });
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  const route = {
    id: "route-01",
    label: "Editorial monument",
    familyId: "editorial-monument",
    navigation: "quiet-corner",
    heroGeometry: "typographic-monument",
    servicePresentation: "magazine-ledger",
    sectionRhythm: "slow-chapters",
    typographyCategory: "monumental-serif",
    imageStrategy: "editorial-tableaux",
    motionOpportunity: "masked-image-reveal",
  };
  const manifest = buildCandidateManifest({
    candidate: { candidateId: "candidate-a" },
    route,
    model: "test/model",
    contentManifestDigest: "content-digest",
    assets: ["content.hero.image"],
  });
  await fs.writeFile(
    path.join(root, "src/site.config.json"),
    JSON.stringify({ design: { recipe: "general-editorial", sections: [] } }),
  );
  await fs.writeFile(
    path.join(root, "candidate-a/metadata.json"),
    JSON.stringify({ ...manifest, creativeManifest: manifest }),
  );
  await fs.writeFile(
    path.join(root, "candidate-a/Experience.jsx"),
    `import { LeadForm } from "@launchloom/runtime";
export default function Experience({ content, runtime }) {
  return <main><nav><a href="#services">Services</a><a href="#faqs">FAQs</a><a href="#contact">Contact</a></nav><section data-hero><div data-hero-copy><h1>{content.hero.heading}</h1><button data-early-conversion>{content.hero.primaryLabel}</button></div><img src={content.hero.image} alt={content.hero.heading} data-hero-media hidden /></section>
    <section id="services">{content.services.map((service) => <p key={service.name}>{service.name}</p>)}</section>
    <section id="faqs">{content.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary></details>)}</section>
    <section id="contact" data-ll-surface="page"><LeadForm content={content} runtime={runtime} /></section></main>;
}`,
  );
  await fs.writeFile(
    path.join(root, "candidate-a/styles.css"),
    "[data-hero]{min-height:40rem}",
  );
  await fs.writeFile(
    path.join(root, "candidate-a/motion.js"),
    "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}; return () => {}; }",
  );
  await writeV2ContentManifest(root);
  return root;
}

/**
 * Promote the fixture candidate to a version-two candidate bound to the first
 * registered reference so the judge path is exercised.
 */
export async function makeVersionTwoCandidate(root: string) {
  const record = JSON.parse(
    await fs.readFile("data/inspiration-registry.json", "utf8"),
  ).records[0];
  const baseDna = buildReferenceDna(record, { requireEvidence: true });
  const metadataPath = path.join(root, "candidate-a/metadata.json");
  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  metadata.version = 2;
  metadata.referenceDna = baseDna;
  metadata.referenceEvidence = {
    desktop: baseDna.evidence.desktopScreenshot.path,
    mobile: baseDna.evidence.mobileScreenshot?.path || "",
    complete: true,
  };
  metadata.creativeManifest = {
    ...metadata.creativeManifest,
    version: 2,
    referenceDna: baseDna,
    referenceEvidence: metadata.referenceEvidence,
  };
  await fs.writeFile(metadataPath, JSON.stringify(metadata));
  await writeV2ContentManifest(root);
}

export async function writeV2ContentManifest(root: string, directory = "candidate-a") {
  await fs.writeFile(
    path.join(root, directory, "content-manifest.json"),
    JSON.stringify({
      version: 2,
      values: {
        brand: { phone: "+12125550186", email: "studio@example.test" },
        hero: {
          heading: "A considered local service",
          primaryLabel: "Request a consultation",
          image: "/images/hero.webp",
        },
        services: [],
        faqs: [],
      },
      tokens: [],
      visualBrief: {
        palette: {},
        tone: "",
        preference: "",
        visualDirection: "",
        artDirection: "",
      },
    }),
  );
}

export async function cleanupTempRoots() {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
}
