import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  authorExperienceCandidates,
  namespaceCreativeCss,
  validateProductionCandidateFiles,
  type AuthorStageRequest,
} from "../scripts/production-experience-author.mjs";
import { buildReferenceDna } from "../scripts/reference-dna.mjs";

const site = {
  business: {
    name: "Maison Orphee",
    phone: "(212) 555-0186",
    email: "hello@example.com",
    address: "Upper East Side, New York, NY",
  },
  hero: {
    kicker: "Fine jewelry by appointment",
    heading: "Designed in private, worn forever",
    body: "A private consultation before any commission begins.",
    primaryLabel: "Request a private appointment",
  },
  services: [
    {
      name: "Bespoke commissions",
      description: "Designed around your stones.",
    },
    {
      name: "Heirloom redesign",
      description: "Preserve stones you already own.",
    },
  ],
  conversion: {
    faqs: [
      { question: "What happens first?", answer: "A private consultation." },
    ],
  },
  assets: { logo: "/assets/logo.svg", hero: "/assets/hero.webp" },
};

const inspirationPack = {
  version: 1,
  selectionKey: "sealed-selection",
  routes: [
    {
      id: "route-01",
      label: "Nocturnal Salon",
      navigation: "discreet-overlay-navigation",
      heroGeometry: "full-bleed-image-with-inset-manifesto",
      servicePresentation: "sensory-chapter-sequence",
      sectionRhythm: "dark-light-crescendo",
      typographyCategory: "cinematic-display-serif",
      imageStrategy: "low-light-material-macro",
      motionOpportunity: "scrubbed-light-shift",
      signature: "salon-signature",
      evidence: [{ name: "Nocturnal Salon", source: "Owned", rights: "owned" }],
    },
    {
      id: "route-02",
      label: "Fashion Archive",
      navigation: "micro-menu-with-cart-counterpoint",
      heroGeometry: "editorial-face-and-type-collision",
      servicePresentation: "archive-collection-rail",
      sectionRhythm: "campaign-spread-sequence",
      typographyCategory: "fashion-grotesk-and-display-mix",
      imageStrategy: "hard-cropped-fashion-portrait",
      motionOpportunity: "horizontal-collection-scrub",
      signature: "archive-signature",
      evidence: [
        { name: "Fashion Archive", source: "Lapa", rights: "reference-only" },
      ],
    },
    {
      id: "route-03",
      label: "Spatial Editorial Monument",
      navigation: "whispered-corner-navigation",
      heroGeometry: "typographic-monument-with-central-portrait",
      servicePresentation: "magazine-ledger",
      sectionRhythm: "slow-cinematic-chapters",
      typographyCategory: "monumental-serif-with-script-accent",
      imageStrategy: "warm-architectural-tableaux",
      motionOpportunity: "masked-image-reveal",
      signature: "monument-signature",
      evidence: [
        { name: "Spatial Monument", source: "Lapa", rights: "reference-only" },
      ],
    },
  ],
};

function safeStage(request: AuthorStageRequest) {
  if (request.stage === "contract") {
    return {
      designContract: `A complete ${request.route.label} composition using ${request.route.heroGeometry}.`,
      designRationale: `The route owns ${request.route.navigation}.`,
    };
  }
  if (request.stage === "experience") {
    return {
      content: `import React from "react";
import { LeadForm } from "@launchloom/runtime";
export default function Experience({ content, runtime }) {
  return <div data-model-experience="${request.route.id}">
    <nav aria-label="Main navigation"><a href="#services">Services</a><a href="#faqs">FAQs</a><a href="#contact">Contact</a></nav>
    <main><section data-hero><h1>{content.hero.heading}</h1><p>{content.hero.body}</p><button data-early-conversion>{content.hero.primaryLabel}</button></section>
    <section id="services">{content.services.map((service) => <article key={service.name}><h2>{service.name}</h2><p>{service.description}</p></article>)}</section>
    <section id="faqs">{content.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</section>
    <section id="contact"><LeadForm content={content} runtime={runtime} /><a href={content.brand.phone}>{content.brand.phone}</a></section></main>
  </div>;
}`,
    };
  }
  if (request.stage === "styles") {
    return {
      content: `[data-model-experience="${request.route.id}"] { color: var(--ink); background: var(--paper); }`,
    };
  }
  return {
    content: `export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }`,
  };
}

