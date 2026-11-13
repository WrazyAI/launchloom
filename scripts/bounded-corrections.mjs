/**
 * Managed contrast-correction blocks.
 *
 * The rendered contrast pass appends deterministic CSS rules that correct the
 * colours it measured. Those rules are machine-generated and fully removable, so
 * they must never count against the authored source limits: the repair model
 * rewrites the authored stylesheet, not the corrections derived from the last
 * render. Keeping the markers and the strip logic here lets both the contrast
 * sweep and the source validator agree without loading Playwright.
 */

export const BOUNDED_CORRECTIONS_START =
  "/* launchloom: bounded rendered contrast corrections */";
export const BOUNDED_CORRECTIONS_END =
  "/* launchloom: end bounded rendered contrast corrections */";

// Generated corrections are single-line rules with these exact signatures;
// anything else that follows a legacy marker is authored CSS and is preserved.
const GENERATED_RULE_SIGNATURES = [
  "{--ll-creative-auto-text:#",
  "{outline:2px solid #",
  "position:relative!important;z-index:3!important;background-color:#",
  "content:none!important;}",
];

/** Remove every managed corrections block (delimited or legacy undelimited)
 * while preserving authored CSS anywhere in the file. */
export function stripBoundedCorrections(existing) {
  let text = String(existing ?? "");
  let guard = 0;
  while (guard++ < 200) {
    const start = text.indexOf(BOUNDED_CORRECTIONS_START);
    if (start === -1) break;
    const end = text.indexOf(BOUNDED_CORRECTIONS_END, start);
    if (end !== -1) {
      text =
        text.slice(0, start) + text.slice(end + BOUNDED_CORRECTIONS_END.length);
      continue;
    }
    // Legacy undelimited block: the marker line plus the contiguous generated
    // rule lines that follow it are managed content; authored CSS stops the
    // scan and is preserved.
    const lines = text
      .slice(start + BOUNDED_CORRECTIONS_START.length)
      .split("\n");
    let consumed = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "") {
        consumed += 1;
        continue;
      }
      const generated =
        trimmed.endsWith("}") &&
        GENERATED_RULE_SIGNATURES.some((signature) =>
          trimmed.includes(signature),
        );
      if (!generated) break;
      consumed += 1;
    }
    text = text.slice(0, start) + lines.slice(consumed).join("\n");
  }
  return text.replace(/\n{3,}/g, "\n\n").trimEnd();
}

/** Rewrite the managed corrections block in place so repeated passes and
 * repeated runs never append duplicate or obsolete rules, and authored CSS
 * before or after the block is always preserved. */
export function withBoundedCorrections(existing, css) {
  const base = stripBoundedCorrections(existing);
  return base ? `${base}\n${css}` : String(css).trimStart();
}
