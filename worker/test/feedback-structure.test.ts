import { describe, expect, it } from "vitest";
import {
  buildFeedbackImagePrompt,
  feedbackImageRequestIsSafe,
} from "../src/feedback-image";
import {
  feedbackStructureSummary,
  parseFeedbackStructure,
  sanitizeFeedbackStructure,
} from "../src/feedback-structure";

const ASSET_BASE = "https://assets.launchloom.wrazyos.com";

describe("feedback structure sanitization", () => {
  it("accepts uploads, generated drafts, and palette choices", () => {
    const result = sanitizeFeedbackStructure(
      {
        attachments: [
          {
            target: "hero",
            kind: "upload",
            url: `${ASSET_BASE}/feedback/acme/hero-a.webp`,
          },
          {
            target: "logo",
            kind: "generated",
            url: `${ASSET_BASE}/feedback-drafts/acme/logo-b.webp`,
            prompt: " A minimal lighthouse mark ",
            model: "fal-ai/minimax/image-01",
          },
        ],
        colors: [{ role: "primary", hex: "#1F3A5F" }],
      },
      ASSET_BASE,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.structure.attachments[1]).toMatchObject({
      target: "logo",
      kind: "generated",
      prompt: "A minimal lighthouse mark",
    });
    expect(result.structure.colors).toEqual([
      { role: "primary", hex: "#1f3a5f" },
    ]);
  });

  it("rejects foreign hosts, duplicate targets, and unknown placements", () => {
    const foreign = sanitizeFeedbackStructure(
      {
        attachments: [
          { target: "hero", kind: "upload", url: "https://evil.test/x.png" },
        ],
      },
      ASSET_BASE,
    );
    expect(foreign.ok).toBe(false);
    const duplicate = sanitizeFeedbackStructure(
      {
        attachments: [
          {
            target: "hero",
            kind: "upload",
            url: `${ASSET_BASE}/feedback/x/a.png`,
          },
          {
            target: "hero",
            kind: "upload",
            url: `${ASSET_BASE}/feedback/x/b.png`,
          },
        ],
      },
      ASSET_BASE,
    );
    expect(duplicate.ok).toBe(false);
    const unknown = sanitizeFeedbackStructure(
      {
        attachments: [
          {
            target: "banner",
            kind: "upload",
            url: `${ASSET_BASE}/feedback/x/a.png`,
          },
        ],
      },
      ASSET_BASE,
    );
    expect(unknown.ok).toBe(false);
  });

  it("requires a prompt for generated drafts and rejects bad colors", () => {
    const missingPrompt = sanitizeFeedbackStructure(
      {
        attachments: [
          {
            target: "hero",
            kind: "generated",
            url: `${ASSET_BASE}/feedback-drafts/x/a.webp`,
          },
        ],
      },
      ASSET_BASE,
    );
    expect(missingPrompt.ok).toBe(false);
    const badColor = sanitizeFeedbackStructure(
      { colors: [{ role: "primary", hex: "navy" }] },
      ASSET_BASE,
    );
    expect(badColor.ok).toBe(false);
  });

  it("treats a missing details payload as no structured feedback", () => {
    const result = sanitizeFeedbackStructure(undefined, ASSET_BASE);
    expect(result).toEqual({
      ok: true,
      structure: { attachments: [], colors: [] },
    });
  });

  it("parses and summarizes a stored structure", () => {
    const structure = parseFeedbackStructure(
      JSON.stringify({
        attachments: [
          {
            target: "team",
            kind: "generated",
            url: `${ASSET_BASE}/feedback-drafts/x/team.webp`,
            prompt: "A friendly workshop team",
          },
        ],
        colors: [{ role: "surface", hex: "#faf7f2" }],
      }),
    );
    expect(feedbackStructureSummary(structure)).toEqual([
      '- Replace the team photo with a generated image: "A friendly workshop team".',
      "- Set page background #faf7f2.",
    ]);
  });
});

describe("feedback image prompts", () => {
  const site = {
    business: { name: "Daley Hope", serviceAreas: ["Bala Cynwyd"] },
    businessKind: "home-care",
    services: [{ name: "Home care" }],
    style: { tone: "calm", visualDirection: "natural light" },
  };

  it("builds a constrained prompt from verified context", () => {
    const prompt = buildFeedbackImagePrompt({
      site,
      target: "hero",
      request: "a warm living room with morning light",
    });
    expect(prompt).toContain("Daley Hope");
    expect(prompt).toContain("Bala Cynwyd");
    expect(prompt).toContain("a warm living room with morning light");
    expect(prompt).toContain("No readable text");
    expect(prompt.length).toBeLessThanOrEqual(1_500);
  });

  it("blocks private contact details in generation requests", () => {
    expect(feedbackImageRequestIsSafe("a calm studio photo")).toBe(true);
    expect(feedbackImageRequestIsSafe("call us on 555-0100")).toBe(false);
    expect(feedbackImageRequestIsSafe("email hello@example.com")).toBe(false);
    expect(feedbackImageRequestIsSafe("visit https://example.com")).toBe(
      false,
    );
  });
});
