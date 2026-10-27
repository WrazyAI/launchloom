import { parseHTML } from "linkedom";

const SECTION_TAGS = new Set(["nav", "header", "section", "article", "footer"]);
const REPEATABLE_TAGS = new Set([
  "article",
  "details",
  "li",
  "figure",
  "blockquote",
  "tr",
  "section",
]);
const INLINE_TAGS = new Set(["a", "button", "span", "strong", "em", "b", "i"]);
const SKIP_TEXT_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
]);

const ROLE_PATTERNS = [
  { role: "seasons", pattern: /\b(?:seasons?|calendar|schedules?)\b/iu },
  { role: "plans", pattern: /\b(?:plans?|pricing|packages?|maintenance)\b/iu },
  {
    role: "estimate",
    pattern: /\b(?:estimates?|quotes?|calculator|budget|lot size)\b/iu,
  },
  {
    role: "coverage",
    pattern:
      /\b(?:coverage|areas?|locations?|serving|neighbourhoods?|neighborhoods?)\b/iu,
  },
  { role: "faq", pattern: /\b(?:faqs?|questions?|accordion)\b/iu },
  {
    role: "proof",
    pattern:
      /\b(?:testimonials?|reviews?|proofs?|results?|case stud(?:y|ies)|client say)\b/iu,
  },
  {
    role: "process",
    pattern: /\b(?:process(?:es)?|steps?|how it works|timeline)\b/iu,
  },
  {
    role: "contact",
    pattern:
      /\b(?:contacts?|enquir(?:y|ies)?|inquir(?:y|ies)?|book|consult)\b/iu,
  },
  {
    role: "about",
    pattern:
      /\b(?:about|stories?|approaches?|philosoph(?:y|ies)?|who we|team)\b/iu,
  },
  {
    role: "portfolio",
    pattern: /\b(?:works?|portfolios?|projects?|galleries|gallery)\b/iu,
  },
  {
    role: "services",
    pattern:
      /\b(?:services?|practices?|treatments?|menu|programs?|capabilit(?:y|ies))\b/iu,
  },
];

const HEADING_PATHS = {
  hero: "hero.heading",
  services: "copy.servicesHeading",
  portfolio: "copy.servicesHeading",
  faq: "copy.faqHeading",
  contact: "copy.contactHeading",
  about: "copy.aboutHeading",
  coverage: "coverageHeading",
};

const BODY_PATHS = {
  hero: "hero.body",
  services: "copy.servicesIntro",
  portfolio: "copy.servicesIntro",
  about: "copy.aboutBody",
  contact: "businessDescription",
  coverage: "coverageIntro",
};

const ITEM_PATHS = {
  services: { list: "services", item: "service" },
  portfolio: { list: "services", item: "service" },
  faq: { list: "faqs", item: "faq" },
  coverage: { list: "locations", item: "location" },
  proof: { list: "proof", item: "proof" },
  process: { list: "process", item: "step" },
};

const CTA_PATTERN =
  /\b(?:estimate|quote|contact|book|call|request|get started|start|enquire|inquire)\b/iu;

