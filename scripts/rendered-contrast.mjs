import { composite, relativeLuminance, rgbHex } from "./color-contrast.mjs";

/** Runs in Chromium. Collect text runs rather than a stylesheet class whitelist.
 * Browser color resolution handles currentColor, OKLCH and wide gamut CSS.
 * Effects we cannot prove remain explicit unresolved evidence. */
export function collectContrastTargets({
  route = "/",
  state = "default",
} = {}) {
  // These caches live for this synchronous snapshot only. Every focus/hover
  // state gets fresh computed paint and geometry, so no stale state can pass.
  const styles = new Map(),
    boxes = new Map(),
    animations = new Map();
  const properties = [
    "color",
    "backgroundColor",
    "backgroundImage",
    "opacity",
    "display",
    "visibility",
    "overflow",
    "filter",
    "backdropFilter",
    "mixBlendMode",
    "fontSize",
    "fontWeight",
    "fill",
    "fillOpacity",
    "stroke",
    "strokeWidth",
    "strokeOpacity",
    "position",
    "appearance",
    "outlineStyle",
    "outlineWidth",
    "outlineColor",
    "webkitTextFillColor",
    "content",
    ...["Top", "Bottom", "Left", "Right"].flatMap((side) =>
      ["Width", "Style", "Color"].map((field) => `border${side}${field}`),
    ),
  ];
  const pseudoProperties = [
    "content",
    "display",
    "visibility",
    "opacity",
    "backgroundImage",
    "backgroundColor",
    "fontSize",
    "fontWeight",
    "color",
    "webkitTextFillColor",
  ];
  const styleFor = (el, pseudo = "") => {
    if (!styles.has(el)) styles.set(el, new Map());
    const cache = styles.get(el);
    if (!cache.has(pseudo)) {
      const computed = getComputedStyle(el, pseudo || undefined);
      cache.set(
        pseudo,
        Object.fromEntries(
          (pseudo ? pseudoProperties : properties).map((key) => [
            key,
            computed[key],
          ]),
        ),
      );
    }
    return cache.get(pseudo);
  };
  const rectFor = (el) => {
    if (!boxes.has(el)) boxes.set(el, el.getBoundingClientRect());
    return boxes.get(el);
  };
  const animationsFor = (el) => {
    if (!animations.has(el)) animations.set(el, el.getAnimations());
    return animations.get(el);
  };
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const color = (value) => {
    if (!CSS.supports("color", value)) return null;
    const match = value.match(/^rgba?\(([^)]+)\)$/);
    if (match) {
      const parts = match[1].split(/[\s,/]+/).filter(Boolean);
      if (parts.length === 3 || parts.length === 4)
        return parts
          .slice(0, 3)
          .map((c) => parseFloat(c) * (c.endsWith("%") ? 2.55 : 1))
          .concat(
            parts[3]
              ? parseFloat(parts[3]) / (parts[3].endsWith("%") ? 100 : 1)
              : 1,
          );
    }
    const srgb = value.match(/^color\(srgb\s+([^)]+)\)$/);
    if (srgb) {
      const parts = srgb[1].split(/[\s/]+/).filter(Boolean);
      const values = parts.map(
        (part) => parseFloat(part) / (part.endsWith("%") ? 100 : 1),
      );
      if (
        (parts.length === 3 || parts.length === 4) &&
        values.every(Number.isFinite) &&
        values.slice(0, 3).every((v) => v >= 0 && v <= 1)
      )
        return values
          .slice(0, 3)
          .map((v) => v * 255)
          .concat(values[3] ?? 1);
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const over = (a, b) =>
    a
      .slice(0, 3)
      .map((c, i) => c * a[3] + b[i] * (1 - a[3]))
      .concat(1);
  const selector = (el) => {
    const parts = [];
    while (el && el !== document.body) {
      const siblings = [...el.parentElement.children].filter(
        (s) => s.localName === el.localName,
      );
      parts.unshift(`${el.localName}:nth-of-type(${siblings.indexOf(el) + 1})`);
      el = el.parentElement;
    }
    return "body" + (parts.length ? " > " + parts.join(" > ") : "");
  };
  const intersects = (a, b) =>
    a.width > 0 &&
    a.height > 0 &&
    b.width > 0 &&
    b.height > 0 &&
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top;
  const visible = (el, rect) => {
    if (
      !rect.width ||
      !rect.height ||
      rect.right <= 0 ||
      rect.bottom <= 0 ||
      el.closest("[hidden],[inert],script,style,template,button:disabled")
    )
      return false;
    for (let p = el; p; p = p.parentElement) {
      if (
        p.localName === "details" &&
        !p.open &&
        !p.querySelector(":scope > summary")?.contains(el)
      )
        return false;
    }
    const root = document.scrollingElement;
    if (
      rect.left >= Math.max(innerWidth, root.scrollWidth) - scrollX ||
      rect.top >= Math.max(innerHeight, root.scrollHeight) - scrollY
    )
      return false;
    for (let p = el; p; p = p.parentElement) {
      const s = styleFor(p);
      if (
        s.position === "fixed" &&
        (rect.left >= innerWidth || rect.top >= innerHeight)
      )
        return false;
      if (
        s.display === "none" ||
        s.visibility !== "visible" ||
        Number(s.opacity) === 0
      )
        return false;
      if (s.overflow === "hidden" || s.overflow === "clip") {
        if (!intersects(rect, rectFor(p))) return false;
      }
    }
    return true;
  };
  const images = [...document.querySelectorAll("img,video,canvas,iframe")].map(
    (el) => ({ el, rect: rectFor(el) }),
  );
  const backdrop = (el, rect) => {
    const chain = [];
    let effects = [];
    for (let p = el; p; p = p.parentElement) {
      chain.unshift(p);
      const s = styleFor(p);
      if (
        animationsFor(p).some(
          (a) =>
            a.playState !== "finished" &&
            a.playState !== "idle" &&
            (a instanceof CSSTransition
              ? /color|background|opacity|filter|shadow|outline|^all$/.test(
                  a.transitionProperty,
                )
              : a.effect
                  ?.getKeyframes()
                  .some((frame) =>
                    Object.keys(frame).some((key) =>
                      /color|background|opacity|filter|shadow|outline|fill|stroke/i.test(
                        key,
                      ),
                    ),
                  )),
        )
      )
        effects.push("paint animation did not settle");
      if (
        s.filter !== "none" ||
        s.backdropFilter !== "none" ||
        s.mixBlendMode !== "normal" ||
        Number(s.opacity) !== 1
      )
        effects.push("filter, blend, backdrop-filter or group opacity");
    }
    let backgrounds = [[255, 255, 255, 1]],
      variable = false,
      issues = [];
    for (const p of chain) {
      const s = styleFor(p),
        bg = color(s.backgroundColor);
      const box = rectFor(p);
      // Root backgrounds propagate to the document canvas. Other plates must
      // actually cover the glyph bounds; absolute children can escape parents.
      if (p !== document.body && p !== document.documentElement) {
        if (!intersects(box, rect)) continue;
        const covers =
          box.left <= rect.left + 1 &&
          box.top <= rect.top + 1 &&
          box.right >= rect.right - 1 &&
          box.bottom >= rect.bottom - 1;
        if (!covers && (bg?.[3] > 0 || s.backgroundImage !== "none")) {
          issues.push("background plate only partially covers text");
          continue;
        }
      }
      if (!bg) issues.push("unsupported background color");
      else {
        backgrounds = backgrounds.map((b) => over(bg, b));
        if (bg[3] === 1) {
          variable = false;
          issues = [];
        }
      }
      const media = images.some(
        (i) =>
          i.el !== el &&
          p.contains(i.el) &&
          !i.el.contains(el) &&
          intersects(i.rect, rect),
      );
      if (s.backgroundImage !== "none" || media) {
        backgrounds = [
          [0, 0, 0, 1],
          [255, 255, 255, 1],
        ];
        variable = true;
      }
      // Pseudo-element paint ordering/coverage cannot be inferred reliably
      // from backgroundColor alone. A local opaque plate below clears it.
      for (const pseudo of ["::before", "::after"]) {
        const ps = styleFor(p, pseudo);
        if (
          ps.content !== "none" &&
          ps.content !== "normal" &&
          ps.display !== "none" &&
          ps.visibility === "visible" &&
          Number(ps.opacity) > 0 &&
          (ps.backgroundImage !== "none" || color(ps.backgroundColor)?.[3] > 0)
        )
          issues.push("pseudo-element backdrop requires rendered review");
      }
    }
    return {
      backgrounds,
      variable,
      issues: [...new Set([...issues, ...effects])],
    };
  };
  const targets = [];
  const add = (
    el,
    kind,
    text,
    foreground,
    bg,
    minimum,
    rect,
    alpha = 1,
    paintProperty = "color",
  ) => {
    const s = styleFor(el);
    const rgba = color(foreground);
    if (rgba) rgba[3] *= alpha;
    targets.push({
      paintProperty,
      route,
      state,
      selector: selector(el),
      kind,
      text: text.trim().slice(0, 180),
      foreground: rgba,
      ...bg,
      minimum,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      fontSize: parseFloat(s.fontSize),
      fontWeight: s.fontWeight,
    });
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode,
      el = node.parentElement;
    if (!node.textContent.trim() || !el || el.closest("svg title,svg desc"))
      continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (!visible(el, rect)) continue;
    const s = styleFor(el),
      fontSize = parseFloat(s.fontSize),
      weight = parseInt(s.fontWeight) || 400;
    add(
      el,
      el.closest("svg") ? "svg-text" : "text",
      node.textContent,
      el.closest("svg") ? s.fill : s.webkitTextFillColor || s.color,
      backdrop(el, rect),
      fontSize >= 24 || (fontSize >= 18.666666 && weight >= 700) ? 3 : 4.5,
      rect,
      el.closest("svg") ? Number(s.fillOpacity) : 1,
      !el.closest("svg") &&
        s.webkitTextFillColor &&
        s.webkitTextFillColor !== s.color
        ? "-webkit-text-fill-color"
        : "color",
    );
  }
  for (const el of document.querySelectorAll("*")) {
    const rect = rectFor(el);
    if (!visible(el, rect) || el.getAttribute("aria-hidden") === "true")
      continue;
    for (const pseudo of ["::before", "::after"]) {
      const ps = styleFor(el, pseudo);
      if (
        ps.content === "none" ||
        ps.content === "normal" ||
        ps.content === '""' ||
        ps.display === "none" ||
        ps.visibility !== "visible"
      )
        continue;
      const bg = backdrop(el, rect);
      if (Number(ps.opacity) !== 1 || ps.backgroundImage !== "none")
        bg.issues.push("generated text opacity or image backdrop");
      const fontSize = parseFloat(ps.fontSize),
        weight = parseInt(ps.fontWeight) || 400;
      add(
        el,
        "generated-text",
        ps.content.replace(/^"|"$/g, ""),
        ps.webkitTextFillColor || ps.color,
        bg,
        fontSize >= 24 || (fontSize >= 18.666666 && weight >= 700) ? 3 : 4.5,
        rect,
      );
    }
  }
  for (const el of document.querySelectorAll(
    'input,textarea,select,button,[role="button"],a[href],svg[role="img"]',
  )) {
    const rect = rectFor(el);
    if (!visible(el, rect) || el.disabled) continue;
    const s = styleFor(el),
      parentBg = backdrop(el.parentElement || el, rect);
    const label =
      el.getAttribute("aria-label") ||
      el.textContent ||
      el.getAttribute("placeholder") ||
      el.localName;
    if (el.matches("input,textarea,select")) {
      if (el.value || el.placeholder) {
        const textStyle = el.value ? s : styleFor(el, "::placeholder");
        const bg = backdrop(el, rect);
        if (Number(textStyle.opacity) !== 1)
          bg.issues.push("placeholder opacity");
        add(
          el,
          "text",
          el.value || el.placeholder,
          textStyle.webkitTextFillColor || textStyle.color,
          bg,
          4.5,
          rect,
          1,
          textStyle.webkitTextFillColor &&
            textStyle.webkitTextFillColor !== textStyle.color
            ? "-webkit-text-fill-color"
            : "color",
        );
      }
      const nativeToggle =
        el.matches('input[type="checkbox"],input[type="radio"]') &&
        s.appearance !== "none";
      if (!nativeToggle) {
        const borderSide = ["Bottom", "Top", "Right", "Left"].find(
          (side) =>
            parseFloat(s[`border${side}Width`]) > 0 &&
            !["none", "hidden"].includes(s[`border${side}Style`]) &&
            (color(s[`border${side}Color`])?.[3] || 0) > 0,
        );
        add(
          el,
          "control",
          label,
          borderSide ? s[`border${borderSide}Color`] : s.backgroundColor,
          parentBg,
          3,
          rect,
        );
      }
    }
    if (
      el.matches('svg[role="img"]') &&
      el.getAttribute("aria-hidden") !== "true"
    ) {
      for (const part of el.querySelectorAll("path,circle,rect,polygon,line")) {
        const ps = styleFor(part);
        if (ps.fill !== "none")
          add(
            part,
            "icon",
            label,
            ps.fill,
            backdrop(part, rectFor(part)),
            3,
            rect,
            Number(ps.fillOpacity),
            "fill",
          );
        if (ps.stroke !== "none" && parseFloat(ps.strokeWidth) > 0)
          add(
            part,
            "icon",
            label,
            ps.stroke,
            backdrop(part, rectFor(part)),
            3,
            rect,
            Number(ps.strokeOpacity),
            "stroke",
          );
      }
    }
    if (el.matches(":focus-visible")) {
      const bg = parentBg;
      if (s.outlineStyle === "none" || parseFloat(s.outlineWidth) === 0)
        bg.issues.push("focus indicator absent or uses unmeasured shadow");
      add(el, "focus", label, s.outlineColor, bg, 3, rect);
    }
  }
  return targets;
}

