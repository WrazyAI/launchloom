/**
 * Decide how the rendered verifier may exercise the desktop quick-answers
 * assistant. The shared layout hides and inerts the launcher only after it
 * proves a collision with visible page copy or controls. A hidden launcher
 * without that proof is a defect, not an accepted state.
 * @param {{launcherVisible: boolean, inert: boolean, colliding: boolean}} state
 * @returns {"interact" | "suppressed" | "invalid"}
 */
export function quickAnswersInteraction({ launcherVisible, inert, colliding }) {
  if (launcherVisible && !inert) return "interact";
  if (!launcherVisible && inert && colliding) return "suppressed";
  return "invalid";
}
