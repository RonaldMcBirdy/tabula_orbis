from typing import Any

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str


class CategoryResponse(BaseModel):
    id: str
    label: str
    dataFile: str
    featureCount: int
    defaultVisible: bool
    legendIcon: str | None = None


class ManifestResponse(BaseModel):
    title: str
    description: str
    sourceFile: str | None = None
    generatedAt: str | None = None
    bounds: dict[str, float]
    categories: list[CategoryResponse]
    icons: dict[str, dict[str, Any]]


class FeaturePayload(BaseModel):
    type: str = "Feature"
    id: str | None = None
    geometry: dict[str, Any]
    properties: dict[str, Any] = Field(default_factory=dict)


class FeatureCreate(BaseModel):
    id: str | None = None
    category: str
    styleId: str | None = None
    name: str
    descriptionHtml: str = ""
    validFrom: str | None = None
    validTo: str | None = None
    metadata: dict[str, str] = Field(default_factory=dict)
    geometry: dict[str, Any]


class FeatureUpdate(BaseModel):
    category: str | None = None
    styleId: str | None = None
    name: str | None = None
    descriptionHtml: str | None = None
    validFrom: str | None = None
    validTo: str | None = None
    metadata: dict[str, str] | None = None
    geometry: dict[str, Any] | None = None


class FeatureEventBase(BaseModel):
    eventType: str
    startDate: str
    endDate: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class FeatureEventCreate(FeatureEventBase):
    id: str | None = None


class FeatureEventUpdate(BaseModel):
    eventType: str | None = None
    startDate: str | None = None
    endDate: str | None = None
    payload: dict[str, Any] | None = None


class FeatureEventResponse(FeatureEventBase):
    id: str
    featureId: str
    createdAt: str | None = None
    updatedAt: str | None = None


class ProvinceCreate(BaseModel):
    name: str
    description: str = ""
    coordinates: list[list[float]]


class ProvinceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    coordinates: list[list[float]] | None = None


class ProvinceResponse(BaseModel):
    id: str
    name: str
    description: str
    coordinates: list[list[float]]
    createdAt: str | None = None
