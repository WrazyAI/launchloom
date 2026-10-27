import crypto from "node:crypto";

export const FOUNDATION_SCHEMA_VERSION = 1;

export const FOUNDATION_SECTION_ROLES = Object.freeze([
  "navigation",
  "hero",
  "conversion",
  "services",
  "portfolio",
  "seasons",
  "plans",
  "estimate",
  "coverage",
  "proof",
  "process",
  "faq",
  "contact",
  "footer",
  "about",
  "gallery",
  "unknown",
]);

export const FOUNDATION_SLOT_KINDS = Object.freeze([
  "text",
  "html",
  "image",
  "href",
  "attribute",
  "each",
]);

export const FOUNDATION_ASSET_ROLES = Object.freeze([
  "reference-only",
  "client",
  "generated",
  "graphic",
  "icon",
  "font",
  "other",
]);

export const FOUNDATION_COMPATIBILITY = Object.freeze([
  "renderable",
  "needs-adaptation",
  "blocked",
]);

const SOURCE_CLASSES = new Set(["owned", "licensed", "permission-cleared"]);

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;
const SLOT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;

function fail(message) {
  throw new Error(`Foundation manifest invalid: ${message}`);
}

function text(value, field, { max = 500 } = {}) {
  const normalized = String(value ?? "")
    .replace(/\u0000/gu, "")
    .trim();
  if (!normalized) fail(`${field} is required.`);
  if (normalized.length > max)
    fail(`${field} exceeds its ${max}-character limit.`);
  return normalized;
}

function optionalText(value, field, { max = 500 } = {}) {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, field, { max });
}

function slug(value, field) {
  const normalized = text(value, field, { max: 160 });
  if (!SLUG_PATTERN.test(normalized))
    fail(`${field} must be a lowercase slug.`);
  return normalized;
}

function slotId(value, field) {
  const normalized = text(value, field, { max: 200 });
  if (!SLOT_ID_PATTERN.test(normalized))
    fail(`${field} must be a lowercase slot id.`);
  return normalized;
}

function digest(value, field) {
  const normalized = text(value, field, { max: 64 });
  if (!DIGEST_PATTERN.test(normalized))
    fail(`${field} must be a 64-character lowercase sha256 digest.`);
  return normalized;
}

function relativePath(value, field) {
  const normalized = text(value, field, { max: 500 }).replaceAll("\\", "/");
  if (/^[a-z][a-z0-9+.-]*:/iu.test(normalized) || normalized.startsWith("//"))
    fail(`${field} must be a relative local path, not a remote URL.`);
  if (normalized.startsWith("/") || normalized.split("/").includes(".."))
    fail(`${field} must be a relative path without traversal.`);
  return normalized;
}

function sourcePath(value, field) {
  const normalized = text(value, field, { max: 500 }).replaceAll("\\", "/");
  if (/^[a-z][a-z0-9+.-]*:/iu.test(normalized) || normalized.startsWith("//"))
    fail(`${field} must not be a remote URL.`);
  return relativePath(normalized, field);
}

function boolean(value, field) {
  if (typeof value !== "boolean") fail(`${field} must be a boolean.`);
  return value;
}

function list(value, field) {
  if (!Array.isArray(value)) fail(`${field} must be an array.`);
  return value;
}

function unique(values, field) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(`duplicate ${field}: ${value}`);
    seen.add(value);
  }
}

function normalizeLicense(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("license is required.");
  return {
    name: text(value.name, "license.name", { max: 120 }),
    ...(optionalText(value.url, "license.url", { max: 500 })
      ? { url: optionalText(value.url, "license.url", { max: 500 }) }
      : {}),
    credit: text(value.credit, "license.credit", { max: 240 }),
  };
}

