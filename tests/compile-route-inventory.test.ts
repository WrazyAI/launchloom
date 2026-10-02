import { it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});
it("exports a proposal report while keeping approval separate from delivery", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-route-cli-"));
  dirs.push(dir);
  const config = path.join(dir, "config.json"),
    out = path.join(dir, "inventory.json");
  await fs.writeFile(
    config,
    JSON.stringify({
      routePolicy: {
        version: 1,
        decisions: [{ pageType: "privacy", status: "approved" }],
      },
      business: { description: "Supplied description." },
      services: [],
      locations: [],
    }),
  );
  await exec("node", [
    path.resolve("scripts/compile-route-inventory.mjs"),
    "--config",
    config,
    "--out",
    out,
  ]);
  const report = JSON.parse(await fs.readFile(out, "utf8"));
  expect(report.issues.join(" ")).toContain("supporting content");
  expect(
    report.records.find(
      (record: { pageType: string }) => record.pageType === "privacy",
    ),
  ).toMatchObject({
    approval: { status: "deferred" },
    delivery: { generated: false, rendered: false, verified: false },
  });
});
it.each([
  ["--config", "--out", "/tmp/unreachable-report.json"],
  [
    "config",
    "/tmp/unreachable-config.json",
    "--out",
    "/tmp/unreachable-report.json",
  ],
  ["--config", "/tmp/unreachable-config.json", "--out"],
])(
  "rejects malformed CLI argument pairs before reading or writing a file: %j",
  async (...args) => {
    await expect(
      exec("node", [
        path.resolve("scripts/compile-route-inventory.mjs"),
        ...args,
      ]),
    ).rejects.toThrow("Invalid route inventory arguments");
  },
);
