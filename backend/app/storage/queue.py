"""队列存储边界。

负责即梦生成队列的创建、查询、状态更新、位置重排、资产快照和异常退出后的恢复。
"""

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

from ..jimeng_models import JimengAssetType, JimengQueueItem, JimengQueueStatus, JimengShotStatus


_ASSET_DIRS = {
    JimengAssetType.character: "characters",
    JimengAssetType.scene: "scenes",
    JimengAssetType.prop: "props",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _loads(value: str | None, fallback: Any) -> Any:
    if value in (None, ""):
        return fallback
    return json.loads(value)


def create_queue_item(
    store: Any,
    project_id: str,
    shot_id: str,
    prefix_prompt: str = "",
    final_prompt: str | None = None,
    final_prompt_snapshot: str | None = None,
    asset_snapshot: dict[str, Any] | None = None,
    prompt_preset_id: str | None = None,
    cli_command: str = "",
    poll_seconds: int = 30,
    download_dir: str = "",
) -> JimengQueueItem:
    shot = store.get_shot(shot_id)
    if shot.project_id != project_id:
        raise ValueError("shot does not belong to project")
    if final_prompt_snapshot is not None:
        final_prompt = final_prompt_snapshot
    final_prompt = final_prompt if final_prompt is not None else f"{prefix_prompt}{shot.prompt}"
    stamp = _now()
    item_id = _id("jimeng_queue")
    with store._connect() as conn:
        row = conn.execute("SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM queue_items").fetchone()
        position = int(row["next_position"])
        resolved_asset_snapshot = asset_snapshot_for_shot(conn, shot_id)
        if asset_snapshot is not None:
            resolved_asset_snapshot.update(asset_snapshot)

        conn.execute(
            """
            INSERT INTO queue_items (
                id, project_id, shot_id, status, position, prompt_snapshot,
                prompt_preset_id, prefix_prompt_snapshot, final_prompt_snapshot,
                asset_snapshot, cli_command, poll_seconds, download_dir,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item_id,
                project_id,
                shot_id,
                JimengQueueStatus.waiting.value,
                position,
                shot.prompt,
                prompt_preset_id,
                prefix_prompt,
                final_prompt,
                _json(resolved_asset_snapshot),
                cli_command,
                poll_seconds,
                download_dir,
                stamp,
                stamp,
            ),
        )
        conn.execute(
            "UPDATE shots SET status = ?, updated_at = ? WHERE id = ?",
            (JimengShotStatus.queued.value, stamp, shot_id),
        )
    return get_queue_item(store, item_id)


def get_queue_item(store: Any, item_id: str) -> JimengQueueItem:
    with store._connect() as conn:
        row = conn.execute("SELECT * FROM queue_items WHERE id = ?", (item_id,)).fetchone()
    if row is None:
        raise KeyError(f"Jimeng queue item not found: {item_id}")
    return queue_item_from_row(row)


def list_queue(store: Any, project_id: str | None = None) -> list[JimengQueueItem]:
    with store._connect() as conn:
        if project_id is None:
            rows = conn.execute(
                "SELECT * FROM queue_items ORDER BY position ASC, created_at ASC, id ASC"
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT * FROM queue_items
                WHERE project_id = ?
                ORDER BY position ASC, created_at ASC, id ASC
                """,
                (project_id,),
            ).fetchall()
    return [queue_item_from_row(row) for row in rows]


def next_waiting_item(store: Any) -> JimengQueueItem | None:
    with store._connect() as conn:
        row = conn.execute(
            """
            SELECT * FROM queue_items
            WHERE status = ?
            ORDER BY position ASC, created_at ASC, id ASC
            LIMIT 1
            """,
            (JimengQueueStatus.waiting.value,),
        ).fetchone()
    return queue_item_from_row(row) if row else None


def running_queue_item(store: Any) -> JimengQueueItem | None:
    with store._connect() as conn:
        row = conn.execute(
            """
            SELECT * FROM queue_items
            WHERE status IN (?, ?)
            ORDER BY submitted_at ASC, position ASC, created_at ASC, id ASC
            LIMIT 1
            """,
            (JimengQueueStatus.running.value, JimengQueueStatus.polling.value),
        ).fetchone()
    return queue_item_from_row(row) if row else None


def count_queue(store: Any, status: JimengQueueStatus | str | None = None) -> int:
    with store._connect() as conn:
        if status is None:
            row = conn.execute("SELECT COUNT(*) AS count FROM queue_items").fetchone()
        else:
            queue_status = JimengQueueStatus(status).value
            row = conn.execute(
                "SELECT COUNT(*) AS count FROM queue_items WHERE status = ?",
                (queue_status,),
            ).fetchone()
    return int(row["count"])


def update_queue_item(store: Any, item_id: str, **updates: Any) -> JimengQueueItem:
    allowed = {
        "status",
        "position",
        "prompt_preset_id",
        "cli_command",
        "poll_seconds",
        "download_dir",
        "submit_id",
        "gen_status",
        "result_url",
        "local_video_path",
        "cli_raw_output",
        "error_message",
        "submitted_at",
        "finished_at",
    }
    values = {key: value for key, value in updates.items() if key in allowed}
    if values:
        if isinstance(values.get("status"), JimengQueueStatus):
            values["status"] = values["status"].value
        values["updated_at"] = _now()
        assignments = ", ".join(f"{key} = ?" for key in values)
        with store._connect() as conn:
            conn.execute(f"UPDATE queue_items SET {assignments} WHERE id = ?", (*values.values(), item_id))
            if "position" in values:
                row = conn.execute("SELECT project_id FROM queue_items WHERE id = ?", (item_id,)).fetchone()
                if row:
                    normalize_queue_positions(conn, row["project_id"])
    return get_queue_item(store, item_id)


def recover_interrupted_queue_items(store: Any) -> dict[str, list[str]]:
    recovered = {"polling": [], "orphaned": []}
    for item in list_queue(store):
        if item.status != JimengQueueStatus.running:
            continue
        if item.submit_id:
            update_queue_item(
                store,
                item.id,
                status=JimengQueueStatus.polling,
                error_message=None,
            )
            recovered["polling"].append(item.id)
            continue
        update_queue_item(
            store,
            item.id,
            status=JimengQueueStatus.orphaned,
            error_message="程序上次关闭时任务尚未提交成功，请确认即梦后台后手动重试。",
        )
        recovered["orphaned"].append(item.id)
    return recovered


def normalize_queue_positions(conn: sqlite3.Connection, project_id: str) -> None:
    rows = conn.execute(
        """
        SELECT id FROM queue_items
        WHERE project_id = ?
        ORDER BY position ASC, created_at ASC, id ASC
        """,
        (project_id,),
    ).fetchall()
    stamp = _now()
    for position, row in enumerate(rows, start=1):
        conn.execute(
            "UPDATE queue_items SET position = ?, updated_at = ? WHERE id = ?",
            (position, stamp, row["id"]),
        )


def asset_snapshot_for_shot(conn: sqlite3.Connection, shot_id: str) -> dict[str, list[dict[str, Any]]]:
    snapshot: dict[str, list[dict[str, Any]]] = {"characters": [], "scenes": [], "props": []}
    rows = conn.execute(
        """
        SELECT a.*, b.voice_enabled FROM asset_bindings b
        JOIN assets a ON a.id = b.asset_id
        WHERE b.shot_id = ?
        ORDER BY b.slot_order ASC
        """,
        (shot_id,),
    ).fetchall()
    for row in rows:
        key = _ASSET_DIRS[JimengAssetType(row["type"])]
        snapshot[key].append(
            {
                "id": row["id"],
                "name": row["name"],
                "image_path": row["image_path"],
                "audio_path": row["audio_path"] if bool(row["voice_enabled"]) else None,
                "voice_enabled": bool(row["voice_enabled"]),
            }
        )
    return snapshot


def queue_item_from_row(row: sqlite3.Row) -> JimengQueueItem:
    return JimengQueueItem(
        id=row["id"],
        project_id=row["project_id"],
        shot_id=row["shot_id"],
        status=JimengQueueStatus(row["status"]),
        position=row["position"],
        prompt_snapshot=row["prompt_snapshot"],
        prompt_preset_id=row["prompt_preset_id"],
        prefix_prompt_snapshot=row["prefix_prompt_snapshot"],
        final_prompt_snapshot=row["final_prompt_snapshot"],
        asset_snapshot=_loads(row["asset_snapshot"], {}),
        cli_command=row["cli_command"],
        poll_seconds=row["poll_seconds"],
        download_dir=row["download_dir"],
        submit_id=row["submit_id"],
        gen_status=row["gen_status"],
        result_url=row["result_url"],
        local_video_path=row["local_video_path"],
        cli_raw_output=row["cli_raw_output"],
        error_message=row["error_message"],
        submitted_at=row["submitted_at"],
        finished_at=row["finished_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
