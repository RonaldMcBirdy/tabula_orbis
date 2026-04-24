import { useCallback, useEffect, useMemo, useState } from "react";
import { GeoJSON, MapContainer, Marker, Polygon, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import sanitizeHtml from "sanitize-html";
import { renderToStaticMarkup } from "react-dom/server";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { createProvince, deleteProvince, fetchFeatures, fetchManifest, fetchProvinces } from "./api.js";
import DataBrowserPage from "./DataBrowserPage.jsx";

const EMPTY_BOUNDS = [
  [35, 20],
  [47, 42],
];

const DEFAULT_VECTOR_COLORS = [
  "#b85c38",
  "#cf9a42",
  "#4f6d4a",
  "#41658a",
  "#6b4f7b",
  "#ad5d68",
  "#5d747d",
  "#7d6b57",
];

const BASE_LAYERS = {
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

const CUSTOM_PROVINCES_STORAGE_KEY = "tabula-orbis-custom-provinces";

const descriptionPolicy = {
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

function sanitizePopupHtml(value) {
  return sanitizeHtml(value ?? "", descriptionPolicy);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSearchQuery(value) {
  return value.trim().toLowerCase();
}

function loadCustomProvinces() {
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

function provinceCenter(coordinates) {
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

function leafletLabelIcon(name, isSelected = false) {
  return L.divIcon({
    className: `province-label-icon${isSelected ? " selected" : ""}`,
    html: `<span>${sanitizeHtml(name, { allowedTags: [], allowedAttributes: {} })}</span>`,
    iconSize: null,
    iconAnchor: [0, 0],
  });
}

function isFarEnough(previousLatLng, nextLatLng) {
  if (!previousLatLng) {
    return true;
  }

  return previousLatLng.distanceTo(nextLatLng) > 2500;
}

function featureSearchText(feature) {
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

function featureMatchesSearch(feature, searchQuery) {
  const normalized = normalizeSearchQuery(searchQuery);
  return Boolean(normalized) && featureSearchText(feature).includes(normalized);
}

function highlightHtml(value, searchQuery) {
  const html = sanitizePopupHtml(value);
  const term = searchQuery.trim();

  if (!html || !term || typeof document === "undefined") {
    return html;
  }

  const template = document.createElement("template");
  template.innerHTML = html;
  const pattern = new RegExp(`(${escapeRegExp(term)})`, "gi");
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  for (const node of textNodes) {
    if (!pattern.test(node.nodeValue)) {
      pattern.lastIndex = 0;
      continue;
    }

    pattern.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    for (const part of node.nodeValue.split(pattern)) {
      if (!part) {
        continue;
      }

      if (part.toLowerCase() === term.toLowerCase()) {
        const mark = document.createElement("mark");
        mark.textContent = part;
        fragment.appendChild(mark);
      } else {
        fragment.appendChild(document.createTextNode(part));
      }
    }
    node.parentNode.replaceChild(fragment, node);
  }

  return template.innerHTML;
}

function hashColor(input, index) {
  if (!input) {
    return DEFAULT_VECTOR_COLORS[index % DEFAULT_VECTOR_COLORS.length];
  }

  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }

  return DEFAULT_VECTOR_COLORS[Math.abs(hash) % DEFAULT_VECTOR_COLORS.length];
}

function categoryHasPoints(featureCollection) {
  return featureCollection.features.some((feature) => feature.geometry?.type === "Point");
}

function categoryHasVectors(featureCollection) {
  return featureCollection.features.some((feature) => feature.geometry?.type !== "Point");
}

function BoundsController({ bounds }) {
  const map = useMap();

  useEffect(() => {
    if (!bounds?.length) {
      return;
    }

    map.fitBounds(bounds, {
      padding: [32, 32],
      maxZoom: 9,
    });
  }, [bounds, map]);

  return null;
}

function ProvinceDrawController({ isDrawingMode, onDraftChange, onDrawingChange }) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState([]);
  const map = useMapEvents({
    mousedown(event) {
      if (!isDrawingMode) {
        return;
      }

      const nextPoints = [[event.latlng.lat, event.latlng.lng]];
      setIsDrawing(true);
      setPoints(nextPoints);
      onDraftChange(nextPoints);
      onDrawingChange(true);
      L.DomEvent.preventDefault(event.originalEvent);
    },
    mousemove(event) {
      if (!isDrawingMode || !isDrawing) {
        return;
      }

      setPoints((current) => {
        const previousPoint = current[current.length - 1];
        const previousLatLng = previousPoint ? L.latLng(previousPoint[0], previousPoint[1]) : null;
        if (!isFarEnough(previousLatLng, event.latlng)) {
          return current;
        }

        const nextPoints = [...current, [event.latlng.lat, event.latlng.lng]];
        onDraftChange(nextPoints);
        return nextPoints;
      });
    },
    mouseup() {
      if (!isDrawingMode || !isDrawing) {
        return;
      }

      setIsDrawing(false);
      onDrawingChange(false);
    },
  });

  useEffect(() => {
    if (!isDrawingMode) {
      setIsDrawing(false);
      setPoints([]);
      onDrawingChange(false);
      map.dragging.enable();
      map.doubleClickZoom.enable();
      return undefined;
    }

    map.dragging.disable();
    map.doubleClickZoom.disable();

    return () => {
      map.dragging.enable();
      map.doubleClickZoom.enable();
    };
  }, [isDrawingMode, map, onDrawingChange]);

  return points.length > 1 ? (
    <Polygon
      positions={points}
      pathOptions={{
        color: "#f3c15f",
        weight: 3,
        opacity: 0.95,
        dashArray: "8 7",
        fillColor: "#f3c15f",
        fillOpacity: 0.2,
      }}
    />
  ) : null;
}

function buildPopupContent(properties, searchQuery = "") {
  const html = highlightHtml(properties.descriptionHtml, searchQuery);
  const metadataEntries = Object.entries(properties.metadata ?? {}).filter(
    ([key, value]) => value && key.toLowerCase() !== "summary",
  );

  return (
    <div className="popup-card">
      <h3>{properties.name || "Untitled feature"}</h3>
      {metadataEntries.length > 0 ? (
        <dl className="popup-meta">
          {metadataEntries.map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {html ? <div className="popup-body" dangerouslySetInnerHTML={{ __html: html }} /> : null}
    </div>
  );
}

function createLeafletIcon(icon, isHighlighted = false) {
  if (isHighlighted) {
    const width = Math.max(24, Math.round((icon?.width ?? 32) * (icon?.scale ?? 1)));
    const height = Math.max(24, Math.round((icon?.height ?? 32) * (icon?.scale ?? 1)));
    const iconHtml = icon?.href
      ? `<img src="${icon.href}" alt="" width="${width}" height="${height}" />`
      : '<span class="highlight-pin-core"></span>';

    return L.divIcon({
      className: "highlight-marker",
      html: `<span class="highlight-pin">${iconHtml}</span>`,
      iconSize: [width + 20, height + 20],
      iconAnchor: [Math.round((width + 20) / 2), height + 16],
      popupAnchor: [0, -height],
    });
  }

  if (!icon?.href) {
    return null;
  }

  const width = Math.max(18, Math.round((icon.width ?? 32) * (icon.scale ?? 1)));
  const height = Math.max(18, Math.round((icon.height ?? 32) * (icon.scale ?? 1)));

  return L.icon({
    iconUrl: icon.href,
    iconSize: [width, height],
    iconAnchor: [Math.round(width / 2), height],
    popupAnchor: [0, -height + 10],
    tooltipAnchor: [0, -height / 2],
  });
}

function FeaturePopup({ feature, searchQuery }) {
  return <Popup maxWidth={380}>{buildPopupContent(feature.properties, searchQuery)}</Popup>;
}

function ProvincePopup({ province }) {
  return (
    <Popup maxWidth={360}>
      <div className="popup-card province-popup">
        <h3>{province.name}</h3>
        {province.description ? <p>{province.description}</p> : <p>No description added.</p>}
      </div>
    </Popup>
  );
}

function CustomProvincesLayer({
  provinces,
  selectedProvinceId,
  showLabels,
  onSelectProvince,
}) {
  return (
    <>
      {provinces.map((province) => {
        const isSelected = selectedProvinceId === province.id;
        const color = isSelected ? "#f3c15f" : "#7f3f20";

        return (
          <Polygon
            key={`${province.id}-area`}
            positions={province.coordinates}
            eventHandlers={{
              click: () => onSelectProvince(province.id),
            }}
            pathOptions={{
              color,
              weight: isSelected ? 5 : 2,
              opacity: isSelected ? 1 : 0.82,
              fillColor: color,
              fillOpacity: isSelected ? 0.38 : 0.12,
            }}
          >
            <ProvincePopup province={province} />
          </Polygon>
        );
      })}
      {showLabels
        ? provinces.map((province) => {
            const isSelected = selectedProvinceId === province.id;
            return (
              <Marker
                key={`${province.id}-label`}
                position={provinceCenter(province.coordinates)}
                icon={leafletLabelIcon(province.name, isSelected)}
                eventHandlers={{
                  click: () => onSelectProvince(province.id),
                }}
                zIndexOffset={isSelected ? 1000 : 500}
              >
                <ProvincePopup province={province} />
              </Marker>
            );
          })
        : null}
    </>
  );
}

function CategoryPointsLayer({ featureCollection, category, iconsByStyle, searchQuery }) {
  const pointFeatures = useMemo(
    () => featureCollection.features.filter((feature) => feature.geometry?.type === "Point"),
    [featureCollection],
  );

  const defaultIcon = useMemo(
    () => createLeafletIcon(category.legendIcon ? iconsByStyle[category.legendIcon] : null),
    [category.legendIcon, iconsByStyle],
  );

  return (
    <MarkerClusterGroup chunkedLoading maxClusterRadius={44} showCoverageOnHover={false}>
      {pointFeatures.map((feature, index) => {
        const [longitude, latitude] = feature.geometry.coordinates;
        const sourceIcon = iconsByStyle[feature.properties.styleId] || iconsByStyle[category.legendIcon];
        const isHighlighted = featureMatchesSearch(feature, searchQuery);
        const icon = createLeafletIcon(sourceIcon, isHighlighted) || defaultIcon;

        return (
          <Marker
            key={feature.id ?? `${category.id}-point-${index}`}
            position={[latitude, longitude]}
            icon={icon ?? undefined}
          >
            <FeaturePopup feature={feature} searchQuery={searchQuery} />
          </Marker>
        );
      })}
    </MarkerClusterGroup>
  );
}

function styleFeature(feature, category, index, searchQuery = "") {
  const color = feature.properties.strokeColor || hashColor(category.id, index);
  const isHighlighted = featureMatchesSearch(feature, searchQuery);

  return {
    color: isHighlighted ? "#f3c15f" : color,
    weight: isHighlighted ? 6 : feature.geometry.type === "LineString" ? 3 : 2,
    opacity: isHighlighted ? 1 : 0.9,
    fillColor: feature.properties.fillColor || color,
    fillOpacity: feature.geometry.type === "Polygon" ? (isHighlighted ? 0.42 : 0.25) : 0,
  };
}

function CategoryVectorsLayer({ featureCollection, category, searchQuery }) {
  const vectorFeatures = useMemo(
    () => ({
      ...featureCollection,
      features: featureCollection.features.filter((feature) => feature.geometry?.type !== "Point"),
    }),
    [featureCollection],
  );

  return (
    <GeoJSON
      key={`${category.id}-${searchQuery}`}
      data={vectorFeatures}
      style={(feature) => styleFeature(feature, category, 0, searchQuery)}
      onEachFeature={(feature, layer) => {
        layer.bindPopup(renderToStaticMarkup(buildPopupContent(feature.properties, searchQuery)), {
          maxWidth: 380,
        });
      }}
    />
  );
}

function LayerPanel({
  categories,
  activeCategories,
  loadedCategories,
  onToggleCategory,
  onShowAll,
  onHideAll,
  iconsByStyle,
  searchQuery,
  onSearchQueryChange,
  matchCount,
  onOpenDataBrowser,
  customProvinces,
  isAddProvinceMode,
  draftProvincePoints,
  isDrawingProvince,
  provinceForm,
  showProvinceLabels,
  selectedProvinceId,
  onStartAddProvince,
  onCancelAddProvince,
  onProvinceFormChange,
  onSaveProvince,
  onDeleteProvince,
  onToggleProvinceLabels,
  onSelectProvince,
}) {
  const canSaveProvince = provinceForm.name.trim() && draftProvincePoints.length >= 3;
  const selectedProvince = customProvinces.find((province) => province.id === selectedProvinceId);

  return (
    <aside className="sidebar">
      <div className="sidebar-shell">
        <p className="eyebrow">Digital Atlas of the Byzantine Empire</p>
        <h1>Tabula Orbis</h1>
        <p className="lede">
          East Roman and Byzantine settlements, roads, fortifications, and ecclesiastical sites
          rendered from the bundled KMZ source.
        </p>
        <section className="search-panel" aria-label="Search atlas">
          <label htmlFor="atlas-search">Search atlas</label>
          <input
            id="atlas-search"
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search places, dates, sources"
          />
          <small>
            {searchQuery.trim()
              ? `${matchCount} visible matches highlighted`
              : "Highlights visible loaded layers"}
          </small>
        </section>
        <section className="panel-section province-panel">
          <div className="panel-heading-row">
            <h2>Custom Provinces</h2>
            <label className="label-toggle">
              <input
                type="checkbox"
                checked={showProvinceLabels}
                onChange={(event) => onToggleProvinceLabels(event.target.checked)}
              />
              Names
            </label>
          </div>
          {isAddProvinceMode ? (
            <div className="province-editor">
              <p className="draw-hint">
                {isDrawingProvince
                  ? "Release the mouse to finish the outline."
                  : draftProvincePoints.length >= 3
                    ? "Review the outline, then name and save it."
                    : "Drag on the map to freehand the province boundary."}
              </p>
              <label>
                Name
                <input
                  type="text"
                  value={provinceForm.name}
                  onChange={(event) => onProvinceFormChange({ name: event.target.value })}
                  placeholder="Province name"
                />
              </label>
              <label>
                Description
                <textarea
                  value={provinceForm.description}
                  onChange={(event) => onProvinceFormChange({ description: event.target.value })}
                  placeholder="Short historical or administrative note"
                  rows={4}
                />
              </label>
              <div className="panel-actions compact">
                <button type="button" onClick={onSaveProvince} disabled={!canSaveProvince}>
                  Save province
                </button>
                <button type="button" onClick={onCancelAddProvince} className="ghost">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="full-action" onClick={onStartAddProvince}>
              Add new province
            </button>
          )}
          {customProvinces.length > 0 ? (
            <div className="province-list">
              {customProvinces.map((province) => (
                <button
                  key={province.id}
                  type="button"
                  className={selectedProvinceId === province.id ? "selected" : ""}
                  onClick={() => onSelectProvince(province.id)}
                >
                  {province.name}
                </button>
              ))}
            </div>
          ) : (
            <small className="empty-note">Saved provinces will appear here.</small>
          )}
          {selectedProvince ? (
            <button type="button" className="db-btn db-btn--reset" onClick={() => onDeleteProvince(selectedProvince.id)}>
              Delete selected province
            </button>
          ) : null}
        </section>
        <div className="panel-actions">
          <button type="button" onClick={onShowAll}>
            Show all
          </button>
          <button type="button" onClick={onHideAll} className="ghost">
            Hide all
          </button>
        </div>
        <section className="panel-section">
          <h2>Layers</h2>
          <div className="layer-list">
            {categories.map((category) => {
              const checked = activeCategories[category.id] ?? false;
              const status = loadedCategories[category.id] ? "Loaded" : "On demand";
              return (
                <label key={category.id} className="layer-row">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleCategory(category.id)}
                  />
                  <span className="layer-label">
                    <strong>{category.label}</strong>
                    <small>
                      {category.featureCount} features · {status}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
        </section>
        <section className="panel-section">
          <h2>Legend</h2>
          <div className="legend-list">
            {categories.map((category) => {
              const icon = category.legendIcon ? iconsByStyle[category.legendIcon] : null;
              return (
                <div key={`${category.id}-legend`} className="legend-row">
                  {icon ? <img src={icon.href} alt="" width="18" height="18" /> : <span className="legend-swatch" style={{ background: hashColor(category.id, 0) }} />}
                  <span>{category.label}</span>
                </div>
              );
            })}
          </div>
        </section>
        <button type="button" className="db-nav-btn" onClick={onOpenDataBrowser}>
          Browse Settlement Data
        </button>
      </div>
    </aside>
  );
}

function App() {
  const [manifest, setManifest] = useState(null);
  const [activeCategories, setActiveCategories] = useState({});
  const [loadedCategories, setLoadedCategories] = useState({});
  const [featureCollections, setFeatureCollections] = useState({});
  const [loadingState, setLoadingState] = useState("loading");
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [baseLayer, setBaseLayer] = useState("map");
  const [currentView, setCurrentView] = useState("map");
  const [customProvinces, setCustomProvinces] = useState([]);
  const [isAddProvinceMode, setIsAddProvinceMode] = useState(false);
  const [draftProvincePoints, setDraftProvincePoints] = useState([]);
  const [isDrawingProvince, setIsDrawingProvince] = useState(false);
  const [provinceForm, setProvinceForm] = useState({ name: "", description: "" });
  const [showProvinceLabels, setShowProvinceLabels] = useState(true);
  const [selectedProvinceId, setSelectedProvinceId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        let nextManifest;
        try {
          nextManifest = await fetchManifest();
        } catch {
          const response = await fetch("/atlas/manifest.json");
          if (!response.ok) {
            throw new Error(`Manifest request failed with ${response.status}`);
          }
          nextManifest = await response.json();
        }
        if (cancelled) {
          return;
        }

        const defaults = Object.fromEntries(
          nextManifest.categories.map((category) => [category.id, category.defaultVisible]),
        );

        setManifest(nextManifest);
        setActiveCategories(defaults);
        setLoadingState("ready");
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError.message);
          setLoadingState("error");
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProvinces() {
      try {
        const provinces = await fetchProvinces();
        if (!cancelled) {
          setCustomProvinces(provinces);
        }
      } catch {
        if (!cancelled) {
          setCustomProvinces(loadCustomProvinces());
        }
      }
    }

    loadProvinces();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!manifest) {
      return;
    }

    const visibleIds = manifest.categories
      .filter((category) => activeCategories[category.id])
      .map((category) => category.id)
      .filter((categoryId) => !loadedCategories[categoryId]);

    if (!visibleIds.length) {
      return;
    }

    let cancelled = false;

    async function loadVisibleCategories() {
      const responses = await Promise.all(
        visibleIds.map(async (categoryId) => {
          const category = manifest.categories.find((item) => item.id === categoryId);
          try {
            const featureCollection = await fetchFeatures({ category: category.id, limit: 10000 });
            return [categoryId, featureCollection];
          } catch {
            const response = await fetch(category.dataFile);
            if (!response.ok) {
              throw new Error(`Category request failed for ${category.label}`);
            }
            const featureCollection = await response.json();
            return [categoryId, featureCollection];
          }
        }),
      );

      if (cancelled) {
        return;
      }

      setFeatureCollections((current) => ({
        ...current,
        ...Object.fromEntries(responses),
      }));
      setLoadedCategories((current) => ({
        ...current,
        ...Object.fromEntries(visibleIds.map((categoryId) => [categoryId, true])),
      }));
    }

    loadVisibleCategories().catch((nextError) => {
      if (!cancelled) {
        setError(nextError.message);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeCategories, loadedCategories, manifest]);

  const updateDraftProvince = useCallback((points) => {
    setDraftProvincePoints(points);
  }, []);

  const updateDrawingState = useCallback((nextIsDrawing) => {
    setIsDrawingProvince(nextIsDrawing);
  }, []);

  const cancelAddProvince = useCallback(() => {
    setIsAddProvinceMode(false);
    setIsDrawingProvince(false);
    setDraftProvincePoints([]);
    setProvinceForm({ name: "", description: "" });
  }, []);

  const saveProvince = useCallback(async () => {
    const name = provinceForm.name.trim();
    if (!name || draftProvincePoints.length < 3) {
      return;
    }

    try {
      const newProvince = await createProvince({
        name,
        description: provinceForm.description.trim(),
        coordinates: draftProvincePoints,
      });

      setCustomProvinces((current) => [...current, newProvince]);
      setSelectedProvinceId(newProvince.id);
    } catch (nextError) {
      const newProvince = {
        id: `province-${Date.now()}`,
        name,
        description: provinceForm.description.trim(),
        coordinates: draftProvincePoints,
        createdAt: new Date().toISOString(),
      };

      setCustomProvinces((current) => {
        const next = [...current, newProvince];
        window.localStorage.setItem(CUSTOM_PROVINCES_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
      setSelectedProvinceId(newProvince.id);
      setError(nextError.message);
    }

    setIsAddProvinceMode(false);
    setIsDrawingProvince(false);
    setDraftProvincePoints([]);
    setProvinceForm({ name: "", description: "" });
  }, [draftProvincePoints, provinceForm.description, provinceForm.name]);

  const removeProvince = useCallback(async (provinceId) => {
    try {
      await deleteProvince(provinceId);
    } catch (nextError) {
      setError(nextError.message);
    }
    setCustomProvinces((current) => current.filter((province) => province.id !== provinceId));
    setSelectedProvinceId(null);
  }, []);

  const iconsByStyle = useMemo(() => manifest?.icons ?? {}, [manifest]);
  const activeBaseLayer = BASE_LAYERS[baseLayer];

  const visibleMatchCount = useMemo(() => {
    if (!searchQuery.trim()) {
      return 0;
    }

    return Object.entries(featureCollections).reduce((count, [categoryId, featureCollection]) => {
      if (!activeCategories[categoryId]) {
        return count;
      }

      return (
        count +
        featureCollection.features.filter((feature) => featureMatchesSearch(feature, searchQuery)).length
      );
    }, 0);
  }, [activeCategories, featureCollections, searchQuery]);

  const visibleBounds = useMemo(() => {
    if (!manifest?.bounds) {
      return EMPTY_BOUNDS;
    }

    return [
      [manifest.bounds.minLatitude, manifest.bounds.minLongitude],
      [manifest.bounds.maxLatitude, manifest.bounds.maxLongitude],
    ];
  }, [manifest]);

  if (currentView === "data") {
    return <DataBrowserPage onBack={() => setCurrentView("map")} />;
  }

  if (loadingState === "loading") {
    return <div className="app-state">Preparing atlas…</div>;
  }

  if (loadingState === "error") {
    return <div className="app-state error">Failed to load the atlas: {error}</div>;
  }

  return (
    <div className="app-shell">
      <LayerPanel
        categories={manifest.categories}
        activeCategories={activeCategories}
        loadedCategories={loadedCategories}
        onToggleCategory={(categoryId) => {
          setActiveCategories((current) => ({
            ...current,
            [categoryId]: !current[categoryId],
          }));
        }}
        onShowAll={() => {
          setActiveCategories(
            Object.fromEntries(manifest.categories.map((category) => [category.id, true])),
          );
        }}
        onHideAll={() => {
          setActiveCategories(
            Object.fromEntries(manifest.categories.map((category) => [category.id, false])),
          );
        }}
        iconsByStyle={iconsByStyle}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        matchCount={visibleMatchCount}
        onOpenDataBrowser={() => setCurrentView("data")}
        customProvinces={customProvinces}
        isAddProvinceMode={isAddProvinceMode}
        draftProvincePoints={draftProvincePoints}
        isDrawingProvince={isDrawingProvince}
        provinceForm={provinceForm}
        showProvinceLabels={showProvinceLabels}
        selectedProvinceId={selectedProvinceId}
        onStartAddProvince={() => {
          setSelectedProvinceId(null);
          setIsAddProvinceMode(true);
          setDraftProvincePoints([]);
          setProvinceForm({ name: "", description: "" });
        }}
        onCancelAddProvince={cancelAddProvince}
        onProvinceFormChange={(changes) =>
          setProvinceForm((current) => ({
            ...current,
            ...changes,
          }))
        }
        onSaveProvince={saveProvince}
        onDeleteProvince={removeProvince}
        onToggleProvinceLabels={setShowProvinceLabels}
        onSelectProvince={setSelectedProvinceId}
      />
      <main className="map-stage">
        {error ? <div className="inline-error">{error}</div> : null}
        <div className="map-toolbar" aria-label="Map base layer">
          {Object.entries(BASE_LAYERS).map(([key, layer]) => (
            <button
              key={key}
              type="button"
              className={baseLayer === key ? "active" : ""}
              onClick={() => setBaseLayer(key)}
            >
              {layer.label}
            </button>
          ))}
        </div>
        <MapContainer
          className="map-canvas"
          center={[41.01, 28.97]}
          zoom={5}
          scrollWheelZoom
          preferCanvas
        >
          <TileLayer
            key={baseLayer}
            attribution={activeBaseLayer.attribution}
            url={activeBaseLayer.url}
          />
          <BoundsController bounds={visibleBounds} />
          <ProvinceDrawController
            isDrawingMode={isAddProvinceMode}
            onDraftChange={updateDraftProvince}
            onDrawingChange={updateDrawingState}
          />
          <CustomProvincesLayer
            provinces={customProvinces}
            selectedProvinceId={selectedProvinceId}
            showLabels={showProvinceLabels}
            onSelectProvince={setSelectedProvinceId}
          />
          {manifest.categories.map((category) => {
            if (!activeCategories[category.id]) {
              return null;
            }

            const featureCollection = featureCollections[category.id];
            if (!featureCollection) {
              return null;
            }

            return (
              <div key={category.id}>
                {categoryHasPoints(featureCollection) ? (
                  <CategoryPointsLayer
                    category={category}
                    featureCollection={featureCollection}
                    iconsByStyle={iconsByStyle}
                    searchQuery={searchQuery}
                  />
                ) : null}
                {categoryHasVectors(featureCollection) ? (
                  <CategoryVectorsLayer
                    category={category}
                    featureCollection={featureCollection}
                    searchQuery={searchQuery}
                  />
                ) : null}
              </div>
            );
          })}
        </MapContainer>
      </main>
    </div>
  );
}

export default App;
