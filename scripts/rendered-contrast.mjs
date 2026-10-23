import { composite, relativeLuminance, rgbHex } from "./color-contrast.mjs";
import sharp from "sharp";

/**
 * Decode a PNG screenshot into sampled RGBA pixels. Sampling caps the work for
 * very large element captures while keeping deterministic strides.
 * @param {Buffer} buffer
 * @param {{maximumSamples?: number}} [options]
 */
export async function decodeRgbaPixels(buffer, { maximumSamples = 250_000 } = {}) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const rowStep = Math.max(
    1,
    Math.ceil(Math.sqrt((width * height) / maximumSamples)),
  );
  const pixels = [];
  for (let y = 0; y < height; y += rowStep) {
    for (let x = 0; x < width; x += rowStep) {
      const offset = (y * width + x) * channels;
      pixels.push(data[offset], data[offset + 1], data[offset + 2], 255);
    }
  }
  return { pixels: Uint8Array.from(pixels), width, height, rowStep };
}

/**
 * Analyze the worst-case contrast between a foreground color and decoded
 * pixels, also returning the darkest and lightest sampled backdrop colors.
 * A foreground proven against both extremes is proven against every sampled
 * pixel whose luminance lies between them, which is what the bounded repair
 * planner relies on.
 * @param {number[]} foreground [r, g, b, alpha] with alpha in 0..1
 * @param {Uint8Array | number[]} pixels RGBA bytes
 */
export function analyzePixelBackdrop(
  foreground,
  pixels,
  { band = 0, width = 0, height = 0, rowStep = 1, minimum = 0 } = {},
) {
  let worst = Number.POSITIVE_INFINITY;
  let darkPixel = null;
  let lightPixel = null;
  let darkLuminance = Number.POSITIVE_INFINITY;
  let lightLuminance = Number.NEGATIVE_INFINITY;
  // Outline rings paint only a perimeter band; measuring them against every
  // interior pixel would compare the ring color with surfaces it never
  // covers (and a mid-gray icon could make every ring color unprovable).
  const colsCount =
    band > 0 && width > 0 ? Math.ceil(width / rowStep) : 0;
  const samples = pixels.length / 4;
  for (let sample = 0; sample < samples; sample += 1) {
    const index = sample * 4;
    if (band > 0 && colsCount > 0) {
      const x = (sample % colsCount) * rowStep;
      const y = Math.floor(sample / colsCount) * rowStep;
      const inBand =
        x < band || y < band || x >= width - band || y >= height - band;
      if (!inBand) continue;
    }
    const backdrop = [
      Number(pixels[index]),
      Number(pixels[index + 1]),
      Number(pixels[index + 2]),
      1,
    ];
    const composited = composite(foreground, backdrop);
    const text = relativeLuminance(composited);
    const plate = relativeLuminance(backdrop);
    const ratio =
      (Math.max(text, plate) + 0.05) / (Math.min(text, plate) + 0.05);
    if (ratio < worst) worst = ratio;
    if (plate < darkLuminance) {
      darkLuminance = plate;
      darkPixel = backdrop;
    }
    if (plate > lightLuminance) {
      lightLuminance = plate;
      lightPixel = backdrop;
    }
  }
  // Feasible luminance window: a foreground at luminance Lc satisfies the
  // minimum against every sampled pixel exactly when no pixel luminance lies
  // strictly inside ((Lc+0.05)/m - 0.05, m*(Lc+0.05) - 0.05). Scanning Lc
  // over a fine grid finds the window the repair can move within, which a
  // mixed band (dark card, lime accent, ivory page) otherwise hides behind
  // two extremes that individually conflict.
  let provableMinimum = null;
  let provableMaximum = null;
  const parseMinimum = Number(minimum);
  if (Number.isFinite(parseMinimum) && parseMinimum > 1 && pixels.length >= 4) {
    const luminances = [];
    for (let sample = 0; sample < pixels.length / 4; sample += 1) {
      if (band > 0 && colsCount > 0) {
        const x = (sample % colsCount) * rowStep;
        const y = Math.floor(sample / colsCount) * rowStep;
        const inBand =
          x < band || y < band || x >= width - band || y >= height - band;
        if (!inBand) continue;
      }
      const offset = sample * 4;
      luminances.push(
        relativeLuminance([
          Number(pixels[offset]),
          Number(pixels[offset + 1]),
          Number(pixels[offset + 2]),
          1,
        ]),
      );
    }
    // A small margin keeps the window clear of midpoint rounding so the
    // resulting color still verifies against the recorded extremes.
    const m = parseMinimum + 0.05;
    const sorted = luminances.slice().sort((left, right) => left - right);
    const firstGreater = (value) => {
      let low = 0,
        high = sorted.length;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (sorted[mid] <= value) low = mid + 1;
        else high = mid;
      }
      return low;
    };
    const firstGreaterOrEqual = (value) => {
      let low = 0,
        high = sorted.length;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (sorted[mid] < value) low = mid + 1;
        else high = mid;
      }
      return low;
    };
    const feasible = (lc) => {
      const upper = (lc + 0.05) / m - 0.05 - 0.002;
      const lower = m * (lc + 0.05) - 0.05 + 0.002;
      if (lower <= upper) return false;
      return firstGreaterOrEqual(lower) - firstGreater(upper) === 0;
    };
    for (let stepIndex = 0; stepIndex <= 400; stepIndex += 1) {
      const lc = stepIndex / 400;
      if (!feasible(lc)) continue;
      if (provableMinimum === null) provableMinimum = lc;
      provableMaximum = lc;
    }
  }
  return {
    ratio: Number.isFinite(worst) ? worst : 0,
    darkPixel,
    lightPixel,
    provable:
      provableMinimum === null
        ? null
        : { min: provableMinimum, max: provableMaximum },
  };
}

