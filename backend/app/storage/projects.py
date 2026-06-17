"""项目存储边界。

负责项目 CRUD、项目更新时间维护和项目行对象转换；不处理分镜、资产、队列或 CLI 登录逻辑。
"""

import shutil
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

from ..jimeng_models import JimengProject, JimengProjectStatus


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def create_project(store: Any, name: str, style: str = "", description: str = "", default_ratio: str = "9:16") -> JimengProject:
    store._validate_video_ratio(default_ratio)
    stamp = _now()
    project_id = _id("jimeng_project")
    with store._connect() as conn:
        conn.execute(
            """
            INSERT INTO projects (id, name, style, default_ratio, description, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (project_id, name, style, default_ratio, description, JimengProjectStatus.draft.value, stamp, stamp),
        )
    return store.get_project(project_id)


def update_project(store: Any, project_id: str, **updates: Any) -> JimengProject:
    allowed = {"name", "style", "description", "default_ratio", "prompt_preset_id", "status"}
    values = {key: value for key, value in updates.items() if key in allowed}
    if values:
        if "default_ratio" in values:
            store._validate_video_ratio(str(values["default_ratio"]))
        if isinstance(values.get("status"), JimengProjectStatus):
            values["status"] = values["status"].value
        values["updated_at"] = _now()
        assignments = ", ".join(f"{key} = ?" for key in values)
        with store._connect() as conn:
            row = conn.execute("SELECT id FROM projects WHERE id = ?", (project_id,)).fetchone()
            if row is None:
                raise KeyError(f"Jimeng project not found: {project_id}")
            conn.execute(f"UPDATE projects SET {assignments} WHERE id = ?", (*values.values(), project_id))
    return store.get_project(project_id)


def list_projects(store: Any) -> list[JimengProject]:
    with store._connect() as conn:
        rows = conn.execute("SELECT * FROM projects ORDER BY updated_at DESC").fetchall()
    return [project_from_row(store, row) for row in rows]


def get_project(store: Any, project_id: str) -> JimengProject:
    with store._connect() as conn:
        row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    if row is None:
        raise KeyError(f"Jimeng project not found: {project_id}")
    return project_from_row(store, row)


def delete_project(store: Any, project_id: str) -> None:
    project_root = store._safe_project_root(project_id)
    with store._connect() as conn:
        conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    shutil.rmtree(project_root, ignore_errors=True)


def touch_project(store: Any, conn: sqlite3.Connection, project_id: str, stamp: str) -> None:
    conn.execute("UPDATE projects SET updated_at = ? WHERE id = ?", (stamp, project_id))


def project_from_row(store: Any, row: sqlite3.Row) -> JimengProject:
    with store._connect() as conn:
        count_row = conn.execute(
            "SELECT COUNT(*) AS count FROM shots WHERE project_id = ?", (row["id"],)
        ).fetchone()
    return JimengProject(
        id=row["id"],
        name=row["name"],
        style=row["style"],
        default_ratio=row["default_ratio"],
        prompt_preset_id=row["prompt_preset_id"],
        description=row["description"],
        shot_count=int(count_row["count"]),
        status=JimengProjectStatus(row["status"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
