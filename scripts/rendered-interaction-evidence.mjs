import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export function interactionSourceDigest(files) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        ["experience", "styles", "motion"].map((key) => [
          key,
          files?.[key] || "",
        ]),
      ),
    )
    .digest("hex");
}

export function requiresPurposefulInteraction(brief = {}) {
  return /\b(?:purposeful\s+(?:interactions?|interactive)|interactive\s+(?:care\s+)?(?:guide|selector|chooser|navigator|flow)|(?:guide|selector|chooser|navigator)\s+interaction)\b/iu.test(
    [brief.artDirection, brief.visualDirection, brief.preference]
      .filter(Boolean)
      .join(" "),
  );
}

export function validateInteractionEvidence(
  evidence,
  { candidateId, sourceDigest } = {},
) {
  if (!evidence) return;
  if (
    evidence.version !== 1 ||
    !Array.isArray(evidence.observations) ||
    !Array.isArray(evidence.pairs) ||
    !Array.isArray(evidence.failures) ||
    evidence.observations.length > 3 ||
    evidence.pairs.length > 2
  )
    throw new Error("Invalid or unbounded rendered interaction evidence.");
  if (!candidateId || evidence.candidateId !== candidateId)
    throw new Error(
      "Rendered interaction evidence candidate identity mismatch.",
    );
  if (
    !sourceDigest ||
    evidence.sourceDigest !== sourceDigest ||
    !/^[a-f0-9]{64}$/u.test(sourceDigest)
  )
    throw new Error("Rendered interaction evidence source identity mismatch.");
  for (const pair of evidence.pairs) {
    if (
      !["desktop", "mobile"].includes(pair.viewport) ||
      typeof pair.before !== "string" ||
      typeof pair.after !== "string"
    )
      throw new Error("Invalid rendered interaction screenshot pair.");
  }
}

export async function interactionPromptParts(evidence, identity, imagePart) {
  if (!evidence) return [];
  validateInteractionEvidence(evidence, identity);
  const parts = [
    {
      type: "text",
      text: `BROWSER INTERACTION EVIDENCE
Actual bounded user actions on this exact candidate source. Observations are browser measurements, not author claims. Evaluate useful visible state changes using paired pixels. A marker or changed ARIA value alone is not proof. Unproven means not established by this sample; do not claim all interactions or motion work. Scroll samples prove only the recorded reveal or paint change, not all motion mechanics. Runtime failures cannot be overridden by attractive pixels. Provider widgets listed in omittedRuntime are intentionally disabled for this offline sample; these pairs do not verify live Google reviews or embedded maps.
${JSON.stringify({ candidateId: evidence.candidateId, sourceDigest: evidence.sourceDigest, observations: evidence.observations, failures: evidence.failures })}`,
    },
  ];
  for (const pair of evidence.pairs) {
    parts.push({
      type: "text",
      text: `${pair.viewport} ${pair.kind || "local interaction"}: before activation (same viewport; scroll positions are recorded in the observations).`,
    });
    parts.push(await imagePart(pair.before, { detail: "high" }));
    parts.push({
      type: "text",
      text: `${pair.viewport} ${pair.kind || "local interaction"}: after activation. Inspect the useful changed content and obstruction.`,
    });
    parts.push(await imagePart(pair.after, { detail: "high" }));
  }
  return parts;
}