/**
 * Worst-case contrast between a foreground color and a set of decoded pixels.
 * The foreground is alpha-composited over every sampled pixel, so translucent
 * text colors are measured as they actually render.
 * @param {number[]} foreground [r, g, b, alpha] with alpha in 0..1
 * @param {Uint8Array | number[]} pixels RGBA bytes
 */
export function worstCasePixelRatio(foreground, pixels) {
  return analyzePixelBackdrop(foreground, pixels).ratio;
}

/**
 * Issue classes a single rendered frame cannot prove: an unsettled paint
 * animation changes color over time, and text-clipped backgrounds paint the
 * glyphs themselves (hiding glyph paint would hide the measured foreground).
 */
export const RENDERED_UNPROVABLE_ISSUES = Object.freeze([
  "paint animation did not settle",
  "text-clipped background is not a provable backdrop",
]);

/**
 * Maximum absolute channel difference between two stride-matched decodes.
 * Used to decide whether hidden glyph paint actually changes the pixels: an
 * occluded or same-color text renders identically with and without its paint.
 * @param {Uint8Array | number[]} left
 * @param {Uint8Array | number[]} right
 */
export function maxChannelDelta(left, right) {
  const length = Math.min(left.length, right.length);
  let maximum = 0;
  for (let index = 0; index < length; index += 1) {
    const delta = Math.abs(Number(left[index]) - Number(right[index]));
    if (delta > maximum) maximum = delta;
  }
  return maximum;
}

/**
 * Resolve structurally unresolvable text and outline backdrops from the
 * rendered pixels: hide only the target's own glyph paint (or outline), capture
 * the element region, and measure the worst-case luminance behind it. The
 * DOM-based audit cannot bound overlapping non-ancestor paint, filters, or
 * partially covering plates; the rendered pixels can.
 *
 * Fails closed: a missing element, capture error, or decode error leaves the
 * target `unresolved`, never a pass.
 *
 * @param {import("playwright").Page} page
 * @param {Array<Record<string, any>>} targets already measured targets
 * @param {{maximumResolutions?: number}} [options]
 * @returns {Promise<{resolved: number, failed: number, attempted: number}>}
 */
