import postcss from "postcss";
import { parseHTML } from "linkedom";

export const FOUNDATION_COLOR_MAP = Object.freeze({
  "#16241a": "var(--ink)",
  "#f2f4ef": "var(--cream)",
  "#2f6b3f": "var(--brand)",
  "#1f4d2c": "var(--brand-surface)",
  "#8bc34a": "var(--accent, #8bc34a)",
  "#f7f9f4": "color-mix(in srgb, var(--cream) 70%, white)",
  "#a3b0a1": "var(--muted)",
  "#eef3e8": "color-mix(in srgb, var(--hero-surface) 60%, white)",
  "#e6ebe0": "var(--hero-surface)",
  "#d8e2d4": "var(--on-brand-surface)",
  "#a8bba6": "var(--on-brand-surface)",
  "#5c6b5c": "var(--ink)",
  "#d5ddcd": "var(--line)",
});

const COLOR_PATTERN = new RegExp(
  Object.keys(FOUNDATION_COLOR_MAP)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("|"),
  "giu",
);

function replaceColors(value) {
  return String(value || "").replace(
    COLOR_PATTERN,
    (match) => FOUNDATION_COLOR_MAP[match.toLowerCase()] || match,
  );
}

export function applyFoundationThemeCss(css) {
  const root = postcss.parse(String(css || ""));
  root.walkDecls((declaration) => {
    if (declaration.prop === "--font-tpl-serif") {
      declaration.value = "var(--font-heading)";
      return;
    }
    if (declaration.prop === "--font-tpl-body") {
      declaration.value = "var(--font-body)";
      return;
    }
    if (COLOR_PATTERN.test(declaration.value))
      declaration.value = replaceColors(declaration.value);
    COLOR_PATTERN.lastIndex = 0;
  });
  return root.toString();
}

export function applyFoundationThemeHtml(html) {
  const { document } = parseHTML(String(html || ""));
  if (!document?.body) return String(html || "");
  const themedAttributes = [
    "style",
    "fill",
    "stroke",
    "stop-color",
    "flood-color",
    "color",
  ];
  for (const element of document.querySelectorAll("*")) {
    for (const attribute of themedAttributes) {
      const value = element.getAttribute(attribute);
      if (!value || !COLOR_PATTERN.test(value)) continue;
      element.setAttribute(attribute, replaceColors(value));
      COLOR_PATTERN.lastIndex = 0;
    }
  }
  return document.toString();
}
