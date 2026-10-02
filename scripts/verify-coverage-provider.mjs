// Run with Node 22 --experimental-strip-types. Uses existing Actions secrets;
// prints only public city labels and bounded lookup results, never signed refs.
import { randomUUID } from "node:crypto";
import { lookupCoverageAreas } from "../worker/src/coverage-areas.ts";
const results = [];
for (const radius of ["10", "20", "30", "50", "50+"]) {
  const result = await lookupCoverageAreas({
    env: { GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY, ONBOARDING_INVITE_SIGNING_SECRET: randomUUID() },
    inviteId: "coverage-provider-canary",
    primaryCity: "Cookeville, TN",
    serviceRadius: radius,
  });
  const summary = result.ok ? {
    radius, ok: true, primary: result.primary.label,
    cities: result.candidates.map(city => ({ label: city.label, distanceMiles: city.distanceMiles })),
    partial: result.partial, truncated: result.truncated, warnings: result.warnings,
  } : { radius, ok: false, code: result.code, message: result.message };
  results.push(summary);
  console.log(JSON.stringify(summary));
  if (!result.ok || result.partial) process.exitCode = 1;
}
