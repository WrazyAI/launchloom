import { describe, expect, it } from "vitest";
import { argsFrom as auditArgsFrom } from "../scripts/audit-gold-reference-library.mjs";
import { argsFrom as benchmarkArgsFrom } from "../scripts/run-gold-reference-benchmark.mjs";

describe("Gold reference CLI arguments", () => {
  it.each([
    ["audit", auditArgsFrom],
    ["benchmark", benchmarkArgsFrom],
  ])("%s parser accepts flag/value pairs", (_name, parse) => {
    expect(
      parse(["node", "script.mjs", "--out", "report.json", "--root", "."]),
    ).toEqual({ out: "report.json", root: "." });
  });

  it.each([
    ["audit", auditArgsFrom],
    ["benchmark", benchmarkArgsFrom],
  ])("%s parser rejects a missing operand", (_name, parse) => {
    expect(() => parse(["node", "script.mjs", "--out"])).toThrow(
      "Missing value for --out.",
    );
    expect(() =>
      parse(["node", "script.mjs", "--out", "--root", "."]),
    ).toThrow("Missing value for --out.");
  });
});
