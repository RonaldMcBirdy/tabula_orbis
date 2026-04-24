export const EMPTY_BOUNDS = [
  [35, 20],
  [47, 42],
];

export const DEFAULT_VECTOR_COLORS = [
  "#b85c38",
  "#cf9a42",
  "#4f6d4a",
  "#41658a",
  "#6b4f7b",
  "#ad5d68",
  "#5d747d",
  "#7d6b57",
];

export const BASE_LAYERS = {
  map: {
    label: "Map",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  },
  satellite: {
    label: "Satellite",
    attribution:
      "Tiles &copy; Esri - Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  },
};

export const CUSTOM_PROVINCES_STORAGE_KEY = "tabula-orbis-custom-provinces";

export const DESCRIPTION_POLICY = {
  allowedTags: [
    "a", "abbr", "b", "blockquote", "br", "code", "dd", "div", "dl", "dt",
    "em", "h1", "h2", "h3", "h4", "hr", "i", "li", "ol", "p", "small",
    "span", "strong", "sub", "sup", "table", "tbody", "td", "th", "thead",
    "tr", "u", "ul",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    "*": ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
};
