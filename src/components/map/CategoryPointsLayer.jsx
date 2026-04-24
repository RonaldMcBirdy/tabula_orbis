import { useMemo } from "react";
import { Marker, Tooltip } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { featureMatchesSearch } from "../../utils/geo.js";
import { createLeafletIcon } from "../../utils/icons.js";
import FeaturePopup from "./FeaturePopup.jsx";

function resolvedFeatureName(feature) {
  return feature.properties?.snapshot?.name || feature.properties?.name || "Untitled feature";
}

export default function CategoryPointsLayer({ featureCollection, category, iconsByStyle, searchQuery, atDate }) {
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
            {atDate ? (
              <Tooltip permanent direction="right" offset={[10, -12]} className="feature-label-tooltip">
                {resolvedFeatureName(feature)}
              </Tooltip>
            ) : null}
            <FeaturePopup feature={feature} searchQuery={searchQuery} atDate={atDate} />
          </Marker>
        );
      })}
    </MarkerClusterGroup>
  );
}
