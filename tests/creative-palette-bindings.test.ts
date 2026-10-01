import { expect, it } from "vitest";
import {
  bindCreativePalette,
  creativeColorOverrideCss,
} from "../scripts/creative-palette-bindings.mjs";

function run(styles: string) {
  const config = { style: { surfaceColor: "#e8d391" } };
  const results = [{ feedbackIndex: 0, fulfilled: ["color"], structuredColorOnly: true }];
  const bound = bindCreativePalette({
    config,
    styles,
    results,
    operations: [
      {
        kind: "set_color_palette",
        feedbackIndex: 0,
        requestedFields: ["surfaceColor"],
      },
    ],
  });
  return { config, results, bound };
}
it("binds root palettes and preserves unrelated candidate colors", () => {
  for (const selector of [":root", "@root"]) {
    const result = run(
      `${selector} { --ll-creative-page: #fff; --ll-creative-ink: #111; } body { background: var(--ll-creative-page); }`,
    );
    expect(result.bound).toEqual([0]);
    expect(creativeColorOverrideCss(result.config.style)).toBe(
      "--ll-creative-page: #e8d391;",
    );
    expect(result.results[0]).toMatchObject({ creativePaletteBound: true });
  }
});
it("keeps unknown, unused, and section-local colors in the source repair lane", () => {
  for (const styles of [
    "body { background: #fff; }",
    ":root { --ll-creative-page: #fff; }",
    ".hero { --ll-creative-page: #fff; background: var(--ll-creative-page); }",
  ]) {
    const result = run(styles);
    expect(result.bound).toEqual([]);
    expect(creativeColorOverrideCss(result.config.style)).toBe("");
  }
});
it("refuses executable CSS in serialized overrides", () => {
  expect(
    creativeColorOverrideCss({
      creativeColorOverrides: {
        surfaceColor: {
          variable: "--ll-creative-page",
          value: "red;}body{background:url(evil)",
        },
      },
    }),
  ).toBe("");
});

it("keeps composition feedback scoped even when its background choice is bound", async () => {
  const {createCreativeRepairScopeDeclaration} = await import("../scripts/creative-revision-scope.mjs");
  const feedback = "Make the hero shorter";
  expect(createCreativeRepairScopeDeclaration({creativeRenderer: true, feedback: [feedback], results: [{feedbackIndex: 0, feedback, status: "creative", intents: ["color", "layout"], fulfilled: ["color"], creativePaletteBound: true}]}).required).toBe(true);
  expect(createCreativeRepairScopeDeclaration({creativeRenderer: true, feedback: ["Change background"], results: [{feedbackIndex: 0, feedback: "Change background", status: "fulfilled", intents: ["color"]}]}).required).toBe(true);
});

it("does not declare a mixed text palette request fully bound by one structured background choice", () => {
  const config = {style: {surfaceColor: "#e8d391"}};
  const results = [{feedbackIndex: 0, fulfilled: ["color"], structuredColorOnly: false}];
  bindCreativePalette({config, styles: ":root {--ll-creative-page:#fff} body{background:var(--ll-creative-page)}", results, operations: [{kind: "set_color_palette", feedbackIndex: 0, requestedFields: ["surfaceColor"]}]});
  expect(results[0]).not.toHaveProperty("creativePaletteBound");
});
