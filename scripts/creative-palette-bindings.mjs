import postcss from "postcss";

import { CREATIVE_COLOR_TOKENS } from "../templates/client-site/src/lib/creative-palette-bindings.mjs";
export { creativeColorOverrideCss } from "../templates/client-site/src/lib/creative-palette-bindings.mjs";

export function bindCreativePalette({ config, operations, results, styles }) {
  const root = postcss.parse(styles);
  const bindings = { ...config.style?.creativeColorOverrides };
  // A later palette edit must not be masked by an older runtime override.
  for (const [field, binding] of Object.entries(bindings))
    if (config.style?.[field] !== binding.value) delete bindings[field];
  if (config.style?.creativeColorOverrides)
    config.style.creativeColorOverrides = bindings;
  const bound = new Set();
  for (const operation of operations) {
    if (
      operation.kind !== "set_color_palette" ||
      !operation.requestedFields?.length
    )
      continue;
    const requested = [];
    for (const field of operation.requestedFields) {
      const variable = CREATIVE_COLOR_TOKENS[field];
      const value = config.style?.[field];
      let declared = false;
      let used = false;
      root.walkDecls((declaration) => {
        if (
          declaration.prop === variable &&
          ((declaration.parent.type === "rule" &&
            declaration.parent.selector?.trim() === ":root") ||
            (declaration.parent.type === "atrule" &&
              declaration.parent.name === "root"))
        )
          declared = true;
        if (variable && declaration.value.includes(`var(${variable}`))
          used = true;
      });
      if (
        !variable ||
        !/^#[a-f0-9]{6}$/iu.test(value || "") ||
        !declared ||
        !used
      )
        break;
      requested.push([field, { variable, value }]);
    }
    if (requested.length !== operation.requestedFields.length) continue;
    for (const [field, binding] of requested) bindings[field] = binding;
    bound.add(operation.feedbackIndex);
  }
  if (bound.size) config.style.creativeColorOverrides = bindings;
  for (const result of results)
    if (bound.has(result.feedbackIndex) && result.structuredColorOnly === true && result.fulfilled?.includes("color"))
      result.creativePaletteBound = true;
  return [...bound];
}
