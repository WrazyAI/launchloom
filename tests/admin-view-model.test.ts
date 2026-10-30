import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAttemptQuery,
  buildClientQuery,
  createAdminApi,
} from "../src/admin/api";
import {
  describeAttempt,
  formatActor,
  formatClientName,
  formatCost,
  formatElapsed,
  formatProfile,
  formatTimestamp,
  focusedDiagnosticPreviewUrl,
  parseDateEnd,
  parseDateStart,
  previewHref,
  relatedPreviewLink,
  safeEvidenceUrl,
  safeFocusedPreviewUrl,
  safeSiteUrl,
  generationHeroUrl,
} from "../src/admin/format";
import { readRouteState, writeRouteState } from "../src/admin/route-state";
import {
  attemptDetail,
  fixtureHealth,
  unknownActor,
  syntheticAttempts,
  syntheticClients,
} from "./fixtures/admin-workspace";

const ROOT = path.resolve(import.meta.dirname, "..");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin view model formatting", () => {
  it("uses only the exact GitHub attempt image for proven focused runs", () => {
    const attempt = {
      issueNumber: 185,
      profile: "creative-only" as const,
      runId: "9001",
      runAttempt: 2,
      executionStatus: "succeeded" as const,
      deliveryStatus: "diagnostic" as const,
      previewUrl: "https://abc123.launchloom-pipeline-preview.pages.dev/",
    };
    expect(generationHeroUrl(attempt)).toContain("id=github%3A9001%3A2");
    expect(
      generationHeroUrl({
        ...attempt,
        executionStatus: "running",
        deliveryStatus: "none",
        previewUrl: null,
      }),
    ).toContain("id=github%3A9001%3A2");
    expect(focusedDiagnosticPreviewUrl(attempt)).toBe(attempt.previewUrl);
    expect(
      focusedDiagnosticPreviewUrl({ ...attempt, deliveryStatus: "none" }),
    ).toBeNull();
    expect(generationHeroUrl({ ...attempt, previewUrl: null })).toBeNull();
    expect(
      generationHeroUrl({ ...attempt, deliveryStatus: "none" }),
    ).toBeNull();
    expect(
      generationHeroUrl({
        ...attempt,
        previewUrl: "https://evil.pages.dev/",
      }),
    ).toBeNull();
    expect(
      generationHeroUrl({
        ...attempt,
        deliveryStatus: "published",
      }),
    ).toBeNull();
    expect(generationHeroUrl({ ...attempt, runId: null })).toBeNull();
    expect(
      generationHeroUrl({
        issueNumber: 185,
        profile: "full",
        runId: "9001",
        runAttempt: 2,
        executionStatus: "succeeded",
        deliveryStatus: "published",
        previewUrl: null,
      }),
    ).toContain("id=issue%3A185");
  });
  it("links a related preview only when it is proven and not already the own link", () => {
    const related = {
      attemptId: "github:40737253021:1",
      issueNumber: 202,
      runId: "40737253021",
      runAttempt: 1,
      completedAt: Date.UTC(2026, 9, 28, 18, 0, 0),
      deliveryStatus: "preview_ready" as const,
      previewUrl:
        "https://review-initial.launchloom-202-northline-dental-studio.pages.dev/",
    };
    expect(relatedPreviewLink(related, null)).toEqual({
      ...related,
      href: related.previewUrl,
    });
    expect(relatedPreviewLink(related, "/admin/preview/x/")).toBeNull();
    expect(relatedPreviewLink(null, null)).toBeNull();
    expect(
      relatedPreviewLink(
        { ...related, previewUrl: "https://preview.pages.dev/?token=secret" },
        null,
      ),
    ).toBeNull();
    expect(
      relatedPreviewLink(
        { ...related, previewUrl: "https://evil.example/" },
        null,
      ),
    ).toBeNull();
    expect(
      relatedPreviewLink(
        {
          ...related,
          previewUrl: "https://abc.launchloom-pipeline-preview.pages.dev/",
        },
        null,
      ),
    ).toBeNull();
    expect(
      relatedPreviewLink(
        { ...related, previewUrl: "http://review.pages.dev/" },
        null,
      ),
    ).toBeNull();
    expect(
      relatedPreviewLink({ ...related, attemptId: "bad id/<script>" }, null),
    ).toBeNull();
    expect(
      relatedPreviewLink(
        {
          ...related,
          previewUrl: "https://review-initial.client.wrazyos.com/services/",
        },
        null,
      )?.href,
    ).toBe("https://review-initial.client.wrazyos.com/services/");
  });
  it("does not manufacture an actor name or a zero price", () => {
    expect(formatActor(unknownActor).label).toBe("Not recorded");
    expect(
      formatCost({ actualUsd: null, estimatedUsd: null, unreportedCount: 1 })
        .actual,
    ).toBe("Not reported");
    expect(
      formatCost({ actualUsd: null, estimatedUsd: null, unreportedCount: 1 })
        .estimated,
    ).toBe("Not reported");
  });

  it("renders recorded actors and their provenance without inference", () => {
    expect(
      formatActor({
        kind: "admin",
        id: "admin:1",
        name: "Avery Chen",
        email: "avery@example.test",
        source: "cloudflare-access",
      }),
    ).toEqual({ label: "Avery Chen", sourceLabel: "Access" });
    expect(
      formatActor({
        kind: "client",
        id: null,
        name: null,
        email: "zoe@example.test",
        source: "intake",
      }),
    ).toEqual({ label: "zoe@example.test", sourceLabel: "Client submission" });
    expect(
      formatActor({
        kind: "github",
        id: "42",
        name: null,
        email: null,
        source: "github",
      }),
    ).toEqual({ label: "GitHub actor", sourceLabel: "GitHub" });
    expect(
      formatActor({
        kind: "system",
        id: null,
        name: null,
        email: null,
        source: "system",
      }),
    ).toEqual({ label: "System", sourceLabel: "System" });
  });

  it("keeps actual, estimated and unreported cost values separate", () => {
    expect(
      formatCost({ actualUsd: 0, estimatedUsd: null, unreportedCount: 0 }),
    ).toEqual({
      actual: "$0.00",
      estimated: "Not reported",
      unreported: "None unreported",
    });
    expect(
      formatCost({ actualUsd: 0.0042, estimatedUsd: 1.5, unreportedCount: 2 }),
    ).toEqual({
      actual: "$0.0042",
      estimated: "$1.50",
      unreported: "2 unreported",
    });
    expect(
      formatCost({
        actualUsd: -1,
        estimatedUsd: Number.NaN,
        unreportedCount: 0,
      }),
    ).toMatchObject({ actual: "Not reported", estimated: "Not reported" });
  });

  it("keeps execution and delivery independent", () => {
    expect(
      describeAttempt({
        executionStatus: "failed",
        deliveryStatus: "diagnostic",
      }),
    ).toEqual({ executionLabel: "Failed", deliveryLabel: "Diagnostic" });
    expect(
      describeAttempt({
        executionStatus: "failed",
        deliveryStatus: "preview_ready",
      }),
    ).toEqual({ executionLabel: "Failed", deliveryLabel: "Preview ready" });
    expect(
      describeAttempt({
        executionStatus: "unknown",
        deliveryStatus: "none",
      }),
    ).toEqual({ executionLabel: "Unknown", deliveryLabel: "No delivery" });
    expect(
      describeAttempt({
        executionStatus: "succeeded",
        deliveryStatus: "published",
      }),
    ).toEqual({ executionLabel: "Succeeded", deliveryLabel: "Published" });
  });

  it("does not turn an empty or invalid date filter into an epoch filter", () => {
    expect(parseDateStart("")).toBeUndefined();
    expect(parseDateEnd("")).toBeUndefined();
    expect(parseDateStart("2026-02-31")).toBeUndefined();
    expect(parseDateEnd("2026-10-19")).toBe(Date.UTC(2026, 9, 20) - 1);
  });

  it("uses real contact identity before an opaque client record id", () => {
    expect(
      formatClientName({
        businessName: null,
        contactName: null,
        email: "legacy@example.test",
        clientId: "submission:9035e03f-dead-beef",
      }),
    ).toBe("legacy@example.test");
    expect(
      formatClientName({
        businessName: null,
        contactName: null,
        email: null,
        clientId: "submission:9035e03f-dead-beef",
      }),
    ).toBe("Client 9035e03f");
  });

  it("shows unknown or invalid dates as not recorded", () => {
    expect(formatTimestamp(null)).toBe("Not recorded");
    expect(formatTimestamp(Number.NaN)).toBe("Not recorded");
    expect(formatTimestamp(9e15)).toBe("Not recorded");
    expect(formatTimestamp(Date.UTC(2026, 9, 19, 14, 0))).toBe(
      "19 Oct 2026, 14:00 UTC",
    );
  });

  it("only links approved token-free HTTPS evidence and site routes", () => {
    expect(
      safeEvidenceUrl(
        "https://github.com/WrazyAI/launchloom/actions/runs/90123",
      ),
    ).toBe("https://github.com/WrazyAI/launchloom/actions/runs/90123");
    expect(
      safeEvidenceUrl("https://github.com/WrazyAI/launchloom/issues/12"),
    ).toBe("https://github.com/WrazyAI/launchloom/issues/12");
    expect(safeEvidenceUrl("javascript:window.alert(1)")).toBeNull();
    expect(
      safeEvidenceUrl("https://github.com/other/repo/actions/runs/1"),
    ).toBeNull();
    expect(
      safeEvidenceUrl(
        "https://github.com/WrazyAI/launchloom/actions/runs/1?token=secret",
      ),
    ).toBeNull();

    expect(safeSiteUrl("https://acme.pages.dev/")).toBe(
      "https://acme.pages.dev/",
    );
    expect(safeSiteUrl("https://launchloom.wrazyos.com/")).toBe(
      "https://launchloom.wrazyos.com/",
    );
    expect(safeSiteUrl("https://acme.pages.dev/?token=secret")).toBeNull();
    expect(safeSiteUrl("javascript:window.alert(1)")).toBeNull();
    expect(safeSiteUrl("https://unapproved.example.test/")).toBeNull();

    expect(previewHref("https://acme.pages.dev/services/")).toBe(
      "https://acme.pages.dev/services/",
    );
    expect(
      previewHref(
        "https://abc.launchloom-pipeline-preview.pages.dev/services/",
      ),
    ).toBe(
      "/admin/preview/abc.launchloom-pipeline-preview.pages.dev/services/",
    );
    expect(previewHref("https://launchloom.wrazyos.com/about")).toBe(
      "https://launchloom.wrazyos.com/about",
    );
    expect(previewHref("javascript:window.alert(1)")).toBeNull();

    expect(
      safeFocusedPreviewUrl(
        "https://abc123.launchloom-pipeline-preview.pages.dev/",
      ),
    ).toBe("https://abc123.launchloom-pipeline-preview.pages.dev/");
    expect(safeFocusedPreviewUrl("https://evil.pages.dev/")).toBeNull();
    expect(safeFocusedPreviewUrl("https://launchloom.wrazyos.com/")).toBeNull();
    expect(safeFocusedPreviewUrl(null)).toBeNull();
  });

  it("does not call a terminal attempt in progress when completion is missing", () => {
    expect(formatElapsed(1_000, null, false)).toBe("In progress");
    expect(formatElapsed(1_000, null, true)).toBe("Not recorded");
    expect(formatElapsed(null, null, true)).toBe("Not started");
    expect(formatElapsed(1_000, 61_000, true)).toBe("1 minute");
  });

  it("uses sentence-case profile labels", () => {
    expect(formatProfile("full")).toBe("Full generation");
    expect(formatProfile("full-preview")).toBe("Full preview");
    expect(formatProfile("creative-only")).toBe("Creative only");
    expect(formatProfile("seo-only")).toBe("SEO only");
  });
});

