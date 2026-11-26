/**
 * Keep the collapsed desktop assistant at its bottom-left anchor. If visible
 * copy, controls, or fixed chrome would occupy that corner, use the assistant's
 * normal document position instead.
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
  let suppressOwnResize = false;
  let lastBodyWidth = document.body.clientWidth;

  const markOwnLayoutChange = () => {
    suppressOwnResize = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        suppressOwnResize = false;
      });
    });
  };

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

    // A fixed or sticky chrome panel can cover the corner with its surface even
    // when its text and controls sit elsewhere. Empty page containers stay
    // excluded so decorative fixed backgrounds do not hide the assistant.
    for (const element of document.body.children) {
      if (root.contains(element) || effectivelyHidden(element)) continue;
      if (!["fixed", "sticky"].includes(getComputedStyle(element).position))
        continue;
      if (
        !element.innerText?.trim() &&
        !element.querySelector(obstacleSelector)
      )
        continue;
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
      (!root.classList.contains("is-colliding") &&
        getComputedStyle(root).position !== "fixed")
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
    const top = window.innerHeight - margin - height;
    const wasColliding = root.classList.contains("is-colliding");
    const pad = wasColliding ? 24 : 8;
    const safe = {
      left: margin - pad,
      right: margin + width + pad,
      top: top - pad,
      bottom: top + height + pad,
    };
    const collides = obstacles().some(
      (rect) =>
        rect.left < safe.right &&
        rect.right > safe.left &&
        rect.top < safe.bottom &&
        rect.bottom > safe.top,
    );
    if (collides) {
      if (!wasColliding) markOwnLayoutChange();
      clearPosition();
      root.classList.add("is-colliding");
      return;
    }
    if (wasColliding && root.contains(document.activeElement))
      return;
    if (wasColliding) markOwnLayoutChange();
    root.style.setProperty("left", `${margin}px`, "important");
    root.style.setProperty("right", "auto", "important");
    root.style.setProperty("bottom", `${margin}px`, "important");
    root.style.setProperty("top", "auto", "important");
    root.classList.remove("is-colliding");
    root.inert = false;
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
  root.addEventListener("focusout", schedule);
  document.fonts?.ready.then(schedule).catch(() => {});
  if ("ResizeObserver" in window)
    new ResizeObserver(() => {
      const nextWidth = document.body.clientWidth;
      if (suppressOwnResize && nextWidth === lastBodyWidth) return;
      lastBodyWidth = nextWidth;
      schedule();
    }).observe(document.body);
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
