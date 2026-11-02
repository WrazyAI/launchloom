import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let directory: string;
let DetailValue: (props: { value: string }) => ReactElement;
beforeAll(async () => {
  const cache = path.resolve("node_modules/.cache");
  await mkdir(cache, { recursive: true });
  directory = await mkdtemp(path.join(cache, "admin-detail-value-"));
  const outfile = path.join(directory, "detail.mjs");
  await build({
    entryPoints: [path.resolve("src/admin/DetailValue.tsx")],
    outfile,
    bundle: true,
    packages: "external",
    platform: "node",
    format: "esm",
    jsx: "automatic",
  });
  ({ DetailValue } = await import(
    /* @vite-ignore */ pathToFileURL(outfile).href
  ));
});
afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("retained admin JSON rendering bounds", () => {
  it("does not amplify an ingestion-sized deeply nested payload through indentation", () => {
    const source = "[".repeat(3990) + "0" + "]".repeat(3990);
    expect(source.length).toBe(7981);
    const html = renderToStaticMarkup(
      createElement(DetailValue, { value: source }),
    );
    expect(html.length).toBeLessThan(source.length + 1000);
    expect(html).toContain(source);
  });

  it("does not throw when a deeply nested payload is below the component byte limit", () => {
    const source = "[".repeat(20000) + "0" + "]".repeat(20000);
    expect(() =>
      renderToStaticMarkup(createElement(DetailValue, { value: source })),
    ).not.toThrow();
  });

  it("falls back once to original escaped evidence when structural breadth exceeds the budget", () => {
    const source = JSON.stringify(
      Array.from({ length: 1000 }, () => ({
        note: "<script>untrusted()</script>",
      })),
    );
    const html = renderToStaticMarkup(
      createElement(DetailValue, { value: source }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect((html.match(/<pre\b/gu) || []).length).toBe(1);
    expect((html.match(/<(?:dl|ol)\b/gu) || []).length).toBe(0);
    expect(html.length).toBeLessThan(source.length * 3);
  });
});
