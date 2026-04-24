import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import sanitizeHtml from "sanitize-html";

const projectRoot = process.cwd();
const dataDir = path.join(projectRoot, "data");
const publicAtlasDir = path.join(projectRoot, "public", "atlas");
const publicIconsDir = path.join(publicAtlasDir, "icons");
const preferredSourceName = "byzantine-atlas.kmz";
const fallbackSourceName = "Digital Atlas of the Byzantine Empire.kmz";
const sourceCandidates = [
  path.join(dataDir, preferredSourceName),
  path.join(projectRoot, fallbackSourceName),
];

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: false,
});

const sanitizePolicy = {
  allowedTags: [
    "a",
    "abbr",
    "b",
    "blockquote",
    "br",
    "code",
    "dd",
    "div",
    "dl",
    "dt",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "hr",
    "i",
    "li",
    "ol",
    "p",
    "small",
    "span",
    "strong",
    "sub",
    "sup",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "u",
    "ul",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    "*": ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
};

const imageDimensions = {
  "images/icon-1.png": { width: 42, height: 42 },
  "images/icon-2.png": { width: 34, height: 34 },
  "images/icon-3.png": { width: 42, height: 42 },
  "images/icon-4.png": { width: 28, height: 28 },
  "images/icon-5.png": { width: 26, height: 26 },
  "images/icon-6.png": { width: 30, height: 30 },
  "images/icon-7.png": { width: 40, height: 40 },
  "images/icon-8.png": { width: 32, height: 32 },
  "images/icon-9.png": { width: 30, height: 30 },
  "images/icon-10.png": { width: 24, height: 24 },
  "images/icon-11.png": { width: 24, height: 24 },
  "images/icon-12.png": { width: 24, height: 24 },
  "images/icon-13.png": { width: 36, height: 36 },
  "images/icon-14.png": { width: 36, height: 36 },
  "images/icon-15.png": { width: 24, height: 24 },
};

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

async function resolveSourcePath() {
  for (const candidate of sourceCandidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Continue.
    }
  }

  throw new Error(
    `KMZ source not found. Expected ${preferredSourceName} in /data or the original KMZ in the project root.`,
  );
}

function stripCoordinates(input) {
  return input
    .trim()
    .split(/\s+/)
    .map((coordinateSet) => coordinateSet.split(",").slice(0, 2).map(Number))
    .filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude));
}

function parseLinearRing(value) {
  const coordinatesText = value?.coordinates ?? "";
  return stripCoordinates(coordinatesText);
}

function parseGeometry(placemark) {
  if (placemark.Point?.coordinates) {
    const [longitude, latitude] = stripCoordinates(placemark.Point.coordinates)[0] ?? [];
    return Number.isFinite(longitude) && Number.isFinite(latitude)
      ? { type: "Point", coordinates: [longitude, latitude] }
      : null;
  }

  if (placemark.LineString?.coordinates) {
    return {
      type: "LineString",
      coordinates: stripCoordinates(placemark.LineString.coordinates),
    };
  }

  if (placemark.Polygon?.outerBoundaryIs?.LinearRing?.coordinates) {
    const outerRing = parseLinearRing(placemark.Polygon.outerBoundaryIs.LinearRing);
    const innerRings = asArray(placemark.Polygon.innerBoundaryIs).map((ring) =>
      parseLinearRing(ring.LinearRing),
    );
    return {
      type: "Polygon",
      coordinates: [outerRing, ...innerRings],
    };
  }

  return null;
}

