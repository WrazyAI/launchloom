import { describe, expect, it } from "vitest";
import {
  classifyGateFailure,
  splitGateFailures,
} from "../scripts/gate-policy.mjs";

describe("gate failure policy", () => {
  const hard = [
    "Private location fields remain in the public site configuration.",
    "/services/plumbing/: rendered route is missing.",
    "/about/: rendered page contains a prohibited em dash.",
    "/: unapproved or omitted route returned content.",
    "/: invalid internal link /bad.",
    "/: unresolved internal link /missing/.",
    "/: unresolved internal anchor /#bad.",
    "/orphan/: rendered route is orphaned.",
    "robots.txt must permit crawling so review noindex is observable and production can be indexed.",
    "SEO release mode must be review or production.",
    "Production origin must be the approved HTTPS Pages hostname.",
    "/: review page is not marked noindex.",
    "/: h1: Exactly one meaningful main H1 must identify the service or locality where applicable.",
    "/: privacy: Known private location fields must not occur anywhere in public HTML.",
    "/: media-asset: Page asset must exist locally or have approved hosted provenance.",
    "/: remnants: No unauthorized placeholder or configured stale identifier may remain in visible copy.",
    "/: distinct-page-substance: Near-duplicate city/service substitution must add route-specific substance.",
    "/missing/: initial-html: Approved route must have a built HTML document.",
    "compact: horizontal overflow of 12px.",
    "desktop: broken fragment links #pricing.",
    "contrast fail: / desktop default body > main (1.200; required 4.5).",
    "desktop: Form lifecycle: submission failed.",
    "desktop: navigation: At least one visible contextual route link navigates.",
    "desktop: one or more configured sections are not visible.",
    "desktop: runtime: No runtime script errors.",
    "seo: robots.txt is missing or invalid.",
    "a brand new gate failure with no policy",
  ];

  const advisory = [
    "seo: homepage description metadata is missing.",
    "seo: LocalBusiness structured data is missing.",
    "seo: configured public domain is missing a canonical URL.",
    "seo: sitemap omits approved route /about/.",
    "/: descriptive business-specific title is missing.",
    "/: useful meta description is missing.",
    "/: service or location page is too thin to publish.",
    "/: supported page metadata differs from the brief.",
    "/: unique-title: duplicate title with /about/.",
    "/: unique-description: duplicate description with /about/.",
    "/: open-graph-copy: Open Graph title and description must match the page metadata.",
    "/: open-graph-url: Open Graph URL must identify this canonical route.",
    "/: open-graph-image: Open Graph image must be absolute HTTPS and an approved page/site asset.",
    "/: json-ld: Every JSON-LD block must parse and contain structured nodes.",
    "/: schema-business: All structured business facts must match the approved identity.",
    "/: schema-context: Schema context and types must be suitable structured records.",
    "/: schema-service: Service schema must identify the requested route and current provider.",
    "/: schema-faq: FAQ schema answers must match supported page questions.",
    "/: schema-claims: Unbound rating, testimonial, credential and price schema claims require explicit supported integration.",
    "/: related-links: Expected relevance-backed related routes must be crawlable.",
    "contrast unresolved: / desktop default body > main (unresolved; required 4.5); foreground unknown, background variable.",
  ];

  it.each(hard)("classifies %s as hard", (message) => {
    expect(classifyGateFailure({ gate: "seo", message })).toBe("hard");
    expect(classifyGateFailure({ gate: "rendered", message })).toBe("hard");
  });

  it.each(advisory)("classifies %s as advisory", (message) => {
    expect(classifyGateFailure({ gate: "seo", message })).toBe("advisory");
    expect(classifyGateFailure({ gate: "rendered", message })).toBe("advisory");
  });

  it("fails closed for missing, empty, or unknown input", () => {
    expect(classifyGateFailure({ gate: "seo", message: "" })).toBe("hard");
    expect(classifyGateFailure({ gate: "seo", message: undefined })).toBe("hard");
    expect(classifyGateFailure({ gate: "unknown", message: advisory[0] })).toBe(
      "hard",
    );
    expect(classifyGateFailure({})).toBe("hard");
  });

  it("splits review findings by severity and keeps production strict", () => {
    const messages = [advisory[0], hard[0], advisory[0]];
    const review = splitGateFailures({
      gate: "seo",
      mode: "review",
      messages,
    });
    expect(review.hard).toEqual([hard[0]]);
    expect(review.advisory).toEqual([advisory[0]]);
    expect(review.classified).toEqual([
      { message: advisory[0], severity: "advisory" },
      { message: hard[0], severity: "hard" },
    ]);
    const production = splitGateFailures({
      gate: "seo",
      mode: "production",
      messages,
    });
    expect(production.hard).toEqual([advisory[0], hard[0]]);
    expect(production.advisory).toEqual([]);
  });

  it("treats an unknown mode as strict", () => {
    const split = splitGateFailures({
      gate: "rendered",
      mode: "preview",
      messages: [advisory[0]],
    });
    expect(split.hard).toEqual([advisory[0]]);
    expect(split.advisory).toEqual([]);
  });
});
