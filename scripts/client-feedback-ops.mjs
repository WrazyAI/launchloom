const categories = new Map([
  ["logo", "logo"],
  ["photos", "photos"],
  ["business photos", "photos"],
  ["style", "style"],
  ["font/style", "style"],
  ["font or styling", "style"],
  ["color", "color"],
  ["colour", "color"],
  ["text", "text"],
  ["text/factual correction", "text"],
  ["text or factual correction", "text"],
  ["contact", "contact"],
  ["contact details", "contact"],
  ["other-small", "other-small"],
  ["other small change", "other-small"],
]);

const typography = new Set([
  "editorial", "sans", "strong", "refined-serif", "humanist", "geometric",
  "heritage", "modern-serif", "industrial", "condensed", "soft-sans",
]);
const density = new Set(["compact", "balanced", "spacious"]);
const clean = (value, limit = 500) => String(value ?? "")
  .replace(/\u0000/gu, "")
  .replace(/—/gu, "-")
  .trim()
  .slice(0, limit);

function categoryAndNote(value) {
  const match = String(value || "").match(/^\s*\[([^\]]+)\]\s*([\s\S]*)$/u);
  if (!match) return { category: "", note: String(value || "").trim() };
  return {
    category: categories.get(match[1].trim().toLocaleLowerCase()) || "",
    note: match[2].trim(),
  };
}

function replacementAsset(note) {
  const match = note.match(/^Replacement asset:\s*(https:\/\/\S+)\s*\n+/iu);
  if (!match) return { url: "", note };
  try {
    const url = new URL(match[1]);
    if (url.hostname !== "assets.launchloom.wrazyos.com" ||
        !url.pathname.startsWith("/client-replacements/") ||
        url.username || url.password || url.search || url.hash)
      return { url: "", note };
    return { url: url.href, note: note.slice(match[0].length).trim() };
  } catch {
    return { url: "", note };
  }
}

