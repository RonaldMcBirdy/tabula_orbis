from datetime import datetime, timezone
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
from server.app.models import AtlasSource, Category, Feature, FeatureMetadata, Province, Style
from server.app.schemas import (
    CategoryResponse,
    FeatureCreate,
    FeaturePayload,
    FeatureUpdate,
    HealthResponse,
    ManifestResponse,
    ProvinceCreate,
    ProvinceResponse,
    ProvinceUpdate,
)

settings = get_settings()

app = FastAPI(title=settings.api_title)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
            "metadata": metadata_dict(feature),
            "strokeColor": feature.style.stroke_color if feature.style else None,
            "fillColor": feature.style.fill_color if feature.style else None,
        },
    }


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
        if value is not None and str(value).strip():
            session.add(FeatureMetadata(feature_id=feature.id, key=key, value=str(value)))


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
        geometry=geojson_to_wkt_expression(payload.geometry),
        geometry_type=payload.geometry["type"],
    )
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