export async function resolveRenderedBackdrop(
  page,
  targets,
  { maximumResolutions = 120, scoped = false } = {},
) {
  const outlineTargetOf = (target) =>
    target?.kind === "focus" || target?.paintProperty === "outline-color";
  const candidates = (targets || [])
    .filter((target) => {
      if (
        !target ||
        !target.foreground ||
        !target.selector ||
        !target.rect ||
        target.rect.width <= 0 ||
        target.rect.height <= 0
      )
        return false;
      if (
        target.kind !== "text" &&
        target.kind !== "focus" &&
        target.kind !== "icon"
      )
        return false;
      if (
        (target.issues || []).some((issue) =>
          RENDERED_UNPROVABLE_ISSUES.includes(issue),
        )
      )
        return false;
      // Unresolved targets are resolved from pixels. Failing outline targets
      // gather band evidence even when the DOM proved a fail (a ring crosses
      // every surface along its perimeter, and its repair must be proven
      // against all of them). Failing text and icon targets whose backdrop
      // the DOM could not prove (variable paint, image media, no solid
      // background) are measured from the rendered pixels too: the endpoint
      // estimate that produced the fail is a conservative bound, and the real
      // composite either proves readable or feeds a bounded repair.
      return (
        target.status === "unresolved" ||
        (target.status === "fail" &&
          (outlineTargetOf(target) ||
            target.kind === "icon" ||
            (target.kind === "text" && !target.background)))
      );
    })
    .slice(0, maximumResolutions);
  let resolved = 0;
  let failed = 0;
  let evidenceOnly = 0;
  // A single managed rule hides descendant glyph paint during captures so the
  // sampled backdrop is surfaces only: a child paragraph or span is not the
  // backdrop of the target text or focus ring, and its pixels must not be
  // mistaken for it (a gray child label once matched a synthesized ring).
  await page
    .evaluate(() => {
      if (document.getElementById("data-ll-contrast-hide-children")) return;
      const style = document.createElement("style");
      style.id = "data-ll-contrast-hide-children";
      style.textContent =
        "[data-ll-contrast-hide-children] *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}";
      document.head.appendChild(style);
    })
    .catch(() => {});
  // Marked scope: hover/focus/menu states resolve only the paints of the
  // interacted control subtree. Everything else was already measured in the
  // default state; unresolved targets outside the scope stay unresolved in
  // that state, exactly as the DOM contract reported them before.
  const inScope = async (locator) => {
    if (!scoped) return true;
    return locator
      .evaluate(
        (element) => {
          const markers = [
            ...document.querySelectorAll("[data-ll-contrast-scope]"),
          ];
          return markers.some(
            (marker) => marker === element || marker.contains(element),
          );
        },
        undefined,
        { timeout: 800 },
      )
      .catch(() => false);
  };
  // A partial plate is the known duplicate case: its rendered backdrop can
  // change between states even when the computed ancestor chain looks the
  // same. Re-prove it from state-local pixels instead of carrying the default
  // verdict into a state where out-of-scope resolution is skipped. Partially
  // clipped targets are captured from their visible intersection without
  // scrolling. Fully offscreen targets are captured only in the default state:
  // scroll to a deterministic position, capture, then restore the previous
  // scroll. Non-default states omit fully offscreen partial plates. Every
  // other out-of-scope issue remains fail-closed.
  const partialPlateOnly = (target) =>
    target.issues?.length === 1 &&
    target.issues[0] === "background plate only partially covers text";
  const visibleIntersection = (rect, viewport) => {
    if (!viewport || rect.width <= 0 || rect.height <= 0) return null;
    const left = Math.max(0, rect.x);
    const top = Math.max(0, rect.y);
    const right = Math.min(viewport.width, rect.x + rect.width);
    const bottom = Math.min(viewport.height, rect.y + rect.height);
    if (right <= left || bottom <= top) return null;
    return { x: left, y: top, width: right - left, height: bottom - top };
  };
  const capturePartialPlate = async (locator, allowScroll) => {
    const rect = await locator.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      };
    });
    const clip = visibleIntersection(rect, page.viewportSize());
    if (clip)
      return page.screenshot({ type: "png", clip, timeout: 2500 });
    if (!allowScroll)
      throw new Error("partial plate is outside the state viewport");
    // The default state is the authority for fully offscreen plates. Scroll
    // the target to a deterministic position, capture it there, and restore
    // the previous scroll. The default state is not hover-sensitive, so this
    // cannot clear an interaction paint; a fixed background is measured at the
    // same viewport origin the user would see after scrolling to the target.
    const previousScroll = await page.evaluate(() => ({
      x: scrollX,
      y: scrollY,
    }));
    try {
      await locator.evaluate((element) =>
        element.scrollIntoView({
          block: "start",
          inline: "nearest",
          behavior: "instant",
        }),
      );
      const scrolledRect = await locator.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
        };
      });
      const scrolledClip = visibleIntersection(
        scrolledRect,
        page.viewportSize(),
      );
      if (!scrolledClip)
        throw new Error("partial plate is not visible after scrolling");
      return await page.screenshot({
        type: "png",
        clip: scrolledClip,
        timeout: 2500,
      });
    } finally {
      await page
        .evaluate(({ x, y }) => window.scrollTo(x, y), previousScroll)
        .catch(() => {});
    }
  };
  for (const target of candidates) {
    const locator = page.locator(target.selector).first();
    const partialPlate = partialPlateOnly(target);
    let png = null;
    let effectiveForeground = null;
    try {
      if (!partialPlate && !(await inScope(locator))) continue;
      // Element-level filters change how the foreground actually renders.
      // Only opacity-only filters have a provable effect on the foreground
      // alpha; any other filter (blur, brightness, blend, ...) is not
      // recoverable from a hidden-paint capture and fails closed.
      const effect = await locator.evaluate(
        (element) => {
          const style = getComputedStyle(element);
          // Group and ancestor opacity multiplies into the foreground alpha;
          // capturing only the element's own opacity false-passed a black
          // icon inside an opacity:0.1 group.
          let opacity = 1;
          for (
            let node = element;
            node && node !== document.documentElement;
            node = node.parentElement
          ) {
            const nodeStyle = getComputedStyle(node);
            const value = Number(nodeStyle.opacity);
            opacity *= Number.isFinite(value) ? value : 1;
          }
          return {
            opacity,
            filter:
              style.filter && style.filter !== "none" ? style.filter : "",
          };
        },
        undefined,
        { timeout: 1500 },
      );
      const filterOpacityValues = [
        ...String(effect.filter).matchAll(/opacity\(([\d.]+)\)/gu),
      ].map((match) => Number(match[1]));
      const onlyOpacityFilter =
        !effect.filter ||
        /^(?:opacity\([\d.]+\)\s*)+$/u.test(effect.filter);
      if (!onlyOpacityFilter) continue;
      const effectiveAlpha =
        (Number(target.foreground?.[3]) || 1) *
        (Number.isFinite(effect.opacity) ? effect.opacity : 1) *
        filterOpacityValues.reduce((product, value) => product * value, 1);
      effectiveForeground = [
        target.foreground[0],
        target.foreground[1],
        target.foreground[2],
        Math.min(1, Math.max(0, effectiveAlpha)),
      ];
      let visiblePng = null;
      const previousStyle = await locator.evaluate(
        (element) => {
          const previous = element.getAttribute("style") || "";
          element.setAttribute(
            "style",
            `${previous};color:transparent !important;-webkit-text-fill-color:transparent !important;text-shadow:none !important;outline-color:transparent !important;fill-opacity:0 !important;stroke-opacity:0 !important;`,
          );
          element.setAttribute("data-ll-contrast-hide-children", "1");
          return previous;
        },
        undefined,
        { timeout: 1500 },
      );
      try {
        png = partialPlate
          ? await capturePartialPlate(locator, target.state === "default")
          : await locator.screenshot({ type: "png", timeout: 2500 });
      } finally {
        await locator
          .evaluate(
            (element, previous) => {
              if (previous) element.setAttribute("style", previous);
              else element.removeAttribute("style");
              element.removeAttribute("data-ll-contrast-hide-children");
            },
            previousStyle,
            { timeout: 1500 },
          )
          .catch(() => {});
      }
    } catch {
      continue; // missing or unmeasurable element: stays unresolved
    }
    let ratio = null;
    try {
      // Distinguishability: capture once with the paint intact and once with
      // it hidden. Identical captures mean the paint is occluded by higher
      // paint or indistinguishable from its backdrop; hiding glyphs would
      // otherwise sample the occluder and false-pass the text.
      let visiblePixels = null;
      try {
        const visibleCapture = partialPlate
          ? await capturePartialPlate(locator, target.state === "default")
          : await locator.screenshot({
              type: "png",
              timeout: 2500,
            });
        visiblePixels = (await decodeRgbaPixels(visibleCapture)).pixels;
      } catch {
        visiblePixels = null;
      }
      const outlineTarget = outlineTargetOf(target);
      const decoded = await decodeRgbaPixels(png);
      const analysis = analyzePixelBackdrop(effectiveForeground, decoded.pixels, {
        band: outlineTarget ? 4 : 0,
        width: decoded.width,
        height: decoded.height,
        rowStep: decoded.rowStep,
        minimum: Number(target.minimum),
      });
      if (analysis.darkPixel && analysis.lightPixel)
        target.pixelBackdrop = {
          dark: rgbHex(analysis.darkPixel),
          light: rgbHex(analysis.lightPixel),
          ...(analysis.provable ? { provable: analysis.provable } : {}),
        };
      if (target.status === "fail" && outlineTargetOf(target)) {
        // DOM-proven outline failure: the capture only enriches the repair
        // evidence; the verdict stays exactly as the DOM audit reported it.
        evidenceOnly += 1;
        continue;
      }
      if (visiblePixels) {
        const delta = maxChannelDelta(visiblePixels, decoded.pixels);
        if (delta <= 8) {
          target.pixelResolved = true;
          target.ratio = 1;
          target.status = "fail";
          target.color = rgbHex(effectiveForeground);
          target.background = null;
          target.issues = [
            ...(target.issues || []),
            "resolved from rendered pixels",
            "text paint is indistinguishable from its rendered backdrop (occluded or same color)",
          ];
          resolved += 1;
          failed += 1;
          continue;
        }
      }
      ratio = analysis.ratio;
    } catch {
      continue; // decode failure: stays unresolved
    }
    target.pixelResolved = true;
    target.ratio = ratio;
    target.status = ratio + 1e-9 >= Number(target.minimum) ? "pass" : "fail";
    target.color = rgbHex(effectiveForeground);
    target.background = null;
    target.issues = [
      ...(target.issues || []),
      "resolved from rendered pixels",
    ];
    resolved += 1;
    if (target.status === "fail") failed += 1;
  }
  return {
    resolved,
    failed,
    evidenceOnly,
    attempted: candidates.length,
  };
}

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
    "backgroundClip",
    "boxShadow",
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
    "zIndex",
    "transform",
    "translate",
    "rotate",
    "scale",
    "perspective",
    "isolation",
    "contain",
    "containerType",
    "willChange",
    "clipPath",
    "maskImage",
    "borderTopLeftRadius",
    "borderTopRightRadius",
    "borderBottomLeftRadius",
    "borderBottomRightRadius",
    "appearance",
    "outlineStyle",
    "outlineWidth",
    "outlineColor",
    "outlineOffset",
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
    "position",
    "top",
    "left",
    "width",
    "height",
    "transform",
    "translate",
    "rotate",
    "scale",
    "boxSizing",
    "writingMode",
    "fontSize",
    "fontWeight",
    "color",
    "webkitTextFillColor",
    ...["Top", "Right", "Bottom", "Left"].flatMap((side) => [
      `margin${side}`,
      `border${side}Width`,
      `padding${side}`,
    ]),
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
  const pseudoBackdropRect = (el, style) => {
    const ownerStyle = styleFor(el);
    if (
      style.position !== "absolute" ||
      ownerStyle.position === "static" ||
      style.transform !== "none" ||
      style.translate !== "none" ||
      style.rotate !== "none" ||
      style.scale !== "none" ||
      ownerStyle.transform !== "none" ||
      ownerStyle.translate !== "none" ||
      ownerStyle.rotate !== "none" ||
      ownerStyle.scale !== "none" ||
      ownerStyle.perspective !== "none" ||
      style.writingMode !== "horizontal-tb"
    )
      return null;
    const px = (value) =>
      /^-?(?:\d+|\d*\.\d+)px$/u.test(value) ? Number.parseFloat(value) : NaN;
    const left = px(style.left),
      top = px(style.top),
      rawWidth = px(style.width),
      rawHeight = px(style.height);
    if (![left, top, rawWidth, rawHeight].every(Number.isFinite)) return null;
    const box = rectFor(el),
      borderLeft = parseFloat(ownerStyle.borderLeftWidth) || 0,
      borderTop = parseFloat(ownerStyle.borderTopWidth) || 0,
      marginLeft = px(style.marginLeft),
      marginTop = px(style.marginTop),
      marginRight = px(style.marginRight),
      marginBottom = px(style.marginBottom),
      paddingLeft = px(style.paddingLeft),
      paddingTop = px(style.paddingTop),
      paddingRight = px(style.paddingRight),
      paddingBottom = px(style.paddingBottom);
    if (
      ![
        marginLeft,
        marginTop,
        marginRight,
        marginBottom,
        paddingLeft,
        paddingTop,
        paddingRight,
        paddingBottom,
      ].every(Number.isFinite)
    )
      return null;
    const width =
      rawWidth +
      (style.boxSizing === "border-box"
        ? 0
        : paddingLeft +
          paddingRight +
          (parseFloat(style.borderLeftWidth) || 0) +
          (parseFloat(style.borderRightWidth) || 0));
    const height =
      rawHeight +
      (style.boxSizing === "border-box"
        ? 0
        : paddingTop +
          paddingBottom +
          (parseFloat(style.borderTopWidth) || 0) +
          (parseFloat(style.borderBottomWidth) || 0));
    return {
      left: box.left + borderLeft + left + marginLeft,
      top: box.top + borderTop + top + marginTop,
      right: box.left + borderLeft + left + marginLeft + width + marginRight,
      bottom: box.top + borderTop + top + marginTop + height + marginBottom,
      width: width + marginLeft + marginRight,
      height: height + marginTop + marginBottom,
    };
  };
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
        p.offsetParent === null &&
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
  // Ancestor backgrounds do not describe positioned/transformed sibling paint.
  // Conservatively reject overlapping unrelated paint rather than guessing its
  // stacking order. Descendant media inside a control is not its outer backdrop.
  const paintedLayers = [...document.querySelectorAll("*")].filter((el) => {
    const s = styleFor(el);
    return (
      color(s.backgroundColor)?.[3] > 0 ||
      s.backgroundImage !== "none" ||
      el.matches("svg,img,video,canvas,iframe") ||
      ["::before", "::after"].some((pseudo) => {
        const ps = styleFor(el, pseudo);
        return (
          ps.content !== "none" &&
          ps.content !== "normal" &&
          ps.display !== "none" &&
          ps.visibility === "visible" &&
          Number(ps.opacity) > 0 &&
          (color(ps.backgroundColor)?.[3] > 0 || ps.backgroundImage !== "none")
        );
      })
    );
  });
  const contextCache = new Map();
  const createsContext = (el) => {
    if (contextCache.has(el)) return contextCache.get(el);
    const s = styleFor(el);
    const parentDisplay = el.parentElement
      ? styleFor(el.parentElement).display
      : "";
    const context =
      el.matches(":modal,:popover-open") ||
      ["fixed", "sticky"].includes(s.position) ||
      (s.zIndex !== "auto" &&
        (s.position !== "static" || /flex|grid/.test(parentDisplay))) ||
      Number(s.opacity) !== 1 ||
      [
        s.transform,
        s.translate,
        s.rotate,
        s.scale,
        s.perspective,
        s.filter,
        s.backdropFilter,
        s.clipPath,
        s.maskImage,
      ].some((value) => value !== "none") ||
      s.mixBlendMode !== "normal" ||
      s.isolation === "isolate" ||
      /layout|paint|strict|content/.test(s.contain) ||
      s.containerType !== "normal" ||
      s.willChange !== "auto";
    contextCache.set(el, context);
    return context;
  };
  const rootContextCache = new Map();
  const rootContext = (el) => {
    if (rootContextCache.has(el)) return rootContextCache.get(el);
    let outer = document.documentElement;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      if (p.matches(":modal,:popover-open")) {
        outer = null;
        break;
      }
      if (createsContext(p)) outer = p;
    }
    rootContextCache.set(el, outer);
    return outer;
  };
  const stackZ = (el) => {
    if (el === document.documentElement) return 0;
    const s = styleFor(el);
    const parentDisplay = el.parentElement
      ? styleFor(el.parentElement).display
      : "";
    return s.position !== "static" || /flex|grid/.test(parentDisplay)
      ? Number.parseInt(s.zIndex) || 0
      : 0;
  };
  const hasPaintPseudo = (el) =>
    ["::before", "::after"].some((pseudo) => {
      const ps = styleFor(el, pseudo);
      return (
        ps.content !== "none" &&
        ps.content !== "normal" &&
        ps.display !== "none" &&
        ps.visibility === "visible" &&
        Number(ps.opacity) > 0 &&
        (color(ps.backgroundColor)?.[3] > 0 || ps.backgroundImage !== "none")
      );
    });
  const opaquePlateSurface = (plate) => {
    const s = styleFor(plate);
    return (
      color(s.backgroundColor)?.[3] === 1 &&
      s.backgroundImage === "none" &&
      s.backgroundClip === "border-box" &&
      Number(s.opacity) === 1 &&
      s.mixBlendMode === "normal" &&
      [
        s.clipPath,
        s.maskImage,
        s.transform,
        s.translate,
        s.rotate,
        s.scale,
        s.perspective,
        s.filter,
        s.backdropFilter,
      ].every((value) => value === "none") &&
      !hasPaintPseudo(plate) &&
      !animationsFor(plate).some(
        (animation) =>
          animation.playState !== "finished" && animation.playState !== "idle",
      )
    );
  };
  const opaqueRootPlate = (plate) =>
    opaquePlateSurface(plate) &&
    stackZ(plate) > 0 &&
    rootContext(plate) === plate;
  // Context creators strictly between an element and a shared ancestor context
  // govern how that element's paint is ordered inside the ancestor, so paint
  // order may only be compared directly when neither side has one.
  const interveningContexts = (el, root) => {
    for (let p = el.parentElement; p && p !== root; p = p.parentElement)
      if (createsContext(p)) return true;
    return false;
  };
  const outermostStackingContextUnder = (el, root) => {
    let context = null;
    for (let p = el; p && p !== root; p = p.parentElement)
      if (createsContext(p)) context = p;
    return context;
  };
  const hasPaintPseudoThroughRoot = (el, root) => {
    for (let p = el; p; p = p.parentElement) {
      if (hasPaintPseudo(p)) return true;
      if (p === root) return false;
    }
    return true;
  };
  const roundedFillCovers = (plate, rect) => {
    const box = rectFor(plate),
      s = styleFor(plate);
    if (
      box.width <= 0 ||
      box.height <= 0 ||
      rect.left < box.left ||
      rect.top < box.top ||
      rect.right > box.right ||
      rect.bottom > box.bottom
    )
      return false;
    // Glyphs on a painted border have a different local surface.
    if (
      rect.left < box.left + parseFloat(s.borderLeftWidth) ||
      rect.top < box.top + parseFloat(s.borderTopWidth) ||
      rect.right > box.right - parseFloat(s.borderRightWidth) ||
      rect.bottom > box.bottom - parseFloat(s.borderBottomWidth)
    )
      return false;
    const length = (value, size) => {
      if (!/^(?:\d+(?:\.\d+)?|\.\d+)(?:px|%)$/.test(value)) return NaN;
      return parseFloat(value) * (value.endsWith("%") ? size / 100 : 1);
    };
    const radii = [
      s.borderTopLeftRadius,
      s.borderTopRightRadius,
      s.borderBottomRightRadius,
      s.borderBottomLeftRadius,
    ].map((radius) => {
      const values = radius.split(/\s+/);
      return [
        length(values[0], box.width),
        length(values[1] || values[0], box.height),
      ];
    });
    if (radii.flat().some((v) => !Number.isFinite(v))) return false;
    // CSS scales every corner by the same factor when adjacent radii overlap.
    const factor = Math.min(
      1,
      box.width / (radii[0][0] + radii[1][0]),
      box.width / (radii[3][0] + radii[2][0]),
      box.height / (radii[0][1] + radii[3][1]),
      box.height / (radii[1][1] + radii[2][1]),
    );
    const normalized = radii.map(([x, y]) => [x * factor, y * factor]);
    const inside = (x, y) =>
      normalized.every(([rx, ry], corner) => {
        if (!rx || !ry) return true;
        const dx = corner === 1 || corner === 2 ? box.width - x : x;
        const dy = corner >= 2 ? box.height - y : y;
        return (
          dx >= rx ||
          dy >= ry ||
          ((dx - rx) / rx) ** 2 + ((dy - ry) / ry) ** 2 <= 1
        );
      });
    return [
      [rect.left, rect.top],
      [rect.right, rect.top],
      [rect.right, rect.bottom],
      [rect.left, rect.bottom],
    ].every(([x, y]) => inside(x - box.left, y - box.top));
  };
  const provenSeparatePaint = (
    el,
    rect,
    layer,
    { ownRoundedContour = false } = {},
  ) => {
    // Root stacking contexts are atomic. Equal/unknown ordering, top layers,
    // pseudo-elements and nonrectangular/translucent plates remain unresolved.
    if (hasPaintPseudo(layer)) return false;
    const layerContext = rootContext(layer),
      targetContext = rootContext(el);
    if (!layerContext || !targetContext) return false;
    if (
      opaqueRootPlate(layer) &&
      styleFor(layer).boxShadow === "none" &&
      stackZ(layer) > stackZ(targetContext)
    ) {
      // Opaque paint above glyphs occludes them; it does not composite their
      // backdrop. Obstruction remains owned by the mandatory visual gate.
      return true;
    }
    for (
      let plate = el;
      plate && plate !== document.documentElement;
      plate = plate.parentElement
    ) {
      if (!opaquePlateSurface(plate)) continue;
      if (!(
        (ownRoundedContour && plate === el) ||
        roundedFillCovers(plate, rect)
      ))
        continue;
      const plateContext = rootContext(plate);
      if (plateContext && stackZ(layerContext) < stackZ(plateContext))
        return true;
      // A plate and layer that share the same outermost context, with no
      // intervening context creators, keep a valid z-order comparison inside
      // that context even when an ancestor filter, isolation or transform
      // created it.
      if (
        plateContext &&
        plateContext === layerContext &&
        !interveningContexts(plate, plateContext) &&
        !interveningContexts(layer, layerContext) &&
        stackZ(layer) < stackZ(plate)
      )
        return true;
      // An isolated hero may add nested contexts on both sides (for example,
      // a transformed image inside a negative-z media wrapper and an opaque
      // nav link inside a positive-z header). Compare the outermost child
      // contexts immediately below their shared root. Only strict sibling
      // ordering proves the plate is above the image; equal or unknown order,
      // or any pseudo paint on the plate path, remains unresolved.
      const plateStackingContext = outermostStackingContextUnder(
        plate,
        plateContext,
      );
      const layerStackingContext = outermostStackingContextUnder(
        layer,
        layerContext,
      );
      if (
        plateContext === layerContext &&
        plateStackingContext &&
        layerStackingContext &&
        plateStackingContext !== layerStackingContext &&
        !hasPaintPseudoThroughRoot(plate, plateContext) &&
        stackZ(layerStackingContext) < stackZ(plateStackingContext)
      )
        return true;
    }
    return false;
  };
  const backdrop = (el, rect, options = {}) => {
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
      // Text-clipped backgrounds paint glyphs, not the rectangular surface
      // behind them. Their antialiasing cannot establish an opaque plate.
      if (s.backgroundClip.split(",").some((clip) => clip.trim() === "text")) {
        issues.push("text-clipped background is not a provable backdrop");
        continue;
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
        ) {
          const pseudoRect = pseudoBackdropRect(p, ps);
          if (pseudoRect && !intersects(pseudoRect, rect)) continue;
          issues.push("pseudo-element backdrop requires rendered review");
        }
      }
    }
    const overlap = paintedLayers.some((layer) => {
      if (layer === el || layer.contains(el) || el.contains(layer))
        return false;
      const box = rectFor(layer);
      return (
        intersects(box, rect) &&
        visible(layer, box) &&
        !provenSeparatePaint(el, rect, layer, options)
      );
    });
    if (overlap)
      issues.push("overlapping non-ancestor paint requires rendered review");
    return {
      backgrounds,
      variable,
      issues: [...new Set([...issues, ...effects])],
    };
  };
  const targets = [];
  // Client palette contract role colors are custom properties, which the
  // cached computed-style map does not carry. Read them directly and cache
  // per element so a repair can reuse the local surface/text pair.
  const roleCache = new Map();
  const roleHex = (el, name) => {
    for (let p = el; p; p = p.parentElement) {
      if (!roleCache.has(p)) {
        const computed = getComputedStyle(p);
        roleCache.set(p, {
          "--ll-surface": String(
            computed.getPropertyValue("--ll-surface") || "",
          ).trim(),
          "--ll-text": String(
            computed.getPropertyValue("--ll-text") || "",
          ).trim(),
        });
      }
      const value = roleCache.get(p)[name];
      if (value && /^#[0-9a-f]{6}$/iu.test(value)) return value.toLowerCase();
    }
    return null;
  };
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
    // A deterministic plate repair may only paint inside the element's own
    // box, so it is safe only when no own effect would move, clip or blend
    // that paint.
    const plate =
      kind === "text"
        ? {
            plateSurface: roleHex(el, "--ll-surface"),
            plateText: roleHex(el, "--ll-text"),
            platePseudo: ["::before", "::after"].some((pseudo) => {
              const ps = styleFor(el, pseudo);
              return (
                ps.content !== "none" &&
                ps.content !== "normal" &&
                ps.display !== "none" &&
                ps.visibility === "visible" &&
                Number(ps.opacity) > 0 &&
                (ps.backgroundImage !== "none" ||
                  (color(ps.backgroundColor)?.[3] ?? 0) > 0)
              );
            }),
            plateSafe:
              Number(s.opacity) === 1 &&
              s.mixBlendMode === "normal" &&
              [
                s.transform,
                s.translate,
                s.rotate,
                s.scale,
                s.perspective,
                s.filter,
                s.backdropFilter,
                s.clipPath,
                s.maskImage,
              ].every((value) => !value || value === "none"),
          }
        : {};
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
      ...plate,
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
    'input,textarea,select,button,summary,[tabindex]:not([tabindex="-1"]),[role="button"],a[href],svg[role="img"]',
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
      const offset = parseFloat(s.outlineOffset) || 0;
      const width = parseFloat(s.outlineWidth) || 0;
      const borderWidth = Math.max(
        ...["Top", "Bottom", "Left", "Right"].map(
          (side) => parseFloat(s[`border${side}Width`]) || 0,
        ),
      );
      const ownRoundedContour =
        width > 0 && offset <= -width && -offset - width >= borderWidth;
      const localBg =
        offset < 0 ? backdrop(el, rect, { ownRoundedContour }) : null;
      // An inset outline paints over the control, while a partially inset
      // outline touches both surfaces. Prove contrast against both in that case.
      const bg =
        offset <= -width && width > 0
          ? localBg
          : offset < 0
            ? {
                backgrounds: [...parentBg.backgrounds, ...localBg.backgrounds],
                issues: [...parentBg.issues, ...localBg.issues],
                variable: parentBg.variable || localBg.variable,
              }
            : parentBg;
      if (offset < 0 && -offset - width < borderWidth)
        bg.issues.push("inset focus outline overlaps unmeasured border paint");
      if (s.outlineStyle === "none" || parseFloat(s.outlineWidth) === 0)
        bg.issues.push("focus indicator absent or uses unmeasured shadow");
      add(el, "focus", label, s.outlineColor, bg, 3, rect, 1, "outline-color");
    }
  }
  return targets;
}

