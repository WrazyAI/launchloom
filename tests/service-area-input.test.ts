import { describe, expect, it } from "vitest";
import {
  firstServiceArea,
  parseServiceAreas,
} from "../scripts/service-area-input.mjs";

describe("service area input parsing", () => {
  it("splits newline and semicolon lists while preserving commas in locality names", () => {
    expect(
      parseServiceAreas(
        "Portland, OR; Beaverton, OR\nLake Oswego, OR; PORTLAND, OR",
      ),
    ).toEqual(["Portland, OR", "Beaverton, OR", "Lake Oswego, OR"]);
  });

  it("accepts arrays of service-area labels without splitting city and state", () => {
    expect(parseServiceAreas(["Portland, OR", "Beaverton, OR"])).toEqual([
      "Portland, OR",
      "Beaverton, OR",
    ]);
    expect(firstServiceArea("Portland, OR; Beaverton, OR")).toBe(
      "Portland, OR",
    );
  });

  it("bounds and deduplicates normalized service-area values", () => {
    expect(
      parseServiceAreas("A; B; C; D", { limit: 2 }),
    ).toEqual(["A", "B"]);
  });
});
