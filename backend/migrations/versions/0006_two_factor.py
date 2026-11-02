"""Two-factor sign-in: TOTP secret, recovery codes and pending sign-in challenges.

Revision ID: 0006
Revises: 0005
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as b:
        b.add_column(sa.Column("totp_secret", sa.String(64), nullable=True))
        b.add_column(sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default="0"))
        b.add_column(sa.Column("totp_last_step", sa.Integer(), nullable=True))
        b.add_column(sa.Column("recovery_codes", sa.JSON(), nullable=True))
    op.create_table(
        "login_challenges",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_login_challenges_user_id", "login_challenges", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_login_challenges_user_id", "login_challenges")
    op.drop_table("login_challenges")
    with op.batch_alter_table("users") as b:
        b.drop_column("recovery_codes")
        b.drop_column("totp_last_step")
        b.drop_column("totp_enabled")
        b.drop_column("totp_secret")