export function measure(target) {
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
  let pixelResolved = 0;
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
    const measured = (
      await page.evaluate(collectContrastTargets, { route, state })
    ).map(measure);
    const viewport = page.viewportSize();
    const stateTargets = measured.filter((target) => {
      if (
        state === "default" ||
        target.issues?.length !== 1 ||
        target.issues[0] !== "background plate only partially covers text"
      )
        return true;
      // A fully offscreen partial plate is already covered by the default
      // state and is not part of this state's visible frame. Partially clipped
      // targets stay and are proven from their visible intersection without
      // scrolling.
      const rect = target.rect;
      return (
        Boolean(viewport) &&
        rect.x < viewport.width &&
        rect.x + rect.width > 0 &&
        rect.y < viewport.height &&
        rect.y + rect.height > 0
      );
    });
    // Structurally unresolvable backdrops (overlapping paint, filters,
    // partial plates) are resolved from the rendered pixels of this exact
    // state before the findings are finalized. Failures stay failures.
    // CREATIVE_PIXEL_CONTRAST=false restores the DOM-only contract.
    if (String(process.env.CREATIVE_PIXEL_CONTRAST ?? "true").trim() !== "false") {
      const resolution = await resolveRenderedBackdrop(page, stateTargets, {
        scoped: await page.evaluate(() =>
          Boolean(document.querySelector("[data-ll-contrast-scope]")),
        ),
      });
      pixelResolved += resolution.resolved;
    }
    targets.push(...stateTargets);
  };
  const markScope = async (elements) => {
    for (const element of elements)
      await element
        .evaluate((node) => node.setAttribute("data-ll-contrast-scope", "1"))
        .catch(() => {});
  };
  const clearScope = async (elements) => {
    for (const element of elements)
      await element
        .evaluate((node) => node.removeAttribute("data-ll-contrast-scope"))
        .catch(() => {});
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
          parent.offsetParent === null &&
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
    const controlSelector =
      'a[href],button,input,textarea,select,summary,[tabindex]:not([tabindex="-1"]),[role="button"]';
    const exerciseControls = async (scope = null) => {
      // Menu clicks switch to pointer modality. Re-enter keyboard modality so
      // programmatic focus still exercises the authored :focus-visible paint.
      await page.keyboard.press("Tab");
      const controls = scope
        ? await scope.$$(controlSelector)
        : await page.locator(controlSelector).elementHandles();
      for (const control of controls) {
        if (!(await control.isVisible()) || !(await control.isEnabled()))
          continue;
        if (!(await isPainted(control))) continue;
        // Check a reachable, unobscured state instead of leaving nearby controls
        // at the viewport edge under persistent floating actions.
        await control.evaluate((el) =>
          el.scrollIntoView({
            block: "center",
            inline: "center",
            behavior: "instant",
          }),
        );
        await markScope([control]);
        await control.focus();
        await collect("focus");
        if (!(await isPainted(control))) {
          await clearScope([control]);
          continue;
        }
        await control
          .hover({ timeout: 1500 })
          .then(() => collect("hover"))
          .catch((error) => {
            targets.push({
              route,
              state: "hover",
              kind: "control",
              selector: "control",
              text: "Hover target inaccessible",
              issues: [error.message],
              minimum: 3,
              status: "unresolved",
              ratio: null,
              repairEligible: false,
            });
          });
        await control.evaluate((el) => el.blur());
        await clearScope([control]);
      }
      await page.mouse.move(0, 0);
    };
    await exerciseControls();
    await page.mouse.move(0, 0);
    const details = await page.locator("details").elementHandles();
    const initialOpen = await Promise.all(
      details.map((el) => el.evaluate((node) => node.open)),
    );
    try {
      // Snapshot before mutation: named disclosure groups close their peers.
      await page.evaluate(() => {
        for (const el of document.querySelectorAll("details")) {
          if (!el.name) el.open = true;
        }
      });
      await collect("open");
      for (const detail of details) {
        if (await detail.evaluate((el) => !el.name && el.open))
          await exerciseControls(detail);
      }
      for (const detail of details) {
        if (!(await detail.evaluate((el) => Boolean(el.name)))) continue;
        await detail.evaluate((el) => {
          el.open = true;
        });
        await markScope([detail]);
        await collect("open");
        await exerciseControls(detail);
        await clearScope([detail]);
      }
    } finally {
      for (const detail of details)
        await detail.evaluate((el) => {
          el.open = false;
        });
      for (let i = 0; i < details.length; i++) {
        if (initialOpen[i])
          await details[i].evaluate((el) => {
            el.open = true;
          });
      }
    }
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
        const menu = await page.evaluateHandle(
          (id) => document.getElementById(id),
          id,
        );
        try {
          const scopeElements = [toggle];
          if (menu.asElement()) scopeElements.push(menu.asElement());
          await markScope(scopeElements);
          await collect("menu-open");
          if (menu.asElement()) await exerciseControls(menu.asElement());
          await clearScope(scopeElements);
        } finally {
          await menu.dispose();
        }
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
    pixelResolved,
    targets: measured,
    findings: measured.filter((t) => t.status !== "pass"),
  };
}

export function contrastFailureMessages(report) {
  return report.findings.map(
    (f) =>
      `contrast ${f.status}: ${f.route} ${f.viewport || ""} ${f.state} ${f.selector} ${f.kind} ${JSON.stringify(f.text)} (${f.ratio == null ? "unresolved" : f.ratio.toFixed(3)}; required ${f.minimum}); foreground ${f.color || "unknown"}, background ${f.background || "variable"}; ${(f.issues || []).join(", ")}${f.status === "unresolved" ? "; use a proving foreground color, a sufficiently strong scrim, or a moved copy field and rerun" : ""}`,
  );
}
