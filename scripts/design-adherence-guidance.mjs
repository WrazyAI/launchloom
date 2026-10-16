/**
 * Pinned design guidance and the template-adherence contract shared by the
 * creative authoring and repair agents.
 *
 * The Anthropic frontend-design skill is retained in-repo (Apache-2.0; the
 * exact upstream revision, checksums, and adaptation boundaries are recorded
 * in docs/design-guidance/anthropic/frontend-design/README.md). It is read
 * from disk at runtime — never fetched from a moving network URL — so every
 * generation works from a reviewed, versioned copy with provenance.
 *
 * The template-adherence contract states the boundary between adapting the
 * assigned reference design and replacing it with a generic layout. It takes
 * precedence over generic creative reinterpretation: a candidate may adapt
 * copy, branding roles, imagery, and responsive composition, but must preserve
 * the assigned structure, section order, and design mechanics.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** Retained review copy of the upstream frontend-design guidance. */
export const FRONTEND_DESIGN_SKILL_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/design-guidance/anthropic/frontend-design/SKILL.md",
);

const FALLBACK_GUIDANCE = `Design with intentionality. Commit to a clear aesthetic direction instead of default template grammar. Use a deliberate type scale, a considered palette, and real hierarchy. Avoid generic split heroes, card walls, centered editorial openers, and repeated accordion filler. Make one distinctive visual idea carry the page and let everything else support it.`;

let cachedGuidance = null;

/** Read the pinned guidance once per process. */
export function frontendDesignGuidance() {
  if (cachedGuidance !== null) return cachedGuidance;
  try {
    const text = fs.readFileSync(FRONTEND_DESIGN_SKILL_PATH, "utf8").trim();
    cachedGuidance = text || FALLBACK_GUIDANCE;
  } catch {
    cachedGuidance = FALLBACK_GUIDANCE;
  }
  return cachedGuidance;
}

/**
 * The pinned guidance with provenance, ready to embed in a model prompt.
 */
export function frontendDesignGuidanceBlock() {
  return `PINNED FRONTEND-DESIGN GUIDANCE
Source: Anthropic frontend-design skill, Apache-2.0, retained review copy with
the pinned upstream revision recorded in docs/design-guidance/anthropic/frontend-design/README.md.

${frontendDesignGuidance()}`;
}

/**
 * Boundary between adapting the assigned reference design and replacing it.
 * This contract is binding for authoring and repair alike.
 */
export const TEMPLATE_ADHERENCE_CONTRACT = `TEMPLATE ADHERENCE CONTRACT
The assigned Reference DNA, Reference Dossier, and (when present) the route designTemplate are the authoritative template for this route. Adapt within the template; never replace it with a generic layout.

Preserve exactly:
- page structure and section order (data-reference-section markers and their DOM order)
- the declared hero geometry, composition topology, and layout hierarchy
- component relationships and the navigation model
- the reference's visual language: type roles and scale, spacing rhythm, image role and crop behavior, service presentation, interaction primitive
- working behavior: anchors, disclosure, forms, and reduced-motion handling

Adapt freely:
- verified client copy, names, and contact details
- brand colors and typography within the provided palette and typography roles, respecting contrast floors
- client imagery that matches the referenced image role (client assets take precedence)
- responsive recomposition that preserves the design language

Prohibited:
- substituting a familiar generic pattern (split hero, card wall, centered editorial opener, repeated accordion) for the assigned mechanics
- inventing reviews, credentials, prices, guarantees, staff, locations, or outcomes
- copying reference branding, logos, proprietary fonts, or trade dress
- opaque per-line background boxes or painted controls as contrast fixes

Never drift toward a LaunchLoom house style when the assigned reference has a different, deliberate direction.`;

/**
 * Combined guidance + contract block for prompt injection.
 */
export function designAdherencePromptBlock() {
  return `${TEMPLATE_ADHERENCE_CONTRACT}

${frontendDesignGuidanceBlock()}`;
}
