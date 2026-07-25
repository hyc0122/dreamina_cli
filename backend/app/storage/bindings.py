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


def create_bindings_bulk(
    store: Any,
    project_id: str,
    bindings: list[dict[str, Any]],
) -> list[JimengAssetBinding]:
    if not bindings:
        return []

    stamp = _now()
    normalized: list[dict[str, Any]] = []
    shot_ids = list(dict.fromkeys(str(item["shot_id"]) for item in bindings))
    asset_ids = list(dict.fromkeys(str(item["asset_id"]) for item in bindings))
    conn = store._connect()
    try:
        with conn:
            store._validate_project_membership(conn, project_id=project_id)

            # 一次校验当前批次的分镜和资产，避免每个绑定重复打开 SQLite 连接。
            shot_placeholders = ", ".join("?" for _ in shot_ids)
            known_shots = {
                row["id"]
                for row in conn.execute(
                    f"SELECT id FROM shots WHERE project_id = ? AND id IN ({shot_placeholders})",
                    (project_id, *shot_ids),
                ).fetchall()
            }
            if len(known_shots) != len(shot_ids):
                raise ValueError("selected shot does not belong to project")

            asset_placeholders = ", ".join("?" for _ in asset_ids)
            asset_types = {
                row["id"]: row["type"]
                for row in conn.execute(
                    f"SELECT id, type FROM assets WHERE project_id = ? AND id IN ({asset_placeholders})",
                    (project_id, *asset_ids),
                ).fetchall()
            }
            if len(asset_types) != len(asset_ids):
                raise ValueError("selected asset does not belong to project")

            next_orders = {
                row["shot_id"]: int(row["next_order"])
                for row in conn.execute(
                    f"""
                    SELECT shot_id, COALESCE(MAX(slot_order), 0) + 1 AS next_order
                    FROM asset_bindings
                    WHERE project_id = ? AND shot_id IN ({shot_placeholders})
                    GROUP BY shot_id
                    """,
                    (project_id, *shot_ids),
                ).fetchall()
            }

            for item in bindings:
                shot_id = str(item["shot_id"])
                asset_id = str(item["asset_id"])
                asset_type = JimengAssetType(item["asset_type"])
                if asset_types[asset_id] != asset_type.value:
                    raise ValueError("asset type does not match asset")

                slot_order = item.get("slot_order")
                if slot_order is None:
                    slot_order = next_orders.get(shot_id, 1)
                    next_orders[shot_id] = int(slot_order) + 1

                normalized.append(
                    {
                        "id": _id("jimeng_binding"),
                        "shot_id": shot_id,
                        "asset_id": asset_id,
                        "asset_type": asset_type,
                        "source": str(item.get("source") or "auto"),
                        "locked": bool(item.get("locked", False)),
                        "voice_enabled": bool(item.get("voice_enabled", True)),
                        "slot_order": int(slot_order),
                    }
                )

            # 当前五条分镜的所有新绑定在同一个事务中写入。
            conn.executemany(
                """
                INSERT INTO asset_bindings (
                    id, project_id, shot_id, asset_id, asset_type, source, locked,
                    voice_enabled, slot_order, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        item["id"],
                        project_id,
                        item["shot_id"],
                        item["asset_id"],
                        item["asset_type"].value,
                        item["source"],
                        int(item["locked"]),
                        int(item["voice_enabled"]),
                        item["slot_order"],
                        stamp,
                        stamp,
                    )
                    for item in normalized
                ],
            )
    finally:
        # sqlite3.Connection 的 with 只提交事务，不会关闭连接，必须显式关闭。
        conn.close()

    return [
        JimengAssetBinding(
            id=item["id"],
            project_id=project_id,
            shot_id=item["shot_id"],
            asset_id=item["asset_id"],
            asset_type=item["asset_type"],
            source=item["source"],
            locked=item["locked"],
            voice_enabled=item["voice_enabled"],
            slot_order=item["slot_order"],
            created_at=stamp,
            updated_at=stamp,
        )
        for item in normalized
    ]


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


def list_bindings_for_shots(
    store: Any,
    project_id: str,
    shot_ids: list[str] | None = None,
) -> dict[str, list[JimengAssetBinding]]:
    ordered_ids = list(dict.fromkeys(shot_id for shot_id in (shot_ids or []) if shot_id))
    conn = store._connect()
    try:
        with conn:
            store._validate_project_membership(conn, project_id=project_id)
            if ordered_ids:
                placeholders = ", ".join("?" for _ in ordered_ids)
                rows = conn.execute(
                    f"""
                    SELECT * FROM asset_bindings
                    WHERE project_id = ? AND shot_id IN ({placeholders})
                    ORDER BY shot_id ASC, slot_order ASC
                    """,
                    (project_id, *ordered_ids),
                ).fetchall()
                known_rows = conn.execute(
                    f"SELECT id FROM shots WHERE project_id = ? AND id IN ({placeholders})",
                    (project_id, *ordered_ids),
                ).fetchall()
                known_ids = {row["id"] for row in known_rows}
                missing_ids = [shot_id for shot_id in ordered_ids if shot_id not in known_ids]
                if missing_ids:
                    raise ValueError("selected shot does not belong to project")
                result = {shot_id: [] for shot_id in ordered_ids}
            else:
                rows = conn.execute(
                    """
                    SELECT * FROM asset_bindings
                    WHERE project_id = ?
                    ORDER BY shot_id ASC, slot_order ASC
                    """,
                    (project_id,),
                ).fetchall()
                result = {}
    finally:
        conn.close()
    for row in rows:
        binding = binding_from_row(row)
        result.setdefault(binding.shot_id, []).append(binding)
    return result


def delete_auto_bindings_for_shots(
    store: Any,
    project_id: str,
    shot_ids: list[str],
) -> dict[str, list[str]]:
    ordered_ids = list(dict.fromkeys(shot_id for shot_id in shot_ids if shot_id))
    if not ordered_ids:
        return {}

    placeholders = ", ".join("?" for _ in ordered_ids)
    conn = store._connect()
    try:
        with conn:
            store._validate_project_membership(conn, project_id=project_id)
            known_ids = {
                row["id"]
                for row in conn.execute(
                    f"SELECT id FROM shots WHERE project_id = ? AND id IN ({placeholders})",
                    (project_id, *ordered_ids),
                ).fetchall()
            }
            if len(known_ids) != len(ordered_ids):
                raise ValueError("selected shot does not belong to project")

            rows = conn.execute(
                f"""
                SELECT id, shot_id FROM asset_bindings
                WHERE project_id = ? AND shot_id IN ({placeholders}) AND source = 'auto'
                """,
                (project_id, *ordered_ids),
            ).fetchall()
            conn.execute(
                f"""
                DELETE FROM asset_bindings
                WHERE project_id = ? AND shot_id IN ({placeholders}) AND source = 'auto'
                """,
                (project_id, *ordered_ids),
            )
    finally:
        conn.close()

    deleted = {shot_id: [] for shot_id in ordered_ids}
    for row in rows:
        deleted[row["shot_id"]].append(row["id"])
    return deleted


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