describe("admin API contracts", () => {
  it("serializes every server-side attempt filter and cursor", () => {
    const query = buildAttemptQuery({
      search: "  Zoë & Sons ",
      executionStatus: "failed",
      initiatorId: "admin:initiator",
      creatorId: "admin:creator",
      profile: "full",
      clientId: "submission:client-a",
      from: 100,
      to: 200,
      cursor: "offset:100",
      limit: 100,
    });
    expect(Object.fromEntries(query)).toEqual({
      search: "Zoë & Sons",
      executionStatus: "failed",
      initiatorId: "admin:initiator",
      creatorId: "admin:creator",
      profile: "full",
      clientId: "submission:client-a",
      from: "100",
      to: "200",
      cursor: "offset:100",
      limit: "100",
    });
    expect(Object.fromEntries(buildAttemptQuery({ search: "   " }))).toEqual(
      {},
    );
  });

  it("serializes client filters, cursors and limits", () => {
    const query = buildClientQuery({
      search: "same@example.test",
      from: 10,
      to: 20,
      cursor: "offset:50",
      limit: 50,
    });
    expect(Object.fromEntries(query)).toEqual({
      search: "same@example.test",
      from: "10",
      to: "20",
      cursor: "offset:50",
      limit: "50",
    });
  });

  it("sends typed requests and unwraps detail envelopes", async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requested.push(url);
        if (url.includes("/attempts/")) {
          if (url.endsWith("/events?cursor=offset%3A25&limit=25"))
            return json({ items: [], total: 0, nextCursor: null });
          return json({ attempt: { attemptId: "attempt-1" } });
        }
        if (url.includes("/clients/"))
          return json({ client: { clientId: "submission:client-a" } });
        if (url.endsWith("/clients?search=Acme&limit=25"))
          return json({
            items: [],
            total: 0,
            nextCursor: null,
            health: fixtureHealth(),
          });
        if (url.endsWith("/health")) return json(fixtureHealth());
        if (url.endsWith("/me"))
          return json({
            principal: {
              id: `access:${"a".repeat(64)}`,
              email: "admin@example.test",
              displayName: null,
              role: "admin",
              authSource: "cloudflare-access",
            },
          });
        return json({
          items: [{ attemptId: "attempt-1" }],
          total: 1,
          nextCursor: null,
        });
      }),
    );
    const api = createAdminApi();
    await expect(
      api.listAttempts({ executionStatus: "failed", limit: 25 }),
    ).resolves.toMatchObject({ total: 1 });
    await expect(api.getAttempt("attempt-1")).resolves.toMatchObject({
      attemptId: "attempt-1",
    });
    await expect(
      api.getAttemptEvents("attempt-1", "offset:25", 25),
    ).resolves.toMatchObject({ items: [], total: 0 });
    await expect(
      api.listClients({ search: "Acme", limit: 25 }),
    ).resolves.toMatchObject({ total: 0, health: { partial: false } });
    await expect(api.getClient("submission:client-a")).resolves.toMatchObject({
      clientId: "submission:client-a",
    });
    await expect(api.getHealth()).resolves.toMatchObject({ partial: false });
    await expect(api.getMe()).resolves.toMatchObject({
      email: "admin@example.test",
      displayName: null,
      role: "admin",
    });
    expect(requested).toEqual(
      expect.arrayContaining([
        "/api/admin/onboarding-invites/workspace/attempts?executionStatus=failed&limit=25",
        "/api/admin/onboarding-invites/workspace/attempts/attempt-1",
        "/api/admin/onboarding-invites/workspace/attempts/attempt-1/events?cursor=offset%3A25&limit=25",
        "/api/admin/onboarding-invites/workspace/clients?search=Acme&limit=25",
        "/api/admin/onboarding-invites/workspace/clients/submission%3Aclient-a",
        "/api/admin/onboarding-invites/workspace/health",
        "/api/admin/onboarding-invites/workspace/me",
      ]),
    );
  });

  it("rejects a malformed page response rather than rendering invented rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ items: "nope", total: 4, nextCursor: null })),
    );
    await expect(createAdminApi().listAttempts({})).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});