function parseColor(value) {
  if (!value || value.length !== 8) {
    return null;
  }

  const a = value.slice(0, 2);
  const b = value.slice(2, 4);
  const g = value.slice(4, 6);
  const r = value.slice(6, 8);
  return `#${r}${g}${b}`.toLowerCase();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function collectStyles(documentNode) {
  const styles = {};

  for (const style of asArray(documentNode.Style)) {
    const id = style?.["@_id"];
    if (!id) {
      continue;
    }

    styles[id] = {
      id,
      iconHref: style.IconStyle?.Icon?.href || null,
      scale: Number(style.IconStyle?.scale ?? 1),
      lineColor: parseColor(style.LineStyle?.color),
      polyColor: parseColor(style.PolyStyle?.color),
    };
  }

  for (const map of asArray(documentNode.StyleMap)) {
    const id = map?.["@_id"];
    if (!id) {
      continue;
    }

    const normalPair = asArray(map.Pair).find((pair) => pair.key === "normal") ?? asArray(map.Pair)[0];
    if (normalPair?.styleUrl) {
      styles[id] = {
        ...(styles[normalPair.styleUrl.replace(/^#/, "")] ?? {}),
        id,
      };
    }
  }

  return styles;
}

function collectDescriptionMetadata(descriptionHtml) {
  const stripped = sanitizeHtml(descriptionHtml ?? "", {
    allowedTags: [],
    allowedAttributes: {},
  })
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  const metadata = {};
  if (stripped.length > 0) {
    metadata.Summary = stripped.slice(0, 3).join(" | ");
  }
  return metadata;
}

function walkFolder(folderNode, topLevelName, output, styles) {
  const categoryName = topLevelName ?? folderNode.name ?? "Uncategorized";

  for (const placemark of asArray(folderNode.Placemark)) {
    const geometry = parseGeometry(placemark);
    if (!geometry) {
      continue;
    }

    const styleId = (placemark.styleUrl || "").replace(/^#/, "");
    const style = styles[styleId] ?? {};
    const descriptionHtml = sanitizeHtml(placemark.description ?? "", sanitizePolicy);

    output[categoryName] ??= [];
    output[categoryName].push({
      type: "Feature",
      id: placemark["@_id"] || `${slugify(categoryName)}-${output[categoryName].length + 1}`,
      geometry,
      properties: {
        name: placemark.name || "Untitled feature",
        category: categoryName,
        styleId,
        descriptionHtml,
        metadata: collectDescriptionMetadata(descriptionHtml),
        strokeColor: style.lineColor,
        fillColor: style.polyColor,
      },
    });
  }

  for (const childFolder of asArray(folderNode.Folder)) {
    walkFolder(childFolder, categoryName, output, styles);
  }
}

async function writeGeoJson(categoryName, features) {
  const slug = slugify(categoryName);
  const filename = `${slug}.geojson`;
  const targetPath = path.join(publicAtlasDir, filename);
  const payload = {
    type: "FeatureCollection",
    features,
  };
  await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return filename;
}

function computeBounds(featuresByCategory) {
  let minLongitude = Infinity;
  let minLatitude = Infinity;
  let maxLongitude = -Infinity;
  let maxLatitude = -Infinity;

  function absorbCoordinateSet(coordinates) {
    if (!Array.isArray(coordinates)) {
      return;
    }

    if (typeof coordinates[0] === "number") {
      const [longitude, latitude] = coordinates;
      minLongitude = Math.min(minLongitude, longitude);
      minLatitude = Math.min(minLatitude, latitude);
      maxLongitude = Math.max(maxLongitude, longitude);
      maxLatitude = Math.max(maxLatitude, latitude);
      return;
    }

    for (const nested of coordinates) {
      absorbCoordinateSet(nested);
    }
  }

  Object.values(featuresByCategory).flat().forEach((feature) => absorbCoordinateSet(feature.geometry.coordinates));

  return {
    minLongitude,
    minLatitude,
    maxLongitude,
    maxLatitude,
  };
}

async function ensureDirectories() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(publicIconsDir, { recursive: true });
}

async function clearGeneratedOutput() {
  await fs.rm(publicAtlasDir, { recursive: true, force: true });
  await fs.mkdir(publicIconsDir, { recursive: true });
}

async function main() {
  await ensureDirectories();
  const sourcePath = await resolveSourcePath();
  const sourceBuffer = await fs.readFile(sourcePath);
  const zip = await JSZip.loadAsync(sourceBuffer);
  const docFile = zip.file("doc.kml");

  if (!docFile) {
    throw new Error("doc.kml was not found inside the KMZ archive.");
  }

  await clearGeneratedOutput();

  for (const [entryName, entry] of Object.entries(zip.files)) {
    if (!entryName.startsWith("images/") || entry.dir) {
      continue;
    }

    const outputPath = path.join(publicIconsDir, path.basename(entryName));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, await entry.async("nodebuffer"));
  }

  const xml = await docFile.async("string");
  const parsed = xmlParser.parse(xml);
  const documentNode = parsed?.kml?.Document;

  if (!documentNode) {
    throw new Error("Could not locate the KML Document node.");
  }

  const styles = collectStyles(documentNode);
  const featuresByCategory = {};

  for (const folderNode of asArray(documentNode.Folder)) {
    walkFolder(folderNode, folderNode.name ?? "Uncategorized", featuresByCategory, styles);
  }

  const bounds = computeBounds(featuresByCategory);
  const categories = [];
  const iconUsage = {};

  for (const [categoryName, features] of Object.entries(featuresByCategory)) {
    const dataFile = await writeGeoJson(categoryName, features);
    for (const feature of features) {
      if (feature.properties.styleId) {
        iconUsage[categoryName] ??= {};
        iconUsage[categoryName][feature.properties.styleId] =
          (iconUsage[categoryName][feature.properties.styleId] ?? 0) + 1;
      }
    }

    const legendIcon =
      Object.entries(iconUsage[categoryName] ?? {}).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;

    categories.push({
      id: slugify(categoryName),
      label: categoryName,
      dataFile: `/atlas/${dataFile}`,
      featureCount: features.length,
      defaultVisible: true,
      legendIcon,
    });
  }

  const iconMap = {};
  for (const [styleId, style] of Object.entries(styles)) {
    if (!style.iconHref) {
      continue;
    }

    iconMap[styleId] = {
      href: `/atlas/icons/${path.basename(style.iconHref.replace(/\\/g, "/"))}`,
      scale: style.scale || 1,
      ...(imageDimensions[style.iconHref] ?? { width: 32, height: 32 }),
    };
  }

  const manifest = {
    title: documentNode.name || "KMZ Atlas",
    description: sanitizeHtml(documentNode.description ?? "", sanitizePolicy),
    sourceFile: path.relative(projectRoot, sourcePath).replace(/\\/g, "/"),
    generatedAt: new Date().toISOString(),
    bounds,
    categories,
    icons: iconMap,
  };

  await fs.writeFile(
    path.join(publicAtlasDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  if (sourcePath.endsWith(fallbackSourceName)) {
    const targetPath = path.join(dataDir, preferredSourceName);
    await fs.copyFile(sourcePath, targetPath);
  }

  console.log(
    `Processed ${categories.length} categories and ${Object.values(featuresByCategory).flat().length} features from ${path.basename(sourcePath)}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
