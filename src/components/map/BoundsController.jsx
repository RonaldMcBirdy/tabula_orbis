import { useEffect } from "react";
import { useMap } from "react-leaflet";

export default function BoundsController({ bounds }) {
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
