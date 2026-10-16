import { sourceAttribution } from "../templates/client-site/src/lib/source-attribution.mjs";

/** Source-reuse license conditions are rendered acceptance gates, not comments. */
export async function sourceAttributionFailures(page, creditId) {
  if (!creditId) return [];
  const credit = sourceAttribution(creditId);
  if (!credit) return ["source attribution decision is unknown"];
  const pass = await page.evaluate(
    ({ id, href, label }) => {
      const nodes = [
        ...document.querySelectorAll("[data-source-attribution]"),
      ].filter((node) => node.getAttribute("data-source-attribution") === id);
      if (nodes.length !== 1) return false;
      const link = nodes[0].querySelector("a");
      if (
        !link ||
        link.getAttribute("href") !== href ||
        link.textContent.trim() !== label ||
        link.rel.toLowerCase().split(/\s/u).includes("nofollow")
      )
        return false;
      let opacity = 1;
      for (let parent = link; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        opacity *= Number(style.opacity);
        if (
          style.display === "none" ||
          style.visibility !== "visible" ||
          opacity <= 0.02 ||
          parent.getAttribute("aria-hidden") === "true"
        )
          return false;
      }
      const scroll = { left: window.scrollX, top: window.scrollY };
      try {
        link.scrollIntoView({ block: "center", behavior: "instant" });
        const rect = link.getBoundingClientRect();
        let left = Math.max(0, rect.left),
          right = Math.min(innerWidth, rect.right);
        let top = Math.max(0, rect.top),
          bottom = Math.min(innerHeight, rect.bottom);
        for (
          let parent = link.parentElement;
          parent;
          parent = parent.parentElement
        ) {
          const style = getComputedStyle(parent),
            bounds = parent.getBoundingClientRect();
          if (["hidden", "clip", "scroll", "auto"].includes(style.overflowX)) {
            left = Math.max(left, bounds.left);
            right = Math.min(right, bounds.right);
          }
          if (["hidden", "clip", "scroll", "auto"].includes(style.overflowY)) {
            top = Math.max(top, bounds.top);
            bottom = Math.min(bottom, bounds.bottom);
          }
        }
        const hit = document.elementFromPoint(
          (left + right) / 2,
          (top + bottom) / 2,
        );
        return (
          right - left >= 16 &&
          bottom - top >= 8 &&
          Number.parseFloat(getComputedStyle(link).fontSize) >= 12 &&
          (hit === link || link.contains(hit))
        );
      } finally {
        window.scrollTo({ ...scroll, behavior: "instant" });
      }
    },
    { id: creditId, href: credit.href, label: credit.label },
  );
  return pass
    ? []
    : ["source attribution must remain visible, readable and followed"];
}
