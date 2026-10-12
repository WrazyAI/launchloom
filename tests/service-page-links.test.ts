import { describe, expect, it } from "vitest";
import { selectServicePageLinks } from "../templates/client-site/src/lib/service-page-links.mjs";

const services = [
  {
    name: "Drain cleaning",
    slug: "drain-cleaning",
    description: "Discuss drainage concerns.",
  },
  {
    name: "Leak repair",
    slug: "leak-repair",
    description: "Discuss visible leaks.",
  },
  {
    name: "Water heater service",
    slug: "water-heater-service",
    description: "Discuss water heater needs.",
  },
];

describe("service page navigation links", () => {
  it("keeps explicitly evidenced related service links when present", () => {
    expect(
      selectServicePageLinks(services, "drain-cleaning", [
        {
          path: "/services/leak-repair/",
          reason: "Evidence-backed connection.",
        },
      ]),
    ).toEqual([services[1]]);
  });

  it("provides a bounded set of other confirmed services when no relation evidence exists", () => {
    expect(selectServicePageLinks(services, "drain-cleaning", [])).toEqual([
      services[1],
      services[2],
    ]);
  });

  it("does not fabricate targets or include the current service", () => {
    expect(
      selectServicePageLinks(services, "drain-cleaning", [
        { path: "/services/not-approved/", reason: "Unapproved." },
        { path: "/services/drain-cleaning/", reason: "Self reference." },
      ]),
    ).toEqual([services[1], services[2]]);
  });
});
