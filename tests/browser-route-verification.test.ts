import { it, expect, afterEach, vi } from "vitest";
import http from "node:http";
import { verifyApprovedRoutes } from "../scripts/browser-route-verification.mjs";
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
function html(route: string, broken = false) {
  return `<html><head><title>Browser fixture</title></head><body><main><h1>${route === "/" ? "Browser Fixture" : "Drain cleaning"}</h1><a href="${route === "/" ? "/services/drain-cleaning/" : "/"}">Other page</a><details><summary>What should I share?</summary><p>Explain which drain is affected.</p></details><form class="lead-form"><label>Name<input name="name" required></label><label>Phone<input name="phone" required></label><label>Email<input name="email" type="email" required></label><label>Message<textarea name="message" required></textarea></label><button type="submit">Send</button><small role="status"></small></form></main><script>${broken ? 'throw new Error("synthetic hydration failure");' : ""}const form=document.querySelector('form');form.addEventListener('submit',async event=>{event.preventDefault();try{const fields=Object.fromEntries(new FormData(form));const r=await fetch('https://stage4-provider.invalid/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,token:'synthetic-token',pageUrl:location.href})});const data=await r.json();if(!r.ok)throw new Error(data.error);form.reset();form.querySelector('[role=status]').textContent='Thank you. We will be in touch shortly.';dispatchEvent(new CustomEvent('launchloom:lead-submitted'));}catch(error){form.querySelector('[role=status]').textContent=error.message;}});</script></body></html>`;
}
async function server(
  options: {
    soft404?: boolean;
    broken?: boolean;
    asset?: boolean;
    fakeSuccess?: boolean;
  } = {},
) {
  let mutations = 0;
  const s = http.createServer((req, res) => {
    if (req.method === "POST") mutations++;
    const route = new URL(req.url!, "http://localhost").pathname;
    if (
      !["/", "/services/drain-cleaning/"].includes(route) &&
      !options.soft404
    ) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      (options.fakeSuccess
        ? html(route, options.broken).replace(
            "dispatchEvent(new CustomEvent('launchloom:lead-submitted'));",
            "",
          )
        : html(route, options.broken)) +
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
  };
}
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