// Observes useful painted content, excluding controls themselves. ARIA changes
// alone cannot make an inert tab pass. Hit testing rejects obstructed content.
async function snapshot(control) {
  return control.evaluate((el) => {
    const detail = el.closest("details");
    const scope =
      el.closest("[data-purposeful-interaction]") ||
      detail ||
      el.closest("nav") ||
      el.parentElement;
    const panelId = el.getAttribute("aria-controls");
    const panel = panelId ? document.getElementById(panelId) : null;
    const contentScope = scope?.querySelector('[role="tablist"]')
      ? scope
      : panel || scope;
    const painted = (node) => {
      const r = node.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= innerHeight)
        return false;
      let opacity = 1;
      for (let p = node; p; p = p.parentElement) {
        const css = getComputedStyle(p);
        opacity *= Number(css.opacity);
        if (
          css.display === "none" ||
          css.visibility !== "visible" ||
          opacity <= 0.02
        )
          return false;
        if (
          p.tagName === "DETAILS" &&
          !p.open &&
          !p.querySelector("summary")?.contains(node)
        )
          return false;
      }
      const x = Math.max(1, Math.min(innerWidth - 1, r.left + r.width / 2));
      const y = Math.max(1, Math.min(innerHeight - 1, r.top + r.height / 2));
      const hit = document.elementFromPoint(x, y);
      return Boolean(hit && (node.contains(hit) || hit.contains(node)));
    };
    const nodes = contentScope
      ? [contentScope, ...contentScope.querySelectorAll("*")]
      : [];
    const content = nodes
      .filter(
        (node) =>
          !node.matches(
            'button,summary,input,select,textarea,[role="tab"],[role="tablist"]',
          ) &&
          !node.querySelector(
            'button,summary,input,select,textarea,[role="tab"]',
          ) &&
          painted(node),
      )
      .map((node) => (node.innerText || "").trim())
      .filter(Boolean);
    const state = detail
      ? String(detail.open)
      : el.tagName === "SELECT"
        ? el.value
        : el.getAttribute("aria-selected") ||
          el.getAttribute("aria-expanded") ||
          el.getAttribute("aria-pressed") ||
          "";
    return {
      state,
      content: [...new Set(content)].join("\n").slice(0, 1800),
      scrollY: Math.round(scrollY),
    };
  });
}

/** Capture one bounded local transition in a fresh, guarded context.
 * Static responses are fulfilled from dist: no capture request reaches even
 * the local server. Network APIs, documents, workers and unsafe controls block.
 * @param {any} options
 */
