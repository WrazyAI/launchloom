import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { buildReferenceDna } from "../scripts/reference-dna.mjs";
import { validateReferenceCandidate } from "../scripts/reference-fidelity.mjs";

const record = JSON.parse(fs.readFileSync("data/inspiration-registry.json", "utf8")).records[0];
const dna = buildReferenceDna(record, { requireEvidence: true });
const validExperience = `<main data-mobile-recomposition="single-column-editorial-chapters" data-motion-primitive="masked-image-reveal"><nav data-navigation-geometry="quiet-corner-links"></nav><section data-reference-section="hero" data-hero data-hero-geometry="typographic-monument" data-reference-signature="editorial-monument"><h1>{content.hero.heading}</h1><img src={content.hero.image} /></section><section data-reference-section="image-chapter"></section><section data-reference-section="editorial-intro"></section><section data-reference-section="image-mosaic"></section><section id="services" data-reference-section="magazine-archive" data-service-presentation="magazine-archive-ledger" data-reference-signature="magazine-archive">{content.services}</section><section data-reference-section="closing-scene" data-reference-signature="closing-scene"></section><section id="faqs">{content.faqs}</section><section id="contact" data-reference-section="contact"><a data-early-conversion data-cta-placement="after-hero-image"></a></section></main>`;
const validStyles = `:root { --ll-creative-ink: #fff; } @media (max-width: 700px) { main { display:block; } }`;
const validMotion = `export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; const move = () => {}; window.addEventListener("pointermove", move); return () => window.removeEventListener("pointermove", move); }`;

