import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";
import { buildCreativeContentManifest } from "../scripts/production-experience-author.mjs";

const temporary: string[] = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "launchloom-enrichment-"));
  temporary.push(directory);
  const file = path.join(directory, "config.json");
  const config = JSON.parse(fs.readFileSync("templates/client-site/src/site.config.json", "utf8"));
  config.images = { ...config.images, hero: "/images/generated/frozen-hero.webp", secondary: "/images/generated/frozen-secondary.webp" };
  config.assets = { photoOne: "", photoTwo: "", logo: "sealed-logo.svg" };
  fs.writeFileSync(file, JSON.stringify(config));
  return { file, config };
}

it("preserves every sealed image and asset binding while refreshing transport credentials", () => {
  const { file, config } = fixture();
  const manifest = buildCreativeContentManifest(config);
  execFileSync(process.execPath, ["scripts/enrich-site-config.mjs", "--file", file, "--assets", JSON.stringify({ photoOne: "", photoTwo: "", logo: "different.svg" }), "--preserve-assets", "true", "--api", "https://api.example.test", "--leadToken", "synthetic-new-token"]);
  const actual = JSON.parse(fs.readFileSync(file, "utf8"));
  expect(actual.images).toEqual(config.images);
  expect(actual.assets).toEqual(config.assets);
  expect(actual.lead).toEqual({ apiUrl: "https://api.example.test", token: "synthetic-new-token" });
  expect(buildCreativeContentManifest(actual)).toEqual(manifest);
});

it.each([undefined, "false"])("keeps normal intake asset enrichment when preservation is %s", (preserve) => {
  const { file } = fixture();
  const args = ["scripts/enrich-site-config.mjs", "--file", file, "--assets", JSON.stringify({ photoOne: "supplied-hero.webp", photoTwo: "supplied-secondary.webp" })];
  if (preserve !== undefined) args.push("--preserve-assets", preserve);
  execFileSync(process.execPath, args);
  const actual = JSON.parse(fs.readFileSync(file, "utf8"));
  expect(actual.images.hero).toBe("supplied-hero.webp");
  expect(actual.images.secondary).toBe("supplied-secondary.webp");
});

it.each(["true", "false"])("runs the actual workflow enrichment command with frozen reuse=%s", (reuse) => {
  const { file, config } = fixture();
  const workflow = fs.readFileSync(".github/workflows/generate-client.yml", "utf8");
  const command = workflow.split("\n").find(line => line.trimStart().startsWith("node scripts/enrich-site-config.mjs "));
  expect(command).toBeDefined();
  const boundedCommand = command!.trim().replace("--file /tmp/site.config.json", '--file "$QA_FIXTURE_CONFIG"').replace("${{ steps.intake.outputs.assets }}", JSON.stringify({ photoOne: "", photoTwo: "" }));
  expect(boundedCommand).not.toContain("${{");
  execFileSync("bash", ["-c", boundedCommand], { env: { ...process.env, QA_FIXTURE_CONFIG: file, REUSE_AUTHORED_CANDIDATES: reuse, LAUNCHLOOM_API_URL: "https://api.example.test", LEAD_TOKEN: "synthetic-workflow-token" } });
  const actual = JSON.parse(fs.readFileSync(file, "utf8"));
  expect(actual.images.hero).toBe(reuse === "true" ? config.images.hero : "");
  if (reuse === "true") expect(buildCreativeContentManifest(actual)).toEqual(buildCreativeContentManifest(config));
  expect(actual.lead.token).toBe("synthetic-workflow-token");
});