export async function captureRenderedInteractionEvidence({
  browser,
  origin,
  dist,
  candidateId,
  sourceDigest,
  viewport,
  evidenceDir,
  requiredPurposeful = false,
  scrollRequired = false,
  capturePair = false,
  timeoutMs = 1500,
  settleMs = 250,
}) {
  const unsafe = [],
    errors = [],
    pairs = [],
    failures = [];
  /** @type {{viewport: string, candidateId: string, sourceDigest: string, kind: string, status: string, required: boolean, restored: boolean, before?: {state: string, content: string, scrollY: number}, after?: {state: string, content: string, scrollY: number}, reason?: string, unsafeEffects?: string[], browserErrors?: string[], omittedRuntime?: string[]}} */
  const observation = {
    viewport: viewport.name,
    candidateId,
    sourceDigest,
    kind: "none",
    status: "unproven",
    required: requiredPurposeful,
    restored: false,
  };
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    serviceWorkers: "block",
    acceptDownloads: false,
  });
  try {
    const staticRoot = await fs.realpath(dist);
    let documentAllowed = true;
    await context.exposeBinding("__llInteractionBlocked", (_source, kind) => {
      unsafe.push(String(kind).slice(0, 120));
    });
    await context.addInitScript(() => {
      const record = (kind) => {
        void globalThis.__llInteractionBlocked(kind);
      };
      const deny = (kind) =>
        function () {
          record(kind);
          throw new Error(`Interaction capture blocked ${kind}`);
        };
      for (const name of [
        "open",
        "WebSocket",
        "WebTransport",
        "RTCPeerConnection",
        "webkitRTCPeerConnection",
        "Worker",
        "SharedWorker",
      ]) {
        Object.defineProperty(globalThis, name, {
          value: deny(name),
          writable: false,
          configurable: false,
        });
      }
      for (const name of ["submit", "requestSubmit", "reset"]) {
        Object.defineProperty(HTMLFormElement.prototype, name, {
          value: deny(`form-${name}`),
          writable: false,
          configurable: false,
        });
      }
      document.addEventListener(
        "submit",
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          record("form-submit");
        },
        true,
      );
      document.addEventListener(
        "click",
        (event) => {
          const el =
            event.target instanceof Element
              ? event.target.closest("a,button,input")
              : null;
          if (
            el &&
            (el.tagName === "A" ||
              (el.form && el.type !== "button") ||
              el.matches('[type="submit"],[type="reset"]'))
          ) {
            event.preventDefault();
            event.stopImmediatePropagation();
            record("unsafe-control");
          }
        },
        true,
      );
      document.addEventListener("securitypolicyviolation", (event) =>
        record(`csp-${event.violatedDirective}`),
      );
    });
    await context.routeWebSocket("**/*", (socket) => {
      unsafe.push("websocket");
      socket.close();
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const initialDocument =
        request.isNavigationRequest() &&
        request.resourceType() === "document" &&
        url.href === `${origin}/` &&
        documentAllowed;
      if (initialDocument) documentAllowed = false;
      const asset = ["script", "stylesheet", "image", "font", "media"].includes(
        request.resourceType(),
      );
      if (
        url.origin !== origin ||
        request.method() !== "GET" ||
        url.search ||
        (!initialDocument && !asset)
      ) {
        unsafe.push(`request-${request.resourceType()}-${request.method()}`);
        await route.abort();
        return;
      }
      try {
        const target = await fs.realpath(
          path.join(
            staticRoot,
            initialDocument ? "index.html" : decodeURIComponent(url.pathname),
          ),
        );
        if (!target.startsWith(`${staticRoot}${path.sep}`))
          throw new Error("outside static root");
        const type =
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".json": "application/json",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".webp": "image/webp",
            ".jpg": "image/jpeg",
            ".woff2": "font/woff2",
          }[path.extname(target)] || "application/octet-stream";
        await route.fulfill({
          body: await fs.readFile(target),
          contentType: type,
          headers: initialDocument
            ? {
                "content-security-policy":
                  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'",
              }
            : {},
        });
      } catch {
        errors.push("Static asset missing or outside built site");
        await route.abort();
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.on("pageerror", (error) => errors.push(error.message.slice(0, 180)));
    page.on("popup", (popup) => {
      unsafe.push("popup");
      void popup.close();
    });
    page.on("download", (download) => {
      unsafe.push("download");
      void download.cancel();
    });
    page.on("framenavigated", (frame) => {
      if (frame.url() !== `${origin}/` && frame.url() !== "about:blank")
        unsafe.push("navigation");
    });
    await page.goto(`${origin}/`, { waitUntil: "load", timeout: 10000 });
    await page.waitForTimeout(Math.min(900, Math.max(30, settleMs)));
    observation.omittedRuntime = await page
      .locator("[data-runtime-provider-omitted]")
      .evaluateAll((nodes) => [
        ...new Set(
          nodes
            .map((node) => node.getAttribute("data-runtime-provider-omitted"))
            .filter(Boolean),
        ),
      ]);
    const scope = requiredPurposeful
      ? "[data-purposeful-interaction]:not(#faqs):not([data-runtime])"
      : "[data-purposeful-interaction],details,nav";
    const controls = page
      .locator(`${scope}`)
      .locator(
        'summary,select,button[aria-controls],button[aria-pressed],[role="tab"][aria-controls]',
      );
    let control, kind;
    for (let index = 0; index < Math.min(await controls.count(), 12); index++) {
      const candidate = controls.nth(index);
      const eligible = await candidate.evaluate((el) => {
        if (
          el.closest(
            "form,#contact,#faqs [data-purposeful-interaction],[data-runtime],[data-chat],a",
          )
        )
          return false;
        if (el.tagName === "BUTTON" && el.type !== "button" && el.form)
          return false;
        if (
          el.getAttribute("role") === "tab" &&
          el.getAttribute("aria-selected") === "true"
        )
          return false;
        if (el.tagName === "SELECT" && el.options.length < 2) return false;
        const id = el.getAttribute("aria-controls");
        return !id || Boolean(document.getElementById(id));
      });
      if (eligible && (await candidate.isVisible())) {
        control = candidate;
        break;
      }
    }
    if (control) {
      kind = await control.evaluate((el) =>
        el.tagName === "SUMMARY"
          ? "disclosure"
          : el.getAttribute("role") === "tab"
            ? "tab"
            : el.tagName === "SELECT"
              ? "select"
              : "toggle",
      );
      observation.kind = kind;
      await control.scrollIntoViewIfNeeded({ timeout: timeoutMs });
      const before = await snapshot(control);
      observation.before = before;
      let restoreControl = control;
      let option;
      if (kind === "tab") {
        const original = await control.evaluateHandle((el) =>
          (
            el.closest("[data-purposeful-interaction]") || el.parentElement
          )?.querySelector('[role="tab"][aria-selected="true"]'),
        );
        restoreControl = original.asElement();
        if (!restoreControl)
          throw new Error("No original selected tab to restore");
      }
      if (kind === "select") {
        option = await control.evaluate(
          (el) =>
            [...el.options].find(
              (entry) => !entry.disabled && entry.value !== el.value,
            )?.value,
        );
        if (option === undefined) throw new Error("No safe alternate option");
      }
      const pair = {
        viewport: viewport.name,
        kind,
        before: path.join(
          evidenceDir,
          `${candidateId}-${viewport.name}-interaction-before.png`,
        ),
        after: path.join(
          evidenceDir,
          `${candidateId}-${viewport.name}-interaction-after.png`,
        ),
      };
      if (capturePair) await page.screenshot({ path: pair.before });
      if (kind === "select")
        await control.selectOption(option, { timeout: timeoutMs });
      else await control.click({ timeout: timeoutMs });
      await page.waitForTimeout(settleMs);
      const after = await snapshot(control);
      observation.after = after;
      if (capturePair) {
        await page.screenshot({ path: pair.after });
        pairs.push(pair);
      }
      if (
        before.state === after.state ||
        before.content === after.content ||
        !after.content
      )
        throw new Error(
          "Activation did not change useful visible content and native/ARIA state",
        );
      if (kind === "select")
        await control.selectOption(before.state, { timeout: timeoutMs });
      else await restoreControl.click({ timeout: timeoutMs });
      await page.waitForTimeout(settleMs);
      const restored = await snapshot(control);
      observation.restored =
        restored.state === before.state && restored.content === before.content;
      if (!observation.restored)
        throw new Error("Original interaction content/state did not restore");
      observation.status = "passed";
    } else if (scrollRequired && !requiredPurposeful) {
      const target = page.locator("[data-motion-primitive]").last();
      if (await target.count()) {
        observation.kind = "scroll";
        observation.before = await snapshot(target);
        await target.scrollIntoViewIfNeeded({ timeout: timeoutMs });
        await page.waitForTimeout(settleMs);
        observation.after = await snapshot(target);
        observation.restored = false;
        observation.status =
          observation.before.content !== observation.after.content &&
          Boolean(observation.after.content)
            ? "passed"
            : "unproven";
        observation.reason =
          "Native scroll sample only; no all-site motion or animation-completion claim";
      }
    } else
      observation.reason =
        "No eligible safe local control in this bounded sample";
    await page.waitForTimeout(30);
  } catch (error) {
    observation.status = "failed";
    observation.reason = String(error.message || error).slice(0, 300);
  } finally {
    await context.close();
  }
  observation.unsafeEffects = [...new Set(unsafe)];
  observation.browserErrors = [...new Set(errors)];
  if (unsafe.length || errors.length) {
    observation.status = "failed";
    failures.push(
      `${viewport.name}: interaction capture blocked unsafe effects or browser/static-asset errors`,
    );
  }
  if (requiredPurposeful && observation.status !== "passed")
    failures.push(
      `${viewport.name}: required purposeful interaction ${observation.status}: ${observation.reason || "state/content transition not proved"}`,
    );
  return { observation, pairs, failures };
}