function accessibleText(hex) {
  const channels = hex.slice(1).match(/.{2}/gu).map((part) => parseInt(part, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  const contrast = (first, second) => (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  return contrast(luminance, 1) >= contrast(luminance, 0.01) ? "#ffffff" : "#10251f";
}

function exactTextReplacement(config, note) {
  const match = note.match(/\b(?:replace|change)\s+(?:the\s+)?(?:exact\s+)?text\s+["“]([^"”]{1,240})["”]\s+(?:with|to)\s+["“]([^"”]{1,500})["”]/iu) ||
    note.match(/\b(?:replace|change)\s+["“]([^"”]{1,240})["”]\s+(?:with|to)\s+["“]([^"”]{1,500})["”]/iu);
  if (!match) return null;
  const [oldValue, newValue] = [match[1], clean(match[2], 500)];
  if (!newValue) return null;
  const targets = [];
  const add = (owner, key, path) => {
    if (typeof owner?.[key] === "string") targets.push({ owner, key, path });
  };
  for (const [key, value] of Object.entries(config.copy || {}))
    if (typeof value === "string") add(config.copy, key, `copy.${key}`);
  for (const [index, service] of (config.services || []).entries())
    add(service, "description", `services[${index}].description`);
  for (const [index, value] of (config.conversion?.process || []).entries())
    if (typeof value === "string") targets.push({ owner: config.conversion.process, key: index, path: `conversion.process[${index}]` });
  for (const [index, faq] of (config.conversion?.faqs || []).entries()) {
    add(faq, "question", `conversion.faqs[${index}].question`);
    add(faq, "answer", `conversion.faqs[${index}].answer`);
  }
  for (const [index, value] of (config.differentiators || []).entries())
    if (typeof value === "string") targets.push({ owner: config.differentiators, key: index, path: `differentiators[${index}]` });
  const matches = targets.filter(({ owner, key }) => owner[key].includes(oldValue));
  if (matches.length !== 1) return null;
  const target = matches[0];
  target.owner[target.key] = target.owner[target.key].replace(oldValue, newValue);
  return { kind: "replace_copy_fragment", path: target.path, from: oldValue, to: newValue };
}

function factUpdate(note, allowedFields) {
  const match = note.match(/^\s*(business name|name|phone|telephone|public email|lead email|notification email|email|address)\s*(?:should be|to|is|:|=|->)\s*(.+?)\s*$/imu);
  if (!match) return null;
  const key = match[1].trim().toLocaleLowerCase();
  const field = key === "business name" || key === "name" ? "name"
    : ["phone", "telephone"].includes(key) ? "phone"
      : ["public email", "email"].includes(key) ? "email"
        : ["lead email", "notification email"].includes(key) ? "leadEmail"
          : key === "address" ? "address"
            : "address";
  if (!allowedFields.has(field)) return null;
  let value = clean(match[2].replace(/^["“]|["”]$/gu, ""), field === "address" ? 300 : 240);
  if (!value || /[\r\n]/u.test(value)) return null;
  if (field === "email" || field === "leadEmail") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) return null;
    value = value.toLowerCase();
  }
  return { field, value };
}

function applyOne(config, value) {
  const parsed = categoryAndNote(value);
  const { category, note } = parsed;
  if (!category || !note) return { ok: false, reason: "Choose a listed small-change category and describe the request." };
  const uploaded = replacementAsset(note);
  if (category === "logo" || category === "photos") {
    if (!uploaded.url) return { ok: false, reason: "Upload a replacement logo or business photo through the signed review form." };
    const key = category === "logo" ? "logo"
      : ["photoOne", "photoTwo", "photoThree"].find((slot) => !config.assets?.[slot]) || "photoOne";
    config.assets ||= {};
    config.assets[key] = uploaded.url;
    if (category === "photos") {
      config.images ||= {};
      if (key === "photoOne") config.images.hero = uploaded.url;
      if (key === "photoTwo") config.images.secondary = uploaded.url;
      if (key === "photoThree") config.images.tertiary = uploaded.url;
    }
    return { ok: true, operation: { kind: "replace_asset", slot: key, url: uploaded.url } };
  }
  if (category === "color") {
    const hex = note.match(/#[0-9a-f]{6}\b/iu)?.[0]?.toLowerCase();
    if (!hex) return { ok: false, reason: "State the existing brand colour as a six-digit hex value such as #205d51." };
    config.style ||= {};
    const contrast = accessibleText(hex);
    config.style.primaryColor = hex;
    config.style.contrastColor = contrast;
    config.style.brandTextColor = contrast;
    config.style.brandSurfaceColor = hex;
    config.style.brandSurfaceTextColor = contrast;
    return { ok: true, operation: { kind: "update_design_token", token: "brand", value: hex } };
  }
  if (category === "style") {
    const font = note.match(/\b(?:font|typeface|typography)\s*(?:to|should be|:|=)\s*([a-z-]+)/iu)?.[1]?.toLowerCase();
    const spacing = note.match(/\b(?:density|spacing)\s*(?:to|should be|:|=)\s*(compact|balanced|spacious)\b/iu)?.[1]?.toLowerCase();
    if ((!font || !typography.has(font)) && (!spacing || !density.has(spacing)))
      return { ok: false, reason: "Name a supported font style or spacing density for this small adjustment." };
    config.design ||= {};
    config.design.treatment ||= {};
    const operation = { kind: "update_design_token" };
    if (font && typography.has(font)) {
      config.design.treatment.typography = font;
      operation.typography = font;
    }
    if (spacing && density.has(spacing)) {
      config.design.treatment.density = spacing;
      operation.density = spacing;
    }
    return { ok: true, operation };
  }
  if (category === "contact") {
    const update = factUpdate(note, new Set(["phone", "email", "leadEmail", "address"]));
    if (!update) return { ok: false, reason: "Specify one field as `Phone: ...`, `Public email: ...`, `Lead email: ...`, or `Address: ...`." };
    config.business ||= {};
    const key = update.field === "leadEmail" ? "leadEmail" : update.field;
    config.business[key] = update.value;
    return { ok: true, operation: { kind: "update_business_fact", field: key, value: update.value } };
  }
  if (category === "text") {
    const fact = factUpdate(note, new Set(["name"]));
    if (fact) {
      config.business ||= {};
      const key = fact.field === "name" ? "name" : fact.field;
      config.business[key] = fact.value;
      return { ok: true, operation: { kind: "update_business_fact", field: key, value: fact.value } };
    }
    const operation = exactTextReplacement(config, note);
    if (operation) return { ok: true, operation };
    return { ok: false, reason: "Quote the exact current text and its replacement, or identify one business fact with `Field: new value`." };
  }
  return { ok: false, reason: "This request needs manual review because it cannot be applied as a small verified change." };
}

export function applyBoundedClientFeedback(config, feedbackItems) {
  const revised = structuredClone(config);
  const feedback = Array.isArray(feedbackItems) ? feedbackItems : [feedbackItems];
  const results = feedback.map((item, feedbackIndex) => {
    const result = applyOne(revised, String(item || ""));
    return result.ok
      ? { feedbackIndex, status: "fulfilled", operation: result.operation }
      : { feedbackIndex, status: "manual", reason: result.reason };
  });
  return {
    ok: results.length > 0 && results.every((result) => result.status === "fulfilled"),
    config: revised,
    operations: results.flatMap((result) => result.operation ? [{ feedbackIndex: result.feedbackIndex, ...result.operation }] : []),
    results,
  };
}
