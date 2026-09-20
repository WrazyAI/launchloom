import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  authorExperienceCandidates,
  type AuthorStageRequest,
} from "../scripts/production-experience-author.mjs";

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
import { mountExperienceMotion } from "./motion.js";
import { LeadForm } from "@launchloom/runtime";
export default function Experience({ content, runtime }) {
  React.useEffect(() => mountExperienceMotion(runtime), [runtime]);
  return <div data-model-experience="${request.route.id}">
    <nav aria-label="Main navigation"><a href="#services">Services</a><a href="#faqs">FAQs</a><a href="#contact">Contact</a></nav>
    <main><section data-hero><h1>{content.hero.heading}</h1><p>{content.hero.body}</p><button data-early-conversion>{content.hero.primaryLabel}</button></section>
    <section id="services">{content.services.map((service) => <article key={service.name}><h2>{service.name}</h2><p>{service.description}</p></article>)}</section>
    <section id="faqs">{content.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</section>
    <section id="contact"><LeadForm content={content} runtime={runtime} data-runtime="lead-form" /><a href={content.contact.phoneHref}>{content.contact.phoneLabel}</a></section></main>
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
    for (const candidate of result.candidates) {
      expect(Object.keys(candidate.files).sort()).toEqual([
        "Experience.jsx",
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
              "export default function Experience({ content: { hero, services, faqs, contact }, runtime }) {",
            )
            .replaceAll("content.hero.", "hero.")
            .replaceAll("content.services", "services")
            .replaceAll("content.faqs", "faqs")
            .replaceAll("content.contact.", "contact."),
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

  it("generates contextual assets before shadow authorship and preserves both evidence sets", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/generate-client.yml", import.meta.url),
      "utf8",
    );
    const inspirationIndex = workflow.indexOf(
      "name: Preserve inspiration evidence",
    );
    const authorIndex = workflow.indexOf(
      "name: Author Phase 2 experience candidates in shadow mode",
    );
    const repositoryIndex = workflow.indexOf(
      "name: Create private repository and Cloudflare Pages project",
    );

    expect(inspirationIndex).toBeGreaterThan(-1);
    expect(authorIndex).toBeGreaterThan(inspirationIndex);
    expect(repositoryIndex).toBeGreaterThan(inspirationIndex);
    expect(authorIndex).toBeGreaterThan(repositoryIndex);
    expect(workflow.indexOf("name: Generate or reuse contextual imagery")).toBeGreaterThan(repositoryIndex);
    expect(workflow.indexOf("name: Generate or reuse contextual imagery")).toBeLessThan(authorIndex);
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
    expect(
      workflow.match(
        /PUBLIC_REVIEW_MODE=true node "\$GITHUB_WORKSPACE\/scripts\/verify-rendered-revision\.mjs"/g,
      ),
    ).toHaveLength(2);
  });
});
