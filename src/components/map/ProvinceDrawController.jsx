import { useEffect, useState } from "react";
import { Polygon, useMapEvents } from "react-leaflet";
import L from "leaflet";

function isFarEnough(previousLatLng, nextLatLng) {
  if (!previousLatLng) {
    return true;
  }

  return previousLatLng.distanceTo(nextLatLng) > 2500;
}

export default function ProvinceDrawController({ isDrawingMode, onDraftChange, onDrawingChange }) {
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
