/**
 * Pinned design guidance, aesthetic-neutral UI craft rules, structured repair
 * critique discipline, and the template-adherence contract shared across the
 * copy, creative authoring, and repair lanes.
 *
 * The Anthropic frontend-design skill is retained unchanged in-repo
 * (Apache-2.0; the exact upstream revision, checksums, and adaptation
 * boundaries are recorded in docs/design-guidance/anthropic/frontend-design/README.md).
 * It is read from disk at runtime (never fetched from a moving network URL) so
 * every generation works from a reviewed, versioned copy with provenance.
 *
 * Guidance is scoped by pipeline lane so upstream general advice never fights
 * LaunchLoom's binding contracts:
 * - Upstream copy lane (`generate-site-config.mjs`): receives only the
 *   writing-in-design principles (`frontendDesignCopyGuidanceBlock()`),
 *   constrained to verified client facts.
 * - Creative authoring (`author-production-experiences.mjs`): receives
 *   `TEMPLATE_ADHERENCE_CONTRACT`, a trimmed visual-craft projection of the
 *   pinned skill (`frontendDesignAuthoringGuidanceBlock()` that strips
 *   placeholder-copy invention and free-palette/typeface overrides), and
 *   aesthetic-neutral `INTERFACE_CRAFT_GUIDANCE`.
 * - Creative repair (`creative-repair-loop.mjs`): receives the authoring block
 *   plus structured `REPAIR_CRITIQUE_GUIDANCE`.
 * - Full upstream review copy (`frontendDesignGuidance()` /
 *   `frontendDesignGuidanceBlock()`): remains available for dossier refinement
 *   and provenance verification.
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

const FALLBACK_COPY_GUIDANCE = `Words appear in a design to make it easier to understand and use. Write from the end user's perspective in plain language. Use active voice and consistent action vocabulary from button to confirmation. Keep tone conversational, sentence case, and free of filler; let each written element do one job.`;

let cachedGuidance = null;

/** Read the full pinned upstream guidance once per process. */
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

function stripFrontmatter(markdown) {
  return String(markdown || "")
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/u, "")
    .trim();
}

function extractMarkdownSection(markdown, heading) {
  const normalized = stripFrontmatter(markdown).replace(/\r\n/gu, "\n");
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(
    `(^|\\n)(## ${escaped}\\n[\\s\\S]*?)(?=\\n## |$)`,
    "u",
  );
  const match = normalized.match(pattern);
  return match ? match[2].trim() : "";
}

/**
 * Extract the writing-in-design principles from the pinned review copy.
 * Used by the upstream copy lane (`generate-site-config.mjs`) where visitor
 * copy is actually authored from verified client facts.
 */
export function frontendDesignCopyGuidance() {
  const section = extractMarkdownSection(
    frontendDesignGuidance(),
    "More on writing in design",
  );
  return section || FALLBACK_COPY_GUIDANCE;
}

/**
 * Copy-lane guidance block with provenance and LaunchLoom factual boundaries.
 */
export function frontendDesignCopyGuidanceBlock() {
  return `PINNED WRITING-IN-DESIGN GUIDANCE (COPY LANE)
Source: Anthropic frontend-design skill ("More on writing in design"), Apache-2.0, retained review copy at docs/design-guidance/anthropic/frontend-design/SKILL.md.
LaunchLoom scope: apply these clarity, active-voice, vocabulary-consistency, and anti-filler principles strictly to verified client facts. Never invent placeholder copy, prices, proof, credentials, staff, locations, or outcomes, and never use em dashes.

${frontendDesignCopyGuidance()}`;
}

/**
 * Extract the LaunchLoom-aligned visual-craft excerpt from the pinned review
 * copy for code authoring and repair. Drops sections that conflict with
 * LaunchLoom's binding contracts:
 * - "More on writing in design" and placeholder-copy invention (authoring must
 *   bind sealed content.* tokens only; copy principles live in the copy lane)
 * - Free-palette ("4-6 named hex values") and free-typeface brainstorming
 *   (authoring binds read-only --ll-* palette roles and client --font-* roles)
 * - Studio-lead creative reinvention framing that conflicts with exact
 *   Reference DNA / template adherence
 */
