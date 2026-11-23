import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocationMap, type CreativeContent } from "../templates/client-site/src/lib/creative-runtime";
import { resolveLocationMap } from "../templates/client-site/src/lib/location-map.mjs";

describe("creative location map", () => {
  it("maps a named public area without implying a verified business address", () => {
    const location = resolveLocationMap({
      businessName: "Mobile Care",
      primaryCity: "Asheville, NC",
    });
    expect(location).toMatchObject({
      available: true,
      kind: "approximate",
      waypoint: "Asheville, NC",
      address: "",
    });
    expect(new URL(location.embedHref).searchParams.get("q")).toBe("Asheville, NC");
    expect(new URL(location.directionsHref).searchParams.get("query")).toBe("Asheville, NC");
  });

  it.each([
    "https://maps.app.goo.gl/ShortDestination",
    "https://www.google.com/maps?q=Asheville+NC",
    "https://www.google.com/maps?q=Asheville",
  ])("uses an approximate embed when %s does not supply a precise map query", (googleMapsUrl) => {
    const location = resolveLocationMap({ primaryCity: "Asheville, NC", googleMapsUrl });
    expect(location.kind).toBe("approximate");
    expect(new URL(location.embedHref).searchParams.get("q")).toBe("Asheville, NC");
  });

  it("skips missing-value waypoint labels in favor of an actual public area", () => {
    expect(resolveLocationMap({
      addressVisibility: "private", primaryCity: "Not provided", serviceAreas: ["Asheville, NC"],
    }).waypoint).toBe("Asheville, NC");
    expect(resolveLocationMap({ primaryCity: "Unknown" }).available).toBe(false);
  });

  it("uses the same public Place ID for the iframe and the directions link", () => {
    const location = resolveLocationMap({
      placeId: "ApprovedPlaceId",
      googleMapsUrl: "https://maps.app.goo.gl/OldDestination",
    });
    expect(new URL(location.embedHref).searchParams.get("q")).toBe("place_id:ApprovedPlaceId");
    expect(new URL(location.directionsHref).searchParams.get("query_place_id")).toBe("ApprovedPlaceId");
  });

  it("does not use private street details, pins or coordinates for a waypoint", () => {
    const location = resolveLocationMap({
      addressVisibility: "private",
      address: "12 Hidden Road, Asheville, NC",
      placeId: "PrivatePlaceId",
      googleMapsUrl: "https://www.google.com/maps?q=35.12,-82.34",
      serviceAreas: ["12 Hidden Road", "Asheville, NC"],
    });
    expect(location).toMatchObject({ kind: "approximate", waypoint: "Asheville, NC", address: "" });
    expect(new URL(location.embedHref).searchParams.get("q")).toBe("Asheville, NC");
    expect(resolveLocationMap({
      addressVisibility: "private",
      address: "12 Hidden Road, Asheville, NC",
      placeId: "PrivatePlaceId",
    }).available).toBe(false);
  });

  it("makes a verified physical address mappable regardless of the primary CTA", () => {
    const location = resolveLocationMap({
      businessName: "Northline Garage Door Co.",
      address: "1200 South Lamar Blvd, Austin, TX 78704",
      primaryCta: "Request garage door service",
    });

    expect(location).toMatchObject({
      available: true,
      address: "1200 South Lamar Blvd, Austin, TX 78704",
    });
    expect(location.directionsHref).toContain("google.com/maps");
    expect(location.embedHref).toContain("output=embed");
  });

  it("uses a place ID or a validated Google Maps URL as location evidence", () => {
    const byPlaceId = resolveLocationMap({
      businessName: "Maison Orphee",
      address: "Upper East Side, New York, NY",
      placeId: "ChIJ1234567890",
    });
    const byUrl = resolveLocationMap({
      businessName: "Maison Orphee",
      address: "Upper East Side, New York, NY",
      googleMapsUrl:
        "https://www.google.com/maps/place/Maison+Orphee/@40.77,-73.96,17z",
    });

    expect(byPlaceId.embedHref).toContain("place_id%3AChIJ1234567890");
    expect(byUrl.available).toBe(true);
    expect(byUrl.directionsHref).toBe(
      "https://www.google.com/maps/place/Maison+Orphee/@40.77,-73.96,17z",
    );
    expect(byUrl.embedHref).toContain("output=embed");
  });

  it("does not treat fixture/example street addresses as verified map locations", () => {
    const fixtureAddress = resolveLocationMap({
      businessName: "Rainline Plumbing",
      address: "123 Example Street, Eugene, OR 97401",
    });
    const verifiedPlace = resolveLocationMap({
      businessName: "Rainline Plumbing",
      address: "123 Example Street, Eugene, OR 97401",
      placeId: "ChIJ1234567890",
    });

    expect(fixtureAddress).toMatchObject({
      available: false,
      directionsHref: "",
      embedHref: "",
    });
    expect(verifiedPlace.available).toBe(true);
  });

  it("does not turn service areas or unsafe map URLs into a physical pin", () => {
    const location = resolveLocationMap({
      businessName: "Mobile Care",
      address: "Portland, Beaverton, and Lake Oswego",
      googleMapsUrl: "javascript:alert(1)",
    });

    expect(location).toMatchObject({
      available: false,
      directionsHref: "",
      embedHref: "",
    });

    expect(
      resolveLocationMap({
        businessName: "Mobile Care",
        address: "Portland, OR",
        placeId: null as unknown as string,
        googleMapsUrl: "https://www.google.com/maps",
      }).available,
    ).toBe(false);
  });

  it("renders an embedded map and directions link from sealed location content", () => {
    const content = {
      brand: {
        name: "Northline Garage Door Co.",
        phone: "(510) 555-0186",
        email: "hello@example.com",
        address: "1200 South Lamar Blvd, Austin, TX 78704",
        serviceAreas: [],
      },
      locationMap: {
        available: true,
        address: "1200 South Lamar Blvd, Austin, TX 78704",
        directionsHref:
          "https://www.google.com/maps/search/?api=1&query=1200+South+Lamar+Blvd",
        embedHref:
          "https://www.google.com/maps?q=1200%20South%20Lamar%20Blvd&output=embed",
      },
      showLocationMap: true,
    } as unknown as CreativeContent;
    const markup = renderToStaticMarkup(
      createElement(LocationMap, { content }),
    );

    expect(markup).toContain('data-runtime="location-map"');
    expect(markup).toContain("<iframe");
    expect(markup).toContain(
      'title="Map showing Northline Garage Door Co. at 1200 South Lamar Blvd, Austin, TX 78704"',
    );
    expect(markup).toContain("Open in Google Maps");
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
  });
});
