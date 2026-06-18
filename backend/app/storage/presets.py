"""提示词模板和风格预设存储边界。"""

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

from ..jimeng_models import JimengPromptPreset, JimengPromptScope, JimengStylePreset


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


def create_prompt_preset(
    store: Any,
    name: str,
    content: str,
    scope: JimengPromptScope | str = JimengPromptScope.user,
    variables: list[str] | None = None,
    is_default: bool = False,
    enabled: bool = True,
) -> JimengPromptPreset:
    preset_id = _id("jimeng_preset")
    stamp = _now()
    scope = JimengPromptScope(scope)
    with store._connect() as conn:
        if is_default:
            conn.execute("UPDATE prompt_presets SET is_default = 0")
        conn.execute(
            """
            INSERT INTO prompt_presets (
                id, name, scope, content, variables, is_default, enabled, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                preset_id,
                name,
                scope.value,
                content,
                _json(variables or []),
                int(is_default),
                int(enabled),
                stamp,
                stamp,
            ),
        )
    return get_prompt_preset(store, preset_id)


def list_prompt_presets(store: Any, enabled_only: bool = False) -> list[JimengPromptPreset]:
    with store._connect() as conn:
        if enabled_only:
            rows = conn.execute(
                "SELECT * FROM prompt_presets WHERE enabled = 1 ORDER BY created_at ASC"
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM prompt_presets ORDER BY created_at ASC").fetchall()
    return [prompt_preset_from_row(row) for row in rows]


def set_default_prompt_preset(store: Any, preset_id: str) -> JimengPromptPreset:
    stamp = _now()
    get_prompt_preset(store, preset_id)
    with store._connect() as conn:
        conn.execute("UPDATE prompt_presets SET is_default = 0, updated_at = ?", (stamp,))
        conn.execute(
            "UPDATE prompt_presets SET is_default = 1, updated_at = ? WHERE id = ?",
            (stamp, preset_id),
        )
    return get_prompt_preset(store, preset_id)


def create_style_preset(store: Any, name: str, prompt: str = "", scope: str = "video", accent: str = "#6478ff") -> JimengStylePreset:
    name = name.strip()
    prompt = prompt.strip()
    scope = store._validate_style_scope(scope)
    accent = store._normalize_style_accent(accent)
    if not name:
        raise ValueError("style name cannot be empty")
    preset_id = _id("jimeng_style")
    stamp = _now()
    try:
        with store._connect() as conn:
            conn.execute(
                """
                INSERT INTO style_presets (id, name, scope, prompt, accent, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (preset_id, name, scope, prompt, accent, stamp, stamp),
            )
    except sqlite3.IntegrityError as exc:
        raise ValueError("style preset with same scope and name already exists") from exc
    return get_style_preset(store, preset_id)


def list_style_presets(store: Any, scope: str | None = None) -> list[JimengStylePreset]:
    with store._connect() as conn:
        if scope:
            normalized_scope = store._validate_style_scope(scope)
            rows = conn.execute("SELECT * FROM style_presets WHERE scope = ? ORDER BY created_at ASC", (normalized_scope,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM style_presets ORDER BY scope ASC, created_at ASC").fetchall()
    return [style_preset_from_row(row) for row in rows]


def update_style_preset(store: Any, preset_id: str, **updates: Any) -> JimengStylePreset:
    allowed = {"name", "prompt", "scope", "accent"}
    values = {key: value for key, value in updates.items() if key in allowed}
    if values:
        if "name" in values:
            values["name"] = str(values["name"]).strip()
            if not values["name"]:
                raise ValueError("style name cannot be empty")
        if "prompt" in values:
            values["prompt"] = str(values["prompt"]).strip()
        if "scope" in values:
            values["scope"] = store._validate_style_scope(str(values["scope"]))
        if "accent" in values:
            values["accent"] = store._normalize_style_accent(str(values["accent"]))
        stamp = _now()
        values["updated_at"] = stamp
        with store._connect() as conn:
            current = conn.execute("SELECT * FROM style_presets WHERE id = ?", (preset_id,)).fetchone()
            if current is None:
                raise KeyError(f"Jimeng style preset not found: {preset_id}")
            assignments = ", ".join(f"{key} = ?" for key in values)
            try:
                conn.execute(f"UPDATE style_presets SET {assignments} WHERE id = ?", (*values.values(), preset_id))
            except sqlite3.IntegrityError as exc:
                raise ValueError("style preset with same scope and name already exists") from exc
            if "name" in values and values["name"] != current["name"] and str(values.get("scope", current["scope"])) == "video":
                conn.execute(
                    "UPDATE projects SET style = ?, updated_at = ? WHERE style = ?",
                    (values["name"], stamp, current["name"]),
                )
    return get_style_preset(store, preset_id)


def delete_style_preset(store: Any, preset_id: str) -> None:
    get_style_preset(store, preset_id)
    with store._connect() as conn:
        conn.execute("DELETE FROM style_presets WHERE id = ?", (preset_id,))


def style_prompt_for(store: Any, style_name: str, scope: str = "video") -> str:
    style_name = (style_name or "").strip()
    if not style_name:
        return ""
    scope = store._validate_style_scope(scope)
    with store._connect() as conn:
        row = conn.execute("SELECT prompt FROM style_presets WHERE scope = ? AND name = ?", (scope, style_name)).fetchone()
    if row is None:
        return style_name
    prompt = str(row["prompt"] or "").strip()
    return prompt or style_name


def prompt_preset_from_row(row: sqlite3.Row) -> JimengPromptPreset:
    return JimengPromptPreset(
        id=row["id"],
        name=row["name"],
        scope=JimengPromptScope(row["scope"]),
        content=row["content"],
        variables=_loads(row["variables"], []),
        is_default=bool(row["is_default"]),
        enabled=bool(row["enabled"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def style_preset_from_row(row: sqlite3.Row) -> JimengStylePreset:
    return JimengStylePreset(
        id=row["id"],
        name=row["name"],
        scope=row["scope"],
        prompt=row["prompt"],
        accent=row["accent"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def get_prompt_preset(store: Any, preset_id: str) -> JimengPromptPreset:
    with store._connect() as conn:
        row = conn.execute("SELECT * FROM prompt_presets WHERE id = ?", (preset_id,)).fetchone()
    if row is None:
        raise KeyError(f"Jimeng prompt preset not found: {preset_id}")
    return prompt_preset_from_row(row)


def get_style_preset(store: Any, preset_id: str) -> JimengStylePreset:
    with store._connect() as conn:
        row = conn.execute("SELECT * FROM style_presets WHERE id = ?", (preset_id,)).fetchone()
    if row is None:
        raise KeyError(f"Jimeng style preset not found: {preset_id}")
    return style_preset_from_row(row)
