"""add feature events

Revision ID: 0003_feature_events
Revises: 0002_feature_validity_dates
Create Date: 2026-04-24
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_feature_events"
down_revision = "0002_feature_validity_dates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "feature_events",
        sa.Column("id", sa.String(length=120), nullable=False),
        sa.Column("feature_id", sa.String(length=120), nullable=False),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("payload_json", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["feature_id"], ["features.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_feature_events_feature_id", "feature_events", ["feature_id"])
    op.create_index("ix_feature_events_event_type", "feature_events", ["event_type"])
    op.create_index("ix_feature_events_start_date", "feature_events", ["start_date"])
    op.create_index("ix_feature_events_end_date", "feature_events", ["end_date"])
    op.create_index("ix_feature_events_deleted_at", "feature_events", ["deleted_at"])


def downgrade() -> None:
    op.drop_index("ix_feature_events_deleted_at", table_name="feature_events")
    op.drop_index("ix_feature_events_end_date", table_name="feature_events")
    op.drop_index("ix_feature_events_start_date", table_name="feature_events")
    op.drop_index("ix_feature_events_event_type", table_name="feature_events")
    op.drop_index("ix_feature_events_feature_id", table_name="feature_events")
    op.drop_table("feature_events")
