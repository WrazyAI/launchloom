import { it, expect } from "vitest";
import { buildRouteHandoff } from "../scripts/route-verification-handoff.mjs";
const technical: any = {
  status: "pass",
  routes: [{ routeId: "home:", path: "/", status: "pass", checks: [] }],
  failures: [],
};
const browser: any = {
  status: "pass",
  routes: [
    {
      routeId: "home:",
      path: "/",
      status: "pass",
      profiles: [{ checks: [], forms: [] }],
    },
  ],
  failures: [],
};
it("keeps local synthetic evidence separate from deferred production/provider evidence", () => {
  const report = buildRouteHandoff({
    config: { business: { name: "Fixture" }, services: [], locations: [] },
    identity: {
      commit: "abc",
      configDigest: "123",
      environment: "local-static",
    },
    technical,
    browser,
    contrast: { pass: true, findings: [] },
  });
  expect(report.readiness.local.status).toBe("pass");
  expect(report.readiness.production.status).toBe("not_verified");
  expect(report.readiness.provider.status).toBe("not_verified");
  expect(report.promotionAuthority).toBe(false);
});
it("blocks unresolved contrast even when another summary claims pass", () => {
  const report = buildRouteHandoff({
    config: {},
    identity: {},
    technical,
    browser,
    contrast: {
      pass: true,
      findings: [
        {
          status: "unresolved",
          route: "/",
          text: "Ambiguous painted background",
        },
      ],
    },
  });
  expect(report.readiness.local.status).toBe("fail");
});
it("blocks missing browser results for a technically approved route", () => {
  const report = buildRouteHandoff({
    config: {},
    identity: {},
    technical,
    browser: { ...browser, routes: [] },
    contrast: { pass: true, findings: [] },
  });
  expect(report.readiness.local.status).toBe("fail");
  expect(report.routes[0].browser.status).toBe("not_verified");
});
it("strips private locations, configured tokens and asset URL queries from reports", () => {
  const report = buildRouteHandoff({
    config: {
      business: { addressVisibility: "private", address: "99 Secret Lane" },
      lead: { token: "secret-token" },
    },
    identity: {},
    technical: {
      ...technical,
      failures: [
        "99 Secret Lane secret-token https://assets.example/a?token=secret-token",
      ],
    },
    browser,
    contrast: { pass: true, findings: [] },
  });
  const json = JSON.stringify(report);
  expect(json).not.toContain("99 Secret Lane");
  expect(json).not.toContain("secret-token");
});
