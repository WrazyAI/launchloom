import { describe, expect, it } from "vitest";
import {
  addIntakeService,
  normalizeIntakeServices,
  removeIntakeService,
} from "../src/lib/intake-service-list";

describe("client confirmed service list", () => {
  it("normalizes newline separated services without splitting commas", () => {
    expect(
      normalizeIntakeServices(
        " Heating, ventilation and AC \nDrain cleaning\nheating, ventilation and AC\n",
      ),
    ).toEqual(["Heating, ventilation and AC", "Drain cleaning"]);
  });

  it("adds a trimmed service and reports empty or duplicate entries", () => {
    expect(
      addIntakeService("Drain cleaning", "  Water heater repair  "),
    ).toEqual({
      services: ["Drain cleaning", "Water heater repair"],
      status: "added",
    });
    expect(addIntakeService("Drain cleaning", "   ")).toEqual({
      services: ["Drain cleaning"],
      status: "empty",
    });
    expect(addIntakeService("Drain cleaning", "drain CLEANING")).toEqual({
      services: ["Drain cleaning"],
      status: "duplicate",
    });
  });

  it("caps client selected services at five and removes only the chosen service", () => {
    const five = "A\nB\nC\nD\nE";
    expect(addIntakeService(five, "F")).toEqual({
      services: ["A", "B", "C", "D", "E"],
      status: "limit",
    });
    expect(removeIntakeService(five, "c")).toEqual(["A", "B", "D", "E"]);
  });
});
