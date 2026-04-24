from datetime import date, datetime
from uuid import uuid4

from geoalchemy2 import Geometry
from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from server.app.db import Base


def uuid_string() -> str:
    return str(uuid4())


class AtlasSource(Base):
    __tablename__ = "atlas_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="KMZ Atlas")
    description_html: Mapped[str] = mapped_column(Text, nullable=False, default="")
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    features: Mapped[list["Feature"]] = relationship(back_populates="source")


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True, index=True)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    default_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    legend_style_key: Mapped[str | None] = mapped_column(String(255), nullable=True)

    parent: Mapped["Category | None"] = relationship(remote_side=[id], back_populates="children")
    children: Mapped[list["Category"]] = relationship(back_populates="parent")
    features: Mapped[list["Feature"]] = relationship(back_populates="category")


class Style(Base):
    __tablename__ = "styles"

    id: Mapped[int] = mapped_column(primary_key=True)
    style_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    icon_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    scale: Mapped[float] = mapped_column(Float, nullable=False, default=1)
    width: Mapped[int] = mapped_column(Integer, nullable=False, default=32)
    height: Mapped[int] = mapped_column(Integer, nullable=False, default=32)
    stroke_color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    fill_color: Mapped[str | None] = mapped_column(String(16), nullable=True)

    features: Mapped[list["Feature"]] = relationship(back_populates="style")


class Feature(Base):
    __tablename__ = "features"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    source_id: Mapped[int | None] = mapped_column(ForeignKey("atlas_sources.id"), nullable=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False, index=True)
    style_id: Mapped[int | None] = mapped_column(ForeignKey("styles.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description_html: Mapped[str] = mapped_column(Text, nullable=False, default="")
    valid_from: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    geometry = mapped_column(Geometry(geometry_type="GEOMETRY", srid=4326, spatial_index=True), nullable=False)
    geometry_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    source: Mapped[AtlasSource | None] = relationship(back_populates="features")
    category: Mapped[Category] = relationship(back_populates="features")
    style: Mapped[Style | None] = relationship(back_populates="features")
    metadata_entries: Mapped[list["FeatureMetadata"]] = relationship(
        back_populates="feature",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    events: Mapped[list["FeatureEvent"]] = relationship(
        back_populates="feature",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="FeatureEvent.start_date",
    )


class FeatureEvent(Base):
    __tablename__ = "feature_events"

    id: Mapped[str] = mapped_column(String(120), primary_key=True, default=uuid_string)
    feature_id: Mapped[str] = mapped_column(ForeignKey("features.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    feature: Mapped[Feature] = relationship(back_populates="events")


class FeatureMetadata(Base):
    __tablename__ = "feature_metadata"
    __table_args__ = (UniqueConstraint("feature_id", "key", name="uq_feature_metadata_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    feature_id: Mapped[str] = mapped_column(ForeignKey("features.id", ondelete="CASCADE"), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(120), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)

    feature: Mapped[Feature] = relationship(back_populates="metadata_entries")


class Province(Base):
    __tablename__ = "provinces"

    id: Mapped[str] = mapped_column(String(120), primary_key=True, default=uuid_string)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    geometry = mapped_column(Geometry(geometry_type="POLYGON", srid=4326, spatial_index=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
