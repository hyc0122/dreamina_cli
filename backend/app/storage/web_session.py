"""Standalone Jimeng web-session account and task storage."""

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

from ..jimeng_models import JimengWebSessionAccount, JimengWebSessionTask
from ..web_session_client import mask_sessionid


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _json(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False)


def _loads(value: str | None) -> Any:
    if value in (None, ""):
        return None
    return json.loads(value)


def create_web_session_account(
    store: Any,
    label: str,
    sessionid: str,
    enabled: bool = True,
    max_concurrency: int = 1,
    cooldown_seconds: int = 0,
) -> JimengWebSessionAccount:
    clean_label = str(label or "").strip()
    clean_sessionid = str(sessionid or "").strip()
    if not clean_label:
        raise ValueError("账号名称不能为空")
    if not clean_sessionid:
        raise ValueError("sessionid 不能为空")
    stamp = _now()
    account_id = _id("jimeng_web_account")
    with store._connect() as conn:
        conn.execute(
            """
            INSERT INTO web_session_accounts (
                id, label, sessionid, enabled, max_concurrency, cooldown_seconds,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                account_id,
                clean_label,
                clean_sessionid,
                1 if enabled else 0,
                max(1, int(max_concurrency or 1)),
                max(0, int(cooldown_seconds or 0)),
                stamp,
                stamp,
            ),
        )
    return get_web_session_account(store, account_id)


def list_web_session_accounts(store: Any) -> list[JimengWebSessionAccount]:
    with store._connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM web_session_accounts
            ORDER BY created_at ASC, id ASC
            """
        ).fetchall()
    return [account_from_row(row) for row in rows]


def get_web_session_account(store: Any, account_id: str) -> JimengWebSessionAccount:
    with store._connect() as conn:
        row = conn.execute("SELECT * FROM web_session_accounts WHERE id = ?", (account_id,)).fetchone()
    if row is None:
        raise KeyError(f"Jimeng web session account not found: {account_id}")
    return account_from_row(row)


def get_web_session_account_secret(store: Any, account_id: str) -> dict[str, Any]:
    with store._connect() as conn:
        row = conn.execute("SELECT * FROM web_session_accounts WHERE id = ?", (account_id,)).fetchone()
    if row is None:
        raise KeyError(f"Jimeng web session account not found: {account_id}")
    return dict(row)


def update_web_session_account(store: Any, account_id: str, **updates: Any) -> JimengWebSessionAccount:
    allowed = {"label", "sessionid", "enabled", "max_concurrency", "cooldown_seconds", "last_error"}
    values = {key: value for key, value in updates.items() if key in allowed and value is not None}
    if "label" in values and not str(values["label"]).strip():
        raise ValueError("账号名称不能为空")
    if "sessionid" in values and not str(values["sessionid"]).strip():
        raise ValueError("sessionid 不能为空")
    if "enabled" in values:
        values["enabled"] = 1 if bool(values["enabled"]) else 0
    if "max_concurrency" in values:
        values["max_concurrency"] = max(1, int(values["max_concurrency"] or 1))
    if "cooldown_seconds" in values:
        values["cooldown_seconds"] = max(0, int(values["cooldown_seconds"] or 0))
    if not values:
        return get_web_session_account(store, account_id)
    values["updated_at"] = _now()
    assignments = ", ".join(f"{key} = ?" for key in values)
    with store._connect() as conn:
        conn.execute(f"UPDATE web_session_accounts SET {assignments} WHERE id = ?", (*values.values(), account_id))
    return get_web_session_account(store, account_id)


def delete_web_session_account(store: Any, account_id: str) -> str:
    with store._connect() as conn:
        row = conn.execute("SELECT id FROM web_session_accounts WHERE id = ?", (account_id,)).fetchone()
        if row is None:
            raise KeyError(f"Jimeng web session account not found: {account_id}")
        conn.execute("DELETE FROM web_session_accounts WHERE id = ?", (account_id,))
    return account_id


