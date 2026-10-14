import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const START = "<!-- launchloom:design-guidance:start -->";
const END = "<!-- launchloom:design-guidance:end -->";

// Schematics express existing curated topology, not newly measured source pixels.
const LAYOUTS = {
  "media-overlay": [
    "[ navigation ]\n[ media field: copy + action over image ]",
    "Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop or a local contrast plate/scrim; do not move copy outside the image to fix contrast.",
  ],
  "split-media": [
    "[ navigation ]\n[ copy + action | separate media field ]",
    "Keep copy and the focal media region as distinct adjacent fields on desktop. Match their hierarchy and relative occupancy to the capture; do not default to equal-width columns, a boxed copy card or centered copy over the focal subject. The original observations clarify any background image extending beyond its focal region.",
  ],
  "utility-panel": [
    "[ navigation ]\n[ promise / media | actionable task panel ]",
    "The task panel is part of the opening, not a decorative proof card. Preserve the assigned task and its visible controls; use the host's single-form placement contract when this is a lead-form panel.",
  ],
  "image-led-stage": [
    "[ navigation ]\n[ dominant media stage ]\n[ supporting promise + action ]",
    "Let the media lead the opening. Keep supporting copy subordinate and maintain the source's visual pause before the next chapter; do not substitute equal-weight text/image columns.",
  ],
  "type-led-statement": [
    "[ navigation ]\n[ dominant typographic statement ]\n[ supporting detail + action ]",
    "Typography carries the opening. Preserve scale contrast and deliberate line breaks; do not add a stock-photo hero merely because image tokens exist.",
  ],
  "editorial-stack": [
    "[ navigation ]\n[ copy + action ]\n[ distinct media chapter ]",
    "Keep the vertical copy/media relationship and chapter boundaries. Do not collapse the stacked narrative into a conventional split hero.",
  ],
  "modular-image-field": [
    "[ navigation ]\n[ promise + coordinated media windows ]",
    "Treat the image windows as one coordinated composition with distinct crops and spatial hierarchy, not as an interchangeable card grid.",
  ],
};

// Source-specific ordering from retained observations/captures. These clarify
// coarse topology labels without changing the curated manifest or measurements.
const PHOTO_FIRST = [
  "[ navigation ]\n[ uncaptioned photograph ]\n[ promise + work action in a separate band ]",
  "The photograph precedes the promise and work action in their separate band. Preserve those chapter boundaries and fit the adapted opening within the host viewport contract; do not reverse the recorded order.",
];
const HYBRID_COVER = [
  "[ framed navigation ]\n[ asymmetric cover: overlapping copy + media ]\n[ distinct search or verified enquiry surface ]",
  "Preserve the off-center copy/media overlap within the cover and the separate action surface that immediately follows it. At mobile widths reduce the cover and stack controls after it. The coarse editorial-stack label is not a direction to detach copy from its cover or erase the recorded hybrid overlap.",
];
const SOURCE_LAYOUTS = {
  "html5up-home-care-story": {
    mobile: [
      "[ navigation ]\n[ hero photograph ]\n[ copy + action ]",
      "On mobile the hero photograph comes before the copy and action, then spotlight chapters stack image before text. Preserve the distinct media chapter and story-led reading order rather than reversing them.",
    ],
  },
  "web-accounting-goodman-jones": {
    desktop: [
      "[ navigation ]\n[ dominant skyline media: promise + specialist action inside ]\n[ separate firm-introduction chapter ]",
      "Keep the promise and specialist action inside the opening media panel, subordinate to its dominant image. Preserve the pause before the separate firm introduction; do not move the opening action into a later detached text block.",
    ],
  },
  "lapa-mesh-architects-editorial": {
    desktop: [
      "[ navigation ]\n[ graphic/media introduction ]\n[ editorial statement + action ]",
      "The introductory graphic/media scene precedes the type-led editorial statement. Preserve that recorded order rather than making the statement the first scene. Adapt the introductory scene's height so the complete opening promise and action still meet the host viewport-fit contract; do not copy a full-page capture's height as CSS vh.",
    ],
  },
  "web-architecture-simpson-studio": {
    desktop: PHOTO_FIRST,
    mobile: PHOTO_FIRST,
  },
  "web-real-estate-stoebe-boutique-listings": {
    desktop: HYBRID_COVER,
    mobile: HYBRID_COVER,
  },
  "web-homeservices-roto-rooter": {
    mobile: [
      "[ utility navigation ]\n[ trade media + promise ]\n[ full-width contact finder + action ]",
      "At 390px stack the trade-media opening above the contact finder and preserve the visible call route. Keep any recorded copy/media overlap within that opening, but do not keep the desktop image/finder fields in side-by-side columns. The coarse split-media label does not override the documented mobile stack.",
    ],
  },
};

const clean = (value) =>
  String(value || "")
    .replaceAll("—", ", ")
    .trim()
    .replace(/\.+$/u, "");
const list = (value) =>
  (Array.isArray(value) ? value : []).map(clean).filter(Boolean);

