import { it, expect, afterEach, vi } from "vitest";
import http from "node:http";
import {
  diagnosticFormMode,
  verifyApprovedRoutes,
} from "../scripts/browser-route-verification.mjs";
vi.setConfig({ testTimeout: 60000 });
const owned: http.Server[] = [];
afterEach(async () => {
  await Promise.all(
    owned
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});
const config: any = {
  business: { name: "Browser Fixture", serviceAreas: [], phone: "555-0100" },
  services: [
    {
      name: "Drain cleaning",
      slug: "drain-cleaning",
      description: "Describe your request.",
    },
  ],
  locations: [],
  routePolicy: {
    version: 1,
    decisions: [
      { pageType: "services-hub", status: "omitted" },
      { pageType: "about", status: "omitted" },
      { pageType: "contact", status: "omitted" },
    ],
  },
  lead: { apiUrl: "https://stage4-provider.invalid", token: "synthetic-token" },
};
it.each(["seo-only", "creative-only", "full-preview"])(
  "accepts %s as a disabled, test-only diagnostic form profile",
  (profile) => {
    expect(
      diagnosticFormMode({
        lead: { apiUrl: "", token: "" },
        pipelineTest: {
          version: 1,
          profile,
          testOnly: true,
          sourceSha: "a".repeat(40),
          runId: "synthetic",
        },
      }),
    ).toBe("test-preview");
  },
);
it("treats a fictional full-path demo as a disabled preview and rejects production form mode", () => {
  const fictional = {
    ...config,
    demoNotice: "Fictional pipeline demo",
    lead: { apiUrl: "", token: "" },
  };
  expect(diagnosticFormMode(fictional)).toBe("test-preview");
  expect(() => diagnosticFormMode(fictional, "production")).toThrow(
    /test-only/i,
  );
});
function html(route: string, broken = false, h1OutsideMain = false) {
  const pageHeading = `<h1>${route === "/" ? "Browser Fixture" : "Drain cleaning"}</h1>`;
  const body = `<a href="${route === "/" ? "/services/drain-cleaning/" : "/"}">Other page</a><details><summary>What should I share?</summary><p>Explain which drain is affected.</p></details><form class="lead-form"><label>Name<input name="name" required></label><label>Phone<input name="phone" required></label><label>Email<input name="email" type="email" required></label><label>Message<textarea name="message" required></textarea></label><button type="submit">Send</button><small role="status"></small></form>`;
  const page = h1OutsideMain
    ? `${pageHeading}<main>${body}</main>`
    : `<main>${pageHeading}${body}</main>`;
  return `<html><head><title>Browser fixture</title></head><body>${page}<script>${broken ? 'throw new Error("synthetic hydration failure");' : ""}const form=document.querySelector('form');form.addEventListener('submit',async event=>{event.preventDefault();try{const fields=Object.fromEntries(new FormData(form));const r=await fetch('https://stage4-provider.invalid/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,token:'synthetic-token',pageUrl:location.href})});const data=await r.json();if(!r.ok)throw new Error(data.error);form.reset();form.querySelector('[role=status]').textContent='Thank you. We will be in touch shortly.';dispatchEvent(new CustomEvent('launchloom:lead-submitted'));}catch(error){form.querySelector('[role=status]').textContent=error.message;}});</script></body></html>`;
}
async function server(
  options: {
    soft404?: boolean;
    broken?: boolean;
    asset?: boolean;
    fakeSuccess?: boolean;
    noForms?: boolean;
    fragmentLink?: boolean;
    relativeNavigation?: boolean;
    h1OutsideMain?: boolean;
    preview?:
      | "safe"
      | "hidden"
      | "no-marker"
      | "live-token"
      | "network"
      | "native-get"
      | "stale-status"
      | "image-get";
  } = {},
) {
  let mutations = 0;
  let deliveries = 0;
  const s = http.createServer((req, res) => {
    if (req.method === "POST") mutations++;
    const route = new URL(req.url!, "http://localhost").pathname;
    if (route === "/unexpected-submission") deliveries++;
    if (
      ![
        "/",
        "/services/drain-cleaning/",
        ...(options.relativeNavigation ? ["/services/pipe-repair/"] : []),
      ].includes(route) &&
      !options.soft404
    ) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    res.setHeader("Content-Type", "text/html");
    if (options.preview) {
      const base = html(route).replace(/<script>[\s\S]*?<\/script>/u, "");
      const body = base.replace(
        '<form class="lead-form">',
        `<form class="lead-form" ${options.preview === "hidden" ? "hidden" : ""} ${options.preview === "no-marker" ? "" : 'data-lead-preview="true"'}><input type="hidden" name="lead-token" value="${options.preview === "live-token" ? "live-secret" : ""}">`,
      );
      const diagnosticBody =
        options.preview === "native-get"
          ? body.replace(
              '<form class="lead-form"',
              '<form method="get" action="/unexpected-submission" class="lead-form"',
            )
          : options.preview === "stale-status"
            ? body.replace(
                '<small role="status"></small>',
                '<small role="status">Test-only preview: submissions are disabled.</small>',
              )
            : body;
      res.end(
        diagnosticBody +
          `<script>document.querySelector('form').addEventListener('submit', async event => { ${options.preview === "native-get" ? "" : "event.preventDefault();"} ${options.preview === "network" ? "await fetch('/unexpected-submission',{method:'POST'});" : ""} ${options.preview === "image-get" ? "const beacon = new Image(); beacon.src = '/unexpected-submission?name=Synthetic'; document.body.append(beacon);" : ""} ${options.preview === "stale-status" ? "" : "document.querySelector('form [role=status]').textContent='Test-only preview: submissions are disabled.';"} });</script>`,
      );
      return;
    }
    if (options.fragmentLink || options.relativeNavigation) {
      let body = html(route, options.broken, options.h1OutsideMain);
      if (route !== "/" && options.relativeNavigation) {
        body = body.replace(
          '<a href="/">Other page</a>',
          `<a href="../${route.includes("pipe-repair") ? "drain-cleaning" : "pipe-repair"}/">Other page</a>`,
        );
      }
      if (options.fragmentLink) {
        body = body.replace(
          "</h1>",
          '</h1><a href="#contact">Contact on this page</a><div id="contact">Contact details</div>',
        );
      }
      res.end(body);
      return;
    }
    if (options.noForms) {
      res.end(
        html(route, options.broken, options.h1OutsideMain)
          .replace(/<form[\s\S]*?<\/form>/u, "")
          .replace(/<script>[\s\S]*?<\/script>/u, ""),
      );
      return;
    }
    res.end(
      (options.fakeSuccess
        ? html(route, options.broken, options.h1OutsideMain).replace(
            "dispatchEvent(new CustomEvent('launchloom:lead-submitted'));",
            "",
          )
        : html(route, options.broken, options.h1OutsideMain)) +
        (options.asset
          ? '<img src="/missing.webp" alt="Missing context">'
          : ""),
    );
  });
  owned.push(s);
  await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
  return {
    origin: "http://127.0.0.1:" + (s.address() as any).port,
    mutations: () => mutations,
    deliveries: () => deliveries,
  };
}
it.each(["safe", "hidden", "no-marker", "live-token", "network"] as const)(
  "verifies bounded diagnostic form behavior: %s",
  async (preview) => {
    const s = await server({ preview });
    const diagnosticConfig = {
      ...config,
      lead: { apiUrl: "", token: "" },
      pipelineTest: {
        version: 1,
        profile: "seo-only",
        testOnly: true,
        sourceSha: "a".repeat(40),
        runId: "synthetic",
      },
    };
    const report: any = await verifyApprovedRoutes({
      config: diagnosticConfig,
      origin: s.origin,
      mode: "review",
      formMode: "test-preview",
      viewports: [{ name: "mobile", width: 390, height: 844 }],
      representativeViewports: [],
      timeout: 1500,
    });
    expect(report.status).toBe(preview === "safe" ? "pass" : "fail");
    if (preview === "safe") {
      expect(
        report.routes.every((route: any) =>
          route.profiles.every((profile: any) =>
            profile.forms.every(
              (form: any) =>
                form.previewDisabled === "pass" &&
                form.externalDelivery === "not_verified" &&
                form.syntheticRequests === 0,
            ),
          ),
        ),
      ).toBe(true);
    }
    expect(s.mutations()).toBe(0);
  },
);
it("runs the disabled-form browser check for full-preview provenance", async () => {
  const s = await server({ preview: "safe" });
  const diagnosticConfig = {
    ...config,
    lead: { apiUrl: "", token: "" },
    pipelineTest: {
      version: 1,
      profile: "full-preview",
      testOnly: true,
      sourceSha: "a".repeat(40),
      runId: "synthetic",
    },
  };
  const report: any = await verifyApprovedRoutes({
    config: diagnosticConfig,
    origin: s.origin,
    mode: "review",
    formMode: diagnosticFormMode(diagnosticConfig),
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    representativeViewports: [],
    timeout: 1500,
  });
  expect(report.status).toBe("pass");
  expect(s.mutations()).toBe(0);
});
it.each(["native-get", "stale-status", "image-get"] as const)(
  "rejects diagnostic GET delivery or stale disabled status: %s",
  async (preview) => {
    const s = await server({ preview });
    const diagnosticConfig = {
      ...config,
      lead: { apiUrl: "", token: "" },
      pipelineTest: {
        version: 1,
        profile: "seo-only",
        testOnly: true,
        sourceSha: "a".repeat(40),
        runId: "synthetic",
      },
    };
    const report: any = await verifyApprovedRoutes({
      config: diagnosticConfig,
      origin: s.origin,
      mode: "review",
      formMode: "test-preview",
      viewports: [{ name: "mobile", width: 390, height: 844 }],
      representativeViewports: [],
      timeout: 1500,
    });
    expect(s.deliveries()).toBe(0);
    expect(report.status).toBe("fail");
    expect(
      report.routes.every((route: any) =>
        route.profiles.every(
          (profile: any) =>
            profile.forms.length > 0 &&
            profile.forms.some((form: any) => form.failures.length > 0),
        ),
      ),
    ).toBe(true);
  },
);
it.each(["production", "unmarked", "malformed", "live-config"])(
  "refuses unauthorized diagnostic form relaxation: %s",
  async (variant) => {
    const s = await server({ preview: "safe" });
    const diagnosticConfig: any = {
      ...config,
      lead: { apiUrl: "", token: "" },
      pipelineTest: {
        version: 1,
        profile: "seo-only",
        testOnly: true,
        sourceSha: "a".repeat(40),
        runId: "synthetic",
      },
    };
    if (variant === "unmarked") delete diagnosticConfig.pipelineTest;
    if (variant === "malformed")
      diagnosticConfig.pipelineTest = { testOnly: true };
    if (variant === "live-config") diagnosticConfig.lead = config.lead;
    await expect(
      verifyApprovedRoutes({
        config: diagnosticConfig,
        origin: s.origin,
        mode: variant === "production" ? "production" : "review",
        formMode: "test-preview",
        viewports: [{ name: "mobile", width: 390, height: 844 }],
        timeout: 500,
      }),
    ).rejects.toThrow(/test-preview|Diagnostic/);
  },
);
it("retains terminal synthetic delivery requirements for preview-marked production forms", async () => {
  const s = await server({ preview: "safe" });
  const report: any = await verifyApprovedRoutes({
    config,
    origin: s.origin,
    mode: "production",
    formMode: "mocked",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    representativeViewports: [],
    timeout: 1500,
  });
  expect(report.status).toBe("fail");
  expect(
    report.routes.some((route: any) =>
      route.profiles.some((profile: any) =>
        profile.forms.some((form: any) =>
          form.failures.includes(
            "Production forms require terminal synthetic lifecycle evidence.",
          ),
        ),
      ),
    ),
  ).toBe(true);
});
it("records every admitted route and synthetic success/failure delivery without external writes", async () => {
  const s = await server();
  const report: any = await verifyApprovedRoutes({
    config,
    origin: s.origin,
    formMode: "mocked",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    timeout: 1500,
  });
  expect(report.status).toBe("pass");
  expect(report.routes.map((r: any) => r.path)).toEqual(
    expect.arrayContaining(["/", "/services/drain-cleaning/"]),
  );
  expect(
    report.routes.every((r: any) =>
      r.profiles.every((p: any) =>
        p.forms.every(
          (f: any) =>
            f.delivery.success === "pass" && f.delivery.failure === "pass",
        ),
      ),
    ),
  ).toBe(true);
  expect(s.mutations()).toBe(0);
});

it("reports out-of-main H1 separately from a successful route refresh", async () => {
  const s = await server({ h1OutsideMain: true });
  const report: any = await verifyApprovedRoutes({
    config,
    origin: s.origin,
    formMode: "mocked",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    representativeViewports: [],
    timeout: 1500,
  });
  const homepage = report.routes.find((route: any) => route.path === "/");
  const checks = homepage.profiles[0].checks;

  expect(checks.find((check: any) => check.name === "h1")?.status).toBe("fail");
  expect(checks.find((check: any) => check.name === "refresh")?.status).toBe(
    "pass",
  );
  expect(
    checks.find((check: any) => check.name === "main-heading-after-refresh")
      ?.status,
  ).toBe("fail");
});

it("keeps fragment-only links on the current route before verifying cross-route navigation", async () => {
  const s = await server({ fragmentLink: true });
  const report: any = await verifyApprovedRoutes({
    config,
    origin: s.origin,
    formMode: "mocked",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    representativeViewports: [],
    timeout: 1500,
  });
  expect(report.failures).toEqual([]);
  expect(report.status).toBe("pass");
  expect(s.mutations()).toBe(0);
});

it("resolves relative sibling links from the current service route", async () => {
  const s = await server({ relativeNavigation: true });
  const report: any = await verifyApprovedRoutes({
    config: {
      ...config,
      services: [
        ...config.services,
        {
          name: "Pipe repair",
          slug: "pipe-repair",
          description: "Describe the pipe problem.",
        },
      ],
    },
    origin: s.origin,
    formMode: "mocked",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    representativeViewports: [],
    timeout: 1500,
  });
  expect(report.failures).toEqual([]);
  expect(report.status).toBe("pass");
  expect(s.mutations()).toBe(0);
});
it("rejects a soft 404 even when unknown slugs return a homepage", async () => {
  const s = await server({ soft404: true });
  const report: any = await verifyApprovedRoutes({
    config,
    origin: s.origin,
    formMode: "mocked",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    timeout: 1500,
  });
  expect(report.status).toBe("fail");
  expect(report.failures.join(" ")).toContain("404");
});
it("reports runtime script errors on their route and viewport", async () => {
  const s = await server({ broken: true });
  const report: any = await verifyApprovedRoutes({
    config,
    origin: s.origin,
    formMode: "mocked",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    timeout: 1500,
  });
  expect(report.status).toBe("fail");
  expect(report.failures.join(" ")).toContain("runtime");
});
it("does not equate unconfigured forms with verified delivery", async () => {
  const s = await server();
  const report: any = await verifyApprovedRoutes({
    config: { ...config, lead: undefined },
    origin: s.origin,
    formMode: "mocked",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    timeout: 1500,
  });
  expect(report.status).toBe("fail");
  expect(report.failures.join(" ")).toContain("not verified");
});
it("detects missing assets through browser network/loading evidence", async () => {
  const s = await server({ asset: true });
  const report: any = await verifyApprovedRoutes({
    config,
    origin: s.origin,
    formMode: "mocked",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    timeout: 1500,
  });
  expect(report.status).toBe("fail");
  expect(report.failures.join(" ")).toContain("asset");
});

it("rejects a success message without the actual success lifecycle event", async () => {
  const s = await server({ fakeSuccess: true });
  const report: any = await verifyApprovedRoutes({
    config,
    origin: s.origin,
    formMode: "mocked",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    timeout: 1500,
  });
  expect(report.status).toBe("fail");
  expect(report.failures.join(" ")).toContain("Form lifecycle");
});

it("emulates Pages SPA fallback until a top-level 404 artifact exists", async () => {
  const fs = await import("node:fs/promises"),
    os = await import("node:os"),
    path = await import("node:path");
  const { serveBuiltSite } =
    await import("../scripts/browser-route-verification.mjs");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ll-pages-host-"));
  await fs.writeFile(
    path.join(dir, "index.html"),
    "<main>Owned fixture homepage</main>",
  );
  const server = await serveBuiltSite(dir);
  try {
    expect((await fetch(server.origin + "/unknown/")).status).toBe(200);
    await fs.writeFile(
      path.join(dir, "404.html"),
      "<main>Page not found</main>",
    );
    const response = await fetch(server.origin + "/unknown/");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Page not found");
  } finally {
    await server.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

it("blocks a missing required contact form on a service route", async () => {
  const s = await server({ noForms: true });
  const report: any = await verifyApprovedRoutes({
    config,
    origin: s.origin,
    formMode: "mocked",
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    timeout: 1500,
  });
  expect(report.status).toBe("fail");
  expect(report.failures.join(" ")).toContain("conversion");
});
