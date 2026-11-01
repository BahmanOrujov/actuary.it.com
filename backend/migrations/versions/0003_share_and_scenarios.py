"""Read-only share links and what-if scenarios on portfolios.

Revision ID: 0003
Revises: 0002
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("portfolios") as b:
        b.add_column(sa.Column("share_token_hash", sa.String(64), nullable=True))
        b.add_column(sa.Column("scenario_of", sa.Integer(), nullable=True))
        b.add_column(sa.Column("scenario_trades", sa.JSON(), nullable=True))
        b.create_unique_constraint("uq_portfolios_share_token_hash", ["share_token_hash"])
        b.create_foreign_key("fk_portfolios_scenario_of", "portfolios", ["scenario_of"], ["id"], ondelete="CASCADE")
        b.create_index("ix_portfolios_scenario_of", ["scenario_of"])


def downgrade() -> None:
    with op.batch_alter_table("portfolios") as b:
        b.drop_index("ix_portfolios_scenario_of")
        b.drop_constraint("fk_portfolios_scenario_of", type_="foreignkey")
        b.drop_constraint("uq_portfolios_share_token_hash", type_="unique")
        b.drop_column("scenario_trades")
        b.drop_column("scenario_of")
        b.drop_column("share_token_hash")
