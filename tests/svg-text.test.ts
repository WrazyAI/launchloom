import { describe, expect, it } from "vitest";
import { escapeXmlText } from "../scripts/svg-text.mjs";

describe("SVG text escaping", () => {
  it("escapes XML-sensitive characters in reference labels", () => {
    expect(escapeXmlText(`A&B <Studio> "quoted" 'text'`)).toBe(
      "A&amp;B &lt;Studio&gt; &quot;quoted&quot; &apos;text&apos;",
    );
  });
});
