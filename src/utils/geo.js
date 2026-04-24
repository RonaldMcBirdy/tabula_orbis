import { CUSTOM_PROVINCES_STORAGE_KEY, DEFAULT_VECTOR_COLORS } from "../constants.js";
import { normalizeSearchQuery } from "./html.js";

export function hashColor(input, index) {
  if (!input) {
    return DEFAULT_VECTOR_COLORS[index % DEFAULT_VECTOR_COLORS.length];
  }

  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }

  return DEFAULT_VECTOR_COLORS[Math.abs(hash) % DEFAULT_VECTOR_COLORS.length];
}

export function categoryHasPoints(featureCollection) {
  return featureCollection.features.some((feature) => feature.geometry?.type === "Point");
}

export function categoryHasVectors(featureCollection) {
  return featureCollection.features.some((feature) => feature.geometry?.type !== "Point");
}

export function provinceCenter(coordinates) {
  if (!coordinates.length) {
    return [41.01, 28.97];
  }

  const totals = coordinates.reduce(
    (accumulator, [latitude, longitude]) => [
      accumulator[0] + latitude,
      accumulator[1] + longitude,
    ],
    [0, 0],
  );

  return [totals[0] / coordinates.length, totals[1] / coordinates.length];
}

export function featureSearchText(feature) {
  const properties = feature.properties ?? {};
  return [
    properties.name,
    properties.category,
    properties.descriptionHtml,
    ...Object.values(properties.metadata ?? {}),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/<[^>]*>/g, " ")
    .toLowerCase();
}

export function featureMatchesSearch(feature, searchQuery) {
  const normalized = normalizeSearchQuery(searchQuery);
  return Boolean(normalized) && featureSearchText(feature).includes(normalized);
}

export function loadCustomProvinces() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(CUSTOM_PROVINCES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (province) =>
        province &&
        typeof province.id === "string" &&
        typeof province.name === "string" &&
        Array.isArray(province.coordinates) &&
        province.coordinates.length >= 3,
    );
  } catch {
    return [];
  }
}

export function saveCustomProvinces(provinces) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CUSTOM_PROVINCES_STORAGE_KEY, JSON.stringify(provinces));
}
