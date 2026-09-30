/**
 * Parse client-confirmed service-area labels without treating city/state commas
 * as separators. Semicolons and line breaks are the supported list delimiters.
 */
export function parseServiceAreas(value, { limit = 20 } = {}) {
  const max = Number.isSafeInteger(limit) && limit >= 0 ? limit : 20;
  if (max === 0) return [];
  const source = Array.isArray(value) ? value : [value];
  const areas = [];

  for (const entry of source) {
    if (typeof entry !== "string" && typeof entry !== "number") continue;
    for (const candidate of String(entry)
      .replace(/\u0000/gu, "")
      .split(/[;\r\n]+/u)) {
      const area = candidate.trim().replace(/\s+/gu, " ").slice(0, 180);
      if (
        area &&
        !areas.some((existing) => existing.toLowerCase() === area.toLowerCase())
      )
        areas.push(area);
      if (areas.length >= max) return areas;
    }
  }

  return areas;
}

export function firstServiceArea(value) {
  return parseServiceAreas(value, { limit: 1 })[0] || "";
}
