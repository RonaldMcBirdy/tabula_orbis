"""initial postgis schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-04-24
"""
from alembic import op
import geoalchemy2
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "atlas_sources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False, server_default="KMZ Atlas"),
        sa.Column("description_html", sa.Text(), nullable=False, server_default=""),
        sa.Column("imported_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_atlas_sources_checksum", "atlas_sources", ["checksum"], unique=True)

    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("default_visible", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("legend_style_key", sa.String(length=255), nullable=True),
    )
    op.create_index("ix_categories_slug", "categories", ["slug"], unique=True)

    op.create_table(
        "styles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("style_key", sa.String(length=255), nullable=False),
        sa.Column("icon_path", sa.String(length=512), nullable=True),
        sa.Column("scale", sa.Float(), nullable=False, server_default="1"),
        sa.Column("width", sa.Integer(), nullable=False, server_default="32"),
        sa.Column("height", sa.Integer(), nullable=False, server_default="32"),
        sa.Column("stroke_color", sa.String(length=16), nullable=True),
        sa.Column("fill_color", sa.String(length=16), nullable=True),
    )
    op.create_index("ix_styles_style_key", "styles", ["style_key"], unique=True)

    op.create_table(
        "features",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("source_id", sa.Integer(), sa.ForeignKey("atlas_sources.id"), nullable=True),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("style_id", sa.Integer(), sa.ForeignKey("styles.id"), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description_html", sa.Text(), nullable=False, server_default=""),
        sa.Column("geometry", geoalchemy2.Geometry(geometry_type="GEOMETRY", srid=4326, spatial_index=True), nullable=False),
        sa.Column("geometry_type", sa.String(length=40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_features_category_id", "features", ["category_id"])
    op.create_index("ix_features_geometry_type", "features", ["geometry_type"])
    op.create_index("ix_features_deleted_at", "features", ["deleted_at"])

    op.create_table(
        "feature_metadata",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("feature_id", sa.String(length=120), sa.ForeignKey("features.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key", sa.String(length=120), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.UniqueConstraint("feature_id", "key", name="uq_feature_metadata_key"),
    )
    op.create_index("ix_feature_metadata_feature_id", "feature_metadata", ["feature_id"])

    op.create_table(
        "provinces",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("geometry", geoalchemy2.Geometry(geometry_type="POLYGON", srid=4326, spatial_index=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_provinces_deleted_at", "provinces", ["deleted_at"])


def downgrade() -> None:
    op.drop_table("provinces")
    op.drop_table("feature_metadata")
    op.drop_table("features")
    op.drop_table("styles")
    op.drop_table("categories")
    op.drop_table("atlas_sources")
