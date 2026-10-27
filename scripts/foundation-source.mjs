import fs from "node:fs";
import path from "node:path";
import { parseHTML } from "linkedom";
import { loadReferenceTemplate } from "./reference-template.mjs";

const REMOTE_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu;
const HTML_FILE = /\.html?$/iu;
const CSS_FILE = /\.css$/iu;
const SCRIPT_FILE = /\.(?:m?js|jsx|ts|tsx)$/iu;
const TEXT_FILE =
  /\.(?:html?|css|m?js|jsx|ts|tsx|json|md|txt|map|xml|webmanifest)$/iu;
const SAFE_REMOVAL_CODES = new Set([
  "remote-base",
  "remote-stylesheet",
  "remote-script",
  "remote-image",
  "remote-form-action",
  "remote-asset",
  "remote-css-url",
  "remote-import",
  "remote-font",
]);
const NETWORK_PRIMITIVE =
  /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/iu;
const ANALYTICS_PRIMITIVE =
  /\b(?:gtag|dataLayer|googletagmanager|google-analytics|fbq|plausible|matomo|segment)\b/iu;

function walk(directory) {
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(
          `Foundation source must not contain a symlink: ${full}.`,
        );
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  visit(directory);
  return files.sort((left, right) => left.localeCompare(right));
}

function isRemote(value) {
  return REMOTE_URL.test(String(value || "").trim());
}