function normalizeSections(value) {
  const sections = list(value, "sections").map((section, index) => {
    if (!section || typeof section !== "object" || Array.isArray(section))
      fail(`sections[${index}] must be an object.`);
    const role = text(section.role, `sections[${index}].role`, { max: 60 });
    if (!FOUNDATION_SECTION_ROLES.includes(role))
      fail(`sections[${index}].role '${role}' is not supported.`);
    return {
      id: slug(section.id, `sections[${index}].id`),
      sourceSelector: text(
        section.sourceSelector,
        `sections[${index}].sourceSelector`,
        { max: 300 },
      ),
      order: Number(section.order),
      role,
      required: boolean(section.required, `sections[${index}].required`),
    };
  });
  if (!sections.length) fail("sections must not be empty.");
  unique(
    sections.map((section) => section.id),
    "section id",
  );
  const ordered = [...sections].sort((left, right) => left.order - right.order);
  ordered.forEach((section, index) => {
    if (!Number.isInteger(section.order) || section.order !== index + 1)
      fail(
        `section '${section.id}' has order ${section.order}; order must be contiguous from 1.`,
      );
  });
  return ordered;
}

function normalizeSlots(value) {
  const slots = list(value, "slots").map((slot, index) => {
    if (!slot || typeof slot !== "object" || Array.isArray(slot))
      fail(`slots[${index}] must be an object.`);
    const kind = text(slot.kind, `slots[${index}].kind`, { max: 40 });
    if (!FOUNDATION_SLOT_KINDS.includes(kind))
      fail(`slots[${index}].kind '${kind}' is not supported.`);
    const required = boolean(slot.required, `slots[${index}].required`);
    const contentPath = optionalText(
      slot.contentPath,
      `slots[${index}].contentPath`,
      { max: 200 },
    );
    if (kind === "each" && !contentPath)
      fail(`slots[${index}].contentPath is required for an each slot.`);
    if (kind === "each")
      text(slot.itemPath, `slots[${index}].itemPath`, { max: 80 });
    return {
      id: slotId(slot.id, `slots[${index}].id`),
      selector: text(slot.selector, `slots[${index}].selector`, {
        max: 300,
      }),
      kind,
      ...(contentPath ? { contentPath } : {}),
      ...(kind === "each"
        ? {
            itemPath: text(slot.itemPath, `slots[${index}].itemPath`, {
              max: 80,
            }),
          }
        : {}),
      required,
    };
  });
  unique(
    slots.map((slot) => slot.id),
    "slot id",
  );
  return slots;
}

function normalizeAssets(value) {
  return list(value, "assets").map((asset, index) => {
    if (!asset || typeof asset !== "object" || Array.isArray(asset))
      fail(`assets[${index}] must be an object.`);
    const role = text(asset.role, `assets[${index}].role`, { max: 40 });
    if (!FOUNDATION_ASSET_ROLES.includes(role))
      fail(`assets[${index}].role '${role}' is not supported.`);
    return {
      source: sourcePath(asset.source, `assets[${index}].source`),
      target: relativePath(asset.target, `assets[${index}].target`),
      role,
      required: boolean(asset.required, `assets[${index}].required`),
    };
  });
}

function normalizeInteractions(value) {
  const interactions = list(value, "interactions").map((interaction, index) => {
    if (
      !interaction ||
      typeof interaction !== "object" ||
      Array.isArray(interaction)
    )
      fail(`interactions[${index}] must be an object.`);
    return {
      id: slug(interaction.id, `interactions[${index}].id`),
      source: text(interaction.source, `interactions[${index}].source`, {
        max: 300,
      }),
      primitive: text(
        interaction.primitive,
        `interactions[${index}].primitive`,
        { max: 120 },
      ),
      reducedMotion: text(
        interaction.reducedMotion,
        `interactions[${index}].reducedMotion`,
        { max: 200 },
      ),
    };
  });
  unique(
    interactions.map((interaction) => interaction.id),
    "interaction id",
  );
  return interactions;
}

