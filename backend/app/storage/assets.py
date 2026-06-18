"""资产存储边界。

负责角色、场景、道具的 CRUD、文件覆盖、同名资产处理、绑定删除保护和批量删除。
"""

import json
import os
import sqlite3
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..jimeng_models import JimengAsset, JimengAssetType
from . import projects as project_storage


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


def upsert_asset_file(
    store: Any,
    project_id: str,
    asset_type: JimengAssetType | str,
    name: str,
    source_path: Path | str,
    file_kind: str,
    content: bytes | None = None,
    image_ratio: str = "16:9",
) -> JimengAsset:
    asset_type = JimengAssetType(asset_type)
    store._validate_asset_name(name)
    store._validate_asset_image_ratio(image_ratio)
    store._ensure_project_exists(project_id)
    if file_kind not in {"image", "audio"}:
        raise ValueError("file_kind must be 'image' or 'audio'")

    source_path = Path(source_path)
    ext = source_path.suffix
    filename = f"{name}{ext}"
    asset_dir = store._asset_dir(project_id, asset_type, file_kind)
    asset_dir.mkdir(parents=True, exist_ok=True)
    target_path = asset_dir / filename
    store._assert_under_output_root(target_path)
    temp_path = target_path.with_name(f".{target_path.name}.{uuid.uuid4().hex}.tmp")
    store._assert_under_output_root(temp_path)
    backup_path: Path | None = None
    target_installed = False

    def restore_target_after_failure() -> None:
        if backup_path is not None and backup_path.exists():
            target_path.unlink(missing_ok=True)
            os.replace(backup_path, target_path)
        elif target_installed:
            target_path.unlink(missing_ok=True)

    try:
        if content is None:
            shutil.copyfile(source_path, temp_path)
        else:
            temp_path.write_bytes(content)
        if target_path.exists():
            backup_path = target_path.with_name(f".{target_path.name}.{uuid.uuid4().hex}.bak")
            store._assert_under_output_root(backup_path)
            os.replace(target_path, backup_path)
        os.replace(temp_path, target_path)
        target_installed = True
    except Exception:
        temp_path.unlink(missing_ok=True)
        restore_target_after_failure()
        raise

    old_path: str | None = None
    try:
        with store._connect() as conn:
            existing = conn.execute(
                "SELECT * FROM assets WHERE project_id = ? AND type = ? AND name = ?",
                (project_id, asset_type.value, name),
            ).fetchone()
            stamp = _now()
            if existing is None:
                asset_id = _id("jimeng_asset")
                conn.execute(
                    """
                    INSERT INTO assets (
                        id, project_id, type, name, aliases, description, image_model,
                        image_ratio, image_params, video_prompt, image_filename, image_path,
                        audio_filename, audio_path, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, '', 'dreamina4.0', ?, '', '', ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        asset_id,
                        project_id,
                        asset_type.value,
                        name,
                        "[]",
                        image_ratio,
                        filename if file_kind == "image" else None,
                        str(target_path) if file_kind == "image" else None,
                        filename if file_kind == "audio" else None,
                        str(target_path) if file_kind == "audio" else None,
                        stamp,
                        stamp,
                    ),
                )
            else:
                asset_id = existing["id"]
                old_path = existing["image_path"] if file_kind == "image" else existing["audio_path"]
                field_filename = "image_filename" if file_kind == "image" else "audio_filename"
                field_path = "image_path" if file_kind == "image" else "audio_path"
                conn.execute(
                    f"UPDATE assets SET {field_filename} = ?, {field_path} = ?, updated_at = ? WHERE id = ?",
                    (filename, str(target_path), stamp, asset_id),
                )
    except Exception:
        restore_target_after_failure()
        raise

    if backup_path is not None:
        backup_path.unlink(missing_ok=True)
    if old_path and Path(old_path) != target_path:
        store._safe_unlink(old_path)
    return get_asset(store, asset_id)


def create_asset(
    store: Any,
    project_id: str,
    asset_type: JimengAssetType | str,
    name: str,
    aliases: list[str] | None = None,
    description: str = "",
    image_model: str = "dreamina4.0",
    image_ratio: str = "16:9",
    image_params: str = "",
    video_prompt: str = "",
) -> JimengAsset:
    asset_type = JimengAssetType(asset_type)
    store._validate_asset_name(name)
    store._validate_asset_image_ratio(image_ratio)
    store._ensure_project_exists(project_id)

    asset_id = _id("jimeng_asset")
    stamp = _now()
    try:
        with store._connect() as conn:
            existing = conn.execute(
                "SELECT id FROM assets WHERE project_id = ? AND type = ? AND name = ?",
                (project_id, asset_type.value, name),
            ).fetchone()
            if existing is not None:
                raise ValueError("asset with same project, type, and name already exists")
            conn.execute(
                """
                INSERT INTO assets (
                    id, project_id, type, name, aliases, description, image_model,
                    image_ratio, image_params, video_prompt, image_filename, image_path,
                    audio_filename, audio_path, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)
                """,
                (
                    asset_id,
                    project_id,
                    asset_type.value,
                    name,
                    _json(aliases or []),
                    description,
                    image_model,
                    image_ratio,
                    image_params,
                    video_prompt,
                    stamp,
                    stamp,
                ),
            )
            project_storage.touch_project(store, conn, project_id, stamp)
    except sqlite3.IntegrityError as exc:
        raise ValueError("asset with same project, type, and name already exists") from exc
    return get_asset(store, asset_id)


def upsert_asset_metadata(
    store: Any,
    project_id: str,
    asset_type: JimengAssetType | str,
    name: str,
    aliases: list[str] | None = None,
    description: str = "",
    image_model: str = "dreamina4.0",
    image_ratio: str = "16:9",
    image_params: str = "",
    video_prompt: str = "",
) -> JimengAsset:
    asset_type = JimengAssetType(asset_type)
    store._validate_asset_name(name)
    store._validate_asset_image_ratio(image_ratio)
    store._ensure_project_exists(project_id)
    with store._connect() as conn:
        existing = conn.execute(
            "SELECT id FROM assets WHERE project_id = ? AND type = ? AND name = ?",
            (project_id, asset_type.value, name),
        ).fetchone()
    if existing is None:
        return store.create_asset(
            project_id=project_id,
            asset_type=asset_type,
            name=name,
            aliases=aliases or [],
            description=description,
            image_model=image_model,
            image_ratio=image_ratio,
            image_params=image_params,
            video_prompt=video_prompt,
        )
    return store.update_asset(
        existing["id"],
        {
            "aliases": aliases or [],
            "description": description,
            "image_model": image_model,
            "image_ratio": image_ratio,
            "image_params": image_params,
            "video_prompt": video_prompt,
        },
    )


def update_asset(store: Any, asset_id: str, updates: dict[str, Any]) -> JimengAsset:
    asset = get_asset(store, asset_id)
    allowed = {
        "name",
        "aliases",
        "description",
        "image_model",
        "image_ratio",
        "image_params",
        "video_prompt",
    }
    values = {key: value for key, value in updates.items() if key in allowed}
    if not values:
        return asset

    new_name = values.get("name")
    if new_name is not None:
        store._validate_asset_name(str(new_name))
    if "image_ratio" in values:
        store._validate_asset_image_ratio(str(values["image_ratio"]))
    if "aliases" in values:
        values["aliases"] = _json(values["aliases"] or [])

    renamed_paths: dict[str, tuple[str, str]] = {}
    if new_name and new_name != asset.name:
        with store._connect() as conn:
            existing = conn.execute(
                "SELECT id FROM assets WHERE project_id = ? AND type = ? AND name = ? AND id != ?",
                (asset.project_id, asset.type.value, new_name, asset_id),
            ).fetchone()
            if existing is not None:
                raise ValueError("asset with same project, type, and name already exists")
        for field_prefix, current_path in (("image", asset.image_path), ("audio", asset.audio_path)):
            if not current_path:
                continue
            source = store._assert_under_output_root(current_path)
            if not source.exists():
                continue
            target = source.with_name(f"{new_name}{source.suffix}")
            store._assert_under_output_root(target)
            if target != source:
                os.replace(source, target)
            renamed_paths[f"{field_prefix}_filename"] = (f"{new_name}{source.suffix}", str(target))

    if renamed_paths:
        for field_prefix in ("image", "audio"):
            key = f"{field_prefix}_filename"
            if key in renamed_paths:
                filename, path = renamed_paths[key]
                values[f"{field_prefix}_filename"] = filename
                values[f"{field_prefix}_path"] = path

    values["updated_at"] = _now()
    assignments = ", ".join(f"{key} = ?" for key in values)
    with store._connect() as conn:
        conn.execute(f"UPDATE assets SET {assignments} WHERE id = ?", (*values.values(), asset_id))
        row = conn.execute("SELECT project_id FROM assets WHERE id = ?", (asset_id,)).fetchone()
        if row:
            project_storage.touch_project(store, conn, row["project_id"], values["updated_at"])
    return get_asset(store, asset_id)


def list_assets(store: Any, project_id: str, asset_type: JimengAssetType | str | None = None) -> list[JimengAsset]:
    with store._connect() as conn:
        if asset_type is None:
            rows = conn.execute(
                "SELECT * FROM assets WHERE project_id = ? ORDER BY type, name", (project_id,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM assets WHERE project_id = ? AND type = ? ORDER BY name",
                (project_id, JimengAssetType(asset_type).value),
            ).fetchall()
    return [asset_from_row(row) for row in rows]


def update_asset_aliases(store: Any, asset_id: str, aliases: list[str]) -> JimengAsset:
    with store._connect() as conn:
        conn.execute(
            "UPDATE assets SET aliases = ?, updated_at = ? WHERE id = ?",
            (_json(aliases), _now(), asset_id),
        )
    return get_asset(store, asset_id)


def delete_asset(store: Any, asset_id: str) -> None:
    asset = get_asset(store, asset_id)
    shot_indexes = asset_binding_shot_indexes(store, asset_id)
    if shot_indexes:
        joined = "、".join(f"分镜{index}" for index in shot_indexes)
        raise ValueError(f"资产「{asset.name}」已绑定：{joined}，请先解除绑定后再删除。")
    for value in (asset.image_path, asset.audio_path):
        if value:
            store._assert_under_output_root(value)
    with store._connect() as conn:
        conn.execute("DELETE FROM assets WHERE id = ?", (asset_id,))
    for value in (asset.image_path, asset.audio_path):
        if value:
            store._safe_unlink(value)


def delete_assets(store: Any, project_id: str, asset_ids: list[str]) -> list[str]:
    unique_ids = [asset_id for index, asset_id in enumerate(asset_ids) if asset_id and asset_id not in asset_ids[:index]]
    if not unique_ids:
        return []
    assets: list[JimengAsset] = []
    blocked_messages: list[str] = []
    for asset_id in unique_ids:
        asset = get_asset(store, asset_id)
        if asset.project_id != project_id:
            raise ValueError("asset does not belong to project")
        assets.append(asset)
        shot_indexes = asset_binding_shot_indexes(store, asset_id)
        if shot_indexes:
            joined = "、".join(f"分镜{index}" for index in shot_indexes)
            blocked_messages.append(f"资产「{asset.name}」已绑定：{joined}")
    if blocked_messages:
        raise ValueError("；".join(blocked_messages) + "，请先解除绑定后再删除。")
    for asset in assets:
        delete_asset(store, asset.id)
    return unique_ids


def asset_binding_shot_indexes(store: Any, asset_id: str) -> list[int]:
    with store._connect() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT s.shot_index
            FROM asset_bindings b
            JOIN shots s ON s.id = b.shot_id
            WHERE b.asset_id = ?
            ORDER BY s.shot_index ASC
            """,
            (asset_id,),
        ).fetchall()
    return [int(row["shot_index"]) for row in rows]


def get_asset(store: Any, asset_id: str) -> JimengAsset:
    with store._connect() as conn:
        row = conn.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()
    if row is None:
        raise KeyError(f"Jimeng asset not found: {asset_id}")
    return asset_from_row(row)


def asset_from_row(row: sqlite3.Row) -> JimengAsset:
    return JimengAsset(
        id=row["id"],
        project_id=row["project_id"],
        type=JimengAssetType(row["type"]),
        name=row["name"],
        aliases=_loads(row["aliases"], []),
        description=row["description"],
        image_model=row["image_model"],
        image_ratio=row["image_ratio"],
        image_params=row["image_params"],
        video_prompt=row["video_prompt"],
        image_filename=row["image_filename"],
        image_path=row["image_path"],
        audio_filename=row["audio_filename"],
        audio_path=row["audio_path"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
