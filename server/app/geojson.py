import json
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session


def geometry_to_geojson(session: Session, geometry: Any) -> dict[str, Any]:
    payload = session.scalar(select(func.ST_AsGeoJSON(geometry)))
    return json.loads(payload) if payload else {}


def geojson_to_wkt_expression(geometry: dict[str, Any]):
    return func.ST_SetSRID(func.ST_GeomFromGeoJSON(json.dumps(geometry)), 4326)


def bbox_to_envelope_expression(bbox: str):
    parts = [float(part.strip()) for part in bbox.split(",")]
    if len(parts) != 4:
        raise ValueError("bbox must contain minLng,minLat,maxLng,maxLat")
    min_lng, min_lat, max_lng, max_lat = parts
    return func.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)


def polygon_from_latlngs(coordinates: list[list[float]]) -> dict[str, Any]:
    ring = [[lng, lat] for lat, lng in coordinates]
    if ring and ring[0] != ring[-1]:
        ring.append(ring[0])
    return {"type": "Polygon", "coordinates": [ring]}


def latlngs_from_polygon(geometry: dict[str, Any]) -> list[list[float]]:
    ring = geometry.get("coordinates", [[]])[0]
    if len(ring) > 1 and ring[0] == ring[-1]:
        ring = ring[:-1]
    return [[lat, lng] for lng, lat in ring]
