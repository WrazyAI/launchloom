// Operations money is decimal text. Numbers are accepted only as already-parsed
// inputs; on-disk operations JSON uses the original numeric lexeme instead.
const MAX_SCALE = 30;
function render(units, scale) {
  const raw = units.toString().padStart(scale + 1, "0");
  const whole = scale ? raw.slice(0, -scale) : raw;
  const fraction = scale ? raw.slice(-scale).replace(/0+$/u, "") : "";
  if (whole.length > 20 || fraction.length > MAX_SCALE) return null;
  return fraction ? `${whole}.${fraction}` : whole;
}
export function decimal(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "number" && (!Number.isFinite(value) || value < 0))
    return null;
  const match = /^(\d{1,60})(?:\.(\d{1,60}))?(?:[eE]([+-]?\d{1,3}))?$/u.exec(
    String(value),
  );
  if (!match) return null;
  let scale = (match[2]?.length ?? 0) - Number(match[3] ?? 0);
  if (Math.abs(scale) > 100) return null;
  let units = BigInt(match[1] + (match[2] ?? ""));
  if (scale < 0) {
    units *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return render(units, scale);
}
function parts(value) {
  const text = decimal(value);
  if (text === null) throw Error("Invalid decimal evidence.");
  const [whole, fraction = ""] = text.split(".");
  return { units: BigInt(whole + fraction), scale: fraction.length };
}
export function addDecimals(values) {
  const terms = values.map(parts);
  const scale = Math.max(0, ...terms.map((term) => term.scale));
  const total = terms.reduce(
    (sum, term) => sum + term.units * 10n ** BigInt(scale - term.scale),
    0n,
  );
  const result = render(total, scale);
  if (result === null) throw Error("Decimal evidence exceeds bounds.");
  return result;
}
export function multiplyDecimals(left, right) {
  const a = parts(left);
  const b = parts(right);
  return render(a.units * b.units, a.scale + b.scale);
}
