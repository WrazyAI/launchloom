/**
 * Move focus outside the assistant before a close recalculates collision state.
 * @param {boolean} focusWasInside
 */
export function focusQuickAnswersFallback(focusWasInside) {
  if (!focusWasInside) return;
  const main = document.querySelector("main");
  const mainStyle = main && getComputedStyle(main);
  const mainIsAvailable =
    main &&
    !main.closest("[hidden], [inert], [aria-hidden='true']") &&
    mainStyle?.display !== "none" &&
    mainStyle?.visibility !== "hidden" &&
    Number(mainStyle?.opacity) !== 0;
  const focusTarget = mainIsAvailable ? main : document.body;
  if (!focusTarget.hasAttribute("tabindex"))
    focusTarget.setAttribute("tabindex", "-1");
  focusTarget.focus({ preventScroll: true });
}

/**
 * Keep the collapsed desktop assistant clear of visible copy and controls.
 * Small-screen and expanded layouts are handled by shared CSS in site.css.
 * @param {HTMLElement} root
 * @returns {{refresh: () => void}}
 */
export function installQuickAnswersLayout(root) {
  const launcher = root.querySelector(".quick-answers__launcher");
  const panel = root.querySelector(".quick-answers__panel");
  const obstacleSelector =
    'a[href], button, input, select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])';
  const positioned = ["left", "right", "top", "bottom"];
  let frame = 0;

  const clearPosition = () => {
    for (const property of positioned) root.style.removeProperty(property);
  };

  const effectivelyHidden = (element) => {
    let current = element;
    while (current && current !== document.documentElement) {
      if (current.hidden || current.inert) return true;
      const style = getComputedStyle(current);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0
      )
        return true;
      current = current.parentElement;
    }
    return false;
  };

  const obstacles = () => {
    const rectangles = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    const range = document.createRange();
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (
        !node.textContent?.trim() ||
        node.parentElement?.closest(
          ".quick-answers, [hidden], [inert], [aria-hidden='true'], script, style, template",
        ) ||
        effectivelyHidden(node.parentElement)
      )
        continue;
      range.selectNodeContents(node);
      for (const rect of range.getClientRects())
        if (rect.width > 0 && rect.height > 0) rectangles.push(rect);
    }

    for (const element of document.querySelectorAll(obstacleSelector)) {
      if (root.contains(element) || effectivelyHidden(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) rectangles.push(rect);
    }
    return rectangles;
  };

  const refresh = () => {
    if (!launcher || !panel) return;
    if (
      root.hidden ||
      !panel.hidden ||
      window.matchMedia("(max-width: 760px)").matches ||
      getComputedStyle(root).position !== "fixed"
    ) {
      clearPosition();
      root.classList.remove("is-colliding");
      root.inert = false;
      return;
    }

    const launcherRect = launcher.getBoundingClientRect();
    if (launcherRect.width <= 0 || launcherRect.height <= 0) return;
    const width = launcherRect.width;
    const height = launcherRect.height;
    const margin = window.innerWidth <= 760 ? 14 : 24;
    const header =
      document.querySelector(".site-header") ||
      [...document.querySelectorAll("header")].find(
        (element) => !root.contains(element),
      );
    const headerBottom = header?.getBoundingClientRect().bottom || 0;
    const topLimit = Math.min(
      window.innerHeight - height - margin,
      Math.max(margin, headerBottom + 12),
    );
    const maxBottom = window.innerHeight - height - topLimit;
    const slots = [];
    for (let bottom = margin; bottom <= maxBottom; bottom += height + 12) {
      const top = window.innerHeight - bottom - height;
      for (const left of [
        margin,
        Math.max(margin, window.innerWidth - width - margin),
      ])
        slots.push({
          left,
          bottom,
          top,
          score:
            Math.abs(left - margin) +
            Math.abs(top - (window.innerHeight - margin - height)),
        });
    }
    slots.sort((a, b) => a.score - b.score);

    const blocked = obstacles();
    let placed = false;
    for (const slot of slots) {
      const safe = {
        left: slot.left - 8,
        right: slot.left + width + 8,
        top: slot.top - 8,
        bottom: slot.top + height + 8,
      };
      const collides = blocked.some(
        (rect) =>
          rect.left < safe.right &&
          rect.right > safe.left &&
          rect.top < safe.bottom &&
          rect.bottom > safe.top,
      );
      if (collides) continue;
      root.style.setProperty("left", `${slot.left}px`, "important");
      root.style.setProperty("right", "auto", "important");
      root.style.setProperty("bottom", `${slot.bottom}px`, "important");
      root.style.setProperty("top", "auto", "important");
      placed = true;
      break;
    }
    root.classList.toggle("is-colliding", !placed);
    root.inert = !placed;
  };

  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      refresh();
    });
  };

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  document.fonts?.ready.then(schedule).catch(() => {});
  if ("ResizeObserver" in window)
    new ResizeObserver(schedule).observe(document.body);
  if ("MutationObserver" in window) {
    const styleChangeMayAffectObstacles = (target) => {
      if (!(target instanceof Element) || root.contains(target)) return false;
      return (
        target.matches(obstacleSelector) ||
        Boolean(target.textContent?.trim()) ||
        Boolean(target.querySelector(obstacleSelector))
      );
    };
    const observer = new MutationObserver((records) => {
      if (
        records.some((record) => {
          if (record.target === root || root.contains(record.target))
            return false;
          if (record.type === "attributes" && record.attributeName === "style")
            return styleChangeMayAffectObstacles(record.target);
          return true;
        })
      )
        schedule();
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "hidden", "inert", "style"],
      characterData: true,
      childList: true,
      subtree: true,
    });
  }

  refresh();
  return { refresh };
}
