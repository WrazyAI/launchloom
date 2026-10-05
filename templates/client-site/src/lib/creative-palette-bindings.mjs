// Other roles retain authored source repair until their visible placement is verifiable.
export const CREATIVE_COLOR_TOKENS = { surfaceColor: "--ll-creative-page" };

export function creativeColorOverrideCss(style = {}) {
  return Object.entries(style.creativeColorOverrides || {})
    .filter(
      ([field, binding]) =>
        CREATIVE_COLOR_TOKENS[field] === binding?.variable &&
        /^#[a-f0-9]{6}$/iu.test(binding?.value || ""),
    )
    .map(([, binding]) => `${binding.variable}: ${binding.value};`)
    .join(" ");
}
