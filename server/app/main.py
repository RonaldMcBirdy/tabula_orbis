from datetime import date, datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from server.app.config import get_settings
from server.app.db import get_session
from server.app.geojson import (
    bbox_to_envelope_expression,
    geojson_to_wkt_expression,
    geometry_to_geojson,
    latlngs_from_polygon,
    polygon_from_latlngs,
)
from server.app.importer import clean_html, import_kmz, slugify
from server.app.models import AtlasSource, Category, Feature, FeatureEvent, FeatureMetadata, Province, Style
from server.app.schemas import (
    CategoryResponse,
    FeatureCreate,
    FeatureEventCreate,
    FeatureEventResponse,
    FeatureEventUpdate,
    FeaturePayload,
    FeatureUpdate,
    HealthResponse,
    ManifestResponse,
    ProvinceCreate,
    ProvinceResponse,
    ProvinceUpdate,
)

settings = get_settings()

FEATURE_EVENT_TYPES = {
    "name_change",
    "conquest",
    "loss",
    "population",
    "theo_political_status",
    "thematic_admin",
    "notable_event",
}

EVENT_PAYLOAD_KEYS = {
    "name_change": {"old_name", "new_name", "source_title", "source_url", "source_note", "note"},
    "conquest": {"actor", "polity", "from_polity", "to_polity", "source_title", "source_url", "source_note", "note"},
    "loss": {"actor", "polity", "from_polity", "to_polity", "source_title", "source_url", "source_note", "note"},
    "population": {"value", "unit", "estimate_type", "source_title", "source_url", "source_note", "note"},
    "theo_political_status": {"status", "source_title", "source_url", "source_note", "note"},
    "thematic_admin": {"theme", "administrative_unit", "source_title", "source_url", "source_note", "note"},
    "notable_event": {"title", "description", "source_title", "source_url", "source_note", "note"},
}

app = FastAPI(title=settings.api_title)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def parse_iso_date(value: str | None, field_name: str) -> date | None:
    if value is None or value == "":
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=f"{field_name} must be YYYY-MM-DD") from error


def parse_date_range_param(value: str | None) -> tuple[date | None, date | None]:
    if not value:
        return None, None
    separator = ".." if ".." in value else ","
    parts = [part.strip() for part in value.split(separator)]
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="date_range must be START,END or START..END")
    start = parse_iso_date(parts[0], "date_range start")
    end = parse_iso_date(parts[1], "date_range end")
    if start and end and start > end:
        raise HTTPException(status_code=400, detail="date_range start must be on or before end")
    return start, end


def validate_feature_dates(valid_from: date | None, valid_to: date | None) -> None:
    if valid_from and valid_to and valid_from > valid_to:
        raise HTTPException(status_code=400, detail="validFrom must be on or before validTo")


def normalize_event_type(event_type: str) -> str:
    normalized = event_type.strip().lower()
    if normalized not in FEATURE_EVENT_TYPES:
        raise HTTPException(status_code=400, detail=f"eventType must be one of: {', '.join(sorted(FEATURE_EVENT_TYPES))}")
    return normalized


def validate_event_dates(start_date: date, end_date: date | None) -> None:
    if end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="startDate must be on or before endDate")


