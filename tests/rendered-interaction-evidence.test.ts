import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import {
  captureRenderedInteractionEvidence,
  interactionSourceDigest,
  requiresPurposefulInteraction,
  validateInteractionEvidence,
} from "../scripts/rendered-interaction-evidence.mjs";

let browser: Browser;
let root: string;
let origin: string;
let html = "";
const contacted: string[] = [];
const server = http.createServer((req, res) => {
  contacted.push(req.url || "");
  res.setHeader("content-type", "text/html");
  res.end(html);
});
const viewport = { name: "desktop", width: 1536, height: 864 };
const files = { experience: "fixture", styles: "", motion: "" };
const disclosure = `<section data-purposeful-interaction><h2>Choose a service</h2><details><summary>Preparation</summary><p>Bring your service history.</p></details></section>`;
const tabs = `<section data-purposeful-interaction><div role="tablist"><button type="button" role="tab" aria-selected="true" aria-controls="one">One</button><button type="button" role="tab" aria-selected="false" aria-controls="two">Two</button></div><div id="one" role="tabpanel">First service information</div><div id="two" role="tabpanel" hidden>Second service information</div></section>`;
const tabScript = `<script>document.querySelectorAll('[role=tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[role=tab]').forEach(t=>t.setAttribute('aria-selected',String(t===b)));document.querySelectorAll('[role=tabpanel]').forEach(p=>p.hidden=p.id!==b.getAttribute('aria-controls'));}));</script>`;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ll-interaction-"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fs.rm(root, { recursive: true, force: true });
});

async function capture(body: string, extra: Record<string, any> = {}) {
  html = `<!doctype html><html><body>${body}</body></html>`;
  await fs.writeFile(path.join(root, "index.html"), html);
  contacted.length = 0;
  return captureRenderedInteractionEvidence({
    browser,
    origin,
    dist: root,
    candidateId: "candidate-a",
    sourceDigest: interactionSourceDigest(files),
    viewport,
    evidenceDir: root,
    requiredPurposeful: true,
    capturePair: true,
    timeoutMs: 350,
    settleMs: 30,
    ...extra,
  });
}

describe("bounded rendered interaction evidence", () => {
  it("recognizes an explicit purposeful interaction without confusing a brand guide with a control", () => {
    expect(requiresPurposefulInteraction({ artDirection: "Add a purposeful interaction." })).toBe(true);
    expect(requiresPurposefulInteraction({ preference: "Use an interactive care guide." })).toBe(true);
    expect(requiresPurposefulInteraction({ artDirection: "Follow the brand guide for this calm page." })).toBe(false);
  });
  it("activates and restores a real native disclosure and preserves paired pixels", async () => {
    const result = await capture(disclosure);
    expect(result.observation.status).toBe("passed");
    expect(result.observation.after?.content).toContain(
      "Bring your service history.",
    );
    expect(result.observation.restored).toBe(true);
    expect(result.pairs).toHaveLength(1);
    expect((await fs.stat(result.pairs[0].after)).size).toBeGreaterThan(100);
  });
  it("proves hydrated tabs change useful panels and restore the original tab", async () => {
    const result = await capture(tabs + tabScript);
    expect(result.observation.status).toBe("passed");
    expect(result.observation.before?.content).toContain(
      "First service information",
    );
    expect(result.observation.after?.content).toContain(
      "Second service information",
    );
    expect(result.observation.restored).toBe(true);
  });
  it.each([
    ["inert", tabs],
    [
      "semantic-only",
      tabs +
        `<script>document.querySelectorAll('[role=tab]').forEach(b=>b.onclick=()=>b.setAttribute('aria-selected','true'));</script>`,
    ],
    [
      "obstructed",
      disclosure +
        `<div style="position:fixed;inset:0;z-index:999;background:white">Blocked</div>`,
    ],
    [
      "never restored",
      tabs +
        tabScript.replace(
          "p.hidden=p.id!==b.getAttribute('aria-controls')",
          "p.hidden=p.id!=='two'",
        ),
    ],
    [
      "late handler",
      tabs +
        `<script>setTimeout(()=>{document.querySelectorAll('[role=tab]').forEach(b=>b.onclick=()=>b.setAttribute('aria-selected','true'));},3000)</script>`,
    ],
  ])("does not claim a required %s transition works", async (_name, body) => {
    const result = await capture(body);
    expect(result.observation.status).toBe("failed");
    expect(result.failures.length).toBeGreaterThan(0);
  });
  it.each([
    ["network", `fetch('/send',{method:'POST'})`],
    ["static-looking fetch", `fetch('/index.html')`],
    ["navigation", `location.href='/contact/'`],
    ["programmatic form", `document.querySelector('form').submit()`],
    ["popup", `window.open('https://example.test/contact')`],
    ["socket", `new WebSocket('ws://127.0.0.1:1')`],
  ])(
    "blocks attempted %s effects before contacting an endpoint",
    async (_name, action) => {
      const result = await capture(
        disclosure +
          `<form action="/send" method="post"></form><script>document.querySelector('summary').addEventListener('click',()=>{${action}})</script>`,
      );
      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.observation.status).toBe("failed");
      expect(contacted.filter((url) => url !== "/")).toEqual([]);
    },
  );
  it("exercises a safe local menu and restores it", async () => {
    const result = await capture(
      `<nav><button type="button" aria-expanded="false" aria-controls="menu">Menu</button><div id="menu" hidden><a href="/services/">Services</a></div></nav><script>document.querySelector('button').onclick=e=>{const b=e.target;b.setAttribute('aria-expanded',String(b.getAttribute('aria-expanded')!=='true'));document.querySelector('#menu').hidden=b.getAttribute('aria-expanded')!=='true';}</script>`,
      { requiredPurposeful: false },
    );
    expect(result.observation.status).toBe("passed");
    expect(result.observation.after?.content).toContain("Services");
  });
  it("never substitutes a FAQ for a required dedicated guide", async () => {
    const result = await capture(
      `<section id="faqs"><details><summary>Question</summary><p>Answer</p></details></section>`,
    );
    expect(result.observation.status).toBe("unproven");
    expect(result.failures.length).toBeGreaterThan(0);
  });
  it("records native scroll reveal without forcing animation completion", async () => {
    const result = await capture(
      `<div style="height:1200px">Opening</div><section data-motion-primitive="scroll-reveal" style="opacity:0"><p>Useful lower content</p></section><script>const section=document.querySelector('section');new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))section.style.opacity='1';}).observe(section);</script>`,
      { requiredPurposeful: false, scrollRequired: true },
    );
    expect(result.observation.kind).toBe("scroll");
    expect(result.observation.status).toBe("passed");
    expect(result.observation.after?.content).toContain("Useful lower content");
  });
  it("rejects evidence from another candidate or stale source", () => {
    const evidence = {
      version: 1,
      candidateId: "candidate-a",
      sourceDigest: interactionSourceDigest(files),
      observations: [],
      pairs: [],
      failures: [],
    };
    expect(() =>
      validateInteractionEvidence(evidence, {
        candidateId: "candidate-b",
        sourceDigest: evidence.sourceDigest,
      }),
    ).toThrow(/candidate/);
    expect(() =>
      validateInteractionEvidence(evidence, {
        candidateId: "candidate-a",
        sourceDigest: interactionSourceDigest({ ...files, styles: "new" }),
      }),
    ).toThrow(/source/);
  });
});
