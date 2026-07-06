"""分镜存储边界。

负责分镜 CRUD、批量删除、移动顺序和分镜序号重排；不处理资产文件上传或队列执行。
"""

import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

from ..jimeng_models import JimengShot, JimengShotStatus
from . import projects as project_storage


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def create_shot(store: Any, project_id: str, prompt: str) -> JimengShot:
    stamp = _now()
    shot_id = _id("jimeng_shot")
    with store._connect() as conn:
        index = next_shot_index(conn, project_id)
        conn.execute(
            """
            INSERT INTO shots (id, project_id, shot_index, prompt, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (shot_id, project_id, index, prompt, JimengShotStatus.draft.value, stamp, stamp),
        )
        project_storage.touch_project(store, conn, project_id, stamp)
    return store.get_shot(shot_id)


def get_shot(store: Any, project_id: str, shot_id: str | None = None) -> JimengShot:
    if shot_id is None:
        shot_id = project_id
        project_id = ""
    with store._connect() as conn:
        row = conn.execute("SELECT * FROM shots WHERE id = ?", (shot_id,)).fetchone()
    if row is None:
        raise KeyError(f"Jimeng shot not found: {shot_id}")
    shot = shot_from_row(row)
    if project_id and shot.project_id != project_id:
        raise ValueError("shot does not belong to project")
    return shot


def list_shots(store: Any, project_id: str) -> list[JimengShot]:
    with store._connect() as conn:
        rows = conn.execute(
            "SELECT * FROM shots WHERE project_id = ? ORDER BY shot_index ASC", (project_id,)
        ).fetchall()
    return [shot_from_row(row) for row in rows]


def list_shots_by_ids(store: Any, project_id: str, shot_ids: list[str]) -> list[JimengShot]:
    ordered_ids = list(dict.fromkeys(shot_id for shot_id in shot_ids if shot_id))
    if not ordered_ids:
        return []
    placeholders = ", ".join("?" for _ in ordered_ids)
    with store._connect() as conn:
        store._validate_project_membership(conn, project_id=project_id)
        rows = conn.execute(
            f"SELECT * FROM shots WHERE project_id = ? AND id IN ({placeholders})",
            (project_id, *ordered_ids),
        ).fetchall()
    shots_by_id = {row["id"]: shot_from_row(row) for row in rows}
    missing = [shot_id for shot_id in ordered_ids if shot_id not in shots_by_id]
    if missing:
        raise ValueError("selected shot does not belong to project")
    return [shots_by_id[shot_id] for shot_id in ordered_ids]


def update_shot(store: Any, shot_id: str, **updates: Any) -> JimengShot:
    allowed = {
        "prompt",
        "default_duration",
        "status",
        "default_video_candidate_id",
        "locked_video_candidate_id",
        "last_error",
    }
    values = {key: value for key, value in updates.items() if key in allowed}
    if values:
        if isinstance(values.get("status"), JimengShotStatus):
            values["status"] = values["status"].value
        values["updated_at"] = _now()
        assignments = ", ".join(f"{key} = ?" for key in values)
        with store._connect() as conn:
            conn.execute(
                f"UPDATE shots SET {assignments} WHERE id = ?",
                (*values.values(), shot_id),
            )
            row = conn.execute("SELECT project_id FROM shots WHERE id = ?", (shot_id,)).fetchone()
            if row:
                project_storage.touch_project(store, conn, row["project_id"], values["updated_at"])
    return store.get_shot(shot_id)


def delete_shot(store: Any, project_id: str, shot_id: str) -> None:
    stamp = _now()
    with store._connect() as conn:
        conn.execute("DELETE FROM shots WHERE project_id = ? AND id = ?", (project_id, shot_id))
        normalize_shot_indexes(conn, project_id)
        project_storage.touch_project(store, conn, project_id, stamp)


def delete_shots(store: Any, project_id: str, shot_ids: list[str]) -> list[str]:
    unique_ids = [shot_id for index, shot_id in enumerate(shot_ids) if shot_id and shot_id not in shot_ids[:index]]
    if not unique_ids:
        return []
    stamp = _now()
    placeholders = ", ".join("?" for _ in unique_ids)
    with store._connect() as conn:
        store._validate_project_membership(conn, project_id=project_id)
        rows = conn.execute(
            f"SELECT id FROM shots WHERE project_id = ? AND id IN ({placeholders})",
            (project_id, *unique_ids),
        ).fetchall()
        found_ids = {row["id"] for row in rows}
        missing_ids = [shot_id for shot_id in unique_ids if shot_id not in found_ids]
        if missing_ids:
            raise KeyError(f"Jimeng shot not found: {missing_ids[0]}")
        conn.execute(
            f"DELETE FROM shots WHERE project_id = ? AND id IN ({placeholders})",
            (project_id, *unique_ids),
        )
        normalize_shot_indexes(conn, project_id)
        project_storage.touch_project(store, conn, project_id, stamp)
    return unique_ids


def move_shot(store: Any, project_id: str, shot_id: str, direction: str) -> JimengShot:
    if direction not in {"up", "down"}:
        raise ValueError("direction must be 'up' or 'down'")
    stamp = _now()
    with store._connect() as conn:
        row = conn.execute(
            "SELECT * FROM shots WHERE project_id = ? AND id = ?", (project_id, shot_id)
        ).fetchone()
        if row is None:
            raise KeyError(f"Jimeng shot not found: {shot_id}")
        operator = "<" if direction == "up" else ">"
        order = "DESC" if direction == "up" else "ASC"
        target = conn.execute(
            f"""
            SELECT * FROM shots
            WHERE project_id = ? AND shot_index {operator} ?
            ORDER BY shot_index {order}
            LIMIT 1
            """,
            (project_id, row["shot_index"]),
        ).fetchone()
        if target is not None:
            conn.execute("UPDATE shots SET shot_index = ?, updated_at = ? WHERE id = ?", (target["shot_index"], stamp, row["id"]))
            conn.execute("UPDATE shots SET shot_index = ?, updated_at = ? WHERE id = ?", (row["shot_index"], stamp, target["id"]))
            normalize_shot_indexes(conn, project_id)
            project_storage.touch_project(store, conn, project_id, stamp)
    return store.get_shot(project_id, shot_id)


def next_shot_index(conn: sqlite3.Connection, project_id: str) -> int:
    row = conn.execute(
        "SELECT COALESCE(MAX(shot_index), 0) + 1 AS next_index FROM shots WHERE project_id = ?",
        (project_id,),
    ).fetchone()
    return int(row["next_index"])


def normalize_shot_indexes(conn: sqlite3.Connection, project_id: str) -> None:
    rows = conn.execute(
        "SELECT id FROM shots WHERE project_id = ? ORDER BY shot_index ASC", (project_id,)
    ).fetchall()
    stamp = _now()
    for index, row in enumerate(rows, start=1):
        conn.execute(
            "UPDATE shots SET shot_index = ?, updated_at = ? WHERE id = ?",
            (index, stamp, row["id"]),
        )


def shot_from_row(row: sqlite3.Row) -> JimengShot:
    return JimengShot(
        id=row["id"],
        project_id=row["project_id"],
        shot_index=row["shot_index"],
        prompt=row["prompt"],
        default_duration=row["default_duration"],
        status=JimengShotStatus(row["status"]),
        default_video_candidate_id=row["default_video_candidate_id"],
        locked_video_candidate_id=row["locked_video_candidate_id"],
        last_error=row["last_error"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
