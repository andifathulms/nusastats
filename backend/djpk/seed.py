"""Seed the ApbdAccount catalog from djpk.accounts (idempotent upsert)."""

from .accounts import ACCOUNTS
from .models import ApbdAccount


def seed_accounts():
    """Upsert the canonical chart of accounts. Returns count written."""
    rows = [
        ApbdAccount(akun_key=key, label_id=label, group=group, parent_key=parent, sort=i)
        for i, (key, label, group, parent) in enumerate(ACCOUNTS)
    ]
    ApbdAccount.objects.bulk_create(
        rows,
        update_conflicts=True,
        unique_fields=["akun_key"],
        update_fields=["label_id", "group", "parent_key", "sort"],
    )
    return len(rows)
