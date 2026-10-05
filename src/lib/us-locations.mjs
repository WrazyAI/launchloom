/**
 * US state and time-zone helpers for the private onboarding form.
 *
 * The onboarding form is US-focused: the address picker scopes Google Places
 * autocomplete to a selected state and the hours picker needs a time zone.
 * States that span zones use their dominant zone as a default; the client can
 * always change the select.
 */

export const US_STATES = Object.freeze([
  { code: "AL", name: "Alabama", zone: "CT" },
  { code: "AK", name: "Alaska", zone: "AKT" },
  { code: "AZ", name: "Arizona", zone: "MT" },
  { code: "AR", name: "Arkansas", zone: "CT" },
  { code: "CA", name: "California", zone: "PT" },
  { code: "CO", name: "Colorado", zone: "MT" },
  { code: "CT", name: "Connecticut", zone: "ET" },
  { code: "DE", name: "Delaware", zone: "ET" },
  { code: "DC", name: "District of Columbia", zone: "ET" },
  { code: "FL", name: "Florida", zone: "ET" },
  { code: "GA", name: "Georgia", zone: "ET" },
  { code: "HI", name: "Hawaii", zone: "HT" },
  { code: "ID", name: "Idaho", zone: "MT" },
  { code: "IL", name: "Illinois", zone: "CT" },
  { code: "IN", name: "Indiana", zone: "ET" },
  { code: "IA", name: "Iowa", zone: "CT" },
  { code: "KS", name: "Kansas", zone: "CT" },
  { code: "KY", name: "Kentucky", zone: "ET" },
  { code: "LA", name: "Louisiana", zone: "CT" },
  { code: "ME", name: "Maine", zone: "ET" },
  { code: "MD", name: "Maryland", zone: "ET" },
  { code: "MA", name: "Massachusetts", zone: "ET" },
  { code: "MI", name: "Michigan", zone: "ET" },
  { code: "MN", name: "Minnesota", zone: "CT" },
  { code: "MS", name: "Mississippi", zone: "CT" },
  { code: "MO", name: "Missouri", zone: "CT" },
  { code: "MT", name: "Montana", zone: "MT" },
  { code: "NE", name: "Nebraska", zone: "CT" },
  { code: "NV", name: "Nevada", zone: "PT" },
  { code: "NH", name: "New Hampshire", zone: "ET" },
  { code: "NJ", name: "New Jersey", zone: "ET" },
  { code: "NM", name: "New Mexico", zone: "MT" },
  { code: "NY", name: "New York", zone: "ET" },
  { code: "NC", name: "North Carolina", zone: "ET" },
  { code: "ND", name: "North Dakota", zone: "CT" },
  { code: "OH", name: "Ohio", zone: "ET" },
  { code: "OK", name: "Oklahoma", zone: "CT" },
  { code: "OR", name: "Oregon", zone: "PT" },
  { code: "PA", name: "Pennsylvania", zone: "ET" },
  { code: "RI", name: "Rhode Island", zone: "ET" },
  { code: "SC", name: "South Carolina", zone: "ET" },
  { code: "SD", name: "South Dakota", zone: "CT" },
  { code: "TN", name: "Tennessee", zone: "CT" },
  { code: "TX", name: "Texas", zone: "CT" },
  { code: "UT", name: "Utah", zone: "MT" },
  { code: "VT", name: "Vermont", zone: "ET" },
  { code: "VA", name: "Virginia", zone: "ET" },
  { code: "WA", name: "Washington", zone: "PT" },
  { code: "WV", name: "West Virginia", zone: "ET" },
  { code: "WI", name: "Wisconsin", zone: "CT" },
  { code: "WY", name: "Wyoming", zone: "MT" },
]);

export const US_TIME_ZONES = Object.freeze([
  { id: "ET", label: "Eastern (ET)" },
  { id: "CT", label: "Central (CT)" },
  { id: "MT", label: "Mountain (MT)" },
  { id: "PT", label: "Pacific (PT)" },
  { id: "AKT", label: "Alaska (AKT)" },
  { id: "HT", label: "Hawaii (HT)" },
]);

export function stateName(code) {
  const normalized = String(code || "").trim().toUpperCase();
  return US_STATES.find((state) => state.code === normalized)?.name || "";
}

export function stateCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (US_STATES.some((state) => state.code === normalized)) return normalized;
  const byName = US_STATES.find(
    (state) => state.name.toUpperCase() === normalized,
  );
  return byName?.code || "";
}

export function timeZoneForState(code) {
  const normalized = stateCode(code);
  return (
    US_STATES.find((state) => state.code === normalized)?.zone || ""
  );
}

export function isValidTimeZone(id) {
  return US_TIME_ZONES.some((zone) => zone.id === id);
}

const DAY_LABELS = Object.freeze([
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
]);

/** "09:00" -> "9:00 AM", "17:30" -> "5:30 PM", "00:00" -> "12:00 AM". */
export function formatTime(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/u);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = match[2];
  const period = hours >= 12 ? "PM" : "AM";
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${minutes} ${period}`;
}

export const TIME_OPTIONS = Object.freeze(
  Array.from({ length: 48 }, (_, index) => {
    const hours = Math.floor(index / 2);
    const minutes = index % 2 === 0 ? "00" : "30";
    const value = `${String(hours).padStart(2, "0")}:${minutes}`;
    return { value, label: formatTime(value) };
  }),
);

function validTimes(day) {
  return (
    !day.closed &&
    /^\d{2}:\d{2}$/u.test(day.open || "") &&
    /^\d{2}:\d{2}$/u.test(day.close || "") &&
    day.close > day.open
  );
}

/**
 * Build the canonical hours string stored on the intake. Only days the client
 * actually opened are included; a business with no set hours produces an empty
 * string so nothing is invented. Consecutive days with the same times are
 * grouped, for example "Mon-Fri: 9:00 AM - 5:00 PM ET".
 */
export function buildHoursValue(days, timeZoneId) {
  const ordered = DAY_LABELS.map(([key, label]) => {
    const day = Array.isArray(days)
      ? days.find((item) => item.key === key) || {}
      : days?.[key] || {};
    return { key, label, closed: day.closed !== false, open: day.open, close: day.close };
  });
  const open = ordered.filter(validTimes);
  if (!open.length) return "";
  const zone = isValidTimeZone(timeZoneId) ? ` ${timeZoneId}` : "";
  const groups = [];
  for (const day of open) {
    const previous = groups[groups.length - 1];
    if (
      previous &&
      previous.close === day.close &&
      previous.open === day.open &&
      DAY_LABELS.findIndex(([key]) => key === previous.lastKey) + 1 ===
        DAY_LABELS.findIndex(([key]) => key === day.key)
    ) {
      previous.lastKey = day.key;
      previous.lastLabel = day.label;
      continue;
    }
    groups.push({
      firstLabel: day.label,
      lastLabel: day.label,
      lastKey: day.key,
      open: day.open,
      close: day.close,
    });
  }
  return groups
    .map((group) => {
      const label =
        group.firstLabel === group.lastLabel
          ? group.firstLabel
          : `${group.firstLabel}-${group.lastLabel}`;
      return `${label}: ${formatTime(group.open)} - ${formatTime(group.close)}${zone}`;
    })
    .join("; ");
}
