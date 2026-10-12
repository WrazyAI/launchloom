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
      for (let parent = link; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (
          style.display === "none" ||
          style.visibility !== "visible" ||
          Number(style.opacity) <= 0.02 ||
          parent.getAttribute("aria-hidden") === "true"
        )
          return false;
      }
      const rect = link.getBoundingClientRect();
      return (
        rect.width >= 16 &&
        rect.height >= 8 &&
        Number.parseFloat(getComputedStyle(link).fontSize) >= 12
      );
    },
    { id: creditId, href: credit.href, label: credit.label },
  );
  return pass
    ? []
    : ["source attribution must remain visible, readable and followed"];
}
