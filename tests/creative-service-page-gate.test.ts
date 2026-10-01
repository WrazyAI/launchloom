import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import {
  authoredPageFailures,
  authoredPageIdentityFindings,
  inspectAuthoredPage,
} from "../scripts/run-creative-bakeoff.mjs";

const baseEvidence = {
  hasHost: true,
  creativeRenderer: "creative-candidate",
  hasAuthoredMarker: true,
  markers: [
    "data-service-page",
    "data-service-hero",
    "data-service-support",
    "data-service-related",
  ],
  h1Count: 1,
  hasVisibleHeader: true,
  hasVisibleNavigation: true,
  hasVisibleFooter: true,
  hasVisibleContactSection: true,
  hasVisibleLeadForm: true,
  hasVisiblePrimaryAction: true,
  hasContactSection: true,
  hasLeadForm: true,
  missingAlt: 0,
  unnamedControls: 0,
  brokenNavigation: [],
  contrastFailures: [],
  clippedText: [],
  overflow: false,
  brokenImages: 0,
  imageCount: 0,
  emDashes: 0,
};

const locationEvidence = {
  ...baseEvidence,
  markers: [
    "data-location-page",
    "data-location-hero",
    "data-location-coverage",
    "data-location-related",
  ],
};

const servicesIndexEvidence = {
  ...baseEvidence,
  markers: [
    "data-services-index",
    "data-services-index-hero",
    "data-services-index-list",
  ],
};

describe("creative authored page gate", () => {
  it("accepts decorative empty alt attributes and flags missing attributes in the real DOM", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent('<main data-service-page><img alt=""><img alt="A detail"><img id="missing-alt"></main>');
      expect((await inspectAuthoredPage(page)).missingAlt).toBe(1);
      await page.locator("#missing-alt").evaluate((element) => element.remove());
      expect((await inspectAuthoredPage(page)).missingAlt).toBe(0);
    } finally {
      await browser.close();
    }
  });

  it("accepts complete service, location, and services-index renders", () => {
    expect(authoredPageFailures(baseEvidence, "service")).toEqual([]);
    expect(authoredPageFailures(locationEvidence, "location")).toEqual([]);
    expect(
      authoredPageFailures(servicesIndexEvidence, "services-index"),
    ).toEqual([]);
  });

  it("requires visible, usable authored page chrome and accepts deliberate image-free layouts", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.setContent(`
        <div data-authored-page-host="true" data-authored-page-kind="service" data-creative-renderer="creative-candidate">
          <main data-service-page>
            <header><nav aria-label="Service navigation"><a href="/">Willowbridge</a><a href="#contact">Contact</a></nav></header>
            <section data-service-hero><h1>Community-focused preventive and restorative dental care for every stage of life</h1><a href="#contact">Book a visit</a></section>
            <section data-service-support>Support</section>
            <section data-service-related><a href="/services/another-service/">Another service</a></section>
            <section id="contact"><form data-runtime="lead-form"><button type="submit">Send request</button></form></section>
            <footer><nav aria-label="Footer navigation"><a href="/services/">All services</a></nav><a href="#contact">Contact</a></footer>
          </main>
        </div>
      `);
      const complete = await inspectAuthoredPage(page);
      expect(complete.hasVisibleHeader).toBe(true);
      expect(complete.hasVisibleNavigation).toBe(true);
      expect(complete.hasVisibleFooter).toBe(true);
      expect(complete.hasVisiblePrimaryAction).toBe(true);
      expect(complete.hasVisibleContactSection).toBe(true);
      expect(complete.hasVisibleLeadForm).toBe(true);
      expect(complete.imageCount).toBe(0);
      expect(complete.clippedText).toEqual([]);
      expect(authoredPageFailures(complete, "service")).toEqual([]);

      await page.locator("footer").evaluate((element) => {
        element.style.display = "none";
      });
      const hiddenFooter = await inspectAuthoredPage(page);
      expect(authoredPageFailures(hiddenFooter, "service")).toContain(
        "missing visible footer",
      );
    } finally {
      await browser.close();
    }
  });

  it("fails broken navigation, missing primary actions, contrast regressions, and clipped long headings", () => {
    const failures = authoredPageFailures(
      {
        ...baseEvidence,
        hasVisibleNavigation: false,
        hasVisiblePrimaryAction: false,
        brokenNavigation: ["#missing"],
        contrastFailures: ["Book a visit"],
        clippedText: ["h1"],
      },
      "service",
    );
    expect(failures).toEqual(
      expect.arrayContaining([
        "missing visible navigation",
        "missing visible primary action",
        "broken navigation target #missing",
        "text or action contrast is unreadable: Book a visit",
        "visible text is clipped: h1",
      ]),
    );
  });

  it("reports missing page regions and unsafe render states", () => {
    expect(
      authoredPageFailures(
        {
          ...baseEvidence,
          hasAuthoredMarker: false,
          markers: ["data-service-page", "data-service-hero"],
          overflow: true,
          emDashes: 1,
        },
        "service",
      ),
    ).toEqual([
      "missing authored service page marker",
      "missing data-service-support region",
      "missing data-service-related region",
      "horizontal overflow",
      "em dash found",
    ]);
    expect(
      authoredPageFailures({ ...locationEvidence, markers: ["data-location-page"] }, "location"),
    ).toEqual([
      "missing data-location-hero region",
      "missing data-location-coverage region",
      "missing data-location-related region",
    ]);
  });

  it("flags canvas and heading drift from the authored homepage", () => {
    const home = {
      bodyBackground: "rgb(16, 18, 20)",
      htmlBackground: "rgb(16, 18, 20)",
      headingFontFamily: "Georgia, serif",
      headingFontWeight: "700",
    };
    expect(
      authoredPageIdentityFindings(
        home,
        {
          ...home,
          bodyBackground: "rgb(248, 246, 240)",
        },
        "location page",
      ),
    ).toEqual([
      "location page canvas background drifts from the homepage (rgb(16,18,20) to rgb(248,246,240))",
    ]);
    expect(
      authoredPageIdentityFindings(
        home,
        {
          ...home,
          headingFontFamily: "Arial, sans-serif",
          headingFontWeight: "400",
        },
        "services index",
      ),
    ).toEqual([
      "services index heading typeface drifts from the homepage typeface",
      "services index heading weight drifts from the homepage weight",
    ]);
    expect(
      authoredPageIdentityFindings(
        {
          ...home,
          creativeColors: {
            "--ll-creative-page": "#101214",
            "--ll-creative-primary": "#467a61",
          },
        },
        {
          ...home,
          creativeColors: {
            "--ll-creative-page": "#f8f6f0",
            "--ll-creative-primary": "#467a61",
          },
        },
        "service page",
      ),
    ).toEqual([
      "service page creative palette drifts from the homepage at --ll-creative-page",
    ]);
    expect(authoredPageIdentityFindings(home, home, "service page")).toEqual(
      [],
    );
  });
});