export function frontendDesignAuthoringGuidance() {
  const raw = stripFrontmatter(frontendDesignGuidance()).replace(/\r\n/gu, "\n");
  const withoutWriting = raw.replace(
    /\n*## More on writing in design[\s\S]*$/u,
    "",
  );
  const paragraphs = withoutWriting
    .split(/\n{2,}/u)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => {
      if (block.startsWith("# Frontend Design")) return false;
      if (block.startsWith("Approach this as the design lead")) return false;
      if (block.startsWith("## Ground your designs in the subject matter"))
        return false;
      if (block.startsWith("If the brief does not identify what the product"))
        return false;
      if (block.startsWith("Choose your typefaces deliberately")) return false;
      if (block.startsWith("Consider written content carefully.")) return false;
      if (block.startsWith("Work in two passes.")) return false;
      if (block.startsWith("Then review that plan against the brief"))
        return false;
      return true;
    });
  return paragraphs.length ? paragraphs.join("\n\n") : FALLBACK_GUIDANCE;
}

/**
 * The full pinned upstream review copy with provenance (retained for dossier
 * refinement, review tooling, and provenance verification).
 */
export function frontendDesignGuidanceBlock() {
  return `PINNED FRONTEND-DESIGN GUIDANCE
Source: Anthropic frontend-design skill, Apache-2.0, retained review copy with
the pinned upstream revision recorded in docs/design-guidance/anthropic/frontend-design/README.md.

${frontendDesignGuidance()}`;
}

/**
 * Scoped visual-craft guidance block for authoring and repair prompts.
 * Eliminates contradictions with TEMPLATE_ADHERENCE_CONTRACT, sealed content
 * tokens, and read-only client palette/typography roles.
 */
export function frontendDesignAuthoringGuidanceBlock() {
  return `PINNED FRONTEND-DESIGN GUIDANCE (LAUNCHLOOM AUTHORING SCOPE)
Source: Anthropic frontend-design skill (visual craft and restraint excerpt), Apache-2.0, retained review copy with the pinned upstream revision recorded in docs/design-guidance/anthropic/frontend-design/README.md.
Precedence: TEMPLATE ADHERENCE CONTRACT, assigned Reference DNA, CLIENT PALETTE ROLE CONTRACT, CLIENT TYPOGRAPHY CONTRACT, and sealed content tokens always take precedence. Never author unsealed marketing copy, never override read-only --ll-* or --font-* tokens, and never discard a cream/serif, dark-accent, hairline-rule, uppercase-nav, or card pattern when the assigned reference or client brief explicitly calls for it.

${frontendDesignAuthoringGuidance()}`;
}

/**
 * Aesthetic-neutral UI craft, optical polish, and interaction hygiene rules
 * (synthesized from design-engineering craft standards: concentric radii,
 * optical alignment, typography polish, compositor motion, semantic HTML,
 * focus/touch accessibility, and responsive resilience). Imposes zero house
 * aesthetic so it complements any assigned Reference DNA without drift.
 */
export const INTERFACE_CRAFT_GUIDANCE = `INTERFACE CRAFT AND INTERACTION HYGIENE
Apply these aesthetic-neutral craft rules within the assigned Reference DNA and client palette/typography contracts. They never override reference geometry or contrast-structure rules.

Optical and surface craft:
- Concentric border radii: when a rounded element sits inside a rounded container with padding under 32px, derive inner radius = outer radius - padding (when result > 2px; otherwise keep the inner edge sharp). Never put identical radii on parent and nested child.
- Optical over geometric alignment: visually balance icons paired with text labels, directional chevrons, and asymmetric glyphs rather than relying solely on bounding-box centering.
- Crisp image edges: when framed photographs need subtle separation from a matching surface, use a 1px neutral low-opacity outline (pure black at low alpha on light surfaces, pure white at low alpha on dark surfaces), never a muddy tinted border. Keep shadows offset and soft unless the assigned reference uses crisp hairlines or flat borders. Never add decorative zero-offset colored glows or one-sided accent stripes on rounded boxes unless the reference explicitly uses them.

Typography polish:
- Prevent faux weights/styles with font-synthesis: none; use unitless line-height (roughly 1.05 to 1.2 for display headings, 1.5 to 1.6 for body copy) and clear descending size steps from h1 downward.
- Apply text-wrap: balance on headings and text-wrap: pretty on short descriptions to prevent orphaned final words; use font-variant-numeric: tabular-nums for hours, metrics, counts, and prices.
- Keep form inputs at least 16px on mobile viewports to avoid automatic mobile zoom; tune link underlines with text-underline-offset and text-decoration-skip-ink: auto; style ::selection legibly from the active surface palette.

Motion hygiene:
- Prefer interruptible CSS transitions for interactive state changes (hover, focus, menu/disclosure toggles); reserve keyframes for one-shot sequences.
- Never write transition: all. List explicit compositor-friendly properties (transform, opacity, color, background-color, border-color) with a deliberate deceleration curve (for example cubic-bezier(0.22, 1, 0.36, 1)), not generic linear or ease. Use will-change sparingly on transform/opacity only when needed.
- Where the reference uses filled interactive buttons, a subtle active press response (scale(0.96), never below 0.95) provides crisp tactile feedback; always provide a clean prefers-reduced-motion equivalent that preserves state clarity without motion.

Interaction, form, and layout resilience:
- Use semantic HTML first: <button> for actions, <a href> for navigation, explicit <label> bindings on form controls, aria-label on icon-only controls, and aria-hidden="true" on decorative icons.
- Provide visible :focus-visible rings on every interactive element (never outline: none without a proving replacement; keep rings inset when rounded or overflow-hidden ancestors could clip them) and add scroll-margin-top on anchored sections (#services, #faqs, #contact) so sticky headers never obscure jump targets.
- Keep interactive touch targets at least 44x44px on mobile (at least 40x40px on desktop) without overlapping tap zones.
- Guard against overflow and CLS: put min-w-0 on flex children and overflow-wrap: break-word on long strings, size media containers explicitly (aspect-ratio or width/height) with object-fit: cover, load below-fold images lazily and prioritize above-fold hero media, and handle empty optional arrays/strings cleanly without broken shells.`;

