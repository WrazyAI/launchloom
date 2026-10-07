import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import postcss, { type Rule } from "postcss";

const CLIENT_SRC = path.join("templates", "client-site", "src");
// Platform-owned chrome (review mode, override dialogs, demo notice) keeps its
// own UI face on purpose; everything else must follow the client's pairing.
const ALLOWED_SELECTOR =
  /\.ll-review|\.ll-override|\.ll-feedback|\.ll-demo-notice/u;

async function collectCss(
  dir: string,
): Promise<Array<{ file: string; css: string }>> {
  const out: Array<{ file: string; css: string }> = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectCss(full)));
      continue;
    }
    if (!/\.(css|astro)$/u.test(entry.name)) continue;
    const raw = await fs.readFile(full, "utf8");
    if (entry.name.endsWith(".css")) {
      out.push({ file: full, css: raw });
      continue;
    }
    const blocks = [
      ...raw
        .replace(/<style\b[^>]*\/>/gu, "")
        .matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gu),
    ].map((match) => match[1]);
    if (blocks.length) out.push({ file: full, css: blocks.join("\n") });
  }
  return out;
}

describe("client font conformance", () => {
  it("binds every client-facing font declaration to the role variables", async () => {
    const sources = await collectCss(CLIENT_SRC);
    expect(sources.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const { file, css } of sources) {
      const root = postcss.parse(css, { from: file });
      root.walkDecls((declaration) => {
        if (declaration.prop !== "font" && declaration.prop !== "font-family")
          return;
        if (/var\(/u.test(declaration.value)) return;
        if (/^inherit$/iu.test(declaration.value.trim())) return;
        const parent = declaration.parent;
        const selector =
          parent && parent.type === "rule" ? (parent as Rule).selector : "";
        if (ALLOWED_SELECTOR.test(selector)) return;
        offenders.push(
          `${file}: ${selector.replace(/\s+/gu, " ")} => ${declaration.value.replace(/\s+/gu, " ")}`,
        );
      });
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the chosen families as fallbacks so unchosen sites render as before", async () => {
    const sources = await collectCss(CLIENT_SRC);
    const declarations: string[] = [];
    for (const { file, css } of sources) {
      const root = postcss.parse(css, { from: file });
      root.walkDecls((declaration) => {
        if (declaration.prop !== "font" && declaration.prop !== "font-family")
          return;
        declarations.push(declaration.value);
      });
    }
    const heading = declarations.filter((value) =>
      /var\(\s*--font-heading\b/u.test(value),
    );
    const body = declarations.filter((value) =>
      /var\(\s*--font-body\b/u.test(value),
    );
    expect(heading.length).toBeGreaterThan(10);
    expect(body.length).toBeGreaterThan(5);
    for (const value of [...heading, ...body]) {
      // Every role binding keeps a concrete local stack after the variable.
      expect(value).toMatch(
        /var\(\s*--font-(?:heading|body)\s*,\s*[^)]+\)/u,
      );
    }
  });
});
