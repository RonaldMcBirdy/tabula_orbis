"""add category hierarchy

Revision ID: 0004_category_hierarchy
Revises: 0003_feature_events
Create Date: 2026-04-24
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_category_hierarchy"
down_revision = "0003_feature_events"
branch_labels = None
depends_on = None

PARENTS = [
    ("settlements", "Settlements", 10),
    ("ecclesiastical", "Ecclesiastical", 20),
    ("fortifications", "Fortifications", 30),
    ("infrastructure", "Infrastructure", 40),
    ("rural-sites", "Rural Sites", 50),
]

MAPPING = {
    "metropoleis": "settlements",
    "cities": "settlements",
    "towns": "settlements",
    "episcopal": "ecclesiastical",
    "churches": "ecclesiastical",
    "fortresses": "fortifications",
    "castles": "fortifications",
    "bridges": "infrastructure",
    "roads-landmarks": "infrastructure",
    "farmsteads": "rural-sites",
}


def upgrade() -> None:
    op.add_column("categories", sa.Column("parent_id", sa.Integer(), nullable=True))
    op.create_index("ix_categories_parent_id", "categories", ["parent_id"])
    op.create_foreign_key("fk_categories_parent_id_categories", "categories", "categories", ["parent_id"], ["id"])

    connection = op.get_bind()
    for slug, label, order in PARENTS:
        connection.execute(
            sa.text(
                """
                INSERT INTO categories (slug, label, default_visible, display_order)
                VALUES (:slug, :label, true, :display_order)
                ON CONFLICT (slug) DO UPDATE
                SET label = EXCLUDED.label,
                    display_order = EXCLUDED.display_order
                """
            ),
            {"slug": slug, "label": label, "display_order": order},
        )

    for child_slug, parent_slug in MAPPING.items():
        connection.execute(
            sa.text(
                """
                UPDATE categories AS child
                SET parent_id = parent.id
                FROM categories AS parent
                WHERE child.slug = :child_slug
                  AND parent.slug = :parent_slug
                """
            ),
            {"child_slug": child_slug, "parent_slug": parent_slug},
        )

    connection.execute(sa.text("UPDATE categories SET label = 'Episcopal Sees' WHERE slug = 'episcopal'"))


def downgrade() -> None:
    connection = op.get_bind()
    connection.execute(sa.text("UPDATE categories SET parent_id = NULL"))
    for slug, _, _ in PARENTS:
        connection.execute(sa.text("DELETE FROM categories WHERE slug = :slug"), {"slug": slug})
    op.drop_constraint("fk_categories_parent_id_categories", "categories", type_="foreignkey")
    op.drop_index("ix_categories_parent_id", table_name="categories")
    op.drop_column("categories", "parent_id")
