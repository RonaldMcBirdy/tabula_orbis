"""normalize category labels

Revision ID: 0005_normalize_category_labels
Revises: 0004_category_hierarchy
Create Date: 2026-04-24
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_normalize_category_labels"
down_revision = "0004_category_hierarchy"
branch_labels = None
depends_on = None

LABELS = {
    "bridges": "Bridges",
    "castles": "Castles",
    "churches": "Churches",
    "cities": "Cities",
    "episcopal": "Episcopal Sees",
    "farmsteads": "Farmsteads",
    "fortresses": "Fortresses",
    "metropoleis": "Metropoleis",
    "roads-landmarks": "Roads & Landmarks",
    "towns": "Towns",
}


def upgrade() -> None:
    connection = op.get_bind()
    for slug, label in LABELS.items():
        connection.execute(
            sa.text("UPDATE categories SET label = :label WHERE slug = :slug"),
            {"slug": slug, "label": label},
        )


def downgrade() -> None:
    pass
