import { useMemo } from "react";
import { GeoJSON } from "react-leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import { featureMatchesSearch, hashColor } from "../../utils/geo.js";
import { buildPopupContent } from "./FeaturePopup.jsx";

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

export default function CategoryVectorsLayer({ featureCollection, category, searchQuery }) {
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
