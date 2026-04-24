import { describe, expect, test } from "vitest";
import { escapeRegExp, normalizeSearchQuery } from "../utils/html.js";
import {
  categoryHasPoints,
  categoryHasVectors,
  featureMatchesSearch,
  featureSearchText,
  hashColor,
  provinceCenter,
} from "../utils/geo.js";

// ---------------------------------------------------------------------------
// html utils
// ---------------------------------------------------------------------------

describe("escapeRegExp", () => {
  test("escapes regex special characters", () => {
    expect(escapeRegExp("a.b*c+d?")).toBe("a\\.b\\*c\\+d\\?");
  });

  test("leaves plain strings unchanged", () => {
    expect(escapeRegExp("Constantinople")).toBe("Constantinople");
  });
});

describe("normalizeSearchQuery", () => {
  test("trims whitespace and lowercases", () => {
    expect(normalizeSearchQuery("  HELLO  ")).toBe("hello");
  });

  test("returns empty string for blank input", () => {
    expect(normalizeSearchQuery("   ")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// geo utils
// ---------------------------------------------------------------------------

describe("hashColor", () => {
  test("returns a colour from the palette for any string", () => {
    const colour = hashColor("cities", 0);
    expect(colour).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test("returns the same colour for the same input", () => {
    expect(hashColor("towns", 2)).toBe(hashColor("towns", 2));
  });

  test("falls back to index-based colour when input is empty", () => {
    const colour = hashColor("", 0);
    expect(colour).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("provinceCenter", () => {
  test("returns centroid of a triangle", () => {
    const coords = [
      [0, 0],
      [0, 3],
      [3, 0],
    ];
    const [lat, lng] = provinceCenter(coords);
    expect(lat).toBeCloseTo(1);
    expect(lng).toBeCloseTo(1);
  });

  test("returns a default point for empty coordinates", () => {
    const [lat, lng] = provinceCenter([]);
    expect(typeof lat).toBe("number");
    expect(typeof lng).toBe("number");
  });
});

describe("categoryHasPoints / categoryHasVectors", () => {
  const mixedCollection = {
    features: [
      { geometry: { type: "Point" } },
      { geometry: { type: "LineString" } },
    ],
  };

  const pointsOnly = {
    features: [{ geometry: { type: "Point" } }],
  };

  test("categoryHasPoints detects points", () => {
    expect(categoryHasPoints(mixedCollection)).toBe(true);
    expect(categoryHasPoints({ features: [{ geometry: { type: "Polygon" } }] })).toBe(false);
  });

  test("categoryHasVectors detects non-points", () => {
    expect(categoryHasVectors(mixedCollection)).toBe(true);
    expect(categoryHasVectors(pointsOnly)).toBe(false);
  });
});

describe("featureSearchText", () => {
  test("concatenates name, category, description, and metadata", () => {
    const feature = {
      properties: {
        name: "Constantinople",
        category: "metropoleis",
        descriptionHtml: "<p>Capital city</p>",
        metadata: { Summary: "Great city" },
      },
    };

    const text = featureSearchText(feature);
    expect(text).toContain("constantinople");
    expect(text).toContain("metropoleis");
    expect(text).toContain("capital city");
    expect(text).toContain("great city");
  });
});

describe("featureMatchesSearch", () => {
  const feature = {
    properties: {
      name: "Thessaloniki",
      category: "cities",
      descriptionHtml: "",
      metadata: {},
    },
  };

  test("matches on name (case-insensitive)", () => {
    expect(featureMatchesSearch(feature, "THESSALONIKI")).toBe(true);
  });

  test("returns false for empty query", () => {
    expect(featureMatchesSearch(feature, "")).toBe(false);
  });

  test("returns false for whitespace-only query", () => {
    expect(featureMatchesSearch(feature, "   ")).toBe(false);
  });

  test("returns false for non-matching query", () => {
    expect(featureMatchesSearch(feature, "Rome")).toBe(false);
  });
});