def validate_event_payload(event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    allowed_keys = EVENT_PAYLOAD_KEYS[event_type]
    extra_keys = sorted(set(payload) - allowed_keys)
    if extra_keys:
        raise HTTPException(status_code=400, detail=f"Unsupported payload field(s): {', '.join(extra_keys)}")
    return {key: value for key, value in payload.items() if value not in (None, "")}


def metadata_dict(feature: Feature) -> dict[str, str]:
    return {entry.key: entry.value for entry in feature.metadata_entries}


def feature_to_geojson(session: Session, feature: Feature) -> dict[str, Any]:
    style_key = feature.style.style_key if feature.style else None
    return {
        "type": "Feature",
        "id": feature.id,
        "geometry": geometry_to_geojson(session, feature.geometry),
        "properties": {
            "name": feature.name,
            "category": feature.category.label,
            "categoryId": feature.category.slug,
            "styleId": style_key,
            "descriptionHtml": feature.description_html,
            "validFrom": feature.valid_from.isoformat() if feature.valid_from else None,
            "validTo": feature.valid_to.isoformat() if feature.valid_to else None,
            "metadata": metadata_dict(feature),
            "strokeColor": feature.style.stroke_color if feature.style else None,
            "fillColor": feature.style.fill_color if feature.style else None,
        },
    }


def event_to_response(event: FeatureEvent) -> FeatureEventResponse:
    return FeatureEventResponse(
        id=event.id,
        featureId=event.feature_id,
        eventType=event.event_type,
        startDate=event.start_date.isoformat(),
        endDate=event.end_date.isoformat() if event.end_date else None,
        payload=event.payload_json,
        createdAt=event.created_at.isoformat() if event.created_at else None,
        updatedAt=event.updated_at.isoformat() if event.updated_at else None,
    )


def get_live_feature(session: Session, feature_id: str) -> Feature:
    feature = session.scalar(select(Feature).where(Feature.id == feature_id, Feature.deleted_at.is_(None)))
    if feature is None:
        raise HTTPException(status_code=404, detail="Feature not found")
    return feature


def get_live_event(session: Session, feature_id: str, event_id: str) -> FeatureEvent:
    get_live_feature(session, feature_id)
    event = session.scalar(
        select(FeatureEvent).where(
            FeatureEvent.id == event_id,
            FeatureEvent.feature_id == feature_id,
            FeatureEvent.deleted_at.is_(None),
        )
    )
    if event is None:
        raise HTTPException(status_code=404, detail="Feature event not found")
    return event


def get_category(session: Session, slug_or_label: str) -> Category:
    slug = slugify(slug_or_label)
    category = session.scalar(select(Category).where(or_(Category.slug == slug, Category.label == slug_or_label)))
    if category is None:
        category = Category(slug=slug, label=slug_or_label, default_visible=True, display_order=999)
        session.add(category)
        session.flush()
    return category


def get_style(session: Session, style_key: str | None) -> Style | None:
    if not style_key:
        return None
    return session.scalar(select(Style).where(Style.style_key == style_key))


def replace_metadata(session: Session, feature: Feature, metadata: dict[str, str]) -> None:
    session.query(FeatureMetadata).filter(FeatureMetadata.feature_id == feature.id).delete()
    for key, value in metadata.items():
        if key in {"startDate", "endDate"}:
            continue
        if value is not None and str(value).strip():
            session.add(FeatureMetadata(feature_id=feature.id, key=key, value=str(value)))


def apply_temporal_filters(query: Any, at_date: date | None, date_range: str | None) -> Any:
    if at_date:
        query = query.where(
            or_(Feature.valid_from.is_(None), Feature.valid_from <= at_date),
            or_(Feature.valid_to.is_(None), Feature.valid_to >= at_date),
        )

    range_start, range_end = parse_date_range_param(date_range)
    if range_start or range_end:
        if range_end:
            query = query.where(or_(Feature.valid_from.is_(None), Feature.valid_from <= range_end))
        if range_start:
            query = query.where(or_(Feature.valid_to.is_(None), Feature.valid_to >= range_start))

    return query


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/api/categories", response_model=list[CategoryResponse])
def list_categories(session: Session = Depends(get_session)) -> list[CategoryResponse]:
    rows = session.execute(
        select(Category, func.count(Feature.id))
        .outerjoin(Feature, (Feature.category_id == Category.id) & (Feature.deleted_at.is_(None)))
        .group_by(Category.id)
        .order_by(Category.display_order, Category.label)
    ).all()
    return [
        CategoryResponse(
            id=category.slug,
            label=category.label,
            dataFile=f"/api/features?category={category.slug}",
            featureCount=count,
            defaultVisible=category.default_visible,
            legendIcon=category.legend_style_key,
        )
        for category, count in rows
    ]


@app.get("/api/manifest", response_model=ManifestResponse)
def manifest(session: Session = Depends(get_session)) -> ManifestResponse:
    source = session.scalar(select(AtlasSource).order_by(AtlasSource.imported_at.desc()))
    bounds_row = session.execute(
        select(
            func.ST_XMin(func.ST_Extent(Feature.geometry)),
            func.ST_YMin(func.ST_Extent(Feature.geometry)),
            func.ST_XMax(func.ST_Extent(Feature.geometry)),
            func.ST_YMax(func.ST_Extent(Feature.geometry)),
        ).where(Feature.deleted_at.is_(None))
    ).one()
    categories = list_categories(session)
    styles = session.scalars(select(Style).where(Style.icon_path.is_not(None))).all()
    icons = {
        style.style_key: {
            "href": style.icon_path,
            "scale": style.scale,
            "width": style.width,
            "height": style.height,
        }
        for style in styles
    }
    return ManifestResponse(
        title=source.title if source else "Tabula Orbis",
        description=source.description_html if source else "",
        sourceFile=source.filename if source else None,
        generatedAt=source.imported_at.isoformat() if source else None,
        bounds={
            "minLongitude": bounds_row[0] or 20,
            "minLatitude": bounds_row[1] or 35,
            "maxLongitude": bounds_row[2] or 42,
            "maxLatitude": bounds_row[3] or 47,
        },
        categories=categories,
        icons=icons,
    )


@app.get("/api/features")
def list_features(
    category: str | None = None,
    q: str | None = None,
    bbox: str | None = None,
    geometry_type: str | None = None,
    at_date: date | None = None,
    date_range: str | None = None,
    limit: int = Query(5000, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    query = (
        select(Feature)
        .options(joinedload(Feature.category), joinedload(Feature.style), selectinload(Feature.metadata_entries))
        .where(Feature.deleted_at.is_(None))
        .order_by(Feature.id)
        .limit(limit)
        .offset(offset)
    )
    if category:
        query = query.join(Category).where(Category.slug == slugify(category))
    if geometry_type:
        query = query.where(Feature.geometry_type == geometry_type)
    if q:
        pattern = f"%{q.strip()}%"
        query = query.outerjoin(FeatureMetadata).where(
            or_(Feature.name.ilike(pattern), Feature.description_html.ilike(pattern), FeatureMetadata.value.ilike(pattern))
        )
    if bbox:
        try:
            envelope = bbox_to_envelope_expression(bbox)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        query = query.where(func.ST_Intersects(Feature.geometry, envelope))
    query = apply_temporal_filters(query, at_date, date_range)

    features = session.scalars(query).unique().all()
    return {
        "type": "FeatureCollection",
        "features": [feature_to_geojson(session, feature) for feature in features],
    }


@app.get("/api/features/{feature_id}")
def get_feature(feature_id: str, session: Session = Depends(get_session)) -> dict[str, Any]:
    feature = session.scalar(
        select(Feature)
        .options(joinedload(Feature.category), joinedload(Feature.style), selectinload(Feature.metadata_entries))
        .where(Feature.id == feature_id, Feature.deleted_at.is_(None))
    )
    if feature is None:
        raise HTTPException(status_code=404, detail="Feature not found")
    return feature_to_geojson(session, feature)


@app.post("/api/features", response_model=FeaturePayload)
def create_feature(payload: FeatureCreate, session: Session = Depends(get_session)) -> dict[str, Any]:
    category = get_category(session, payload.category)
    style = get_style(session, payload.styleId)
    feature = Feature(
        id=payload.id or f"feature-{uuid4()}",
        category_id=category.id,
        style_id=style.id if style else None,
        name=payload.name.strip() or "Untitled feature",
        description_html=clean_html(payload.descriptionHtml),
        valid_from=parse_iso_date(payload.validFrom, "validFrom"),
        valid_to=parse_iso_date(payload.validTo, "validTo"),
        geometry=geojson_to_wkt_expression(payload.geometry),
        geometry_type=payload.geometry["type"],
    )
    validate_feature_dates(feature.valid_from, feature.valid_to)
    session.add(feature)
    session.flush()
    replace_metadata(session, feature, payload.metadata)
    session.commit()
    session.refresh(feature)
    return feature_to_geojson(session, feature)


@app.patch("/api/features/{feature_id}", response_model=FeaturePayload)
def update_feature(feature_id: str, payload: FeatureUpdate, session: Session = Depends(get_session)) -> dict[str, Any]:
    feature = session.scalar(
        select(Feature)
        .options(joinedload(Feature.category), joinedload(Feature.style), selectinload(Feature.metadata_entries))
        .where(Feature.id == feature_id, Feature.deleted_at.is_(None))
    )
    if feature is None:
        raise HTTPException(status_code=404, detail="Feature not found")
    if payload.category is not None:
        feature.category = get_category(session, payload.category)
    if payload.styleId is not None:
        feature.style = get_style(session, payload.styleId)
    if payload.name is not None:
        feature.name = payload.name.strip() or "Untitled feature"
    if payload.descriptionHtml is not None:
        feature.description_html = clean_html(payload.descriptionHtml)
    if "validFrom" in payload.model_fields_set:
        feature.valid_from = parse_iso_date(payload.validFrom, "validFrom")
    if "validTo" in payload.model_fields_set:
        feature.valid_to = parse_iso_date(payload.validTo, "validTo")
    validate_feature_dates(feature.valid_from, feature.valid_to)
    if payload.geometry is not None:
        feature.geometry = geojson_to_wkt_expression(payload.geometry)
        feature.geometry_type = payload.geometry["type"]
    if payload.metadata is not None:
        replace_metadata(session, feature, payload.metadata)
    session.commit()
    session.refresh(feature)
    return feature_to_geojson(session, feature)


@app.delete("/api/features/{feature_id}")
def delete_feature(feature_id: str, session: Session = Depends(get_session)) -> dict[str, bool]:
    feature = session.get(Feature, feature_id)
    if feature is None or feature.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Feature not found")
    feature.deleted_at = datetime.now(timezone.utc)
    session.commit()
    return {"deleted": True}


@app.get("/api/features/{feature_id}/events", response_model=list[FeatureEventResponse])
def list_feature_events(feature_id: str, session: Session = Depends(get_session)) -> list[FeatureEventResponse]:
    get_live_feature(session, feature_id)
    events = session.scalars(
        select(FeatureEvent)
        .where(FeatureEvent.feature_id == feature_id, FeatureEvent.deleted_at.is_(None))
        .order_by(FeatureEvent.start_date, FeatureEvent.end_date, FeatureEvent.event_type)
    ).all()
    return [event_to_response(event) for event in events]


@app.post("/api/features/{feature_id}/events", response_model=FeatureEventResponse)
def create_feature_event(
    feature_id: str,
    payload: FeatureEventCreate,
    session: Session = Depends(get_session),
) -> FeatureEventResponse:
    get_live_feature(session, feature_id)
    event_type = normalize_event_type(payload.eventType)
    start_date = parse_iso_date(payload.startDate, "startDate")
    if start_date is None:
        raise HTTPException(status_code=400, detail="startDate is required")
    end_date = parse_iso_date(payload.endDate, "endDate")
    validate_event_dates(start_date, end_date)
    event = FeatureEvent(
        id=payload.id or f"event-{uuid4()}",
        feature_id=feature_id,
        event_type=event_type,
        start_date=start_date,
        end_date=end_date,
        payload_json=validate_event_payload(event_type, payload.payload),
    )
    session.add(event)
    session.commit()
    session.refresh(event)
    return event_to_response(event)


@app.patch("/api/features/{feature_id}/events/{event_id}", response_model=FeatureEventResponse)
def update_feature_event(
    feature_id: str,
    event_id: str,
    payload: FeatureEventUpdate,
    session: Session = Depends(get_session),
) -> FeatureEventResponse:
    event = get_live_event(session, feature_id, event_id)
    event_type = event.event_type
    if payload.eventType is not None:
        event_type = normalize_event_type(payload.eventType)
        event.event_type = event_type
    if "startDate" in payload.model_fields_set:
        start_date = parse_iso_date(payload.startDate, "startDate")
        if start_date is None:
            raise HTTPException(status_code=400, detail="startDate is required")
        event.start_date = start_date
    if "endDate" in payload.model_fields_set:
        event.end_date = parse_iso_date(payload.endDate, "endDate")
    validate_event_dates(event.start_date, event.end_date)
    if payload.payload is not None:
        event.payload_json = validate_event_payload(event_type, payload.payload)
    session.commit()
    session.refresh(event)
    return event_to_response(event)


@app.delete("/api/features/{feature_id}/events/{event_id}")
def delete_feature_event(feature_id: str, event_id: str, session: Session = Depends(get_session)) -> dict[str, bool]:
    event = get_live_event(session, feature_id, event_id)
    event.deleted_at = datetime.now(timezone.utc)
    session.commit()
    return {"deleted": True}


def province_to_response(session: Session, province: Province) -> ProvinceResponse:
    geometry = geometry_to_geojson(session, province.geometry)
    return ProvinceResponse(
        id=province.id,
        name=province.name,
        description=province.description,
        coordinates=latlngs_from_polygon(geometry),
        createdAt=province.created_at.isoformat() if province.created_at else None,
    )


@app.get("/api/provinces", response_model=list[ProvinceResponse])
def list_provinces(session: Session = Depends(get_session)) -> list[ProvinceResponse]:
    provinces = session.scalars(select(Province).where(Province.deleted_at.is_(None)).order_by(Province.created_at)).all()
    return [province_to_response(session, province) for province in provinces]


@app.post("/api/provinces", response_model=ProvinceResponse)
def create_province(payload: ProvinceCreate, session: Session = Depends(get_session)) -> ProvinceResponse:
    if len(payload.coordinates) < 3:
        raise HTTPException(status_code=400, detail="Province polygons require at least three points")
    province = Province(
        id=f"province-{uuid4()}",
        name=payload.name.strip(),
        description=payload.description.strip(),
        geometry=geojson_to_wkt_expression(polygon_from_latlngs(payload.coordinates)),
    )
    session.add(province)
    session.commit()
    session.refresh(province)
    return province_to_response(session, province)


@app.patch("/api/provinces/{province_id}", response_model=ProvinceResponse)
def update_province(province_id: str, payload: ProvinceUpdate, session: Session = Depends(get_session)) -> ProvinceResponse:
    province = session.scalar(select(Province).where(Province.id == province_id, Province.deleted_at.is_(None)))
    if province is None:
        raise HTTPException(status_code=404, detail="Province not found")
    if payload.name is not None:
        province.name = payload.name.strip()
    if payload.description is not None:
        province.description = payload.description.strip()
    if payload.coordinates is not None:
        if len(payload.coordinates) < 3:
            raise HTTPException(status_code=400, detail="Province polygons require at least three points")
        province.geometry = geojson_to_wkt_expression(polygon_from_latlngs(payload.coordinates))
    session.commit()
    session.refresh(province)
    return province_to_response(session, province)


@app.delete("/api/provinces/{province_id}")
def delete_province(province_id: str, session: Session = Depends(get_session)) -> dict[str, bool]:
    province = session.get(Province, province_id)
    if province is None or province.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Province not found")
    province.deleted_at = datetime.now(timezone.utc)
    session.commit()
    return {"deleted": True}


@app.post("/api/imports/kmz")
def import_current_kmz(session: Session = Depends(get_session)) -> dict[str, int]:
    return import_kmz(session)
