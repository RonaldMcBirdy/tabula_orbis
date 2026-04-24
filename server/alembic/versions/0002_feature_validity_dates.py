"""add feature validity dates

Revision ID: 0002_feature_validity_dates
Revises: 0001_initial
Create Date: 2026-04-24
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_feature_validity_dates"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("features", sa.Column("valid_from", sa.Date(), nullable=True))
    op.add_column("features", sa.Column("valid_to", sa.Date(), nullable=True))
    op.create_index("ix_features_valid_from", "features", ["valid_from"])
    op.create_index("ix_features_valid_to", "features", ["valid_to"])

    op.execute(
        """
        UPDATE features AS f
        SET valid_from = fm.value::date
        FROM feature_metadata AS fm
        WHERE fm.feature_id = f.id
          AND fm.key = 'startDate'
          AND fm.value ~ '^\\d{4}-\\d{2}-\\d{2}$'
        """
    )
    op.execute(
        """
        UPDATE features AS f
        SET valid_to = fm.value::date
        FROM feature_metadata AS fm
        WHERE fm.feature_id = f.id
          AND fm.key = 'endDate'
          AND fm.value ~ '^\\d{4}-\\d{2}-\\d{2}$'
        """
    )
    op.execute("DELETE FROM feature_metadata WHERE key IN ('startDate', 'endDate')")


def downgrade() -> None:
    op.execute(
        """
        INSERT INTO feature_metadata (feature_id, key, value)
        SELECT id, 'startDate', valid_from::text
        FROM features
        WHERE valid_from IS NOT NULL
        ON CONFLICT ON CONSTRAINT uq_feature_metadata_key DO UPDATE
        SET value = EXCLUDED.value
        """
    )
    op.execute(
        """
        INSERT INTO feature_metadata (feature_id, key, value)
        SELECT id, 'endDate', valid_to::text
        FROM features
        WHERE valid_to IS NOT NULL
        ON CONFLICT ON CONSTRAINT uq_feature_metadata_key DO UPDATE
        SET value = EXCLUDED.value
        """
    )
    op.drop_index("ix_features_valid_to", table_name="features")
    op.drop_index("ix_features_valid_from", table_name="features")
    op.drop_column("features", "valid_to")
    op.drop_column("features", "valid_from")
