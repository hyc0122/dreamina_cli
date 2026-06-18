"""候选视频存储边界：候选视频创建、默认、锁定、上传和下载元数据。"""

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..jimeng_models import JimengQueueStatus, JimengShotStatus, JimengVideoCandidate


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def create_video_candidate(
    store: Any,
    project_id: str,
    shot_id: str,
    queue_item_id: str,
    video_filename: str,
    video_path: str,
    thumbnail_path: str | None = None,
    duration: int | None = None,
    ratio: str | None = None,
    resolution: str | None = None,
    source_url: str | None = None,
    is_default: bool = False,
    is_locked: bool = False,
) -> JimengVideoCandidate:
    candidate_id = _id("jimeng_video")
    stamp = _now()
    with store._connect() as conn:
        store._validate_project_membership(
            conn,
            project_id=project_id,
            shot_id=shot_id,
            queue_item_id=queue_item_id,
        )
        if is_default:
            conn.execute("UPDATE video_candidates SET is_default = 0 WHERE shot_id = ?", (shot_id,))
        if is_locked:
            conn.execute("UPDATE video_candidates SET is_locked = 0 WHERE shot_id = ?", (shot_id,))
        conn.execute(
            """
            INSERT INTO video_candidates (
                id, project_id, shot_id, queue_item_id, video_filename, video_path,
                thumbnail_path, duration, ratio, resolution, source_url, is_default,
                is_locked, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                candidate_id,
                project_id,
                shot_id,
                queue_item_id,
                video_filename,
                video_path,
                thumbnail_path,
                duration,
                ratio,
                resolution,
                source_url,
                int(is_default),
                int(is_locked),
                stamp,
            ),
        )
        if is_default:
            conn.execute(
                "UPDATE shots SET default_video_candidate_id = ?, updated_at = ? WHERE id = ?",
                (candidate_id, stamp, shot_id),
            )
        if is_locked:
            conn.execute(
                "UPDATE shots SET locked_video_candidate_id = ?, status = ?, updated_at = ? WHERE id = ?",
                (candidate_id, JimengShotStatus.locked.value, stamp, shot_id),
            )
    return get_candidate(store, candidate_id)


def create_uploaded_video_candidate(
    store: Any,
    project_id: str,
    shot_id: str,
    video_filename: str,
    content: bytes,
    duration: int | None = None,
    ratio: str | None = None,
    resolution: str | None = None,
    make_default: bool = True,
) -> JimengVideoCandidate:
    if not content:
        raise ValueError("video file cannot be empty")

    shot = store.get_shot(project_id, shot_id)
    safe_filename = Path(video_filename).name
    if not safe_filename:
        raise ValueError("video filename cannot be empty")

    upload_dir = store._safe_project_root(project_id) / "videos" / "uploads" / shot_id
    store._assert_under_output_root(upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    stored_filename = f"{uuid.uuid4().hex[:8]}-{safe_filename}"
    target_path = upload_dir / stored_filename
    store._assert_under_output_root(target_path)
    temp_path = target_path.with_name(f".{target_path.name}.{uuid.uuid4().hex}.tmp")
    store._assert_under_output_root(temp_path)

    try:
        temp_path.write_bytes(content)
        os.replace(temp_path, target_path)
    except Exception:
        temp_path.unlink(missing_ok=True)
        target_path.unlink(missing_ok=True)
        raise

    candidate_id = _id("jimeng_video")
    queue_item_id = _id("jimeng_queue")
    stamp = _now()
    set_as_default = make_default and shot.locked_video_candidate_id is None

    try:
        with store._connect() as conn:
            store._validate_project_membership(conn, project_id=project_id, shot_id=shot_id)
            row = conn.execute("SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM queue_items").fetchone()
            position = int(row["next_position"])
            conn.execute(
                """
                INSERT INTO queue_items (
                    id, project_id, shot_id, status, position, prompt_snapshot,
                    prompt_preset_id, prefix_prompt_snapshot, final_prompt_snapshot,
                    asset_snapshot, cli_command, poll_seconds, download_dir,
                    submit_id, gen_status, result_url, local_video_path,
                    cli_raw_output, error_message, submitted_at, finished_at,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    queue_item_id,
                    project_id,
                    shot_id,
                    JimengQueueStatus.completed.value,
                    position,
                    shot.prompt,
                    None,
                    "",
                    shot.prompt,
                    _json(store._asset_snapshot(conn, shot_id)),
                    "local_upload",
                    0,
                    str(upload_dir),
                    None,
                    "completed",
                    None,
                    str(target_path),
                    "local video upload",
                    None,
                    stamp,
                    stamp,
                    stamp,
                    stamp,
                ),
            )
            if set_as_default:
                conn.execute("UPDATE video_candidates SET is_default = 0 WHERE shot_id = ?", (shot_id,))
            conn.execute(
                """
                INSERT INTO video_candidates (
                    id, project_id, shot_id, queue_item_id, video_filename, video_path,
                    thumbnail_path, duration, ratio, resolution, source_url, is_default,
                    is_locked, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    candidate_id,
                    project_id,
                    shot_id,
                    queue_item_id,
                    safe_filename,
                    str(target_path),
                    None,
                    duration,
                    ratio,
                    resolution,
                    "local_upload",
                    int(set_as_default),
                    0,
                    stamp,
                ),
            )
            conn.execute(
                """
                UPDATE shots
                SET status = ?, default_video_candidate_id = COALESCE(?, default_video_candidate_id),
                    last_error = NULL, updated_at = ?
                WHERE id = ?
                """,
                (
                    JimengShotStatus.locked.value if shot.locked_video_candidate_id else JimengShotStatus.completed.value,
                    candidate_id if set_as_default else None,
                    stamp,
                    shot_id,
                ),
            )
            store._touch_project(conn, project_id, stamp)
    except Exception:
        target_path.unlink(missing_ok=True)
        raise

    return get_candidate(store, candidate_id)


def list_candidates(store: Any, project_id: str, shot_id: str | None = None) -> list[JimengVideoCandidate]:
    if shot_id is None:
        shot_id = project_id
        project_id = ""
    with store._connect() as conn:
        if project_id:
            store._validate_project_membership(conn, project_id=project_id, shot_id=shot_id)
        rows = conn.execute(
            "SELECT * FROM video_candidates WHERE shot_id = ? ORDER BY created_at ASC", (shot_id,)
        ).fetchall()
    return [candidate_from_row(row) for row in rows]


def set_default_candidate(store: Any, shot_id: str, candidate_id: str) -> JimengVideoCandidate:
    stamp = _now()
    candidate = get_candidate(store, candidate_id)
    if candidate.shot_id != shot_id:
        raise ValueError("candidate does not belong to shot")
    with store._connect() as conn:
        conn.execute("UPDATE video_candidates SET is_default = 0 WHERE shot_id = ?", (shot_id,))
        conn.execute("UPDATE video_candidates SET is_default = 1 WHERE id = ?", (candidate_id,))
        conn.execute(
            "UPDATE shots SET default_video_candidate_id = ?, updated_at = ? WHERE id = ?",
            (candidate_id, stamp, shot_id),
        )
    return get_candidate(store, candidate_id)


def lock_candidate(store: Any, shot_id: str, candidate_id: str, locked: bool = True) -> JimengVideoCandidate:
    stamp = _now()
    candidate = get_candidate(store, candidate_id)
    if candidate.shot_id != shot_id:
        raise ValueError("candidate does not belong to shot")
    with store._connect() as conn:
        if locked:
            conn.execute("UPDATE video_candidates SET is_locked = 0 WHERE shot_id = ?", (shot_id,))
        conn.execute("UPDATE video_candidates SET is_locked = ? WHERE id = ?", (int(locked), candidate_id))
        conn.execute(
            "UPDATE shots SET locked_video_candidate_id = ?, status = ?, updated_at = ? WHERE id = ?",
            (
                candidate_id if locked else None,
                JimengShotStatus.locked.value if locked else JimengShotStatus.completed.value,
                stamp,
                shot_id,
            ),
        )
    return get_candidate(store, candidate_id)


def candidate_from_row(row: sqlite3.Row) -> JimengVideoCandidate:
    return JimengVideoCandidate(
        id=row["id"],
        project_id=row["project_id"],
        shot_id=row["shot_id"],
        queue_item_id=row["queue_item_id"],
        video_filename=row["video_filename"],
        video_path=row["video_path"],
        thumbnail_path=row["thumbnail_path"],
        duration=row["duration"],
        ratio=row["ratio"],
        resolution=row["resolution"],
        source_url=row["source_url"],
        is_default=bool(row["is_default"]),
        is_locked=bool(row["is_locked"]),
        created_at=row["created_at"],
    )


def get_candidate(store: Any, candidate_id: str) -> JimengVideoCandidate:
    with store._connect() as conn:
        row = conn.execute("SELECT * FROM video_candidates WHERE id = ?", (candidate_id,)).fetchone()
    if row is None:
        raise KeyError(f"Jimeng video candidate not found: {candidate_id}")
    return candidate_from_row(row)
