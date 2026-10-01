import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { expect, it } from "vitest";

const exec = promisify(execFile);

it("applies an exact uploaded hero request through the workflow CLI without rewriting authored pages", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-targeted-image-"));
  try {
    const selected = path.join(root, "src/generated-experiences/selected");
    await fs.mkdir(selected, { recursive: true });
    const authored = 'export default function Experience({content}) { return <main><section data-reference-section="hero"><img src={content.hero.image} alt="" /></section><section data-reference-section="services"><h2>Keep these services</h2></section></main>; }';
    await fs.writeFile(path.join(selected, "Experience.jsx"), authored);
    await fs.writeFile(path.join(selected, "styles.css"), ".hero { min-height: 600px; }");
    const config = { business: { name: "Juniper Grove" }, assets: { photoTwo: "/images/about.webp" }, images: { hero: "/images/old.webp" }, copy: { heroHeading: "Estate planning", aboutBody: "Keep the original copy" }, services: [{ name: "Estate planning", description: "Original service description" }], design: { experience: { renderer: "creative-candidate", candidateId: "candidate-c" } } };
    const configPath = path.join(root, "src/site.config.json");
    await fs.writeFile(configPath, JSON.stringify(config));
    const bytes = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#b96530" } }).png().toBuffer();
    const structure = Buffer.from(JSON.stringify({ attachments: [{ target: "hero", kind: "upload", url: "https://assets.launchloom.wrazyos.com/feedback/juniper/upload.webp" }], colors: [] })).toString("base64url");
    const comment = { id: 123, body: `<!-- launchloom-feedback:developer -->\n<!-- launchloom-feedback-structure:${structure} -->\n**Developer feedback · Hero image**\n\nPlease change the hero image to the one I uploaded.\n\n_Page: /_` };
    const preload = path.join(root, "fetch.mjs");
    await fs.writeFile(preload, `globalThis.fetch = async (url) => String(url).startsWith("https://api.github.com/") ? Response.json(${JSON.stringify(comment)}) : new Response(Buffer.from("${bytes.toString("base64")}", "base64"), {headers:{"content-type":"image/png"}});`);
    await exec(process.execPath, ["--import", preload, path.resolve("scripts/apply-feedback.mjs")], { env: { ...process.env, CLIENT_REPO: "WrazyAI/launchloom-fixture", CLIENT_PR: "2", GITHUB_ORG_TOKEN: "fixture-token", FEEDBACK_COMMENT_ID: "123", FEEDBACK_STAGE: "developer", CLIENT_CONFIG_PATH: configPath, OPENROUTER_API_KEY: "" } });
    const revised = JSON.parse(await fs.readFile(configPath, "utf8"));
    expect(revised.images.hero).toMatch(/^\/images\/feedback\/hero-[a-f0-9]{12}\.webp$/);
    expect(revised.assets.photoOne).toBe(revised.images.hero);
    expect(revised.assets.photoTwo).toBe(config.assets.photoTwo);
    expect(revised.copy).toEqual(config.copy);
    expect(revised.services).toEqual(config.services);
    expect(revised.design).toEqual(config.design);
    expect(revised.revisionReport.creativeSourceRepairRequired).toBe(false);
    expect(revised.revisionReport.results[0].status).toBe("fulfilled");
    expect(await fs.readFile(path.join(selected, "Experience.jsx"), "utf8")).toBe(authored);
    expect(await fs.readFile(path.join(selected, "styles.css"), "utf8")).toBe(".hero { min-height: 600px; }");
    const metadata = await sharp(path.join(root, "public", revised.images.hero)).metadata();
    expect(metadata.width).toBe(1200);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
