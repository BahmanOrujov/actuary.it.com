"""Login security: account lockout columns; sessions are now stored as token hashes.

Revision ID: 0002
Revises: 0001
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as b:
        b.add_column(sa.Column("failed_logins", sa.Integer(), nullable=False, server_default="0"))
        b.add_column(sa.Column("lockout_count", sa.Integer(), nullable=False, server_default="0"))
        b.add_column(sa.Column("locked_until", sa.DateTime(), nullable=True))
    # existing rows hold raw tokens; they can no longer be matched, so everyone signs in again
    op.execute("DELETE FROM user_sessions")


def downgrade() -> None:
    op.execute("DELETE FROM user_sessions")
    with op.batch_alter_table("users") as b:
        b.drop_column("locked_until")
        b.drop_column("lockout_count")
        b.drop_column("failed_logins")
