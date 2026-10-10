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
      marginBottom = px(style.marginBottom);
    if (
      ![marginLeft, marginTop, marginRight, marginBottom].every(Number.isFinite)
    )
      return null;
    const width =
      rawWidth +
      (style.boxSizing === "border-box"
        ? 0
        : (parseFloat(style.borderLeftWidth) || 0) +
          (parseFloat(style.borderRightWidth) || 0));
    const height =
      rawHeight +
      (style.boxSizing === "border-box"
        ? 0
        : (parseFloat(style.borderTopWidth) || 0) +
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
        await collect("open");
        await exerciseControls(detail);
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
        await collect("menu-open");
        const menu = await page.evaluateHandle(
          (id) => document.getElementById(id),
          id,
        );
        try {
          if (menu.asElement()) await exerciseControls(menu.asElement());
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
