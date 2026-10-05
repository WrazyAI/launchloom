import { expect, it } from "vitest";
import * as contract from "../scripts/creative-repair-contract.mjs";
import { buildRepairSpanCatalog, compileRepairSpanEdits } from "../scripts/creative-repair-spans.mjs";
const budget = (catalog: unknown) => {
  expect(typeof (contract as any).buildSpanRequestBudget).toBe("function");
  return (contract as any).buildSpanRequestBudget(catalog);
};
it.each([[1999,3,23997],[3491,2,18982],[2000,3,24000],[6000,2,24000]])("bounds maximum find %i within the unchanged patch ceiling", (find, edits, worst) => {
  const catalog = { version: 1, spans: [{ find: "x".repeat(find) }] };
  const original = structuredClone(catalog);
  expect(budget(catalog)).toEqual({ maxFindChars: find, maxReplacementChars: 6000, maxEdits: edits, maxPatchChars: 24000, unit: "utf16-code-units" });
  expect(edits * (find + 6000)).toBe(worst);
  expect(catalog).toEqual(original);
});
it.each([null,{}, {version:2,spans:[{find:"x"}]},{version:1,spans:[]},{version:1,spans:[{find:""}]},{version:1,spans:[{find:7}]},{version:1,spans:[{find:"x".repeat(6001)}]}])("rejects an invalid catalog without invented capacity %#", catalog => {
  expect(typeof (contract as any).buildSpanRequestBudget).toBe("function");
  expect(() => (contract as any).buildSpanRequestBudget(catalog)).toThrow(/catalog|window/i);
});
it("counts astral characters in the same UTF16 units as the real patch guard", () => {
  const index = {version:1,spans:[{find:"😀".repeat(2999)}]};
  expect(budget(index).maxFindChars).toBe(5998);
  const files = {styles:".owned{color:navy}"}; const catalog = buildRepairSpanCatalog(files);
  const replacement = "😀".repeat(3001);
  expect([...replacement]).toHaveLength(3001); expect(replacement.length).toBe(6002);
  expect(() => compileRepairSpanEdits(files,catalog,[{spanId:catalog.spans[0].id,replace:replacement}])).toThrow(/6000/);
  expect(files.styles).toBe(".owned{color:navy}");
});