describe("reference fidelity validator", () => {
  it("requires signatures, geometry, tokens, and mobile evidence", () => {
    const report = validateReferenceCandidate({ referenceDna: dna, experienceSource: validExperience, stylesSource: validStyles, motionSource: validMotion });
    expect(report.pass).toBe(true);
    expect(report.score).toBe(100);
  });

  it("allows only the marked deterministic no-motion fallback to skip authored motion evidence", () => {
    const fallbackMotion = `/* launchloom-deterministic-reduced-motion-fallback */
export function mountExperienceMotion(runtime) {
  const reduced = Boolean(runtime?.reducedMotion) ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return () => {};
  return () => {};
}`;
    const fallbackReport = validateReferenceCandidate({
      referenceDna: dna,
      experienceSource: validExperience,
      stylesSource: validStyles,
      motionSource: fallbackMotion,
    });
    expect(fallbackReport.visualFindings).not.toContainEqual(
      expect.objectContaining({ code: "motion-primitive" }),
    );

    const authoredNoop = fallbackMotion.replace(
      "/* launchloom-deterministic-reduced-motion-fallback */\n",
      "",
    );
    const authoredReport = validateReferenceCandidate({
      referenceDna: dna,
      experienceSource: validExperience,
      stylesSource: validStyles,
      motionSource: authoredNoop,
    });
    expect(authoredReport.visualFindings).toContainEqual(
      expect.objectContaining({ code: "motion-primitive" }),
    );
  });

  it("reports visual patterns but blocks only the token collision", () => {
    const report = validateReferenceCandidate({ referenceDna: dna, experienceSource: `${validExperience} <div data-layout="generic-split-hero" />`, stylesSource: `:root { --ink: #fff; }`, motionSource: validMotion });
    expect(report.pass).toBe(false);
    expect(report.visualPass).toBe(false);
    expect(report.visualFindings).toContainEqual(expect.objectContaining({ code: "prohibited-pattern" }));
    expect(report.hardFindings).toContainEqual(expect.objectContaining({ code: "css-token-collision" }));
  });

  it("ignores prohibited words outside relevant attribute values", () => {
    const report = validateReferenceCandidate({
      referenceDna: { ...dna, prohibitedPatterns: [...dna.prohibitedPatterns, "cards", "grid"] },
      experienceSource: `${validExperience}<p>Browse cards in a grid.</p><div className="gridiron" data-description="cards" />`,
      stylesSource: `${validStyles} .cards { display: grid; } /* generic-split-hero */`,
      motionSource: `${validMotion}\n// cards in a grid`,
    });
    expect(report.pass).toBe(true);
  });

  it.each(["data-reference-pattern", "data-layout", "data-grammar", "className", "class"])("detects prohibited patterns in %s values", (attribute) => {
    const report = validateReferenceCandidate({
      referenceDna: { ...dna, prohibitedPatterns: [...dna.prohibitedPatterns, "cards"] },
      experienceSource: `${validExperience}<div ${attribute} = "feature cards" />`,
      stylesSource: validStyles,
      motionSource: validMotion,
    });
    expect(report.pass).toBe(true);
    expect(report.visualPass).toBe(false);
    expect(report.visualFindings).toContainEqual(expect.objectContaining({ code: "prohibited-pattern" }));
  });

  it("accepts human-readable marker values that normalize to the contract slugs", () => {
    const humanReadable = validExperience
      .replace("single-column-editorial-chapters", "single column editorial chapters")
      .replace("masked-image-reveal", "masked image reveal")
      .replace("quiet-corner-links", "quiet corner links")
      .replace("typographic-monument", "typographic monument")
      .replace("magazine-archive-ledger", "magazine archive ledger")
      .replace("after-hero-image", "after hero image");
    const report = validateReferenceCandidate({ referenceDna: dna, experienceSource: humanReadable, stylesSource: validStyles, motionSource: validMotion });
    expect(report.pass).toBe(true);
    expect(report.findings).toEqual([]);
  });

  it("resolves static JSX marker constants without executing authored code", () => {
    const staticMarkers = `const geometry = "typographic-monument";
const navigation = "quiet-corner-links";
const services = "magazine-archive-ledger";
const cta = "after-hero-image";
const mobile = "single-column-editorial-chapters";
const motion = "masked-image-reveal";
${validExperience
  .replace('data-mobile-recomposition="single-column-editorial-chapters"', "data-mobile-recomposition={mobile}")
  .replace('data-motion-primitive="masked-image-reveal"', "data-motion-primitive={motion}")
  .replace('data-navigation-geometry="quiet-corner-links"', "data-navigation-geometry={navigation}")
  .replace('data-hero-geometry="typographic-monument"', "data-hero-geometry={geometry}")
  .replace('data-service-presentation="magazine-archive-ledger"', "data-service-presentation={services}")
  .replace('data-cta-placement="after-hero-image"', "data-cta-placement={cta}")}`;
    const report = validateReferenceCandidate({ referenceDna: dna, experienceSource: staticMarkers, stylesSource: validStyles, motionSource: validMotion });
    expect(report.findings).toEqual([]);
  });

  it("follows sealed content through rendered local component helpers", () => {
    const source = `function Hero({ content }) { return <section data-hero data-hero-geometry="typographic-monument"><img src={content.hero.image} /></section>; }
function Services({ content }) { return <section id="services" data-reference-section="magazine-archive" data-service-presentation="magazine-archive-ledger">{content.services}</section>; }
function Faqs({ content }) { return <section id="faqs">{content.faqs}</section>; }
export default function Experience({ content }) { return <main data-mobile-recomposition="single-column-editorial-chapters" data-motion-primitive="masked-image-reveal"><nav data-navigation-geometry="quiet-corner-links" /><Hero content={content} /><Services content={content} /><Faqs content={content} /><section id="contact"><a data-early-conversion data-cta-placement="after-hero-image" /></section></main>; }`;
    const report = validateReferenceCandidate({ referenceDna: dna, experienceSource: source, stylesSource: validStyles, motionSource: validMotion });
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "unbound-content-token" }),
    ]));
  });

  it("accepts destructured sealed collection bindings", () => {
    const destructured = validExperience
      .replace("<main ", "const { services, faqs } = content; return <main ")
      .replace("{content.services}", "{services}")
      .replace("{content.faqs}", "{faqs}");
    const report = validateReferenceCandidate({ referenceDna: dna, experienceSource: destructured, stylesSource: validStyles, motionSource: validMotion });
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "unbound-content-token" }),
    ]));
  });

  const staticExperience = validExperience
    .replace("{content.hero.heading}", "heading")
    .replace("{content.hero.image}", '"/placeholder.jpg"')
    .replace("{content.services}", "services")
    .replace("{content.faqs}", "faqs");
  const aliasedExperience = validExperience
    .replace("{content.hero.image}", "{heroImage}")
    .replace("{content.services}", "{serviceItems}")
    .replace("{content.faqs}", "{faqItems}");
  const tokenFindings = (experienceSource: string) => validateReferenceCandidate({
    referenceDna: dna,
    experienceSource,
    stylesSource: validStyles,
    motionSource: validMotion,
  }).findings.filter((item: any) => item.code === "unbound-content-token");

  it.each([
    ["nested destructuring", `const { hero: { image: heroImage }, services: serviceItems, faqs: faqItems } = content; return ${aliasedExperience};`],
    ["chained aliases", `const sealed = content; const { hero: banner, services: serviceItems, faqs: faqItems } = sealed; const heroImage = banner.image; return ${aliasedExperience};`],
    ["destructured props", `export default function Experience({ content: { hero: { image: heroImage }, services: serviceItems, faqs: faqItems } }) { return ${aliasedExperience}; }`],
    ["renamed content parameter", `export default ({ content: sealed }) => { const { hero: { image: heroImage }, services: serviceItems, faqs: faqItems } = sealed; return ${aliasedExperience}; };`],
    ["ordinary props parameter", `export default function Experience(props) { const { hero: { image: heroImage }, services: serviceItems, faqs: faqItems } = props.content; return ${aliasedExperience}; }`],
    ["returned JSX alias", `export function Experience({ content }) { const view = ${validExperience}; return view; }`],
    ["separate default export", `const Page = ({ content }) => ${validExperience}; export default Page;`],
    ["direct content parameter", `export function Experience(content) { return ${validExperience}; }`],
    ["block output", `if (ready) { const { hero: { image: heroImage }, services: serviceItems, faqs: faqItems } = content; return ${aliasedExperience}; }`],
    ["direct collection mappings", validExperience
      .replace("{content.services}", "{content.services.map(({ name }) => <p>{name}</p>)}")
      .replace("{content.faqs}", "{content.faqs.map((faq) => { const answer = <p>{faq.answer}</p>; return answer; })}")],
    ["mapped aliases", `export const Experience = ({ content }) => { const { hero: { image: heroImage }, services, faqs } = content; const serviceItems = services.map(({ name }) => <p>{name}</p>); const faqItems = faqs.map(({ question }) => <p>{question}</p>); return ${aliasedExperience}; };`],
    ["returned output expressions", "export function Experience({ content }) { const { hero: { image }, services, faqs } = content; return [image, services.map(({ name }) => name), faqs.map(({ answer }) => answer)]; }"],
    ["typed and bracketed aliases", `export function Experience({ content }) { const heroImage = (content["hero"]["image"] as string); const serviceItems = content.services!; const faqItems = content?.faqs; return ${aliasedExperience}; }`],
    ["unrelated block shadow", `const { hero: { image: heroImage }, services: serviceItems, faqs: faqItems } = content; { const heroImage = "local"; const serviceItems = []; const faqItems = []; } return ${aliasedExperience};`],
    ["mapping callback output", 'export function Experience({ content }) { return [1].map(() => <div><img src={content.hero.image} />{content.services}{content.faqs}</div>); }'],
  ])("accepts sealed tokens flowing through %s", (_label, source) => {
    expect(tokenFindings(source)).toEqual([]);
  });

  it.each([
    ["unused destructuring", `const { hero: { image: heroImage }, services, faqs } = content; return ${staticExperience};`],
    ["unused assignments", `const image = content.hero.image; const services = content.services; const faqs = content.faqs; return ${staticExperience};`],
    ["unused parameter bindings", `export default function Experience({ content: { hero: { image }, services, faqs } }) { return ${staticExperience}; }`],
    ["unused JSX assignment", `export function Experience({ content }) { const unused = ${validExperience}; return ${staticExperience}; }`],
    ["unused mapped output", `const images = [content.hero.image].map((image) => <img src={image} />); const services = content.services.map((service) => <p>{service.name}</p>); const faqs = content.faqs.map((faq) => <p>{faq.answer}</p>); return ${staticExperience};`],
    ["comments and strings", `// content.hero.image content.services content.faqs\n/* content.hero.image content.services content.faqs */\nconst mention = "content.hero.image content.services content.faqs"; return ${staticExperience};`],
    ["literal JSX mentions", '<main title="content.hero.image content.services content.faqs">content.hero.image content.services content.faqs{"content.hero.image content.services content.faqs"}{/* content.hero.image content.services content.faqs */}</main>'],
    ["discarded expressions", `content.hero.image; content.services; content.faqs; console.log(content.hero.image, content.services, content.faqs); return ${staticExperience};`],
    ["discarded comma operands", `return (content.hero.image, content.services, content.faqs, ${staticExperience});`],
    ["unused helper", `function unused() { return ${validExperience}; } export function Experience() { return ${staticExperience}; }`],
    ["unused arrow", `const unused = () => ${validExperience}; return ${staticExperience};`],
    ["local content shadow", `const content = { hero: { image: "local" }, services: [], faqs: [] }; return ${validExperience};`],
    ["block binding shadow", `const { hero: { image: heroImage }, services: serviceItems, faqs: faqItems } = content; { const heroImage = "local"; const serviceItems = []; const faqItems = []; return ${aliasedExperience}; }`],
    ["callback parameter shadow", `export function Experience({ content }) { return unrelated.map((content) => ${validExperience}); }`],
    ["destructured callback shadow", `const { hero: { image: heroImage }, services: serviceItems, faqs: faqItems } = content; export function Experience() { return unrelated.map(({ heroImage, serviceItems, faqItems }) => ${aliasedExperience}); }`],
    ["unused callback bindings", `export function Experience({ content }) { return unrelated.map(() => { const image = content.hero.image, services = content.services, faqs = content.faqs; return ${staticExperience}; }); }`],
    ["catch parameter shadow", `export function Experience({ content }) { try { work(); } catch (content) { return ${validExperience}; } }`],
    ["hoisted function binding shadow", `const { hero: { image: heroImage }, services: serviceItems, faqs: faqItems } = content; export function Experience() { if (ready) { var heroImage = "local", serviceItems = [], faqItems = []; } return ${aliasedExperience}; }`],
    ["overwritten aliases", `let heroImage = content.hero.image, serviceItems = content.services, faqItems = content.faqs; heroImage = "local"; serviceItems = []; faqItems = []; return ${aliasedExperience};`],
    ["unrelated property names", 'const unrelated = { "content.hero.image": 1, "content.services": 2, "content.faqs": 3 }; return unrelated;'],
    ["similar token prefixes", validExperience
      .replace("content.hero.image", "content.hero.imageCaption")
      .replace("content.services", "content.servicesHeading")
      .replace("content.faqs", "content.faqsHeading")],
  ])("rejects sealed token evidence from %s", (_label, source) => {
    const findings = tokenFindings(source);
    expect(findings).toHaveLength(3);
    for (const token of ["content.hero.image", "content.services", "content.faqs"])
      expect(findings).toContainEqual(expect.objectContaining({ message: expect.stringContaining(token) }));
  });

  it("tracks each required token independently", () => {
    const source = `return ${validExperience
      .replace("{content.services}", "[]")
      .replace("{content.faqs}", "[]")};`;
    expect(tokenFindings(source).map((item: any) => item.message)).toEqual([
      "Required sealed token content.services does not flow into output.",
      "Required sealed token content.faqs does not flow into output.",
    ]);
  });

  it("rejects marker values that only contain the expected slug", () => {
    const mismatched = validExperience.replace(
      'data-hero-geometry="typographic-monument"',
      'data-hero-geometry="not-typographic-monument"',
    );
    const report = validateReferenceCandidate({ referenceDna: dna, experienceSource: mismatched, stylesSource: validStyles, motionSource: validMotion });
    expect(report.pass).toBe(true);
    expect(report.visualPass).toBe(false);
    expect(report.visualFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "hero-geometry-mismatch" }),
    ]));
  });
});