describe("production experience author", () => {
  it("keeps shared creative form helper text on the candidate contrast palette", () => {
    const styles = readFileSync(
      "templates/client-site/src/styles/creative-runtime.css",
      "utf8",
    );

    expect(styles).toContain(
      '[data-creative-host="true"] .launchloom-lead-form {',
    );
    expect(styles).toContain("color: var(--ll-creative-ink, currentColor);");
    expect(styles).toContain(
      '[data-creative-host="true"] .launchloom-lead-form small {\n  color: var(--ll-creative-muted, currentColor);',
    );
    expect(styles).toContain('[data-creative-host="true"] {\n  width: 100%;');
    expect(styles).toMatch(
      /\[data-creative-host="true"\]\s*\{[^}]*overflow-x:\s*clip;/u,
    );
  });

  it("fails closed when a repair route carries present-but-incomplete Reference DNA", () => {
    const referenceDna = buildReferenceDna({
      id: "route-incomplete",
      referenceFamilyId: "kokoro-editorial-architecture",
      source: "Owned",
      rights: "owned",
    });
    expect(referenceDna.complete).toBe(false);

    expect(() =>
      validateProductionCandidateFiles({
        files: {
          experience: "export default function Experience(){ return null; }",
          styles: ".candidate { display: block; }",
          motion: "export function mountExperienceMotion(){ return () => {}; }",
        },
        route: {
          id: "route-incomplete",
          referenceDna,
        },
        content: {},
      }),
    ).toThrow(/Reference DNA .* is incomplete/iu);
  });

  it("namespaces candidate-owned CSS variables without hiding host tokens", () => {
    const css = namespaceCreativeCss(
      ":root { --ink: #f5f1e9; --accent: var(--ink); } .hero { color: var(--ink); background: var(--brand); }",
    );

    expect(css).toContain("--ll-creative-ink: #f5f1e9");
    expect(css).toContain("--ll-creative-accent: var(--ll-creative-ink)");
    expect(css).toContain("color: var(--ll-creative-ink)");
    expect(css).toContain("background: var(--brand)");
    expect(css).not.toContain("--ink:");
  });

  it("authors three sealed and structurally independent candidate bundles", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => safeStage(request),
      model: "test/model",
    });

    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.map((candidate) => candidate.directory)).toEqual([
      "candidate-a",
      "candidate-b",
      "candidate-c",
    ]);
    expect(
      new Set(
        result.candidates.map((candidate) => candidate.metadata.signature),
      ).size,
    ).toBe(3);
    expect(result.contentManifest.values).not.toHaveProperty("contact");
    expect(result.contentManifest.tokens.map(({ token }) => token)).toContain(
      "content.hero.image",
    );
    for (const candidate of result.candidates) {
      expect(Object.keys(candidate.files).sort()).toEqual([
        "Experience.jsx",
        "content-manifest.json",
        "contract.json",
        "metadata.json",
        "motion.js",
        "styles.css",
      ]);
      expect(candidate.files["Experience.jsx"]).toContain(
        "content.hero.heading",
      );
      expect(candidate.files["Experience.jsx"]).not.toContain(
        site.business.phone,
      );
      expect(candidate.metadata.contentManifestDigest).toBe(
        result.contentManifest.digest,
      );
      expect(candidate.metadata.runtimeInstrumentation).toEqual({
        rootAttribute: "data-model-experience",
        rootValue: candidate.metadata.routeId,
      });
    }
  });

  it("limits concurrent model stages to protect the provider in-flight budget", async () => {
    let active = 0;
    let maximumActive = 0;
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        try {
          return safeStage(request);
        } finally {
          active -= 1;
        }
      },
      model: "test/model",
    });

    expect(result.candidates).toHaveLength(3);
    expect(maximumActive).toBeLessThanOrEqual(2);
  });

  it("passes a sealed token manifest and a distinct route brief to every generation stage", async () => {
    const requests: AuthorStageRequest[] = [];
    await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        requests.push(request);
        return safeStage(request);
      },
    });

    expect(requests).toHaveLength(12);
    expect(
      new Set(requests.map((request) => request.route.signature)).size,
    ).toBe(3);
    expect(
      requests.every((request) =>
        request.contentTokens.includes("content.hero.heading"),
      ),
    ).toBe(true);
    expect(
      requests.every((request) =>
        request.rules.includes("Do not hardcode business facts"),
      ),
    ).toBe(true);
    expect(
      requests.every((request) =>
        request.rules.includes("Mark the complete opening hero scene with data-hero"),
      ),
    ).toBe(true);
  });

  it("rejects unsafe imports and network-capable authored code", async () => {
    await expect(
      authorExperienceCandidates({
        site,
        inspirationPack,
        generate: async (request) => {
          const value = safeStage(request);
          if (request.stage === "experience") {
            return { content: `import axios from "axios";\n${value.content}` };
          }
          return value;
        },
      }),
    ).rejects.toThrow(/unapproved import axios/i);
  });

  it("accepts sealed content aliases created by ordinary React destructuring", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "experience") return value;
        return {
          content: String(value.content)
            .replace(
              "export default function Experience({ content, runtime }) {",
              "export default function Experience({ content, runtime }) {\n  const { hero } = content;",
            )
            .replace("content.hero.heading", "hero.heading"),
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
  });

  it("accepts optional chaining and aliased nested content bindings", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "experience") return value;
        return {
          content: String(value.content)
            .replace("content.hero.heading", "content.hero?.heading")
            .replace(
              "export default function Experience({ content, runtime }) {",
              "export default function Experience({ content, runtime }) {\n  const { hero: heroContent } = content;",
            )
            .replace("content.hero.body", "heroContent.body"),
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
  });

  it("accepts the sealed copy heading alias", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "experience") return value;
        return {
          content: String(value.content)
            .replace(
              "export default function Experience({ content, runtime }) {",
              "export default function Experience({ content, runtime }) {\n  const { copy } = content;",
            )
            .replace("content.hero.heading", "copy.heroHeading"),
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
  });

  it("keeps successful sibling candidates when one route fails", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        if (request.route.id === "route-02" && request.stage === "experience")
          throw new Error("simulated route failure");
        return safeStage(request);
      },
    });

    expect(result.candidates).toHaveLength(2);
    expect(result.failures).toEqual([
      expect.objectContaining({
        routeId: "route-02",
        candidateId: "candidate-b",
        stage: "experience",
        name: "Error",
        error: "simulated route failure",
      }),
    ]);
    expect(result.failures[0].diagnostic).toContain(
      "production-experience-author.mjs:",
    );
  });

  it("accepts sealed content destructured in the component parameter", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "experience") return value;
        return {
          content: String(value.content)
            .replace(
              "export default function Experience({ content, runtime }) {",
              "export default function Experience({ content: { hero, services, faqs, brand }, runtime }) {",
            )
            .replaceAll("content.hero.", "hero.")
            .replaceAll("content.services", "services")
            .replaceAll("content.faqs", "faqs")
            .replaceAll("content.brand.", "brand."),
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
  });

  it("allows JavaScript comments but rejects actual remote URLs", async () => {
    const accepted = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "experience") return value;
        return {
          content: `// Preserve route-specific composition.\n${value.content}`,
        };
      },
    });
    expect(accepted.candidates).toHaveLength(3);

    await expect(
      authorExperienceCandidates({
        site,
        inspirationPack,
        generate: async (request) => {
          const value = safeStage(request);
          if (request.stage !== "experience") return value;
          return {
            content: `${value.content}\nconst remote = "https://example.com";`,
          };
        },
      }),
    ).rejects.toThrow(/forbidden remote URL/i);
  });

  it("keeps motion mounting in the deterministic host", async () => {
    await expect(
      authorExperienceCandidates({
        site,
        inspirationPack,
        generate: async (request) => {
          const value = safeStage(request);
          if (request.stage !== "experience") return value;
          return { content: `import "./motion.js";\n${value.content}` };
        },
      }),
    ).rejects.toThrow(/unapproved import \.\/motion\.js/i);
  });

  it("repairs one JSX compliance failure without changing the route", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "experience" || request.validationError)
          return value;
        return {
          content: String(value.content).replace(
            "<p>{content.hero.body}</p>",
            "<p>Award winning campaign</p>",
          ),
        };
      },
    });

    expect(
      result.candidates.every((item) => item.metadata.complianceRepaired),
    ).toBe(true);
  });

  it("retries one malformed structured stage response", async () => {
    const attempts = new Map<string, number>();
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const key = `${request.route.id}:${request.stage}`;
        const attempt = (attempts.get(key) || 0) + 1;
        attempts.set(key, attempt);
        if (request.stage === "contract" && attempt === 1)
          throw new Error("OpenRouter did not return a valid JSON object.");
        return safeStage(request);
      },
    });

    expect(result.candidates).toHaveLength(3);
    expect(
      result.candidates.every((item) => item.metadata.complianceRepaired),
    ).toBe(true);
  });

  it("normalizes em dashes out of authored source before persistence", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage === "styles")
          return {
            content: `${value.content}\n/* route - authored — safely */`,
          };
        return value;
      },
    });

    expect(
      result.candidates.every(
        (item) => !item.files["styles.css"].includes("—"),
      ),
    ).toBe(true);
  });

  it("repairs motion that omits its reduced-motion path", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "motion" || request.validationError) return value;
        return {
          content:
            "export function mountExperienceMotion() { document.body.animate([{ opacity: 0 }, { opacity: 1 }]); return () => {}; }",
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
    expect(
      result.candidates.every((item) => item.metadata.complianceRepaired),
    ).toBe(true);
  });

  it("repairs motion that hides required sections until scroll", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "motion" || request.validationError) return value;
        return {
          content: `export function mountExperienceMotion() {
            const sections = document.querySelectorAll("section");
            gsap.set(sections, { opacity: 0, y: 24 });
            return () => {};
          }
          // prefers-reduced-motion`,
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
    expect(
      result.candidates.every((item) => item.metadata.complianceRepaired),
    ).toBe(true);
  });

  it("repairs motion responses that accidentally contain JSX", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "motion" || request.validationError) return value;
        return {
          content: `import React from "react";\n${value.content}\n<svg />`,
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
    expect(
      result.candidates.every(
        (item) =>
          !item.files["motion.js"].includes("<svg") &&
          item.metadata.complianceRepaired,
      ),
    ).toBe(true);
  });

  it("repairs malformed CSS wrappers and empty image alt attributes", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage === "styles" && !request.validationError)
          return {
            content: `<!doctype html>\n<html><body></body></html>\n${value.content}\n}\n\"\n}`,
          };
        if (request.stage === "experience" && !request.validationError)
          return {
            content: `${value.content}\n<img src={content.hero.image} alt="" />`,
          };
        return value;
      },
    });

    expect(result.candidates).toHaveLength(3);
    expect(
      result.candidates.every((item) => item.metadata.complianceRepaired),
    ).toBe(true);
  });

  it("repairs missing LeadForm content and anchor navigation bindings", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "experience" || request.validationError)
          return value;
        return {
          content: String(value.content)
            .replace(
              "<LeadForm content={content} runtime={runtime} />",
              "<LeadForm runtime={runtime} />",
            )
            .replaceAll('href="#services"', "onClick={() => {}}")
            .replaceAll('href="#faqs"', "onClick={() => {}}")
            .replaceAll('href="#contact"', "onClick={() => {}}"),
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
    expect(
      result.candidates.every((item) => item.metadata.complianceRepaired),
    ).toBe(true);
  });

  it("accepts equivalent static JSX section IDs used by model-authored markup", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "experience") return value;
        return {
          content: String(value.content)
            .replace('id="services"', "id = 'services'")
            .replace('id="faqs"', 'id={"faqs"}')
            .replace('id="contact"', "id={'contact'}"),
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
    expect(
      result.candidates.every((item) => !item.metadata.complianceRepaired),
    ).toBe(true);
  });

  it("repairs helpers with unbound sealed content and wrong runtime imports", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "experience" || request.validationError)
          return value;
        return {
          content: String(value.content)
            .replace(
              'import { LeadForm } from "@launchloom/runtime";',
              'import LeadForm from "@launchloom/runtime";',
            )
            .replace(
              "export default function Experience",
              "function Header() { return <span>{content.brand.name}</span>; }\nexport default function Experience",
            ),
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
    expect(
      result.candidates.every((item) => item.metadata.complianceRepaired),
    ).toBe(true);
  });

  it("uses one final bounded experience repair after a failed repair", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "experience") return value;
        if (!request.validationError)
          return {
            content: String(value.content).replace(
              "<LeadForm content={content} runtime={runtime} />",
              "<LeadForm runtime={runtime} />",
            ),
          };
        if (request.validationError.includes("first repair still failed"))
          return value;
        return {
          content: String(value.content).replace(
            "<LeadForm content={content} runtime={runtime} />",
            "<LeadForm runtime={runtime} />",
          ),
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
  });

  it("rejects authored bundles that bypass sealed business content", async () => {
    await expect(
      authorExperienceCandidates({
        site,
        inspirationPack,
        generate: async (request) => {
          const value = safeStage(request);
          if (request.stage === "experience") {
            return {
              content: String(value.content).replace(
                "<p>{content.hero.body}</p>",
                "<p>Award winning jeweler</p>",
              ),
            };
          }
          return value;
        },
      }),
    ).rejects.toThrow(/unsupported claim literal/i);
  });

  it("generates contextual assets before authored preview and preserves both evidence sets", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/generate-client.yml", import.meta.url),
      "utf8",
    );
    const inspirationIndex = workflow.indexOf(
      "name: Preserve inspiration evidence",
    );
    const authorIndex = workflow.indexOf(
      "name: Author independent experience candidates",
    );
    const repositoryIndex = workflow.indexOf(
      "name: Create private repository and Cloudflare Pages project",
    );

    expect(inspirationIndex).toBeGreaterThan(-1);
    expect(authorIndex).toBeGreaterThan(inspirationIndex);
    expect(repositoryIndex).toBeGreaterThan(inspirationIndex);
    expect(authorIndex).toBeGreaterThan(repositoryIndex);
    expect(
      workflow.indexOf("name: Generate or reuse contextual imagery"),
    ).toBeGreaterThan(repositoryIndex);
    expect(
      workflow.indexOf("name: Generate or reuse contextual imagery"),
    ).toBeLessThan(authorIndex);
    expect(workflow).toContain("name: authored-experiences-${{");
    const seoEvidence = workflow.slice(
      workflow.indexOf("name: Preserve SEO research evidence"),
      workflow.indexOf("name: Preserve inspiration evidence"),
    );
    expect(seoEvidence).toContain("continue-on-error: true");
    const authoredEvidence = workflow.slice(
      workflow.indexOf("name: Preserve authored experience evidence"),
      workflow.indexOf("name: Commit authored experience evidence"),
    );
    expect(authoredEvidence).toContain("continue-on-error: true");
    expect(authoredEvidence).toContain("if-no-files-found: warn");
    expect(workflow).toContain(
      "cp -R /tmp/generated-experiences .launchloom/generated-experiences",
    );
    expect(workflow).toContain("--failure-mode throw");
    expect(workflow).not.toContain("--failure-mode record");
    expect(
      workflow.match(
        /PUBLIC_REVIEW_MODE=true node "\$GITHUB_WORKSPACE\/scripts\/verify-rendered-revision\.mjs"/g,
      ),
    ).toHaveLength(1);
  });

  it("emits route-specific content manifests with independently reproducible digests", async () => {
    const routeSite = {
      ...site,
      creativeAssets: {
        "route-01": {
          hero: "/images/generated/route-01-hero.webp",
          secondary: "/images/generated/route-01-secondary.webp",
          tertiary: "/images/generated/route-01-tertiary.webp",
        },
        "route-02": {
          hero: "/images/generated/route-02-hero.webp",
          secondary: "/images/generated/route-02-secondary.webp",
          tertiary: "/images/generated/route-02-tertiary.webp",
        },
        "route-03": {
          hero: "/images/generated/route-03-hero.webp",
          secondary: "/images/generated/route-03-secondary.webp",
          tertiary: "/images/generated/route-03-tertiary.webp",
        },
      },
    };
    const seen = new Map<string, string>();
    const result = await authorExperienceCandidates({
      site: routeSite,
      inspirationPack,
      generate: async (request) => {
        seen.set(request.route.id, request.contentShape.hero.image);
        return safeStage(request);
      },
    });

    expect(seen.get("route-01")).toBe("/images/generated/route-01-hero.webp");
    expect(seen.get("route-02")).toBe("/images/generated/route-02-hero.webp");
    expect(seen.get("route-03")).toBe("/images/generated/route-03-hero.webp");

    // The digest covers the manifest without its digest field, sorting object
    // keys recursively while retaining array order.
    function sortKeys(value: unknown): unknown {
      if (Array.isArray(value)) return value.map(sortKeys);
      if (value && typeof value === "object")
        return Object.fromEntries(
          Object.entries(value)
            .sort(([left], [right]) =>
              left < right ? -1 : left > right ? 1 : 0,
            )
            .map(([key, item]) => [key, sortKeys(item)]),
        );
      return value;
    }
    function recomputeDigest(manifest: Record<string, unknown>) {
      const { digest: _digest, ...payload } = manifest;
      return createHash("sha256")
        .update(JSON.stringify(sortKeys(payload)))
        .digest("hex");
    }

    expect(result.candidates).toHaveLength(3);
    expect(result.contentManifest.values.hero).toMatchObject({
      image: "",
      secondaryImage: "",
      tertiaryImage: "",
    });
    expect(recomputeDigest(result.contentManifest)).toBe(
      result.contentManifest.digest,
    );
    const digests = new Set<string>();
    for (const candidate of result.candidates) {
      const metadata = JSON.parse(candidate.files["metadata.json"]);
      expect(metadata.contentManifestPath).toBe("content-manifest.json");
      expect(candidate.metadata.contentManifestPath).toBe(
        metadata.contentManifestPath,
      );
      const manifest = JSON.parse(candidate.files["content-manifest.json"]);
      const assets =
        routeSite.creativeAssets[
          metadata.routeId as keyof typeof routeSite.creativeAssets
        ];
      expect(manifest.values).toEqual({
        ...result.contentManifest.values,
        hero: {
          ...result.contentManifest.values.hero,
          image: assets.hero,
          secondaryImage: assets.secondary,
          tertiaryImage: assets.tertiary,
        },
      });
      expect(manifest.tokens).toEqual(result.contentManifest.tokens);
      const recomputed = recomputeDigest(manifest);
      expect(manifest.digest).toBe(recomputed);
      expect(metadata.contentManifestDigest).toBe(recomputed);
      expect(candidate.metadata.contentManifestDigest).toBe(recomputed);
      expect(metadata.creativeManifest.contentManifestDigest).toBe(recomputed);
      expect(
        JSON.parse(candidate.files["contract.json"]).creativeManifest
          .contentManifestDigest,
      ).toBe(recomputed);
      expect(recomputed).not.toBe(result.contentManifest.digest);
      digests.add(recomputed);
    }
    expect(digests.size).toBe(3);
  });
});
