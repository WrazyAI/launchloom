function channel(value, scale = 1) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return Math.max(0, Math.min(255, parsed * scale));
}

export function parseCssColor(value) {
  const input = String(value || "")
    .trim()
    .toLowerCase();
  const hex = input.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/);
  if (hex) return hex.slice(1).map((channel) => Number.parseInt(channel, 16));
  const srgb = input.match(
    /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/[^)]+)?\)$/,
  );
  if (srgb)
    return srgb.slice(1, 4).map((value) => Math.round(channel(value, 255)));

  const rgb = input.match(
    /^rgba?\(\s*([\d.]+)(%?)\D+([\d.]+)(%?)\D+([\d.]+)(%?)/,
  );
  if (!rgb) return [];
  return [
    channel(rgb[1], rgb[2] === "%" ? 2.55 : 1),
    channel(rgb[3], rgb[4] === "%" ? 2.55 : 1),
    channel(rgb[5], rgb[6] === "%" ? 2.55 : 1),
  ].map((value) => Math.round(value));
}

function luminance(value) {
  return parseCssColor(value)
    .map((channel) => channel / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index],
      0,
    );
}

export function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
