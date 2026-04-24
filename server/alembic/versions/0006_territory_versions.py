"""territory versions

Revision ID: 0006_territory_versions
Revises: 0005_normalize_category_labels
Create Date: 2026-04-24
"""
from alembic import op
import geoalchemy2
import sqlalchemy as sa

revision = "0006_territory_versions"
down_revision = "0005_normalize_category_labels"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "territories",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("kind", sa.String(length=80), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_territories_kind", "territories", ["kind"])
    op.create_index("ix_territories_deleted_at", "territories", ["deleted_at"])

    op.create_table(
        "territory_versions",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("territory_id", sa.String(length=120), sa.ForeignKey("territories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("geometry", geoalchemy2.Geometry(geometry_type="POLYGON", srid=4326, spatial_index=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_territory_versions_territory_id", "territory_versions", ["territory_id"])
    op.create_index("ix_territory_versions_valid_from", "territory_versions", ["valid_from"])
    op.create_index("ix_territory_versions_valid_to", "territory_versions", ["valid_to"])
    op.create_index("ix_territory_versions_deleted_at", "territory_versions", ["deleted_at"])

    connection = op.get_bind()
    connection.execute(
        sa.text(
            """
            INSERT INTO territories (id, name, kind, description, created_at, updated_at, deleted_at)
            SELECT
              replace(id, 'province-', 'territory-'),
              name,
              'thematic',
              description,
              created_at,
              updated_at,
              deleted_at
            FROM provinces
            """
        )
    )
    connection.execute(
        sa.text(
            """
            INSERT INTO territory_versions (id, territory_id, valid_from, valid_to, geometry, created_at, updated_at, deleted_at)
            SELECT
              replace(id, 'province-', 'territory-version-'),
              replace(id, 'province-', 'territory-'),
              DATE '0330-01-01',
              NULL,
              geometry,
              created_at,
              updated_at,
              deleted_at
            FROM provinces
            """
        )
    )


def downgrade() -> None:
    op.drop_table("territory_versions")
    op.drop_table("territories")
