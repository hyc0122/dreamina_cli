"""CLI 多账号存储边界。

负责账号 profile 目录、默认账号、积分缓存、用户信息和登录状态字段的数据库维护。
"""

import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..jimeng_models import JimengCliAccount


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def create_cli_account(store: Any, label: str) -> JimengCliAccount:
    label = label.strip()
    if not label:
        raise ValueError("account label cannot be empty")
    account_id = _id("jimeng_account")
    profile_dir = cli_account_profile_dir(store, account_id)
    profile_dir.mkdir(parents=True, exist_ok=True)
    stamp = _now()
    with store._connect() as conn:
        existing_count = int(conn.execute("SELECT COUNT(*) AS count FROM cli_accounts").fetchone()["count"])
        is_default = existing_count == 0
        conn.execute(
            """
            INSERT INTO cli_accounts (
                id, label, profile_dir, status, is_default, created_at, updated_at
            )
            VALUES (?, ?, ?, 'unknown', ?, ?, ?)
            """,
            (account_id, label, str(profile_dir), int(is_default), stamp, stamp),
        )
    return get_cli_account(store, account_id)


def list_cli_accounts(store: Any) -> list[JimengCliAccount]:
    with store._connect() as conn:
        rows = conn.execute("SELECT * FROM cli_accounts ORDER BY is_default DESC, created_at ASC").fetchall()
    return [cli_account_from_row(row) for row in rows]


def get_cli_account(store: Any, account_id: str) -> JimengCliAccount:
    with store._connect() as conn:
        row = conn.execute("SELECT * FROM cli_accounts WHERE id = ?", (account_id,)).fetchone()
    if row is None:
        raise KeyError(f"Jimeng CLI account not found: {account_id}")
    return cli_account_from_row(row)


def update_cli_account(store: Any, account_id: str, **updates: Any) -> JimengCliAccount:
    allowed = {
        "label",
        "status",
        "total_credit",
        "user_id",
        "user_name",
        "vip_level",
        "vip_expire_at",
        "last_error",
    }
    values = {key: value for key, value in updates.items() if key in allowed}
    if values:
        if "label" in values:
            values["label"] = str(values["label"]).strip()
            if not values["label"]:
                raise ValueError("account label cannot be empty")
        values["updated_at"] = _now()
        assignments = ", ".join(f"{key} = ?" for key in values)
        with store._connect() as conn:
            conn.execute(f"UPDATE cli_accounts SET {assignments} WHERE id = ?", (*values.values(), account_id))
    return get_cli_account(store, account_id)


def set_default_cli_account(store: Any, account_id: str) -> JimengCliAccount:
    stamp = _now()
    get_cli_account(store, account_id)
    with store._connect() as conn:
        conn.execute("UPDATE cli_accounts SET is_default = 0, updated_at = ?", (stamp,))
        conn.execute("UPDATE cli_accounts SET is_default = 1, updated_at = ? WHERE id = ?", (stamp, account_id))
    return get_cli_account(store, account_id)


def delete_cli_account(store: Any, account_id: str) -> None:
    account = get_cli_account(store, account_id)
    with store._connect() as conn:
        conn.execute("DELETE FROM cli_accounts WHERE id = ?", (account_id,))
        default_count = int(conn.execute("SELECT COUNT(*) AS count FROM cli_accounts WHERE is_default = 1").fetchone()["count"])
        if default_count == 0:
            next_row = conn.execute("SELECT id FROM cli_accounts ORDER BY created_at ASC LIMIT 1").fetchone()
            if next_row is not None:
                conn.execute("UPDATE cli_accounts SET is_default = 1, updated_at = ? WHERE id = ?", (_now(), next_row["id"]))
    store._safe_rmtree(account.profile_dir)


def cli_account_profile_dir(store: Any, account_id: str) -> Path:
    if not account_id or ".." in account_id or any(ch in account_id for ch in '\\/:*?"<>|'):
        raise ValueError("account_id contains unsafe path characters")
    profile_dir = store.output_root / "jimeng" / "cli_profiles" / account_id
    store._assert_under_output_root(profile_dir)
    return profile_dir


def cli_account_from_row(row: sqlite3.Row) -> JimengCliAccount:
    return JimengCliAccount(
        id=row["id"],
        label=row["label"],
        profile_dir=row["profile_dir"],
        status=row["status"],
        total_credit=row["total_credit"],
        user_id=row["user_id"],
        user_name=row["user_name"],
        vip_level=row["vip_level"],
        vip_expire_at=row["vip_expire_at"],
        last_error=row["last_error"],
        is_default=bool(row["is_default"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