describe("URL-addressable admin route state", () => {
  it("round-trips view, direct record IDs, filters, unicode search and cursor", () => {
    const url = writeRouteState({
      view: "clients",
      clientId: "submission:client-a",
      attemptId: null,
      filters: {
        search: "Zoë & Sons",
        clientId: "submission:client-a",
        from: Date.UTC(2026, 9, 1),
        to: Date.UTC(2026, 9, 19, 23, 59),
        limit: 50,
      },
      cursor: "offset:50",
    });
    expect(readRouteState(url)).toEqual({
      view: "clients",
      clientId: "submission:client-a",
      attemptId: null,
      filters: {
        search: "Zoë & Sons",
        clientId: "submission:client-a",
        from: Date.UTC(2026, 9, 1),
        to: Date.UTC(2026, 9, 19, 23, 59),
        limit: 50,
      },
      cursor: "offset:50",
    });
  });

  it("ignores non-allowlisted views, unsafe IDs and invalid filter values", () => {
    expect(
      readRouteState(
        "https://admin.invalid/admin/onboarding-invites?view=evil&attempt=%3Cscript%3E&client=bad%20id&status=maybe&profile=other&from=-1&limit=1000&cursor=",
      ),
    ).toEqual({
      view: "generations",
      clientId: null,
      attemptId: null,
      filters: {},
      cursor: null,
    });
  });

  it("writes only allowlisted filters and clamps sensitive-looking cursor text", () => {
    const url = writeRouteState({
      view: "generations",
      clientId: null,
      attemptId: "attempt-1",
      filters: {
        search: "Acme",
        executionStatus: "failed",
        profile: "seo-only",
        initiatorId: "admin:1",
        creatorId: "admin:2",
        from: 1,
        to: 2,
        limit: 100,
      },
      cursor: "offset:100",
    });
    expect(url.pathname).toBe("/admin/onboarding-invites");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      view: "generations",
      attempt: "attempt-1",
      search: "Acme",
      status: "failed",
      profile: "seo-only",
      initiator: "admin:1",
      creator: "admin:2",
      from: "1",
      to: "2",
      limit: "100",
      cursor: "offset:100",
    });
  });
});

describe("fixture boundaries and runtime isolation", () => {
  it("provides enough paginated synthetic history to exceed one page of 251", () => {
    const attempts = syntheticAttempts();
    const clients = syntheticClients();
    expect(attempts.length).toBeGreaterThan(251);
    expect(clients.length).toBeGreaterThan(151);
    const shared = clients.filter(
      (client) => client.email === "same@example.test",
    );
    expect(shared).toHaveLength(2);
    expect(new Set(shared.map((client) => client.clientId)).size).toBe(2);
    expect(attemptDetail(attempts[0]).events.length).toBeGreaterThan(0);
  });

  it("never imports the test fixtures into runtime admin modules", async () => {
    const directory = path.join(ROOT, "src", "admin");
    const entries = await readdir(directory, { recursive: true });
    for (const entry of entries) {
      if (!/\.(?:ts|tsx)$/u.test(entry)) continue;
      const source = await readFile(path.join(directory, entry), "utf8");
      expect(source).not.toMatch(/tests\/fixtures|fixtures\/admin-workspace/u);
      expect(source).not.toContain("\u2014");
    }
  });
});
