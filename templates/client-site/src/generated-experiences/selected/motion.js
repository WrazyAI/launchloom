export function mountExperienceMotion(runtime) {
  if (runtime?.reducedMotion || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return () => {};
  return () => {};
}
