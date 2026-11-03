import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import {
  contentCompletenessEvidence,
  hardFailures,
} from "../scripts/run-creative-bakeoff.mjs";
import { classifyFailureLine } from "../scripts/creative-gate-severity.mjs";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
});

async function scan(html: string) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  try {
    await page.setContent(`<body>${html}</body>`);
    return await page.evaluate(contentCompletenessEvidence);
  } finally {
    await page.close();
  }
}

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    h1Count: 1,
    hasHero: true,
    hasEarlyConversion: true,
    hasServices: true,
    hasFaqs: true,
    hasContact: true,
    missingFragments: 0,
    missingNavTargets: 0,
    hasLeadForm: true,
    missingAlt: 0,
    unnamedControls: 0,
    heroBottom: 700,
    heroActionBottom: 600,
    heroMediaVisibleHeight: 300,
    viewportHeight: 900,
    overflow: false,
    brokenImages: 0,
    emDashes: 0,
    creativeRenderer: "creative-candidate",
    hollowInteractionPanels: 0,
    emptyMediaFrames: 0,
    ...overrides,
  };
}

const viewport = { name: "desktop", width: 1440, height: 900 };

describe("creative content completeness", () => {
  it("flags a selector whose default panel only repeats the heading and intro", async () => {
    const result = await scan(`
      <div data-creative-candidate>
        <section id="services">
          <h2>What is happening, and what comes next</h2>
          <p>Each service begins with a recognizable problem and a practical next step.</p>
          <div data-purposeful-interaction>
            <fieldset>
              <legend>Services</legend>
              <label><input type="radio" name="scope" checked> Overview</label>
              <label><input type="radio" name="scope"> Drain cleaning</label>
            </fieldset>
            <div aria-live="polite">
              <h3>What is happening, and what comes next</h3>
              <p>Each service begins with a recognizable problem and a practical next step.</p>
            </div>
          </div>
        </section>
      </div>
    `);
    expect(result).toMatchObject({ hollowInteractionPanels: 1 });
    expect(
      hardFailures(evidence({ hollowInteractionPanels: 1 }), viewport),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("purposeful interaction default panel"),
      ]),
    );
  });

  it("accepts a selector whose default panel carries choice-specific detail", async () => {
    const result = await scan(`
      <div data-creative-candidate>
        <section id="services">
          <h2>What is happening, and what comes next</h2>
          <p>Each service begins with a recognizable problem and a practical next step.</p>
          <div data-purposeful-interaction>
            <fieldset>
              <legend>Services</legend>
              <label><input type="radio" name="scope" checked> Drain cleaning</label>
            </fieldset>
            <div aria-live="polite">
              <h3>Drain cleaning</h3>
              <dl>
                <dt>Scope</dt>
                <dd>Clear a slow or backed up drain and confirm the water is moving again.</dd>
                <dt>Next step</dt>
                <dd>Share where the water is backing up and whether it affects more than one fixture.</dd>
                <dt>Before the visit</dt>
                <dd>Stop running water and move stored items away from the affected drain.</dd>
              </dl>
            </div>
          </div>
        </section>
      </div>
    `);
    expect(result).toMatchObject({ hollowInteractionPanels: 0 });
  });

  it("flags an empty poster frame with no image, label, or caption", async () => {
    const result = await scan(`
      <style>.ll-poster{position:relative;width:320px;height:180px;border:1px solid #000}.ll-poster__frame{display:block;width:54px;height:54px}</style>
      <div data-creative-candidate>
        <section id="faqs">
          <div class="ll-poster" aria-hidden="true">
            <span class="ll-poster__frame"></span>
            <span class="ll-poster__line"></span>
          </div>
        </section>
      </div>
    `);
    expect(result).toMatchObject({ emptyMediaFrames: 1 });
    expect(hardFailures(evidence({ emptyMediaFrames: 1 }), viewport)).toEqual(
      expect.arrayContaining([expect.stringContaining("empty media frame")]),
    );
  });

  it("classifies both placeholder findings as hard failures", () => {
    expect(
      classifyFailureLine(
        "purposeful interaction default panel repeats the section heading and intro without choice-specific detail",
      ),
    ).toBe("hard");
    expect(
      classifyFailureLine("empty media frame has no image, label, or caption"),
    ).toBe("hard");
  });

  it("accepts a poster frame with a real image", async () => {
    const result = await scan(`
      <style>.ll-poster{position:relative;width:320px;height:180px;border:1px solid #000}.ll-poster__frame{display:block;width:54px;height:54px}</style>
      <div data-creative-candidate>
        <section id="faqs">
          <div class="ll-poster">
            <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" alt="Poster for the plumbing process video">
          </div>
        </section>
      </div>
    `);
    expect(result).toMatchObject({ emptyMediaFrames: 0 });
  });
});
