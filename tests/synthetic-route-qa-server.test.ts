import { it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startSyntheticRouteServer } from "../scripts/serve-synthetic-route-qa.mjs";
const owned: Array<{ close: () => Promise<unknown> }> = [],
  dirs: string[] = [];
afterEach(async () => {
  await Promise.all(owned.splice(0).map((server) => server.close()));
  await Promise.all(
    dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});
async function fixture(token = "synthetic-stage4-token") {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ll-synthetic-qa-"));
  dirs.push(dir);
  await fs.mkdir(path.join(dir, "dist"));
  await fs.mkdir(path.join(dir, "src"));
  await fs.writeFile(
    path.join(dir, "src/site.config.json"),
    JSON.stringify({
      demoNotice: "Fictional QA fixture",
      business: { name: "Fixture Studio" },
      lead: { apiUrl: "https://stage4-provider.invalid", token },
    }),
  );
  await fs.writeFile(
    path.join(dir, "dist/index.html"),
    '<script>const api="https://stage4-provider.invalid";</script>',
  );
  return path.join(dir, "dist");
}
it("refuses real or unknown lead configuration before listening", async () => {
  await expect(
    startSyntheticRouteServer({ dist: await fixture("real-or-unknown-token") }),
  ).rejects.toThrow("fictional");
});
it("serves retargeted fictional bytes and only local terminal synthetic responses", async () => {
  const server = await startSyntheticRouteServer({ dist: await fixture() });
  owned.push(server);
  expect(await (await fetch(server.origin)).text()).toContain("/_qa");
  const body = {
    token: "synthetic-stage4-token",
    name: "Stage 4 Synthetic",
    phone: "555-0101",
    email: "stage4@example.test",
    message: "Stage 4 synthetic request.",
    pageUrl: server.origin + "/contact/",
  };
  body.message = "Stage 4 synthetic request";
  for (const expected of [503, 200])
    expect(
      (
        await fetch(server.origin + "/_qa/api/lead", {
          method: "POST",
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(expected);
  expect(server.observations).toEqual([
    { route: "/contact/", status: 503 },
    { route: "/contact/", status: 200 },
  ]);
  expect(JSON.stringify(server.observations)).not.toContain(body.email);
});
it("rejects unexpected values and mutation paths without storing a submission", async () => {
  const server = await startSyntheticRouteServer({ dist: await fixture() });
  owned.push(server);
  expect(
    (
      await fetch(server.origin + "/_qa/api/lead", {
        method: "POST",
        body: JSON.stringify({ name: "Actual Visitor" }),
      })
    ).status,
  ).toBe(400);
  expect(
    (await fetch(server.origin + "/api/lead", { method: "POST", body: "{}" }))
      .status,
  ).toBe(405);
  expect(server.observations).toEqual([]);
});

it("reflects empty live contact values into snapshots without clearing filled fields", async () => {
  const dist = await fixture();
  await fs.writeFile(
    path.join(dist, "index.html"),
    '<body><main><form><input name="name" value="Keep the live input"><textarea name="message" value="Stale snapshot attribute"></textarea></form></main></body>',
  );
  const server = await startSyntheticRouteServer({ dist });
  owned.push(server);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(server.origin);
    await page.evaluate(() =>
      dispatchEvent(new CustomEvent("launchloom:lead-submitted")),
    );
    await page.waitForTimeout(100);
    expect(await page.locator("[name=name]").inputValue()).toBe(
      "Keep the live input",
    );
    expect(await page.locator("[name=name]").getAttribute("value")).toBe(
      "Keep the live input",
    );
    expect(await page.locator("[name=message]").inputValue()).toBe("");
    expect(
      await page.locator("[name=message]").getAttribute("value"),
    ).toBeNull();
  } finally {
    await browser.close();
  }
}, 30000);