function measure(target) {
  const { foreground, backgrounds, issues, variable } = target;
  if (!foreground || !backgrounds?.length || issues.length)
    return {
      ...target,
      status: "unresolved",
      ratio: null,
      repairEligible: false,
    };
  const ratios = backgrounds.map((bg) => {
    const a = relativeLuminance(composite(foreground, bg)),
      b = relativeLuminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  let ratio = Math.min(...ratios);
  // A variable backdrop can contain colored pixels between the channel
  // bounds, not just grayscale endpoints. Bound the composited foreground and
  // backdrop luminance independently; their overlap cannot prove contrast.
  if (variable) {
    const foregroundValues = backgrounds.map((bg) =>
      relativeLuminance(composite(foreground, bg)),
    );
    const backgroundValues = backgrounds.map(relativeLuminance);
    const foregroundMin = Math.min(...foregroundValues),
      foregroundMax = Math.max(...foregroundValues);
    const backgroundMin = Math.min(...backgroundValues),
      backgroundMax = Math.max(...backgroundValues);
    ratio =
      foregroundMin > backgroundMax
        ? (foregroundMin + 0.05) / (backgroundMax + 0.05)
        : backgroundMin > foregroundMax
          ? (backgroundMin + 0.05) / (foregroundMax + 0.05)
          : 1;
  }
  const pass = ratio >= target.minimum;
  return {
    ...target,
    ratio,
    status: pass ? "pass" : variable ? "unresolved" : "fail",
    repairEligible:
      !variable && target.kind === "text" && target.state === "default",
    color: rgbHex(foreground),
    background: backgrounds.length === 1 ? rgbHex(backgrounds[0]) : null,
  };
}

/** Never mutates content or submits controls. Optional states exercise hover,
 * keyboard focus, native details and explicit in-page menu toggles. */
export async function inspectContrastPage(
  page,
  { route = new URL(page.url()).pathname, states = true } = {},
) {
  const targets = [],
    visited = [];
  const settle = async () => {
    await page.evaluate(async () => {
      // Let observers and frame-scheduled widget state react before settling paint.
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      for (let cycle = 0; cycle < 4; cycle++) {
        const transitions = document
          .getAnimations()
          .filter(
            (a) =>
              a.playState === "running" &&
              (a instanceof CSSTransition || a instanceof CSSAnimation),
          );
        if (!transitions.length) break;
        for (const animation of transitions) {
          const timing = animation.effect.getComputedTiming();
          if (Number.isFinite(timing.endTime) && timing.endTime <= 1500)
            animation.finish();
        }
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        if (
          !document
            .getAnimations()
            .some(
              (a) =>
                a.playState === "running" &&
                (a instanceof CSSTransition || a instanceof CSSAnimation),
            )
        )
          break;
      }
    });
  };
  const collect = async (state) => {
    await settle();
    visited.push(state);
    targets.push(
      ...(await page.evaluate(collectContrastTargets, { route, state })).map(
        measure,
      ),
    );
  };
  const isPainted = async (control) =>
    control.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right <= 0 || rect.bottom <= 0 || el.closest("[hidden],[inert]"))
        return false;
      const root = document.scrollingElement;
      if (
        rect.left >= Math.max(innerWidth, root.scrollWidth) - scrollX ||
        rect.top >= Math.max(innerHeight, root.scrollHeight) - scrollY
      )
        return false;
      for (let parent = el; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (
          style.position === "fixed" &&
          (rect.left >= innerWidth || rect.top >= innerHeight)
        )
          return false;
        if (
          Number(style.opacity) === 0 ||
          style.visibility !== "visible" ||
          style.display === "none"
        )
          return false;
      }
      return true;
    });
  await collect("default");
  if (states) {
    const controls = page.locator(
      'a[href],button,input,textarea,select,[role="button"]',
    );
    const count = await controls.count();
    await page.keyboard.press("Tab");
    for (let i = 0; i < count; i++) {
      const control = controls.nth(i);
      if (!(await control.isVisible()) || !(await control.isEnabled()))
        continue;
      if (!(await isPainted(control))) continue;
      await control.focus();
      await collect("focus");
      if (!(await isPainted(control))) continue;
      await control
        .hover({ timeout: 1500 })
        .then(() => collect("hover"))
        .catch((error) => {
          targets.push({
            route,
            state: "hover",
            kind: "control",
            selector: "control index " + i,
            text: "Hover target inaccessible",
            issues: [error.message],
            minimum: 3,
            status: "unresolved",
            ratio: null,
            repairEligible: false,
          });
        });
      await control.evaluate((el) => el.blur());
    }
    await page.mouse.move(0, 0);
    const details = await page.evaluate(() =>
      [...document.querySelectorAll("details")].map((el) => {
        const was = el.open;
        el.open = true;
        return was;
      }),
    );
    await collect("open");
    await page.evaluate(
      (values) =>
        [...document.querySelectorAll("details")].forEach(
          (el, i) => (el.open = values[i]),
        ),
      details,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle();
    const toggles = await page
      .locator('button[aria-expanded="false"][aria-controls]')
      .elementHandles();
    for (const toggle of toggles) {
      if (!(await toggle.isVisible()) || !(await isPainted(toggle))) continue;
      const safe = await toggle.evaluate(
        (el) => !el.form || el.type === "button",
      );
      const id = await toggle.getAttribute("aria-controls");
      const local = await page.evaluate(
        (id) => Boolean(document.getElementById(id)),
        id,
      );
      if (!safe || !local) {
        targets.push({
          route,
          state: "menu-open",
          kind: "control",
          selector: "menu toggle",
          text: "Menu toggle cannot be safely exercised without submitting/resetting a form or a local target",
          minimum: 3,
          status: "unresolved",
          ratio: null,
          repairEligible: false,
        });
        continue;
      }
      await toggle.click({ timeout: 1500 });
      try {
        await collect("menu-open");
      } finally {
        await toggle.click({ timeout: 1500 });
      }
    }
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
  }
  const unique = new Map();
  for (const t of targets) {
    const key = [
      t.route,
      t.selector,
      t.kind,
      t.text,
      t.ratio,
      t.status,
      JSON.stringify(t.backgrounds),
      JSON.stringify(t.issues),
    ].join("|");
    if (!unique.has(key)) unique.set(key, t);
  }
  const measured = [...unique.values()];
  return {
    version: 1,
    stateSettling:
      "finite CSS paint transitions and animations completed; uncompleted effects unresolved",
    route,
    pass: measured.every((t) => t.status === "pass"),
    visitedStates: [...new Set(visited)],
    targets: measured,
    findings: measured.filter((t) => t.status !== "pass"),
  };
}

export function contrastFailureMessages(report) {
  return report.findings.map(
    (f) =>
      `contrast ${f.status}: ${f.route} ${f.viewport || ""} ${f.state} ${f.selector} ${f.kind} ${JSON.stringify(f.text)} (${f.ratio == null ? "unresolved" : f.ratio.toFixed(3)}; required ${f.minimum}); foreground ${f.color || "unknown"}, background ${f.background || "variable"}; ${(f.issues || []).join(", ")}${f.status === "unresolved" ? "; use a provable local opaque plate or sufficiently strong scrim and rerun" : ""}`,
  );
}