function cleanText(value, limit = 240) {
  return String(value || "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
}

function slug(value, fallback = "section") {
  const normalized = cleanText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized || fallback;
}

function uniqueId(base, used) {
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function elementText(element, limit = 300) {
  return cleanText(element?.textContent || "", limit);
}

function directChildren(element) {
  return [...(element?.children || [])];
}

function findFirst(element, selector) {
  return element.querySelector(selector);
}

function findFirstTextNode(root) {
  for (const node of root.childNodes || []) {
    if (node.nodeType === 3 && cleanText(node.data || node.nodeValue || ""))
      return node;
    if (node.nodeType === 1 && !SKIP_TEXT_TAGS.has(node.localName)) {
      const nested = findFirstTextNode(node);
      if (nested) return nested;
    }
  }
  return null;
}

function findTextNodes(root, results = []) {
  for (const node of root.childNodes || []) {
    if (node.nodeType === 3) {
      if (cleanText(node.data || node.nodeValue || "")) results.push(node);
      continue;
    }
    if (node.nodeType !== 1 || SKIP_TEXT_TAGS.has(node.localName)) continue;
    findTextNodes(node, results);
  }
  return results;
}

function setTextNode(node, value) {
  node.data = value;
  node.nodeValue = value;
}

function createComment(document, value) {
  return document.createComment(value);
}

function normalizeHref(href) {
  const value = String(href || "").trim();
  if (value === "#work" || value === "#services") return "#services";
  if (value === "#faq" || value === "#faqs") return "#faqs";
  if (value === "#estimate" || value === "#contact") return "#contact";
  return value;
}

function sectionSignature(section) {
  return `${section.localName || ""}|${section.getAttribute("id") || ""}|${section.getAttribute("class") || ""}|${elementText(section, 220)}`;
}

function detectRole(section, { isFirstHeader, hasH1 }) {
  if (section.localName === "nav") return "navigation";
  if (section.localName === "footer") return "footer";
  if (section.localName === "header")
    return isFirstHeader || hasH1 ? "hero" : "about";
  const identity =
    `${section.getAttribute("id") || ""} ${section.getAttribute("class") || ""}`.toLowerCase();
  const heading = elementText(
    section.querySelector("h1, h2, h3, h4") || section,
    160,
  ).toLowerCase();
  const body = elementText(section, 260).toLowerCase();
  let best = { role: "unknown", score: 0 };
  for (const { role, pattern } of ROLE_PATTERNS) {
    let score = 0;
    if (pattern.test(identity)) score = 3;
    else if (pattern.test(heading)) score = 2;
    else if (pattern.test(body)) score = 1;
    if (score > best.score) best = { role, score };
  }
  if (best.score > 0) return best.role;
  if (section.querySelector("form")) return "contact";
  if (section.querySelector("blockquote, figure")) return "proof";
  return "unknown";
}

function findRepeatedGroup(section) {
  let best = null;
  const visit = (element) => {
    const children = directChildren(element);
    if (children.length >= 2) {
      const groups = new Map();
      for (const child of children) {
        if (!REPEATABLE_TAGS.has(child.localName)) continue;
        const key = child.localName;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(child);
      }
      for (const items of groups.values()) {
        if (items.length < 2) continue;
        if (!best || items.length > best.items.length)
          best = { parent: element, items };
      }
    }
    for (const child of children) visit(child);
  };
  visit(section);
  return best;
}

function repeatedItemMapping(role) {
  return ITEM_PATHS[role] || null;
}

function itemChildSlots(role, item, itemPath, slotId, slots) {
  const mapping = repeatedItemMapping(role);
  if (!mapping) return [];
  const childSlots = [];
  const childId = slotId.replace(/\.items$/u, ".item");
  const add = (suffix, kind, contentPath, element) => {
    if (!element) return null;
    const id = `${childId}.${suffix}`;
    slots.push({
      id,
      selector: `[data-foundation-item="${slotId}"] ${suffix}`,
      kind,
      contentPath,
      required: true,
    });
    childSlots.push({ id, kind, contentPath, element });
    return element;
  };
  if (role === "faq") {
    const summary = findFirst(item, "summary") || findFirst(item, "h3, h2, h4");
    const answer = findFirst(item, "p") || findFirst(item, "div");
    add("question", "text", `${itemPath}.question`, summary);
    add("answer", "text", `${itemPath}.answer`, answer);
  } else if (role === "proof") {
    const quote = findFirst(item, "blockquote, p") || item;
    const attribution = findFirst(item, "figcaption, cite, footer");
    add("quote", "text", `${itemPath}.quote`, quote);
    add("attribution", "text", `${itemPath}.attribution`, attribution);
  } else if (role === "process") {
    const description = findFirst(item, "p") || item;
    add("description", "text", `${itemPath}.description`, description);
  } else if (role === "coverage") {
    const name = findFirst(item, "a, span, strong, li") || item;
    add("name", "text", `${itemPath}.name`, name);
  } else {
    const name =
      findFirst(item, "h3, h2, h4, strong, a") ||
      findFirst(item, "span, div") ||
      item;
    const description = findFirst(item, "p");
    add("name", "text", `${itemPath}.name`, name);
    if (description)
      add("description", "text", `${itemPath}.description`, description);
  }
  const image = findFirst(item, "img");
  if (image) {
    const id = `${childId}.image`;
    slots.push({
      id,
      selector: `[data-foundation-item="${slotId}"] img`,
      kind: "image",
      contentPath: `${itemPath}.image`,
      required: false,
    });
    childSlots.push({
      id,
      kind: "image",
      contentPath: `${itemPath}.image`,
      element: image,
    });
  }
  return childSlots;
}

function replaceElementText(element, placeholder) {
  if (!element) return;
  element.textContent = `{{${placeholder}}}`;
}

function replaceImage(element, placeholder) {
  if (!element) return;
  element.setAttribute("src", `{{${placeholder}}}`);
  element.removeAttribute("srcset");
  element.setAttribute("alt", "");
}

function addSection(
  sections,
  usedSectionIds,
  { element, role, order, required },
) {
  const base = slug(element.getAttribute("id") || role, role);
  const id = uniqueId(base, usedSectionIds);
  const sourceSelector = element.getAttribute("id")
    ? `#${element.getAttribute("id")}`
    : element.localName;
  const section = {
    id,
    sourceSelector,
    order,
    role,
    required,
  };
  element.setAttribute("data-foundation-section", id);
  if (role === "hero") element.setAttribute("data-experience-hero", "true");
  sections.push(section);
  return section;
}

function createContactSection(document, sections, slots, usedSectionIds) {
  const section = document.createElement("section");
  section.setAttribute("id", "contact");
  section.setAttribute("data-foundation-contact", "true");
  section.innerHTML =
    "<h2>{{contact.heading}}</h2><div data-foundation-contact-form>{{contact.form}}</div>";
  const footer = document.querySelector("footer");
  if (footer?.parentNode) footer.parentNode.insertBefore(section, footer);
  else document.body.appendChild(section);
  const sectionRecord = addSection(sections, usedSectionIds, {
    element: section,
    role: "contact",
    order: sections.length + 1,
    required: true,
  });
  slots.push({
    id: "contact.heading",
    selector: "#contact h2",
    kind: "text",
    contentPath: "copy.contactHeading",
    required: true,
  });
  slots.push({
    id: "contact.form",
    selector: "[data-foundation-contact-form]",
    kind: "html",
    contentPath: "contact.form",
    required: true,
  });
  return sectionRecord;
}

function addAnchor(document, id, before) {
  if (document.getElementById(id)) return;
  const anchor = document.createElement("span");
  anchor.setAttribute("id", id);
  anchor.setAttribute("data-foundation-anchor", "true");
  if (before?.parentNode) before.parentNode.insertBefore(anchor, before);
  else document.body.appendChild(anchor);
}

function normalizeNavigation(section, slots) {
  const links = [...section.querySelectorAll("a[href]")];
  const first = links[0];
  if (first) {
    const href = String(first.getAttribute("href") || "").trim();
    const firstText = elementText(first, 80);
    const isSectionLink = href.startsWith("#") && href.length > 1;
    const isGenericSectionLabel =
      /^(?:services?|work|faqs?|questions?|plans?|seasons?|estimates?|contacts?)$/iu.test(
        firstText,
      );
    const isBrandLink =
      !isSectionLink ||
      Boolean(first.querySelector("svg, img")) ||
      !isGenericSectionLabel;
    if (isBrandLink) {
      first.innerHTML = "{{navigation.brand}}";
      first.setAttribute("data-foundation-slot", "navigation.brand");
      slots.push({
        id: "navigation.brand",
        selector: '[data-foundation-slot="navigation.brand"]',
        kind: "text",
        contentPath: "brand.name",
        required: true,
      });
    }
  }
  const sectionLinks = links.filter((link) => {
    const href = String(link.getAttribute("href") || "").trim();
    return link !== first && href.startsWith("#") && href.length > 1;
  });
  if (!sectionLinks.length) return;
  const container = sectionLinks[0].parentElement;
  if (!container) return;
  const linkClass = sectionLinks[0].getAttribute("class") || "";
  const innerNav = section.ownerDocument.createElement("nav");
  innerNav.setAttribute("aria-label", "Main navigation");
  const containerClass = container.getAttribute("class") || "";
  if (containerClass) innerNav.setAttribute("class", containerClass);
  const targets = [
    ["Services", "#services"],
    ["FAQs", "#faqs"],
    ["Contact", "#contact"],
  ];
  for (const [label, href] of targets) {
    const link = section.ownerDocument.createElement("a");
    link.setAttribute("href", href);
    if (linkClass) link.setAttribute("class", linkClass);
    link.textContent = label;
    innerNav.appendChild(link);
  }
  container.insertBefore(innerNav, sectionLinks[0]);
  for (const link of sectionLinks) link.remove();
}

function normalizeFooter(section, slots, license) {
  section.innerHTML =
    "<span>{{footer.brand}}</span><span>{{footer.credit}}</span>";
  slots.push({
    id: "footer.brand",
    selector: "footer [data-foundation-footer-brand]",
    kind: "text",
    contentPath: "brand.name",
    required: true,
  });
  slots.push({
    id: "footer.credit",
    selector: "footer [data-foundation-footer-credit]",
    kind: "text",
    contentPath: "license.name",
    required: true,
  });
  section.setAttribute("data-foundation-license", license.name || "");
}

function sectionHeading(section, role) {
  if (role === "hero")
    return findFirst(section, "h1") || findFirst(section, "h2");
  return (
    findFirst(section, "h2") ||
    findFirst(section, "h1") ||
    findFirst(section, "h3")
  );
}

function sectionBody(section, role, heading) {
  const paragraphs = [...section.querySelectorAll("p")].filter(
    (paragraph) => !paragraph.closest("article, details, figure, form"),
  );
  if (role === "hero") {
    const candidates = paragraphs.filter((paragraph) => paragraph !== heading);
    return candidates[0] || paragraphs[0] || null;
  }
  return paragraphs[0] || null;
}

function sectionCta(section, role) {
  if (role !== "hero") return null;
  const candidates = [...section.querySelectorAll("a[href], button")].filter(
    (element) => CTA_PATTERN.test(elementText(element, 80)),
  );
  return candidates[0] || null;
}

function sectionImages(section, role) {
  const images = [...section.querySelectorAll("img")];
  if (role === "hero") return images.slice(0, 3);
  return images.slice(0, 3);
}

function addImageSlot(slots, id, contentPath, required) {
  slots.push({
    id,
    selector: `[data-foundation-image="${id}"]`,
    kind: "image",
    contentPath,
    required,
  });
}

function addTextSlot(slots, id, contentPath, required) {
  slots.push({
    id,
    selector: `[data-foundation-slot="${id}"]`,
    kind: "text",
    ...(contentPath ? { contentPath } : {}),
    required,
  });
}

function detectInteractions(section, interactions, blockers) {
  const add = (id, source, primitive, reducedMotion) => {
    if (interactions.some((interaction) => interaction.id === id)) return;
    interactions.push({ id, source, primitive, reducedMotion });
  };
  if (section.querySelector("details"))
    add(
      `${slug(section.getAttribute("id") || "section")}-disclosure`,
      "details",
      "native-disclosure",
      "all content visible when closed",
    );
  if (section.querySelector("button[aria-pressed]"))
    add(
      `${slug(section.getAttribute("id") || "section")}-buttons`,
      "button[aria-pressed]",
      "native-buttons",
      "static selected state",
    );
  if (section.querySelector('input[type="range"]'))
    add(
      `${slug(section.getAttribute("id") || "section")}-range`,
      'input[type="range"]',
      "native-range",
      "static numeric value",
    );
  if (section.querySelector("form"))
    add(
      `${slug(section.getAttribute("id") || "section")}-form`,
      "form",
      "shared-lead-form",
      "static form",
    );
}

function wrapMain(document) {
  if (document.querySelector("main[data-foundation-main]")) return;
  const nav = document.querySelector("nav");
  const footer = document.querySelector("footer");
  if (!nav || !footer || nav.parentElement !== footer.parentElement) return;
  const parent = nav.parentElement;
  const main = document.createElement("main");
  main.setAttribute("data-foundation-main", "true");
  parent.insertBefore(main, nav.nextSibling);
  let node = main.nextSibling;
  while (node && node !== footer) {
    const next = node.nextSibling;
    main.appendChild(node);
    node = next;
  }
}

function injectConversionRibbon(document, sections, slots, usedSectionIds) {
  const hero = document.querySelector('[data-foundation-section="hero"]');
  if (
    !hero ||
    hero.parentElement?.querySelector('[data-foundation-section="conversion"]')
  )
    return;
  const ribbon = document.createElement("aside");
  ribbon.className = "xp-ribbon";
  ribbon.setAttribute("data-early-conversion", "true");
  ribbon.innerHTML =
    '<p>{{conversion.body}}</p><a href="#contact">{{conversion.action}}</a>';
  hero.parentNode.insertBefore(ribbon, hero.nextSibling);
  addSection(sections, usedSectionIds, {
    element: ribbon,
    role: "conversion",
    order: sections.length + 1,
    required: true,
  });
  slots.push({
    id: "conversion.body",
    selector: '[data-foundation-slot="conversion.body"]',
    kind: "text",
    contentPath: "hero.offer",
    required: false,
  });
  slots.push({
    id: "conversion.action",
    selector: '[data-foundation-slot="conversion.action"]',
    kind: "text",
    contentPath: "hero.primaryLabel",
    required: true,
  });
}

export function detectFoundationSections({ html, dossierId, license }) {
  const { document } = parseHTML(html);
  if (!document?.body) throw new Error("Foundation HTML has no body.");
  const sections = [];
  const slots = [];
  const interactions = [];
  const blockers = [];
  const usedSectionIds = new Set();
  const candidates = [
    ...document.querySelectorAll(
      "body nav, body header, body section, body article, body footer",
    ),
  ].filter(
    (element) =>
      SECTION_TAGS.has(element.localName) &&
      !element.parentElement?.closest("nav, header, section, article, footer"),
  );
  let firstHeader = true;
  const firstH1 = document.querySelector("h1");

  for (const element of candidates) {
    const role = detectRole(element, {
      isFirstHeader: element.localName === "header" && firstHeader,
      hasH1: Boolean(firstH1 && element.contains(firstH1)),
    });
    if (element.localName === "header") firstHeader = false;
    const section = addSection(sections, usedSectionIds, {
      element,
      role,
      order: sections.length + 1,
      required: ["hero", "services", "portfolio", "contact"].includes(role),
    });
    const slotPrefix = role === "portfolio" ? "services" : role;
    detectInteractions(element, interactions, blockers);

    if (role === "navigation") {
      normalizeNavigation(element, slots);
      continue;
    }
    if (role === "footer") {
      normalizeFooter(element, slots, license);
      continue;
    }

    const heading = sectionHeading(element, role);
    if (heading) {
      const id = `${slotPrefix}.heading`;
      const contentPath = HEADING_PATHS[role];
      replaceElementText(heading, id);
      heading.setAttribute("data-foundation-slot", id);
      addTextSlot(slots, id, contentPath, Boolean(contentPath));
    }

    const body = sectionBody(element, role, heading);
    if (body) {
      const id = `${slotPrefix}.body`;
      const contentPath = BODY_PATHS[role];
      replaceElementText(body, id);
      body.setAttribute("data-foundation-slot", id);
      addTextSlot(slots, id, contentPath, Boolean(contentPath));
    }

    const cta = sectionCta(element, role);
    if (cta) {
      const id = `${slotPrefix}.primaryLabel`;
      replaceElementText(cta, id);
      cta.setAttribute("data-foundation-slot", id);
      if (cta.localName === "a") cta.setAttribute("href", "#contact");
      addTextSlot(slots, id, "hero.primaryLabel", true);
      if (role === "hero" && cta.parentElement) {
        const secondary = [
          ...cta.parentElement.querySelectorAll("a[href]"),
        ].find((link) => link !== cta);
        if (secondary) {
          const secondaryId = "hero.secondaryLabel";
          replaceElementText(secondary, secondaryId);
          secondary.setAttribute("data-foundation-slot", secondaryId);
          secondary.setAttribute("href", "#services");
          slots.push({
            id: secondaryId,
            selector: '[data-foundation-slot="hero.secondaryLabel"]',
            kind: "text",
            required: false,
          });
        }
      }
    }

    const images = sectionImages(element, role);
    images.forEach((image, index) => {
      const suffix =
        index === 0
          ? "image"
          : index === 1
            ? "secondaryImage"
            : "tertiaryImage";
      const id = `${slotPrefix}.${suffix}`;
      const contentPath = role === "hero" ? `hero.${suffix}` : `hero.${suffix}`;
      replaceImage(image, id);
      image.setAttribute("data-foundation-image", id);
      addImageSlot(slots, id, contentPath, role === "hero" && index === 0);
    });

    const repeated = findRepeatedGroup(element);
    const mapping = repeatedItemMapping(role);
    if (repeated && mapping) {
      const slotId = `${slotPrefix}.items`;
      const template =
        repeated.items.find(
          (item) =>
            item.querySelector("h1, h2, h3, h4, summary, strong") &&
            item.querySelector("p"),
        ) || repeated.items[0];
      for (const item of repeated.items) {
        if (item !== template) item.remove();
      }
      if (["portfolio", "services"].includes(role)) {
        for (const article of [...element.querySelectorAll("article")]) {
          if (article !== template && !template.contains(article))
            article.remove();
        }
      }
      const start = createComment(document, `foundation:each:${slotId}`);
      const end = createComment(document, `/foundation:each:${slotId}`);
      repeated.parent.insertBefore(start, template);
      repeated.parent.insertBefore(end, template.nextSibling);
      repeated.parent.setAttribute("data-foundation-repeat-parent", slotId);
      slots.push({
        id: slotId,
        selector: `[data-foundation-repeat="${slotId}"]`,
        kind: "each",
        contentPath: mapping.list,
        itemPath: mapping.item,
        required: true,
      });
      template.setAttribute("data-foundation-repeat", slotId);
      const childSlots = itemChildSlots(
        role,
        template,
        mapping.item,
        slotId,
        slots,
      );
      for (const child of childSlots) {
        if (child.kind === "image") {
          replaceImage(child.element, child.id);
          child.element.setAttribute("data-foundation-image", child.id);
        } else {
          replaceElementText(child.element, child.id);
          child.element.setAttribute("data-foundation-slot", child.id);
        }
      }
      for (const textNode of findTextNodes(template)) {
        if (textNode.parentElement?.closest?.("[data-foundation-slot]"))
          continue;
        if (textNode.parentElement?.closest?.("[data-foundation-image]"))
          continue;
        setTextNode(textNode, "");
      }
    } else if (repeated && !mapping) {
      blockers.push({
        code: "unmapped-repeated-items",
        message: `Repeated ${role} items in '${section.id}' have no sealed content mapping.`,
        selector: section.sourceSelector,
      });
    }

    for (const textNode of findTextNodes(element)) {
      if (textNode.parentElement?.closest?.("[data-foundation-slot]")) continue;
      if (textNode.parentElement?.closest?.("[data-foundation-image]"))
        continue;
      setTextNode(textNode, "");
    }

    if (role === "unknown" || ["seasons", "plans", "estimate"].includes(role)) {
      blockers.push({
        code: "unmapped-section-content",
        message:
          role === "unknown"
            ? `Section '${section.id}' has no supported content role.`
            : `Section '${section.id}' preserves source composition that needs adaptation.`,
        selector: section.sourceSelector,
      });
      if (role !== "unknown" && element.querySelector("button, input, svg"))
        blockers.push({
          code: "interactive-section-needs-adaptation",
          message: `Section '${section.id}' preserves an interactive source composition that needs adaptation.`,
          selector: section.sourceSelector,
        });
    }

    for (const svg of [...element.querySelectorAll("svg")]) svg.remove();
  }

  const hasHero = sections.some((section) => section.role === "hero");
  const hasServices = sections.some((section) =>
    ["services", "portfolio"].includes(section.role),
  );
  if (!hasHero)
    blockers.push({
      code: "missing-hero",
      message: "No hero section with an h1 was detected.",
    });
  if (!hasServices)
    blockers.push({
      code: "missing-services",
      message: "No services or portfolio section was detected.",
    });

  addAnchor(document, "services", document.getElementById("work"));
  addAnchor(document, "faqs", document.getElementById("faq"));
  if (!sections.some((section) => section.role === "contact"))
    createContactSection(document, sections, slots, usedSectionIds);
  wrapMain(document);
  injectConversionRibbon(document, sections, slots, usedSectionIds);

  const ordered = [...document.querySelectorAll("[data-foundation-section]")]
    .map((element) =>
      sections.find(
        (section) =>
          section.id === element.getAttribute("data-foundation-section"),
      ),
    )
    .filter(Boolean);
  ordered.forEach((section, index) => {
    section.order = index + 1;
  });
  for (const blocker of blockers) {
    if (!blocker.selector) continue;
    const element = document.querySelector(blocker.selector);
    if (element)
      element.setAttribute("data-foundation-needs-adaptation", "true");
  }

  return {
    html: document.toString(),
    sections: ordered,
    slots,
    interactions,
    blockers,
    compatibility: blockers.length ? "needs-adaptation" : "renderable",
    dossierId,
  };
}
