import { useMemo } from "react";
import { Marker } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { featureMatchesSearch } from "../../utils/geo.js";
import { createLeafletIcon } from "../../utils/icons.js";
import FeaturePopup from "./FeaturePopup.jsx";

export default function CategoryPointsLayer({ featureCollection, category, iconsByStyle, searchQuery }) {
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
