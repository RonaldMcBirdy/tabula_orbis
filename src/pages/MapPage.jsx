import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import { useNavigate } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import { createProvince, deleteProvince, fetchFeatures, fetchManifest, fetchProvinces } from "../api.js";
import { BASE_LAYERS, EMPTY_BOUNDS } from "../constants.js";
import { categoryHasPoints, categoryHasVectors, featureMatchesSearch, loadCustomProvinces, saveCustomProvinces } from "../utils/geo.js";
import BoundsController from "../components/map/BoundsController.jsx";
import ProvinceDrawController from "../components/map/ProvinceDrawController.jsx";
import CustomProvincesLayer from "../components/map/CustomProvincesLayer.jsx";
import CategoryPointsLayer from "../components/map/CategoryPointsLayer.jsx";
import CategoryVectorsLayer from "../components/map/CategoryVectorsLayer.jsx";
import LayerPanel from "../components/LayerPanel.jsx";
import TimelineSlider from "../components/TimelineSlider.jsx";

export default function MapPage() {
  const navigate = useNavigate();

  const [manifest, setManifest] = useState(null);
  const [activeCategories, setActiveCategories] = useState({});
  const [loadedCategories, setLoadedCategories] = useState({});
  const [featureCollections, setFeatureCollections] = useState({});
  const [loadingState, setLoadingState] = useState("loading");
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [baseLayer, setBaseLayer] = useState("map");
  const [customProvinces, setCustomProvinces] = useState([]);
  const [isAddProvinceMode, setIsAddProvinceMode] = useState(false);
  const [draftProvincePoints, setDraftProvincePoints] = useState([]);
  const [isDrawingProvince, setIsDrawingProvince] = useState(false);
  const [provinceForm, setProvinceForm] = useState({ name: "", description: "" });
  const [showProvinceLabels, setShowProvinceLabels] = useState(true);
  const [selectedProvinceId, setSelectedProvinceId] = useState(null);
  const [usesLocalProvinceStore, setUsesLocalProvinceStore] = useState(false);
  const [timelineDate, setTimelineDate] = useState(null);

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
          setUsesLocalProvinceStore(false);
        }
      } catch {
        if (!cancelled) {
          setCustomProvinces(loadCustomProvinces());
          setUsesLocalProvinceStore(true);
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
            const featureCollection = await fetchFeatures({
              category: category.id,
              limit: 10000,
              at_date: timelineDate,
            });
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
  }, [activeCategories, loadedCategories, manifest, timelineDate]);

  const updateTimelineDate = useCallback((nextDate) => {
    setTimelineDate(nextDate);
    setLoadedCategories({});
    setFeatureCollections({});
  }, []);

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
        saveCustomProvinces(next);
        return next;
      });
      setSelectedProvinceId(newProvince.id);
      setUsesLocalProvinceStore(true);
      setError(nextError.message);
    }

    setIsAddProvinceMode(false);
    setIsDrawingProvince(false);
    setDraftProvincePoints([]);
    setProvinceForm({ name: "", description: "" });
  }, [draftProvincePoints, provinceForm.description, provinceForm.name]);

  const removeProvince = useCallback(async (provinceId) => {
    if (!usesLocalProvinceStore) {
      try {
        await deleteProvince(provinceId);
      } catch (nextError) {
        setError(nextError.message);
        return;
      }
    }

    setCustomProvinces((current) => {
      const next = current.filter((province) => province.id !== provinceId);
      saveCustomProvinces(next);
      return next;
    });
    setSelectedProvinceId(null);
  }, [usesLocalProvinceStore]);

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
        onOpenDataBrowser={() => navigate("/research")}
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
        <TimelineSlider atDate={timelineDate} onChange={updateTimelineDate} />
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
            onDeleteProvince={removeProvince}
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
