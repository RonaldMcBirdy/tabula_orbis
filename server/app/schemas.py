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
    parentId: str | None = None
    parentLabel: str | None = None
    displayOrder: int = 0
    isGroup: bool = False


class CategoryCreate(BaseModel):
    id: str | None = None
    label: str
    parentId: str | None = None
    defaultVisible: bool = True
    displayOrder: int = 999
    legendIcon: str | None = None


class CategoryUpdate(BaseModel):
    label: str | None = None
    parentId: str | None = None
    defaultVisible: bool | None = None
    displayOrder: int | None = None
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


class FeatureSnapshotResponse(BaseModel):
    featureId: str
    atDate: str
    name: str
    population: dict[str, Any] | None = None
    theoPoliticalStatus: str | None = None
    thematicAdmin: dict[str, Any] | None = None
    politicalState: dict[str, Any] | None = None
    sources: list[dict[str, Any]] = Field(default_factory=list)
    appliedEvents: list[FeatureEventResponse] = Field(default_factory=list)


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


class TerritoryVersionCreate(BaseModel):
    name: str
    kind: str = "thematic"
    description: str = ""
    validFrom: str
    validTo: str | None = None
    coordinates: list[list[float]]


class TerritoryVersionUpdate(BaseModel):
    name: str | None = None
    kind: str | None = None
    description: str | None = None
    validFrom: str | None = None
    validTo: str | None = None
    coordinates: list[list[float]] | None = None


class TerritoryVersionResponse(BaseModel):
    id: str
    territoryId: str
    name: str
    kind: str
    description: str
    validFrom: str
    validTo: str | None = None
    coordinates: list[list[float]]
    createdAt: str | None = None
