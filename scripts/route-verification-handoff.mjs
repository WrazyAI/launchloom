import { redactPrivateLocation } from "../templates/client-site/src/lib/business-facts.mjs";
import { compilePageBriefs } from "../templates/client-site/src/lib/page-briefs.mjs";

export function sanitizeVerificationReport(value, config) {
  const clean = redactPrivateLocation(value, config.business || {});
  let json = JSON.stringify(clean);
  for (const token of [
    config.lead?.token,
    config.conversion?.aiChat?.token,
  ].filter(Boolean))
    json = json.replaceAll(String(token), "[redacted]");
  return JSON.parse(
    json.replace(/https?:\/\/[^\s"<>\\]+/gu, (url) => {
      try {
        const parsed = new URL(url);
        parsed.username = "";
        parsed.password = "";
        parsed.search = "";
        return parsed.href;
      } catch {
        return "[redacted URL]";
      }
    }),
  );
}

/** Evidence aggregation only. Creative/fact/admission/promotion gates retain authority. */
export function buildRouteHandoff({
  config,
  identity,
  technical,
  browser,
  contrast,
  destination = undefined,
}) {
  const briefs = compilePageBriefs(config);
  const blockers = [
    ...(technical?.failures || []),
    ...(browser?.failures || []),
  ];
  const routes = (technical?.routes || []).map((route) => {
    const observed = browser?.routes?.find(
      (item) => item.routeId === route.routeId,
    );
    if (!observed || observed.status !== "pass")
      blockers.push(
        `${route.path}: browser evidence ${observed?.status || "not_verified"}.`,
      );
    const brief = briefs.briefs.find((item) => item.routeId === route.routeId);
    return {
      ...route,
      technical: { status: route.status, checks: route.checks },
      browser: observed || { status: "not_verified" },
      provenance: brief
        ? {
            mode: brief.mode,
            version: brief.version,
            media: brief.media.map(({ src, alt, evidenceId }) => ({
              src,
              alt,
              evidenceId,
            })),
            evidenceIds: brief.evidenceIds || [],
            factGaps: brief.issues || [],
            omissions: brief.omissions || [],
          }
        : null,
    };
  });
  if (!routes.length) blockers.push("No approved route evidence.");
  if (technical?.status !== "pass")
    blockers.push("Technical/content gate did not pass.");
  if (browser?.status !== "pass")
    blockers.push("Required browser scope did not pass.");
  if (
    contrast?.pass !== true ||
    (contrast.findings || []).some(
      (item) => item.status === "fail" || item.status === "unresolved",
    )
  )
    blockers.push(
      "Full rendered contrast has failed, unresolved or absent evidence.",
    );
  return sanitizeVerificationReport(
    {
      version: 1,
      promotionAuthority: false,
      identity,
      scope: "local-built-site-with-intercepted-synthetic-delivery",
      routes,
      technical,
      browser,
      contrast,
      destination: destination || { status: "not_verified" },
      readiness: {
        local: {
          status: blockers.length ? "fail" : "pass",
          blockers: [...new Set(blockers)],
          owner: "developer",
        },
        provider: {
          status: "not_verified",
          owner: "client/provider",
          dependency:
            "Explicit provider test authorization and a supported test destination.",
        },
        production: {
          status: destination?.status || "not_verified",
          owner: "developer",
          dependency:
            "Shipping authorization, deployed commit readback and destination verification.",
        },
      },
      limits: [
        "Synthetic intercepted requests do not prove provider acceptance or real delivery.",
        "This report supplements existing release and creative-promotion gates.",
      ],
    },
    config,
  );
}
