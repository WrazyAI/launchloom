import fs from "node:fs";
import path from "node:path";
import { parseHTML } from "linkedom";

const HANDLER_ATTRIBUTES = Object.freeze([
  "onclick",
  "onchange",
  "oninput",
  "onsubmit",
  "onkeydown",
  "onkeyup",
  "onfocus",
  "onblur",
  "onload",
]);

const UNSAFE_SOURCE =
  /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|eval|Function|import)\s*\(|\bdocument\.cookie\b|\b(?:localStorage|sessionStorage)\b|\b(?:window|top|parent)\.location\b|\blocation\.href\b|javascript:/iu;

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

function isRemote(value) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(String(value || "").trim());
}

function buildScript(actions) {
  if (!actions.length) return "";
  const entries = actions
    .map(
      (action) =>
        `${JSON.stringify(action.id)}: { event: ${JSON.stringify(action.event)}, handler: function (event) {\n${action.source}\n} }`,
    )
    .join(",\n");
  return `(() => {
  const actions = {
${entries}
  };
  const bind = () => {
    for (const [id, action] of Object.entries(actions)) {
      for (const element of document.querySelectorAll(\`[data-foundation-action="\${id}"]\`)) {
        if (action.event === "load") {
          action.handler.call(element);
          continue;
        }
        element.addEventListener(action.event, (event) => {
          if (action.handler.call(element, event) === false) event.preventDefault();
        });
      }
    }
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})();
`;
}

export function extractFoundationInteractions({
  html,
  sourceDirectory,
  rootSelector = ".xp-foundation",
}) {
  const { document } = parseHTML(html);
  if (!document?.body) throw new Error("Foundation HTML has no body.");
  const blockers = createBlockerCollector();
  const actions = [];
  let actionIndex = 0;

  const addAction = (element, event, source, selector) => {
    if (UNSAFE_SOURCE.test(source)) {
      blockers.add(
        "network-handler",
        "Removed an inline event handler with a network, storage, navigation, or dynamic-code primitive.",
        selector,
      );
      return;
    }
    const id = `action-${++actionIndex}`;
    element.setAttribute("data-foundation-action", id);
    actions.push({ id, event, source });
  };

  for (const element of [...document.querySelectorAll("*")]) {
    for (const attribute of HANDLER_ATTRIBUTES) {
      const source = element.getAttribute(attribute);
      if (source === null || source === undefined) continue;
      element.removeAttribute(attribute);
      const event = attribute.slice(2);
      addAction(element, event, source, `${element.localName}[${attribute}]`);
    }
  }

  for (const script of [...document.querySelectorAll("script")]) {
    const src = script.getAttribute("src");
    if (!src) {
      const source = script.textContent || "";
      if (!source.trim()) {
        script.remove();
        continue;
      }
      if (UNSAFE_SOURCE.test(source)) {
        blockers.add(
          "network-script",
          "Removed an inline script with a network, storage, navigation, or dynamic-code primitive.",
          "script",
        );
        script.remove();
        continue;
      }
      actions.push({
        id: `inline-${++actionIndex}`,
        event: "load",
        source,
      });
      script.remove();
      continue;
    }
    if (isRemote(src)) {
      blockers.add(
        "network-script",
        `Removed a remote script: ${src}`,
        "script[src]",
      );
      script.remove();
      continue;
    }
    const sourceRoot = path.resolve(sourceDirectory);
    const resolved = path.resolve(sourceRoot, src);
    if (
      resolved !== sourceRoot &&
      !resolved.startsWith(`${sourceRoot}${path.sep}`)
    ) {
      blockers.add(
        "unsafe-script-path",
        `Removed a script path that escapes the foundation source: ${src}`,
        "script[src]",
      );
      script.remove();
      continue;
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      blockers.add(
        "missing-script",
        `Removed a missing local script: ${src}`,
        "script[src]",
      );
      script.remove();
      continue;
    }
    const source = fs.readFileSync(resolved, "utf8");
    if (UNSAFE_SOURCE.test(source)) {
      blockers.add(
        "network-script",
        `Removed a local script with a network, storage, navigation, or dynamic-code primitive: ${src}`,
        "script[src]",
      );
      script.remove();
    }
  }

  const script = buildScript(actions);
  const values = blockers.values();
  return {
    html: document.toString(),
    script,
    actions,
    interactions: actions.map((action) => ({
      id: action.id,
      source: `[data-foundation-action="${action.id}"]`,
      primitive: action.event === "load" ? "local-script" : "native-event",
      reducedMotion: "static equivalent remains available",
    })),
    blockers: values,
    compatibility: values.length ? "needs-adaptation" : "renderable",
    rootSelector,
  };
}
