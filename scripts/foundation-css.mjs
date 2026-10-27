import postcss from "postcss";

const REMOTE_URL = /(?:https?:)?\/\//iu;

function createBlockerCollector() {
  const blockers = [];
  const seen = new Set();
  return {
    add(code, message, selector) {
      const key = `${code}|${message}|${selector || ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      blockers.push({ code, message, ...(selector ? { selector } : {}) });
    },
    values() {
      return blockers;
    },
  };
}

function scopeSelector(selector, rootSelector) {
  const trimmed = String(selector || "").trim();
  if (!trimmed) return trimmed;
  if (
    trimmed === rootSelector ||
    trimmed.startsWith(`${rootSelector} `) ||
    trimmed.startsWith(`${rootSelector}:`) ||
    trimmed.startsWith(`${rootSelector}.`) ||
    trimmed.startsWith(`${rootSelector}[`)
  )
    return trimmed;
  if (trimmed === ":root" || trimmed === "html" || trimmed === "body")
    return rootSelector;
  if (trimmed === "*") return `${rootSelector} *`;
  if (trimmed === "::before" || trimmed === "::after")
    return `${rootSelector}${trimmed}`;
  if (/^(?:html|body)\b/iu.test(trimmed))
    return trimmed.replace(/^(?:html|body)\b/iu, rootSelector);
  if (/^:root\b/iu.test(trimmed))
    return trimmed.replace(/^:root\b/iu, rootSelector);
  return `${rootSelector} ${trimmed}`;
}

function removeRemoteUrls(value, blockers) {
  return String(value || "").replace(
    /url\(\s*(['"]?)(?:https?:)?\/\/[^)'"]*\1\s*\)/giu,
    () => {
      blockers.add(
        "remote-css-url",
        "Removed a remote CSS url() resource.",
        "url()",
      );
      return "none";
    },
  );
}

export function scopeFoundationCss(
  css,
  { rootSelector = ".xp-foundation" } = {},
) {
  if (typeof css !== "string")
    throw new Error("Foundation CSS must be a string.");
  const blockers = createBlockerCollector();
  const root = postcss.parse(css);

  root.walkAtRules("import", (atRule) => {
    if (!REMOTE_URL.test(atRule.params)) return;
    blockers.add("remote-import", "Removed a remote CSS @import.", "@import");
    atRule.remove();
  });

  root.walkAtRules("font-face", (atRule) => {
    let remote = false;
    atRule.walkDecls((declaration) => {
      if (REMOTE_URL.test(declaration.value)) remote = true;
    });
    if (!remote) return;
    blockers.add(
      "remote-font",
      "Removed a remote @font-face source.",
      "@font-face",
    );
    atRule.remove();
  });

  root.walkDecls((declaration) => {
    if (!REMOTE_URL.test(declaration.value)) return;
    declaration.value = removeRemoteUrls(declaration.value, blockers);
  });

  root.walkAtRules("layer", (atRule) => {
    if (!atRule.nodes || atRule.nodes.length === 0) {
      atRule.remove();
      return;
    }
    atRule.replaceWith(...atRule.nodes);
  });

  root.walkRules((rule) => {
    const parent = rule.parent;
    if (
      parent?.type === "atrule" &&
      /^(?:-\w+-)?keyframes$/iu.test(parent.name)
    )
      return;
    const selectors = [
      ...new Set(
        rule.selectors.map((selector) => scopeSelector(selector, rootSelector)),
      ),
    ];
    rule.selectors = selectors;
  });

  return {
    css: root.toString(),
    blockers: blockers.values(),
    compatibility: blockers.values().length ? "needs-adaptation" : "renderable",
  };
}