def create_web_session_task(
    store: Any,
    account_id: str,
    prompt: str,
    model: str,
    ratio: str = "9:16",
    duration: int = 5,
    resolution: str = "720p",
) -> JimengWebSessionTask:
    clean_prompt = str(prompt or "").strip()
    if not clean_prompt:
        raise ValueError("提示词不能为空")
    _ensure_account_exists(store, account_id)
    stamp = _now()
    task_id = _id("jimeng_web_task")
    with store._connect() as conn:
        conn.execute(
            """
            INSERT INTO web_session_video_tasks (
                id, account_id, prompt, model, ratio, duration, resolution, status,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_id,
                account_id,
                clean_prompt,
                str(model or "seedance2.0fast"),
                str(ratio or "9:16"),
                int(duration or 5),
                str(resolution or "720p"),
                "draft",
                stamp,
                stamp,
            ),
        )
    return get_web_session_task(store, task_id)


def list_web_session_tasks(store: Any, account_id: str | None = None, limit: int = 100) -> list[JimengWebSessionTask]:
    limit = max(1, min(500, int(limit or 100)))
    with store._connect() as conn:
        if account_id:
            rows = conn.execute(
                """
                SELECT t.*, a.label AS account_label
                FROM web_session_video_tasks t
                LEFT JOIN web_session_accounts a ON a.id = t.account_id
                WHERE t.account_id = ?
                ORDER BY t.created_at DESC, t.id DESC
                LIMIT ?
                """,
                (account_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT t.*, a.label AS account_label
                FROM web_session_video_tasks t
                LEFT JOIN web_session_accounts a ON a.id = t.account_id
                ORDER BY t.created_at DESC, t.id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
    return [task_from_row(row) for row in rows]


def get_web_session_task(store: Any, task_id: str) -> JimengWebSessionTask:
    with store._connect() as conn:
        row = conn.execute(
            """
            SELECT t.*, a.label AS account_label
            FROM web_session_video_tasks t
            LEFT JOIN web_session_accounts a ON a.id = t.account_id
            WHERE t.id = ?
            """,
            (task_id,),
        ).fetchone()
    if row is None:
        raise KeyError(f"Jimeng web session task not found: {task_id}")
    return task_from_row(row)


def update_web_session_task(store: Any, task_id: str, **updates: Any) -> JimengWebSessionTask:
    allowed = {
        "status",
        "submit_id",
        "history_id",
        "result_url",
        "raw_submit_response",
        "raw_poll_response",
        "error_message",
        "submitted_at",
        "last_polled_at",
        "finished_at",
    }
    values = {key: value for key, value in updates.items() if key in allowed}
    for key in ("raw_submit_response", "raw_poll_response"):
        if key in values:
            values[key] = _json(values[key])
    if not values:
        return get_web_session_task(store, task_id)
    values["updated_at"] = _now()
    assignments = ", ".join(f"{key} = ?" for key in values)
    with store._connect() as conn:
        conn.execute(f"UPDATE web_session_video_tasks SET {assignments} WHERE id = ?", (*values.values(), task_id))
    return get_web_session_task(store, task_id)


def account_from_row(row: sqlite3.Row) -> JimengWebSessionAccount:
    return JimengWebSessionAccount(
        id=row["id"],
        label=row["label"],
        sessionid_masked=mask_sessionid(row["sessionid"]),
        enabled=bool(row["enabled"]),
        max_concurrency=int(row["max_concurrency"]),
        cooldown_seconds=int(row["cooldown_seconds"]),
        last_error=row["last_error"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def task_from_row(row: sqlite3.Row) -> JimengWebSessionTask:
    return JimengWebSessionTask(
        id=row["id"],
        account_id=row["account_id"],
        account_label=row["account_label"] or "",
        prompt=row["prompt"],
        model=row["model"],
        ratio=row["ratio"],
        duration=int(row["duration"]),
        resolution=row["resolution"],
        status=row["status"],
        submit_id=row["submit_id"],
        history_id=row["history_id"],
        result_url=row["result_url"],
        raw_submit_response=_loads(row["raw_submit_response"]),
        raw_poll_response=_loads(row["raw_poll_response"]),
        error_message=row["error_message"],
        submitted_at=row["submitted_at"],
        last_polled_at=row["last_polled_at"],
        finished_at=row["finished_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _ensure_account_exists(store: Any, account_id: str) -> None:
    with store._connect() as conn:
        row = conn.execute("SELECT id FROM web_session_accounts WHERE id = ?", (account_id,)).fetchone()
    if row is None:
        raise KeyError(f"Jimeng web session account not found: {account_id}")