function normalizeBlockers(value) {
  return list(value, "blockers").map((blocker, index) => {
    if (!blocker || typeof blocker !== "object" || Array.isArray(blocker))
      fail(`blockers[${index}] must be an object.`);
    return {
      code: slug(blocker.code, `blockers[${index}].code`),
      message: text(blocker.message, `blockers[${index}].message`, {
        max: 1000,
      }),
      ...(optionalText(blocker.selector, `blockers[${index}].selector`, {
        max: 300,
      })
        ? {
            selector: optionalText(
              blocker.selector,
              `blockers[${index}].selector`,
              { max: 300 },
            ),
          }
        : {}),
    };
  });
}

function normalizeStringList(value, field) {
  return list(value, field).map((item, index) =>
    text(item, `${field}[${index}]`, { max: 300 }),
  );
}

function normalizeManifest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("manifest must be an object.");
  if (input.schemaVersion !== FOUNDATION_SCHEMA_VERSION)
    fail(`schemaVersion must be ${FOUNDATION_SCHEMA_VERSION}.`);
  const sourceClass = text(input.sourceClass, "sourceClass", { max: 40 });
  if (!SOURCE_CLASSES.has(sourceClass))
    fail(`sourceClass '${sourceClass}' is not supported.`);
  const compatibility = text(input.compatibility, "compatibility", {
    max: 40,
  });
  if (!FOUNDATION_COMPATIBILITY.includes(compatibility))
    fail(`compatibility '${compatibility}' is not supported.`);
  const sections = normalizeSections(input.sections);
  const slots = normalizeSlots(input.slots);
  const blockers = normalizeBlockers(input.blockers);
  if (compatibility === "renderable") {
    if (blockers.length)
      fail("a renderable foundation must not carry blockers.");
    for (const slot of slots) {
      if (slot.required && !slot.contentPath)
        fail(
          `slot '${slot.id}' is required but has no contentPath for a renderable foundation.`,
        );
    }
  } else if (!blockers.length) {
    fail(
      `a ${compatibility} foundation must carry at least one blocker with the exact reason.`,
    );
  }
  return {
    schemaVersion: FOUNDATION_SCHEMA_VERSION,
    id: slug(input.id, "id"),
    dossierId: slug(input.dossierId, "dossierId"),
    sourceDigest: digest(input.sourceDigest, "sourceDigest"),
    entrypoint: relativePath(input.entrypoint, "entrypoint"),
    sourceClass,
    license: normalizeLicense(input.license),
    sections,
    slots,
    assets: normalizeAssets(input.assets),
    interactions: normalizeInteractions(input.interactions),
    preservedMechanics: normalizeStringList(
      input.preservedMechanics,
      "preservedMechanics",
    ),
    prohibitedSourceMaterial: normalizeStringList(
      input.prohibitedSourceMaterial,
      "prohibitedSourceMaterial",
    ),
    compatibility,
    blockers,
  };
}

function canonicalManifest(value) {
  const normalized = normalizeManifest(value);
  return {
    ...normalized,
    sections: [...normalized.sections].sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    ),
    slots: [...normalized.slots].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    assets: [...normalized.assets].sort((left, right) =>
      left.target.localeCompare(right.target),
    ),
    interactions: [...normalized.interactions].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    preservedMechanics: [...normalized.preservedMechanics].sort(),
    prohibitedSourceMaterial: [...normalized.prohibitedSourceMaterial].sort(),
    blockers: [...normalized.blockers].sort(
      (left, right) =>
        left.code.localeCompare(right.code) ||
        left.message.localeCompare(right.message),
    ),
  };
}

export function computeFoundationFingerprint(input) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalManifest(input)))
    .digest("hex");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function buildFoundationManifest(input) {
  const normalized = canonicalManifest(input);
  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
  return deepFreeze({ ...normalized, fingerprint });
}

export function validateFoundationManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("manifest must be an object.");
  const expected = computeFoundationFingerprint(value);
  if (value.fingerprint !== expected)
    fail(
      `fingerprint does not match the manifest content (expected ${expected}, received ${value.fingerprint || "missing"}).`,
    );
  return true;
}
