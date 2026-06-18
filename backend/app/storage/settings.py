"""即梦运行设置存储。

这里保存软件级运行设置，例如 CLI 路径、默认生成参数和手动登录 JSON。
设置以 JSON value 存在 SQLite，避免刷新或重启后丢失。
"""

import json
from datetime import datetime, timezone
from typing import Any


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_runtime_settings(store: Any) -> dict[str, Any]:
    with store._connect() as conn:
        rows = conn.execute("SELECT key, value FROM runtime_settings").fetchall()
    settings: dict[str, Any] = {}
    for row in rows:
        try:
            settings[row["key"]] = json.loads(row["value"])
        except json.JSONDecodeError:
            continue
    return settings


def update_runtime_settings(store: Any, values: dict[str, Any]) -> dict[str, Any]:
    stamp = _now()
    with store._connect() as conn:
        for key, value in values.items():
            if value is None:
                conn.execute("DELETE FROM runtime_settings WHERE key = ?", (key,))
                continue
            conn.execute(
                """
                INSERT INTO runtime_settings (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                """,
                (key, json.dumps(value, ensure_ascii=False), stamp),
            )
    return get_runtime_settings(store)