function createBlockerCollector() {
  const blockers = [];
  const seen = new Set();
  return {
    add(code, message, selector) {
      const key = `${code}|${message}|${selector || ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      blockers.push({
        code,
        message,
        ...(selector ? { selector } : {}),
      });
    },
    values() {
      return blockers;
    },
  };
}

function normalizeHtml(html, blockers, { stripAssets = false } = {}) {
  const { document } = parseHTML(html);
  if (!document) throw new Error("Foundation HTML could not be parsed.");

  for (const element of [...document.querySelectorAll("base")]) {
    blockers.add(
      "remote-base",
      "Removed a <base> element because it can rewrite local links.",
      "base",
    );
    element.remove();
  }

  for (const element of [...document.querySelectorAll("link[href]")]) {
    const href = element.getAttribute("href") || "";
    if (!isRemote(href)) continue;
    blockers.add(
      "remote-stylesheet",
      `Removed a remote stylesheet: ${href}`,
      "link[href]",
    );
    element.remove();
  }

  for (const element of [...document.querySelectorAll("script[src]")]) {
    const src = element.getAttribute("src") || "";
    if (!isRemote(src)) continue;
    blockers.add(
      "remote-script",
      `Removed a remote script: ${src}`,
      "script[src]",
    );
    element.remove();
  }

  for (const element of [...document.querySelectorAll("script")]) {
    if (element.getAttribute("src")) continue;
    const source = element.textContent || "";
    if (!NETWORK_PRIMITIVE.test(source) && !ANALYTICS_PRIMITIVE.test(source))
      continue;
    blockers.add(
      "network-script",
      "Removed an inline script with a network, analytics, or tracking primitive.",
      "script",
    );
    element.remove();
  }

  for (const element of [...document.querySelectorAll("img[src]")]) {
    const src = element.getAttribute("src") || "";
    if (!isRemote(src)) continue;
    blockers.add("remote-image", `Removed a remote image: ${src}`, "img[src]");
    element.remove();
  }

  for (const element of [...document.querySelectorAll("[srcset]")]) {
    const srcset = element.getAttribute("srcset") || "";
    if (!isRemote(srcset) && !/https?:\/\//iu.test(srcset)) continue;
    blockers.add(
      "remote-image",
      "Removed a srcset with a remote image candidate.",
      "[srcset]",
    );
    element.removeAttribute("srcset");
  }

  for (const element of [...document.querySelectorAll("form[action]")]) {
    const action = element.getAttribute("action") || "";
    if (!isRemote(action)) continue;
    blockers.add(
      "remote-form-action",
      `Removed a remote form action: ${action}`,
      "form[action]",
    );
    element.removeAttribute("action");
  }

  for (const element of [...document.querySelectorAll("[src]")]) {
    const src = element.getAttribute("src") || "";
    if (!isRemote(src)) continue;
    if (element.localName === "script" || element.localName === "img") continue;
    blockers.add(
      "remote-asset",
      `Removed a remote embedded asset: ${src}`,
      "[src]",
    );
    element.remove();
  }

  for (const element of [...document.querySelectorAll("[style]")]) {
    const style = element.getAttribute("style") || "";
    if (/url\(\s*['"]?(?:https?:)?\/\//iu.test(style)) {
      blockers.add(
        "remote-css-url",
        "Removed a remote CSS url() from an inline style.",
        "[style]",
      );
      element.setAttribute(
        "style",
        style.replace(/url\(\s*(['"]?)(?:https?:)?\/\/[^)]*\1\s*\)/giu, "none"),
      );
      continue;
    }
    if (stripAssets && /url\(\s*['"]?(?!data:)[^)]+\)/iu.test(style)) {
      element.setAttribute(
        "style",
        style.replace(/url\(\s*['"]?(?!data:)[^)]+['"]?\s*\)/giu, "none"),
      );
    }
  }

  return document.toString();
}

function normalizeCss(css, blockers, { stripAssets = false } = {}) {
  let normalized = css;
  if (stripAssets) {
    normalized = normalized.replace(/@font-face\s*\{[^}]*\}/giu, "");
    normalized = normalized.replace(
      /url\(\s*(['"]?)(?!data:)[^)'"]+\1\s*\)/giu,
      "none",
    );
  }
  normalized = normalized.replace(
    /@import\s+(?:url\(\s*)?["']?(?:https?:)?\/\/[^;]+;?/giu,
    () => {
      blockers.add("remote-import", "Removed a remote CSS @import.", "@import");
      return "";
    },
  );
  normalized = normalized.replace(/@font-face\s*\{[^}]*\}/giu, (block) => {
    if (!/url\(\s*['"]?(?:https?:)?\/\//iu.test(block)) return block;
    blockers.add(
      "remote-font",
      "Removed a remote @font-face source.",
      "@font-face",
    );
    return "";
  });
  normalized = normalized.replace(
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
  return normalized;
}

function normalizeScript(source, blockers) {
  let normalized = source.replace(
    /(?:import|export)\s+[^;]*?from\s+["'](?:https?:)?\/\/[^"']+["'];?/giu,
    () => {
      blockers.add(
        "remote-import",
        "Removed a remote JavaScript import.",
        "import",
      );
      return "";
    },
  );
  if (
    NETWORK_PRIMITIVE.test(normalized) ||
    ANALYTICS_PRIMITIVE.test(normalized)
  ) {
    blockers.add(
      "network-script",
      "Foundation script contains a network, analytics, or tracking primitive; the foundation needs adaptation.",
      "script",
    );
  }
  return normalized;
}

export { SAFE_REMOVAL_CODES };

export function normalizeFoundationSource({
  repositoryRoot = process.cwd(),
  dossierPath,
  outputDirectory,
  copyAssets = true,
}) {
  const template = loadReferenceTemplate(dossierPath, { repositoryRoot });
  if (!template) {
    throw new Error(
      `No extracted reference template found for '${dossierPath}'.`,
    );
  }
  if (template.status !== "extracted") {
    throw new Error(
      `Reference template '${dossierPath}' is ${template.status}: ${template.reason || "no reason recorded"}.`,
    );
  }
  const sourceRoot = path.join(template.absoluteDirectory, "source");
  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
    throw new Error(
      `Reference template '${dossierPath}' has no source directory at ${sourceRoot}.`,
    );
  }
  const targetSource = path.join(outputDirectory, "source");
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.rmSync(targetSource, { recursive: true, force: true });
  fs.cpSync(sourceRoot, targetSource, {
    recursive: true,
    filter: (source) => {
      if (fs.statSync(source).isDirectory()) return true;
      return copyAssets || TEXT_FILE.test(source);
    },
  });

  const blockers = createBlockerCollector();
  const sourceFiles = walk(sourceRoot);
  const files = walk(targetSource);
  for (const file of files) {
    const relative = path
      .relative(targetSource, file)
      .replaceAll(path.sep, "/");
    if (HTML_FILE.test(file)) {
      fs.writeFileSync(
        file,
        normalizeHtml(fs.readFileSync(file, "utf8"), blockers, {
          stripAssets: !copyAssets,
        }),
      );
      continue;
    }
    if (CSS_FILE.test(file)) {
      fs.writeFileSync(
        file,
        normalizeCss(fs.readFileSync(file, "utf8"), blockers, {
          stripAssets: !copyAssets,
        }),
      );
      continue;
    }
    if (SCRIPT_FILE.test(file)) {
      fs.writeFileSync(
        file,
        normalizeScript(fs.readFileSync(file, "utf8"), blockers),
      );
      continue;
    }
    if (relative.startsWith(".")) continue;
  }

  const assets = sourceFiles
    .filter((file) => !TEXT_FILE.test(file))
    .map((file) => {
      const relative = path
        .relative(sourceRoot, file)
        .replaceAll(path.sep, "/");
      return {
        source: relative,
        target: `template/source/${relative}`,
        role: "reference-only",
        required: false,
      };
    });

  const values = blockers.values();
  const removals = values.filter((blocker) =>
    SAFE_REMOVAL_CODES.has(blocker.code),
  );
  const adaptationBlockers = values.filter(
    (blocker) => !SAFE_REMOVAL_CODES.has(blocker.code),
  );
  return {
    template,
    sourceDigest: template.digest,
    sourceRoot: targetSource,
    files: files.map((file) =>
      path.relative(targetSource, file).replaceAll(path.sep, "/"),
    ),
    assets,
    blockers: adaptationBlockers,
    removals,
    compatibility: adaptationBlockers.length
      ? "needs-adaptation"
      : "renderable",
  };
}
