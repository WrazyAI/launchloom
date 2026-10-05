import { describe, expect, it } from "vitest";
import {
  buildHoursValue,
  formatTime,
  isValidTimeZone,
  stateCode,
  stateName,
  timeZoneForState,
  TIME_OPTIONS,
  US_STATES,
  US_TIME_ZONES,
} from "../src/lib/us-locations.mjs";

describe("US state and time-zone helpers", () => {
  it("lists every state plus DC with unique codes", () => {
    expect(US_STATES).toHaveLength(51);
    expect(new Set(US_STATES.map((state) => state.code)).size).toBe(51);
    expect(US_STATES.map((state) => state.code)).toContain("DC");
    expect(US_STATES.map((state) => state.code)).toContain("SC");
    expect(US_STATES.map((state) => state.name)).toContain("Hawaii");
    expect(US_TIME_ZONES.map((zone) => zone.id)).toEqual([
      "ET",
      "CT",
      "MT",
      "PT",
      "AKT",
      "HT",
    ]);
  });

  it("resolves names, codes, and default time zones", () => {
    expect(stateName("sc")).toBe("South Carolina");
    expect(stateCode("South Carolina")).toBe("SC");
    expect(stateCode("sc")).toBe("SC");
    expect(stateCode("not a state")).toBe("");
    expect(timeZoneForState("SC")).toBe("ET");
    expect(timeZoneForState("California")).toBe("PT");
    expect(timeZoneForState("TX")).toBe("CT");
    expect(timeZoneForState("AK")).toBe("AKT");
    expect(timeZoneForState("HI")).toBe("HT");
    expect(isValidTimeZone("ET")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(false);
  });

  it("formats times for display", () => {
    expect(formatTime("00:00")).toBe("12:00 AM");
    expect(formatTime("09:00")).toBe("9:00 AM");
    expect(formatTime("12:00")).toBe("12:00 PM");
    expect(formatTime("12:30")).toBe("12:30 PM");
    expect(formatTime("17:30")).toBe("5:30 PM");
    expect(formatTime("nope")).toBe("");
    expect(TIME_OPTIONS).toHaveLength(48);
    expect(TIME_OPTIONS[0]).toEqual({ value: "00:00", label: "12:00 AM" });
    expect(TIME_OPTIONS[18]).toEqual({ value: "09:00", label: "9:00 AM" });
  });

  function days(openDays: string[], open = "09:00", close = "17:00") {
    return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((key) => ({
      key,
      closed: !openDays.includes(key),
      open,
      close,
    }));
  }

  it("builds a grouped hours string with the time zone", () => {
    expect(
      buildHoursValue(days(["mon", "tue", "wed", "thu", "fri"]), "ET"),
    ).toBe("Mon-Fri: 9:00 AM - 5:00 PM ET");
  });

  it("groups consecutive days and separates different schedules", () => {
    expect(
      buildHoursValue(
        [
          { key: "mon", closed: false, open: "09:00", close: "17:00" },
          { key: "tue", closed: false, open: "09:00", close: "17:00" },
          { key: "wed", closed: false, open: "09:00", close: "17:00" },
          { key: "thu", closed: false, open: "09:00", close: "17:00" },
          { key: "fri", closed: false, open: "09:00", close: "17:00" },
          { key: "sat", closed: false, open: "10:00", close: "14:00" },
          { key: "sun", closed: true },
        ],
        "CT",
      ),
    ).toBe(
      "Mon-Fri: 9:00 AM - 5:00 PM CT; Sat: 10:00 AM - 2:00 PM CT",
    );
  });

  it("never invents hours when every day is closed", () => {
    expect(buildHoursValue(days([]), "ET")).toBe("");
    expect(buildHoursValue([], "")).toBe("");
  });

  it("ignores a day with an invalid or reversed time range", () => {
    expect(
      buildHoursValue(
        [{ key: "mon", closed: false, open: "17:00", close: "09:00" }],
        "ET",
      ),
    ).toBe("");
    expect(
      buildHoursValue(
        [{ key: "mon", closed: false, open: "09:00", close: "17:00" }],
        "",
      ),
    ).toBe("Mon: 9:00 AM - 5:00 PM");
  });
});
