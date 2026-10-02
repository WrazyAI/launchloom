// Run with Node 22 --experimental-strip-types. Uses existing Actions secrets;
// prints only public city labels and bounded lookup results, never signed refs.
import { randomUUID } from "node:crypto";
import { lookupCoverageAreas } from "../worker/src/coverage-areas.ts";
const providerFetch = async (url, options) => {
  const response = await fetch(url, options);
  const payload = await response.clone().json().catch(() => ({}));
  if (!response.ok || (payload.status && !["OK", "ZERO_RESULTS"].includes(payload.status))) {
    const key = process.env.GOOGLE_PLACES_API_KEY || "";
    const rawMessage = String(payload.error_message || payload.error?.message || "");
    const message = (key ? rawMessage.split(key).join("[redacted]") : rawMessage).replace(/https?:\/\/\S+/gu, "[provider link]").slice(0, 400);
    console.log(JSON.stringify({ providerDiagnostic: true, api: new URL(url).hostname === "maps.googleapis.com" ? "geocoding" : "places", httpStatus: response.status, status: payload.status || payload.error?.status, message }));
  }
  return response;
};
for (const radius of ["10", "20", "30", "50", "50+"]) {
  const result = await lookupCoverageAreas({
    env: { GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY, ONBOARDING_INVITE_SIGNING_SECRET: randomUUID() },
    inviteId: "coverage-provider-canary",
    primaryCity: "Cookeville, TN",
    serviceRadius: radius,
    fetchImpl: providerFetch,
  });
  const summary = result.ok ? {
    radius, ok: true, primary: result.primary.label,
    cities: result.candidates.map(city => ({ label: city.label, distanceMiles: city.distanceMiles })),
    partial: result.partial, truncated: result.truncated, warnings: result.warnings,
  } : { radius, ok: false, code: result.code, message: result.message };
  console.log(JSON.stringify(summary));
  if (!result.ok || result.partial) process.exitCode = 1;
}
