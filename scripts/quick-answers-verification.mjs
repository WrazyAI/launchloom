/**
 * Decide how the rendered verifier may exercise the desktop quick-answers
 * assistant. The in-flow fallback must be as usable as the floating launcher.
 * @param {{launcherVisible: boolean, inert: boolean, colliding: boolean}} state
 * @returns {"interact" | "invalid"}
 */
export function quickAnswersInteraction({ launcherVisible, inert }) {
  if (launcherVisible && !inert) return "interact";
  return "invalid";
}
