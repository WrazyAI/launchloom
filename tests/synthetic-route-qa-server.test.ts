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
