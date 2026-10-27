import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractFoundationInteractions } from "../scripts/foundation-interactions.mjs";

const temporaryRoots: string[] = [];

function temporarySource(files: Record<string, string> = {}) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "launchloom-interactions-"),
  );
  temporaryRoots.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

afterEach(() => {
  while (temporaryRoots.length) {
    const root = temporaryRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("foundation interaction extraction", () => {
  it("moves a safe inline handler into a local foundation script", () => {
    const source = temporarySource();
    const result = extractFoundationInteractions({
      html: `<button onclick="document.querySelector('#panel').hidden = false">Show</button>`,
      sourceDirectory: source,
    });
    expect(result.html).not.toContain("onclick=");
    expect(result.html).toContain("data-foundation-action=");
    expect(result.script).toContain("addEventListener");
    expect(result.script).toContain(
      "document.querySelector('#panel').hidden = false",
    );
    expect(result.actions).toHaveLength(1);
    expect(result.blockers).toEqual([]);
    expect(result.compatibility).toBe("renderable");
  });

  it("rejects a handler with a network primitive", () => {
    const source = temporarySource();
    const result = extractFoundationInteractions({
      html: `<button onclick="fetch('/api/leads')">Send</button>`,
      sourceDirectory: source,
    });
    expect(result.html).not.toContain("onclick=");
    expect(result.script).toBe("");
    expect(result.actions).toEqual([]);
    expect(result.blockers.map((blocker) => blocker.code)).toContain(
      "network-handler",
    );
    expect(result.compatibility).toBe("needs-adaptation");
  });

  it("moves a safe inline script and rejects a network inline script", () => {
    const source = temporarySource();
    const safe = extractFoundationInteractions({
      html: `<script>document.querySelector('button')?.addEventListener('click', () => {});</script>`,
      sourceDirectory: source,
    });
    expect(safe.html).not.toContain("<script");
    expect(safe.script).toContain("addEventListener");
    expect(safe.blockers).toEqual([]);

    const unsafe = extractFoundationInteractions({
      html: `<script>fetch('/api/leads')</script>`,
      sourceDirectory: source,
    });
    expect(unsafe.html).not.toContain("<script");
    expect(unsafe.script).toBe("");
    expect(unsafe.blockers.map((blocker) => blocker.code)).toContain(
      "network-script",
    );
  });

  it("keeps a safe local script and removes an unsafe one", () => {
    const source = temporarySource({
      "app.js":
        "document.querySelector('button')?.addEventListener('click', () => {});",
      "unsafe.js": "fetch('/api/leads');",
    });
    const safe = extractFoundationInteractions({
      html: `<script src="app.js"></script>`,
      sourceDirectory: source,
    });
    expect(safe.html).toContain('src="app.js"');
    expect(safe.blockers).toEqual([]);

    const unsafe = extractFoundationInteractions({
      html: `<script src="unsafe.js"></script>`,
      sourceDirectory: source,
    });
    expect(unsafe.html).not.toContain("<script");
    expect(unsafe.blockers.map((blocker) => blocker.code)).toContain(
      "network-script",
    );
  });

  it("rejects a script path that escapes the foundation source", () => {
    const source = temporarySource();
    const result = extractFoundationInteractions({
      html: `<script src="../outside.js"></script>`,
      sourceDirectory: source,
    });
    expect(result.html).not.toContain("<script");
    expect(result.blockers.map((blocker) => blocker.code)).toContain(
      "unsafe-script-path",
    );
  });
});