/**
 * Structured repair critique discipline for creative-repair-loop.mjs.
 * Keeps repairs bounded, root-cause driven, and focused on measured defects
 * without concealed redesigns or AI-slop regressions.
 */
export const REPAIR_CRITIQUE_GUIDANCE = `STRUCTURED REPAIR CRITIQUE DISCIPLINE
Repair is targeted refinement, never concealed redesign. Preserve the assigned Reference DNA, visual world, sealed content bindings, and everything outside the measured findings.

Triage order (fix the highest-priority defect classes first within the edit budget):
1. Broken or blocked tasks, contrast-structure failures, unreadable text over media, clipped focus rings, and mobile overflow or hidden actions.
2. Broken or missing interactive states (hover, active, :focus-visible, disclosure toggle, mobile menu open/close) and dead or misrouted links.
3. Assigned Reference DNA drift: hero viewport fit, composition topology, section order, palette/typography role adherence, and mobile recomposition.
4. Craft and visual polish: type scale separation, spacing rhythm, concentric radii, optical alignment, and compositor-only transition hygiene.

Classify each finding before editing and fix at the narrowest correct level:
- missing-token: bind an existing --ll-* surface/palette role or --font-* variable instead of hardcoding a one-off color or stack.
- structural-layout: adjust container geometry, grid/flex flow, viewport cap, or DOM region placement (for example moving text off a surface seam instead of tweaking text color alone).
- reference-drift: restore the assigned Reference DNA composition, hierarchy, image role, or signature mechanic.
- local-craft-defect: fix spacing, radius nesting, focus ring clipping, tap target size, or transition specificity in place.

Apply the exact repair verb each finding requires:
- harden: eliminate contrast seams, clipped focus indicators, horizontal overflow, undersized mobile tap targets, and fragile empty/long-copy layouts.
- align: restore Reference DNA geometry, section rhythm, client palette surfaces, and client font bindings.
- distill: strip unrequested template chrome that conflicts with the reference (generic card walls, nested cards, unrequested eyebrow kickers, decorative 01/02/03 numbering on non-sequences, one-sided accent bars on rounded boxes, zero-offset colored glows, transition: all, and scattered fade-up entrances).
- polish: sharpen display/body hierarchy, optical alignment, concentric radii, underline/selection craft, and interruptible motion transitions.`;

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
 * Combined contract + scoped design guidance + craft rules for prompt injection.
 * Pass `{ mode: "repair" }` in the visual repair loop to include structured
 * repair triage, root-cause classification, and anti-slop critique verbs.
 */
export function designAdherencePromptBlock({ mode = "author" } = {}) {
  const sections = [
    TEMPLATE_ADHERENCE_CONTRACT,
    frontendDesignAuthoringGuidanceBlock(),
    INTERFACE_CRAFT_GUIDANCE,
  ];
  if (mode === "repair") sections.push(REPAIR_CRITIQUE_GUIDANCE);
  return sections.join("\n\n");
}
