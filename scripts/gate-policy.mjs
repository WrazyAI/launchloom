/**
 * Gate failure severity policy.
 *
 * Review previews may carry advisory findings so a usable site is not held
 * back by metadata polish. Every unknown, missing, or malformed finding stays
 * hard. Production publishing stays strict: every finding blocks.
 */

const KNOWN_GATES = new Set(["seo", "rendered", "build"]);

/**
 * Advisory failures are limited to named SEO substance findings. Anything not
 * matched here is hard, including new failure classes and contrast failures
 * the audit can prove.
 */
const ADVISORY_PATTERNS = [
  /^seo: homepage description metadata is missing\.$/u,
  /^seo: LocalBusiness structured data is missing\.$/u,
  /^seo: configured public domain is missing a canonical URL\.$/u,
  /^seo: sitemap\.xml is missing or invalid\.$/u,
  /^seo: sitemap omits approved route \S+/u,
  /^contrast unresolved: /u,
  /: descriptive business-specific title is missing\.$/u,
  /: useful meta description is missing\.$/u,
  /: service or location page is too thin to publish\.$/u,
  /: supported page metadata differs from the brief\.$/u,
  /: unique-title: /u,
  /: unique-description: /u,
  /: open-graph-(?:copy|url|image): /u,
  /: json-ld: /u,
  /: schema-(?:business|context|service|faq|claims): /u,
  /: related-links: /u,
];

/**
 * @param {{gate?: string, message?: unknown}} [failure]
 * @returns {"hard" | "advisory"}
 */
export function classifyGateFailure({ gate, message } = {}) {
  if (!KNOWN_GATES.has(gate)) return "hard";
  if (typeof message !== "string") return "hard";
  const text = message.trim();
  if (!text) return "hard";
  return ADVISORY_PATTERNS.some((pattern) => pattern.test(text))
    ? "advisory"
    : "hard";
}

/**
 * Split a gate's failure list into blocking and advisory findings.
 *
 * Only `review` mode may downgrade a classified advisory finding. Production
 * and any unrecognized mode keep every finding hard.
 *
 * @param {{gate?: string, mode?: string, messages?: unknown[]}} [input]
 * @returns {{hard: string[], advisory: string[], classified: Array<{message: string, severity: "hard" | "advisory"}>}}
 */
export function splitGateFailures({ gate, mode, messages = [] } = {}) {
  const classified = [];
  const seen = new Set();
  for (const entry of Array.isArray(messages) ? messages : []) {
    const message =
      typeof entry === "string" && entry.trim()
        ? entry.trim()
        : "Unclassified gate failure.";
    if (seen.has(message)) continue;
    seen.add(message);
    const severity =
      mode === "review"
        ? classifyGateFailure({ gate, message })
        : "hard";
    classified.push({ message, severity });
  }
  return {
    hard: classified
      .filter((entry) => entry.severity === "hard")
      .map((entry) => entry.message),
    advisory: classified
      .filter((entry) => entry.severity === "advisory")
      .map((entry) => entry.message),
    classified,
  };
}
