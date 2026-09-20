import { validateReferenceDna } from "./reference-dna.mjs";

const slug = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");

function finding(code, severity, message) {
  return { code, severity, message };
}

function sourceHasSignature(source, element) {
  const selector = String(element.selector || "");
  const match = selector.match(/data-reference-signature\s*=\s*["']?([a-z0-9_-]+)/iu);
  const value = match?.[1] || element.id;
  return Boolean(value && new RegExp(`data-reference-signature\\s*=\\s*["']?${value}\\b`, "iu").test(source));
}

function attributeValue(source, attribute) {
  return source.match(new RegExp(`${attribute}=["']([^"']+)["']`, "iu"))?.[1] || "";
}

function sourceSectionOrder(source) {
  const sections = [];
  for (const match of source.matchAll(/<section\b[^>]*?(?:data-reference-section=["']([^"']+)["']|id=["']([^"']+)["'])[^>]*>/giu))
    sections.push(String(match[1] || match[2]).toLowerCase());
  return sections;
}

function hasProhibitedPattern(source, pattern) {
  const value = slug(pattern);
  if (!value) return false;
  const escaped = value.replace(/-/gu, "[-_ ]?");
  return new RegExp(`(?:data-reference-pattern|data-layout|data-grammar|className|class)=["'][^"']*${escaped}[^"']*["']|${escaped}`, "iu").test(source);
}

/**
 * Checks the authored source before it reaches the Astro shell. This is
 * intentionally evidence-oriented: a model claim in contract.json cannot
 * satisfy a missing signature or mobile recomposition.
 */
export function validateReferenceCandidate({
  referenceDna,
  experienceSource = "",
  stylesSource = "",
  motionSource = "",
  renderedDom = "",
} = {}) {
  validateReferenceDna(referenceDna, { requireEvidence: true });
  const source = `${experienceSource}\n${stylesSource}\n${motionSource}`;
  const findings = [];
  for (const element of referenceDna.requiredSignatureElements) {
    if (!sourceHasSignature(experienceSource, element))
      findings.push(finding("missing-signature", "critical", `Missing required signature ${element.id}.`));
    if (renderedDom && !sourceHasSignature(renderedDom, element))
      findings.push(finding("missing-rendered-signature", "critical", `Rendered DOM is missing signature ${element.id}.`));
  }
  const sections = sourceSectionOrder(experienceSource);
  const expected = referenceDna.sectionSequence.map((item) => slug(item));
  const matched = expected.filter((item) => sections.includes(item) || source.toLowerCase().includes(item));
  if (matched.length < Math.min(3, expected.length))
    findings.push(finding("section-rhythm", "critical", "The authored section sequence does not represent the assigned reference rhythm."));
  if (!/data-hero(?:\s|=)/iu.test(experienceSource) || !/data-hero-geometry=/iu.test(experienceSource))
    findings.push(finding("hero-geometry", "critical", "The authored hero is missing its explicit reference geometry marker."));
  else if (!attributeValue(experienceSource, "data-hero-geometry").includes(slug(referenceDna.heroGeometry.mode)))
    findings.push(finding("hero-geometry-mismatch", "critical", "The authored hero geometry does not match Reference DNA."));
  if (!/data-navigation-geometry=/iu.test(experienceSource))
    findings.push(finding("navigation-geometry", "major", "The authored navigation is missing its reference geometry marker."));
  else if (!attributeValue(experienceSource, "data-navigation-geometry").includes(slug(referenceDna.navigationGeometry.mode)))
    findings.push(finding("navigation-geometry-mismatch", "critical", "The authored navigation geometry does not match Reference DNA."));
  if (!/data-service-presentation=/iu.test(experienceSource))
    findings.push(finding("service-presentation", "critical", "The authored service presentation is missing its reference marker."));
  else if (!attributeValue(experienceSource, "data-service-presentation").includes(slug(referenceDna.servicePresentation.pattern)))
    findings.push(finding("service-presentation-mismatch", "critical", "The authored service presentation does not match Reference DNA."));
  if (!/data-early-conversion(?:=|\s|>)/iu.test(experienceSource) || !/data-cta-placement=/iu.test(experienceSource))
    findings.push(finding("cta-placement", "critical", "The early CTA is missing its explicit reference placement marker."));
  else if (!attributeValue(experienceSource, "data-cta-placement").includes(slug(referenceDna.ctaPlacement.early)))
    findings.push(finding("cta-placement-mismatch", "critical", "The early CTA placement does not match Reference DNA."));
  if (!/data-mobile-recomposition=/iu.test(experienceSource) || !/@media/iu.test(stylesSource))
    findings.push(finding("mobile-recomposition", "critical", "The candidate does not declare a mobile recomposition and responsive CSS."));
  else if (!attributeValue(experienceSource, "data-mobile-recomposition").includes(slug(referenceDna.mobileRecomposition.strategy)))
    findings.push(finding("mobile-recomposition-mismatch", "critical", "The mobile recomposition does not match Reference DNA."));
  if (!/mountExperienceMotion\s*\(/u.test(motionSource) || !/data-motion-primitive=/iu.test(experienceSource))
    findings.push(finding("motion-primitive", "critical", "The assigned motion primitive is not represented in the authored candidate."));
  else if (!attributeValue(experienceSource, "data-motion-primitive").includes(slug(referenceDna.motion.primitive)))
    findings.push(finding("motion-primitive-mismatch", "critical", "The motion primitive does not match Reference DNA."));
  for (const pattern of referenceDna.prohibitedPatterns)
    if (hasProhibitedPattern(source, pattern))
      findings.push(finding("prohibited-pattern", "critical", `Prohibited pattern detected: ${pattern}.`));
  for (const match of stylesSource.matchAll(/--([a-z][\w-]*)\s*:/giu))
    if (!match[1].startsWith("ll-creative-"))
      findings.push(finding("css-token-collision", "critical", `Candidate CSS variable --${match[1]} is not isolated.`));
  for (const token of ["content.hero.image", "content.services", "content.faqs"])
    if (!experienceSource.includes(token))
      findings.push(finding("unbound-content-token", "critical", `Required sealed token ${token} is not referenced.`));
  const critical = findings.filter((item) => item.severity === "critical").length;
  const score = Math.max(0, Math.round(100 - critical * 18 - findings.filter((item) => item.severity === "major").length * 8));
  return {
    version: 1,
    pass: critical === 0,
    score,
    findings,
    requiredSignatures: referenceDna.requiredSignatureElements.map((item) => item.id),
    sectionOrder: sections,
  };
}

export function assertReferenceCandidate(input) {
  const report = validateReferenceCandidate(input);
  if (!report.pass)
    throw new Error(`Reference fidelity failed: ${report.findings.map((item) => item.message).join(" | ")}`);
  return report;
}