function schematic(topology, kind, dossierId) {
  const mode = kind === "mobile" ? topology.mobileHero : topology.hero;
  const relation =
    kind === "mobile" ? topology.mobileMediaRelation : topology.mediaRelation;
  const layout = SOURCE_LAYOUTS[dossierId]?.[kind] || LAYOUTS[mode];
  if (!layout)
    return `**${kind}:** no normalized opening topology is recorded. Read the paired capture and the original hierarchy/mobile notes before drawing this viewport's wireframe. Do not infer a split hero from the absence of a label.`;
  return `**${kind}: ${mode} / ${relation || "consult recorded geometry"}**\n\n\`\`\`text\n${layout[0]}\n\`\`\`\n\n${layout[1]}`;
}

export function designGuidanceBlock(manifest) {
  const dna = manifest.referenceDna || {};
  const topology = dna.compositionTopology || {};
  const evidence = manifest.evidence || {};
  const sequence = list(dna.sectionSequence);
  const signatures = (dna.requiredSignatureElements || []).map(
    (signature) =>
      `- **${clean(signature.id)}** (${clean(signature.selector)}): ${clean(signature.description)}. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.`,
  );
  const capture = (kind) => {
    const item = evidence[kind] || {};
    const viewport =
      item.viewport || manifest.provenance?.[`${kind}Viewport`] || {};
    return `${kind}: \`${item.path || `screenshots/${kind}.png`}\`, captured viewport ${viewport.width || "unrecorded"} x ${viewport.height || "unrecorded"}`;
  };
  return `${START}

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at \`docs/design-guidance/anthropic/frontend-design/SKILL.md\`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **${clean(manifest.referenceName)}**; family: \`${clean(manifest.familyId)}\`; subject fit: ${list(manifest.businessKinds).join(", ")}. ${manifest.productionEligible ? "Production eligibility is unchanged." : "Archive-only: this refinement does not authorize production selection."}
- Open the paired full-page captures: ${capture("desktop")}; ${capture("mobile")}. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

${schematic(topology, "desktop", manifest.id)}

${schematic(topology, "mobile", manifest.id)}

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.${topology.confidence === "medium" ? ` The existing topology is medium-confidence: ${clean(topology.note || "inspect the documented hybrid composition before applying the label rigidly")}.` : ""}

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

${sequence.map((section, index) => `${index + 1}. **${section}**${manifest.id === "web-veterinary-modern-animal" && ["membership plan", "care team and app"].includes(section) ? " (only if verified for the client; these offerings are optional, otherwise use verified care or process information in this chapter role)" : ""}`).join("\n")}

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to \`#services\`, questions to \`#faqs\`, and the next step to \`#contact\` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: ${clean(dna.typography?.display)}. Body character: ${clean(dna.typography?.body)}. Hierarchy: ${clean(dna.typography?.scale)}. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: ${list(dna.palette?.surfaces).join("; ")}. Contrast intent: ${clean(dna.palette?.contrastIntent)}. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: ${clean(dna.imageTreatment?.mode)}. Crop guidance: ${clean(dna.imageTreatment?.crop)}. Focal role: ${clean(dna.imageTreatment?.focalPoint)}. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: ${clean(dna.servicePresentation?.pattern)}. Early action: ${clean(dna.ctaPlacement?.early)}. Primary placement: ${clean(dna.ctaPlacement?.primary)}. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **${clean(dna.mobileRecomposition?.strategy)}**. ${list(dna.mobileRecomposition?.rules).join("; ")}.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: ${clean(dna.motion?.primitive)}. Reduced-motion contract: ${clean(dna.motion?.reducedMotion)}. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

${signatures.join("\n")}

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

${END}`;
}

export function refineDesignPrompt(prompt, manifest) {
  const start = prompt.indexOf(START);
  const end = prompt.indexOf(END);
  if (
    (start === -1) !== (end === -1) ||
    (start !== -1 &&
      (end < start ||
        prompt.indexOf(START, start + START.length) !== -1 ||
        prompt.indexOf(END, end + END.length) !== -1))
  )
    throw new Error(`Malformed design guidance boundaries for ${manifest.id}.`);
  const block = designGuidanceBlock(manifest);
  const refined =
    start === -1
      ? `${prompt.trimEnd()}\n\n${block}\n`
      : `${prompt.slice(0, start)}${block}${prompt.slice(end + END.length)}`;
  if (refined.trim().length > 18_000)
    throw new Error(
      `Refined prompt for ${manifest.id} exceeds the dossier budget.`,
    );
  return refined;
}

function main() {
  const root = path.resolve(import.meta.dirname, "..");
  const directory = path.join(root, "data/reference-library/dossiers");
  const write = process.argv.includes("--write");
  const updates = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const folder = path.join(directory, entry.name);
      const manifest = JSON.parse(
        fs.readFileSync(path.join(folder, "manifest.json"), "utf8"),
      );
      const promptPath = path.join(folder, "design-prompt.md");
      const original = fs.readFileSync(promptPath, "utf8");
      return {
        promptPath,
        original,
        refined: refineDesignPrompt(original, manifest),
      };
    });
  // Validate every budget before any writes; rerunning preserves hand-authored observations.
  for (const update of updates)
    if (write && update.original !== update.refined)
      fs.writeFileSync(update.promptPath, update.refined);
  console.log(
    `Design briefs: ${updates.length}; changed: ${updates.filter((item) => item.original !== item.refined).length}; write: ${write}.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  main();
