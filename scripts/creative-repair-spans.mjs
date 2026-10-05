import postcss from "postcss";
import { createHash } from "node:crypto";
import {
  REPAIR_EDITABLE_FILE_NAMES, MAX_REPAIR_EDITS, MAX_REPAIR_EDIT_FRAGMENT_CHARS,
  MAX_REPAIR_PATCH_TEXT_CHARS, MAX_REPAIR_FILE_SOURCE_CHARS,
} from "./creative-repair-contract.mjs";
const knownFiles = new Set(REPAIR_EDITABLE_FILE_NAMES);
const digest = value => createHash("sha256").update(value).digest("hex");
const spanId = (file, sourceDigest, start, find) => digest(JSON.stringify([file, sourceDigest, start, find]));
function reject(message) {
  const error = new Error(message); error.code = "CREATIVE_REPAIR_OUTPUT_REJECTED"; throw error;
}
function uniqueOffset(source, find) {
  const first = source.indexOf(find);
  return first >= 0 && source.indexOf(find, first + 1) < 0 ? first : -1;
}
function minifiedCssWindows(source) {
  let root;
  try { root = postcss.parse(source); } catch { return null; }
  const units = [];
  const visit = node => {
    const start = node.source?.start?.offset, end = node.source?.end?.offset;
    if (Number.isSafeInteger(start) && Number.isSafeInteger(end) && end > start &&
        end - start <= MAX_REPAIR_EDIT_FRAGMENT_CHARS) { units.push({ start, end }); return; }
    for (const child of node.nodes || []) visit(child);
  };
  for (const node of root.nodes) visit(node);
  const result = [];
  for (const unit of units) {
    const last = result.at(-1);
    if (last && unit.start >= last.end && unit.end - last.start <= 2_000 &&
        !source.slice(last.end, unit.start).trim()) last.end = unit.end;
    else result.push({ ...unit });
  }
  return result;
}

/** Windows are small enough for targeted repairs; a single line may use the full preserved limit. */
export function buildRepairSpanCatalog(files, { allowedFiles = REPAIR_EDITABLE_FILE_NAMES } = {}) {
  if (!files || typeof files !== "object" || Array.isArray(files)) reject("Invalid candidate source files.");
  if (!Array.isArray(allowedFiles) || allowedFiles.some(file => !knownFiles.has(file)) || new Set(allowedFiles).size !== allowedFiles.length)
    reject("Catalog contains unsupported or duplicate source files.");
  const spans = [];
  for (const file of REPAIR_EDITABLE_FILE_NAMES.filter(key => allowedFiles.includes(key))) {
    if (!Object.hasOwn(files, file)) continue;
    const source = files[file];
    if (typeof source !== "string") reject("Catalog source must be a string.");
    if (source.length > MAX_REPAIR_FILE_SOURCE_CHARS) reject(`Catalog source exceeds ${MAX_REPAIR_FILE_SOURCE_CHARS} characters.`);
    const sourceDigest = digest(source);
    if (file === "styles" && source.split("\n").some(line => line.length > MAX_REPAIR_EDIT_FRAGMENT_CHARS)) {
      const windows = minifiedCssWindows(source);
      if (windows) {
        for (const { start, end } of windows) {
          const find = source.slice(start, end);
          if (uniqueOffset(source, find) === start)
            spans.push({ id: spanId(file, sourceDigest, start, find), file, sourceDigest, find });
        }
        continue;
      }
    }
    let cursor = 0, start = 0, text = "";
    const flush = () => {
      if (text && uniqueOffset(source, text) === start)
        spans.push({ id: spanId(file, sourceDigest, start, text), file, sourceDigest, find: text });
      text = "";
    };
    for (const line of source.match(/[^\n]*\n|[^\n]+$/gu) || []) {
      if (line.length > MAX_REPAIR_EDIT_FRAGMENT_CHARS) { flush(); cursor += line.length; start = cursor; continue; }
      if (text && text.length + line.length > 2_000) flush();
      if (!text) start = cursor;
      text += line; cursor += line.length;
    }
    flush();
  }
  return { version: 1, spans };
}
/** Model IDs compile into the existing literal-edit protocol, never an alternate writer. */
export function compileRepairSpanEdits(files, catalog, edits) {
  if (!catalog || catalog.version !== 1 || !Array.isArray(catalog.spans)) reject("Invalid source catalog.");
  if (!Array.isArray(edits) || edits.length < 1 || edits.length > MAX_REPAIR_EDITS)
    reject(`Span repair requires 1 to ${MAX_REPAIR_EDITS} edits.`);
  const allowedFiles = [...new Set(catalog.spans.map(span => span?.file))];
  if (allowedFiles.some(file => !knownFiles.has(file))) reject("Unsupported source catalog file.");
  for (const span of catalog.spans) {
    if (typeof files?.[span.file] !== "string" || digest(files[span.file]) !== span.sourceDigest)
      reject("Stale source snapshot in repair catalog.");
  }
  const trusted = new Map(buildRepairSpanCatalog(files, { allowedFiles }).spans.map(span => [span.id, span]));
  const members = new Map();
  for (const span of catalog.spans) {
    if (members.has(span.id)) reject("Duplicate catalog member.");
    const actual = trusted.get(span.id);
    if (!actual || actual.file !== span.file || actual.find !== span.find || actual.sourceDigest !== span.sourceDigest)
      reject("Catalog member does not match a trusted source window.");
    members.set(span.id, actual);
  }
  const selected = new Set(), ranges = new Map(), result = [];
  let total = 0;
  for (const edit of edits) {
    if (!edit || typeof edit !== "object" || Array.isArray(edit) || Object.keys(edit).some(key => !["spanId", "replace"].includes(key)))
      reject("Unexpected span-edit fields.");
    const span = members.get(edit.spanId);
    if (!span) reject("Unknown repair span ID.");
    if (selected.has(edit.spanId)) reject("Duplicate selected repair span.");
    selected.add(edit.spanId);
    if (typeof edit.replace !== "string" || !edit.replace.length || edit.replace.length > MAX_REPAIR_EDIT_FRAGMENT_CHARS)
      reject(`Replacement exceeds the non-empty ${MAX_REPAIR_EDIT_FRAGMENT_CHARS}-character contract.`);
    total += span.find.length + edit.replace.length;
    if (total > MAX_REPAIR_PATCH_TEXT_CHARS) reject(`Span patch exceeds ${MAX_REPAIR_PATCH_TEXT_CHARS} total characters.`);
    const start = uniqueOffset(files[span.file], span.find);
    if (start < 0) reject("Repair span is not unique in current source.");
    const end = start + span.find.length, previous = ranges.get(span.file) || [];
    if (previous.some(range => start < range.end && end > range.start)) reject("Overlapping repair spans.");
    previous.push({ start, end }); ranges.set(span.file, previous);
    result.push({ file: span.file, find: span.find, replace: edit.replace });
  }
  return result;
}
