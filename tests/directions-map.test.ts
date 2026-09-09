import { describe, expect, it } from "vitest";
import { hasExactStreetAddress } from "../templates/client-site/src/lib/site";

describe("directions map location safety", () => {
  it("accepts street-level addresses", () => {
    expect(hasExactStreetAddress("10 Harbor Road, Charleston, SC 29401")).toBe(
      true,
    );
    expect(hasExactStreetAddress("4240 Thornton Avenue")).toBe(true);
  });

  it("rejects broad service areas and city-only addresses", () => {
    expect(hasExactStreetAddress("Charleston, SC 29401")).toBe(false);
    expect(hasExactStreetAddress("Floor 4 Austin office")).toBe(false);
    expect(hasExactStreetAddress("Austin and surrounding areas")).toBe(false);
    expect(hasExactStreetAddress("Remote / nationwide")).toBe(false);
  });
});
