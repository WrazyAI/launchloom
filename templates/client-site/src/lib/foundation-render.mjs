export const FOUNDATION_LEAD_FORM_MARKER = "<!--foundation:lead-form-->";

export const FOUNDATION_EMPTY_IMAGE =
  "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201600%20900%22%3E%3Crect%20width%3D%221600%22%20height%3D%22900%22%20fill%3D%22%23e6ebe0%22%2F%3E%3C%2Fsvg%3E";

const FOUNDATION_COPY = Object.freeze({
  "conversion.body":
    "Tell us about the property and the work you are considering.",
  "hero.secondaryLabel": "See the services",
  "contact.kicker": "Start with the property",
  "contact.body":
    "Share the property address and the work you are considering. The team will confirm coverage and the next useful step.",
  "seasons.heading": "Plan the work around the season.",
  "seasons.body":
    "Seasonal timing depends on the property and local conditions. Confirm the right window during the estimate.",
  "plans.heading": "A clear scope before the first visit.",
  "plans.body":
    "The estimate confirms what is included, what is optional, and what is not part of the visit.",
  "estimate.heading": "Request an estimate for the property.",
  "estimate.body":
    "Share the property size, the services you need, and any photos that help explain the site.",
  "proof.heading": "What the work is built around.",
  "about.heading": "How the work is approached.",
  "about.body":
    "The first conversation covers the property, the work being considered, and the next useful step.",
});

const RAW_SLOTS = new Set(["contact.form"]);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function extractBody(html) {
  const match = String(html || "").match(/<body[^>]*>([\s\S]*)<\/body>/iu);
  return match ? match[1] : String(html || "");
}

function getPath(value, path) {
  let current = value;
  for (const segment of String(path || "").split(".")) {
    if (current === null || current === undefined) return undefined;
    current = current[segment];
  }
  return current;
}

function resolveLicenseValue(manifest, path) {
  if (path === "license.credit") return manifest?.license?.credit;
  if (path === "license.name") return manifest?.license?.name;
  if (path === "license.url") return manifest?.license?.url;
  return undefined;
}

function resolveValue({ content, manifest, path, slot }) {
  if (!path) return FOUNDATION_COPY[slot.id];
  if (path === "contact.form") return FOUNDATION_LEAD_FORM_MARKER;
  const license = resolveLicenseValue(manifest, path);
  if (license !== undefined) return license;
  if (path === "brand.phoneHref") {
    const phone = getPath(content, "brand.phone");
    return phone ? `tel:${String(phone).replace(/[^+\d]/gu, "")}` : "";
  }
  if (path === "brand.emailHref") {
    const email = getPath(content, "brand.email");
    return email ? `mailto:${email}` : "";
  }
  const value = getPath(content, path);
  if (value !== undefined) return value;
  return FOUNDATION_COPY[slot.id];
}

function childPrefix(eachSlot) {
  return `${eachSlot.id.replace(/\.items$/u, ".item")}.`;
}

function childField(contentPath, itemPath) {
  const prefix = `${itemPath}.`;
  return String(contentPath || "").startsWith(prefix)
    ? contentPath.slice(prefix.length)
    : contentPath;
}

function itemValue({ item, field, contentPath, content }) {
  if (field === "image") {
    if (item && typeof item === "object" && item.image) return item.image;
    return content?.hero?.secondaryImage || FOUNDATION_EMPTY_IMAGE;
  }
  if (typeof item === "string") return item;
  const value = getPath(item, field);
  if (value !== undefined) return value;
  if (contentPath === "proof.quote") return "";
  if (contentPath === "proof.attribution") return "";
  return "";
}

function resolveList(content, path) {
  if (path === "proof")
    return (content?.proof || []).map((quote) => ({ quote, attribution: "" }));
  if (path === "process")
    return (content?.process || []).map((description) => ({ description }));
  const value = getPath(content, path);
  return Array.isArray(value) ? value : [];
}

function renderEachBlocks({ html, manifest, content, diagnostics }) {
  let rendered = html;
  const eachSlots = manifest.slots.filter((slot) => slot.kind === "each");
  for (const slot of eachSlots) {
    const start = `<!--foundation:each:${slot.id}-->`;
    const end = `<!--/foundation:each:${slot.id}-->`;
    const pattern = new RegExp(
      `${escapeRegExp(start)}([\\s\\S]*?)${escapeRegExp(end)}`,
      "gu",
    );
    const list = resolveList(content, slot.contentPath);
    const prefix = childPrefix(slot);
    const children = manifest.slots.filter((child) =>
      child.id.startsWith(prefix),
    );
    rendered = rendered.replace(pattern, (_, block) => {
      if (!list.length) return "";
      return list
        .map((item) => {
          let itemHtml = block;
          for (const child of children) {
            const field = childField(child.contentPath, slot.itemPath);
            const value = itemValue({
              item,
              field,
              contentPath: child.contentPath,
              content,
            });
            itemHtml = itemHtml.replaceAll(
              `{{${child.id}}}`,
              child.kind === "image"
                ? escapeHtml(value || FOUNDATION_EMPTY_IMAGE)
                : escapeHtml(value),
            );
          }
          return itemHtml.replace(/\{\{[^}]+\}\}/gu, "");
        })
        .join("");
    });
    if (rendered.includes(start))
      diagnostics.push({
        code: "unclosed-each",
        message: `Foundation repeat block '${slot.id}' is not closed.`,
      });
  }
  return rendered;
}

function buildValues({ manifest, content, diagnostics }) {
  const values = new Map();
  const eachSlots = manifest.slots.filter((slot) => slot.kind === "each");
  const childPrefixes = eachSlots.map(childPrefix);
  for (const slot of manifest.slots) {
    if (slot.kind === "each") continue;
    if (childPrefixes.some((prefix) => slot.id.startsWith(prefix))) continue;
    const value = resolveValue({
      content,
      manifest,
      path: slot.contentPath,
      slot,
    });
    if (
      (value === undefined || value === null || value === "") &&
      slot.kind === "image"
    ) {
      values.set(slot.id, FOUNDATION_EMPTY_IMAGE);
      continue;
    }
    if (
      (value === undefined || value === null || value === "") &&
      slot.required
    ) {
      diagnostics.push({
        code: "missing-required-slot",
        message: `Required foundation slot '${slot.id}' has no sealed content.`,
      });
    }
    if (value !== undefined && value !== null) values.set(slot.id, value);
  }
  values.set("contact.form", FOUNDATION_LEAD_FORM_MARKER);
  return values;
}

export function renderFoundation({ html, manifest, content }) {
  if (!html) throw new Error("Foundation HTML is required.");
  if (!manifest) throw new Error("Foundation manifest is required.");
  const diagnostics = [];
  const body = extractBody(html);
  const values = buildValues({ manifest, content: content || {}, diagnostics });
  let rendered = renderEachBlocks({
    html: body,
    manifest,
    content: content || {},
    diagnostics,
  });
  rendered = rendered.replace(/\{\{([^}]+)\}\}/gu, (_, id) => {
    if (RAW_SLOTS.has(id)) return FOUNDATION_LEAD_FORM_MARKER;
    return escapeHtml(values.get(id) ?? "");
  });
  if (!rendered.includes(FOUNDATION_LEAD_FORM_MARKER))
    diagnostics.push({
      code: "missing-lead-form",
      message: "Foundation HTML has no contact form marker.",
    });
  return { html: rendered, diagnostics };
}
