import { describe, expect, it } from "vitest";
import { applyCreativeRepairEdits } from "../scripts/creative-repair-loop.mjs";
const modulePath = "../scripts/creative-repair-spans.mjs";
const spans = await import(modulePath).catch(() => ({})) as any;
const files = { experience: "export default () => <main>Original</main>;\n", styles: ".hero { color: navy; }\n", motion: "export function mountExperienceMotion(){ return () => {}; }\n" };
function catalog(value: Record<string, string> = files, options?: any) { return spans.buildRepairSpanCatalog(value, options); }
function compile(value: any, index: any, edits: any) { return spans.compileRepairSpanEdits(value, index, edits); }

describe("trusted source-span repair", () => {
  it("applies the selected source snapshot through existing literal validation", () => {
    const index = catalog();
    const style = index.spans.find((s: any) => s.file === "styles");
    const patch = compile(files, index, [{ spanId: style.id, replace: ".hero { color: white; }\n" }]);
    const result = applyCreativeRepairEdits(files, patch);
    expect(result).toEqual({ ...files, styles: ".hero { color: white; }\n" });
    expect(files.styles).toBe(".hero { color: navy; }\n");
    expect(catalog()).toEqual(index);
    expect(style.id).toMatch(/^[a-f0-9]{64}$/);
    expect(style.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
  });
  it("rejects stale source without changing its bytes", () => {
    const index = catalog(), style = index.spans.find((s: any) => s.file === "styles");
    const current = { ...files, styles: files.styles + "/* later edit */" };
    expect(() => compile(current, index, [{ spanId: style.id, replace: "new" }])).toThrow(/stale/i);
    expect(current.styles).toBe(files.styles + "/* later edit */");
  });
  it("rejects unknown IDs and enforces the caller's allowed files", () => {
    const index = catalog(files, { allowedFiles: ["styles"] });
    expect(index.spans.map((s: any) => s.file)).toEqual(["styles"]);
    const experience = catalog().spans.find((s: any) => s.file === "experience");
    expect(() => compile(files, index, [{ spanId: experience.id, replace: "new" }])).toThrow(/unknown/i);
    expect(() => catalog(files, { allowedFiles: ["site.config.json"] })).toThrow(/unsupported/);
  });
  it("omits individually oversized markup lines and retains later bounded lines", () => {
    const current = { ...files, experience: "x".repeat(6001) + "\nconst footer = 'old';\n" };
    const index = catalog(current, { allowedFiles: ["experience"] });
    expect(index.spans).toHaveLength(1);
    expect(index.spans[0].find).toBe("const footer = 'old';\n");
    const result = applyCreativeRepairEdits(current, compile(current, index, [{ spanId: index.spans[0].id, replace: "const footer = 'new';\n" }]));
    expect(result.experience).toBe("x".repeat(6001) + "\nconst footer = 'new';\n");
  });
  it("omits repeated windows rather than weakening uniqueness", () => {
    const current = { styles: ("a".repeat(5999) + "\n").repeat(2) };
    expect(catalog(current, { allowedFiles: ["styles"] }).spans).toEqual([]);
  });
  it.each(["", 42, null, {}, "x".repeat(6001)])("rejects invalid replacement %j without mutating source", replace => {
    const index = catalog(); const style = index.spans.find((s: any) => s.file === "styles");
    expect(() => compile(files, index, [{ spanId: style.id, replace }])).toThrow();
    expect(files.styles).toBe(".hero { color: navy; }\n");
  });
  it("rejects duplicate selected spans and tampered/overlapping catalog members", () => {
    const index = catalog(); const style = index.spans.find((s: any) => s.file === "styles");
    expect(() => compile(files, index, [{ spanId: style.id, replace: "new" }, { spanId: style.id, replace: "other" }])).toThrow(/duplicate/i);
    const overlapping = { ...index, spans: [...index.spans, { ...style, id: "a".repeat(64), find: style.find.slice(1) }] };
    expect(() => compile(files, overlapping, [{ spanId: style.id, replace: "new" }, { spanId: "a".repeat(64), replace: "other" }])).toThrow(/catalog|overlap/i);
    const duplicate = { ...index, spans: [...index.spans, style] };
    expect(() => compile(files, duplicate, [{ spanId: style.id, replace: "new" }])).toThrow(/duplicate/i);
  });
  it("rejects thirteen edits before permitting a larger patch", () => {
    const current = { styles: Array.from({ length: 13 }, (_, i) => String(i).padStart(2, "0") + "a".repeat(5997) + "\n").join("") };
    const index = catalog(current, { allowedFiles: ["styles"] });
    expect(index.spans).toHaveLength(13);
    expect(() => compile(current, index, index.spans.map((s: any) => ({ spanId: s.id, replace: "new" })))).toThrow(/12/);
  });
  it("rejects 24001 total characters while accepting the exact 24000 boundary", () => {
    const current = { styles: Array.from({ length: 3 }, (_, i) => String(i) + "a".repeat(3998) + "\n").join("") };
    const index = catalog(current, { allowedFiles: ["styles"] });
    expect(index.spans).toHaveLength(3);
    const edits = index.spans.map((s: any, i: number) => ({ spanId: s.id, replace: String(i) + "b".repeat(3999) }));
    expect(compile(current, index, edits)).toHaveLength(3);
    edits[2].replace += "b";
    expect(() => compile(current, index, edits)).toThrow(/24000/);
    expect(current.styles).toBe(index.spans.map((s: any) => s.find).join(""));
  });
  it("rejects a source beyond the preserved 80000 complete-file limit", () => {
    expect(() => catalog({ styles: "x".repeat(80001) }, { allowedFiles: ["styles"] })).toThrow(/80000/);
  });
  it("rejects model-supplied find/file fields instead of permitting catalog overrides", () => {
    const index = catalog(); const style = index.spans.find((s: any) => s.file === "styles");
    expect(() => compile(files, index, [{ spanId: style.id, replace: "new", find: "injected" }])).toThrow(/unexpected/i);
  });
});

it("repairs byte-preserved minified CSS through parser-bounded windows", () => {
  const css = Array.from({ length: 250 }, (_, i) => `.owned-${i}{color:navy;font-size:14px;}`).join("");
  expect(css.length).toBeGreaterThan(6000);
  const current = { ...files, styles: css };
  const index = catalog(current, { allowedFiles: ["styles"] });
  expect(index.spans.length).toBeGreaterThan(0);
  const selected = index.spans.find((s: any) => s.find.includes("color:navy"));
  expect(selected.find.length).toBeLessThanOrEqual(6000);
  const replacement = selected.find.replace("color:navy", "color:white");
  const result = applyCreativeRepairEdits(current, compile(current, index, [{ spanId: selected.id, replace: replacement }]));
  expect(result.styles).toBe(css.replace(selected.find, replacement));
  expect(current.styles).toBe(css);
});
