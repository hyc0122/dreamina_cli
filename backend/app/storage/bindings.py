"""绑定存储边界：分镜与资产的绑定、解绑和排序。"""

import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

from ..jimeng_models import JimengAssetBinding, JimengAssetType


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def create_binding(
    store: Any,
    project_id: str,
    shot_id: str,
    asset_id: str,
    asset_type: JimengAssetType | str,
    source: str,
    locked: bool = False,
    slot_order: int | None = None,
) -> JimengAssetBinding:
    stamp = _now()
    asset_type = JimengAssetType(asset_type)
    with store._connect() as conn:
        store._validate_project_membership(conn, project_id=project_id, shot_id=shot_id, asset_id=asset_id)
        asset_row = conn.execute("SELECT type FROM assets WHERE id = ?", (asset_id,)).fetchone()
        if asset_row is None:
            raise KeyError(f"Jimeng asset not found: {asset_id}")
        if asset_row["type"] != asset_type.value:
            raise ValueError("asset type does not match asset")
        if slot_order is None:
            row = conn.execute(
                "SELECT COALESCE(MAX(slot_order), 0) + 1 AS next_order FROM asset_bindings WHERE shot_id = ?",
                (shot_id,),
            ).fetchone()
            slot_order = int(row["next_order"])
        binding_id = _id("jimeng_binding")
        conn.execute(
            """
            INSERT INTO asset_bindings (
                id, project_id, shot_id, asset_id, asset_type, source, locked,
                voice_enabled, slot_order, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                binding_id,
                project_id,
                shot_id,
                asset_id,
                asset_type.value,
                source,
                int(locked),
                1,
                slot_order,
                stamp,
                stamp,
            ),
        )
    return get_binding(store, binding_id)


def list_bindings(store: Any, project_id: str, shot_id: str | None = None) -> list[JimengAssetBinding]:
    if shot_id is None:
        shot_id = project_id
        project_id = ""
    with store._connect() as conn:
        if project_id:
            store._validate_project_membership(conn, project_id=project_id, shot_id=shot_id)
            rows = conn.execute(
                """
                SELECT * FROM asset_bindings
                WHERE project_id = ? AND shot_id = ?
                ORDER BY slot_order ASC
                """,
                (project_id, shot_id),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM asset_bindings WHERE shot_id = ? ORDER BY slot_order ASC", (shot_id,)
            ).fetchall()
    return [binding_from_row(row) for row in rows]


def update_binding(store: Any, binding_id: str, **updates: Any) -> JimengAssetBinding:
    allowed = {"locked", "voice_enabled", "slot_order"}
    values = {key: value for key, value in updates.items() if key in allowed}
    if values:
        if "locked" in values:
            values["locked"] = int(bool(values["locked"]))
        if "voice_enabled" in values:
            values["voice_enabled"] = int(bool(values["voice_enabled"]))
        values["updated_at"] = _now()
        assignments = ", ".join(f"{key} = ?" for key in values)
        with store._connect() as conn:
            row = conn.execute("SELECT id FROM asset_bindings WHERE id = ?", (binding_id,)).fetchone()
            if row is None:
                raise KeyError(f"Jimeng binding not found: {binding_id}")
            conn.execute(f"UPDATE asset_bindings SET {assignments} WHERE id = ?", (*values.values(), binding_id))
    return get_binding(store, binding_id)


def delete_binding(store: Any, binding_id: str) -> None:
    with store._connect() as conn:
        conn.execute("DELETE FROM asset_bindings WHERE id = ?", (binding_id,))


def binding_from_row(row: sqlite3.Row) -> JimengAssetBinding:
    return JimengAssetBinding(
        id=row["id"],
        project_id=row["project_id"],
        shot_id=row["shot_id"],
        asset_id=row["asset_id"],
        asset_type=JimengAssetType(row["asset_type"]),
        source=row["source"],
        locked=bool(row["locked"]),
        voice_enabled=bool(row["voice_enabled"]),
        slot_order=row["slot_order"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def get_binding(store: Any, binding_id: str) -> JimengAssetBinding:
    with store._connect() as conn:
        row = conn.execute("SELECT * FROM asset_bindings WHERE id = ?", (binding_id,)).fetchone()
    if row is None:
        raise KeyError(f"Jimeng binding not found: {binding_id}")
    return binding_from_row(row)
