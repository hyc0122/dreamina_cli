import json
import os
import shutil
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .jimeng_models import (
    JimengAsset,
    JimengAssetBinding,
    JimengAssetType,
    JimengCliAccount,
    JimengProject,
    JimengProjectStatus,
    JimengPromptPreset,
    JimengPromptScope,
    JimengQueueItem,
    JimengQueueStatus,
    JimengShot,
    JimengShotStatus,
    JimengStylePreset,
    JimengVideoCandidate,
)
from .storage import projects as project_storage
from .storage import shots as shot_storage
from .storage import assets as asset_storage
from .storage import accounts as account_storage
from .storage import queue as queue_storage


_ASSET_DIRS = {
    JimengAssetType.character: "characters",
    JimengAssetType.scene: "scenes",
    JimengAssetType.prop: "props",
}
_DEFAULT_STYLE_PRESETS = [
    ("video", "电影感写实漫剧", "写实短剧电影感，真实布光，浅景深，人物表演自然，画面干净稳定。", "#6478ff"),
    ("video", "国风3Q漫剧", "国风三头身 3Q 漫剧风格，水墨光影，角色比例稳定，服饰纹样清晰。", "#22c55e"),
    ("video", "都市短剧写实", "现代都市短剧写实风格，自然光线，生活化场景，人物表情真实克制。", "#f59e0b"),
    ("video", "暗黑悬疑漫画", "暗黑悬疑漫画风格，低调照明，高反差阴影，冷色氛围，紧张压迫感。", "#a855f7"),
    ("image", "资产3D设定", "3D 角色设定图，干净背景，主体清晰，比例稳定，适合作为后续视频参考图。", "#06b6d4"),
    ("image", "资产真人写实", "真人写实资产参考图，真实皮肤质感，服装细节清楚，背景简洁。", "#ef4444"),
    ("image", "资产国风", "国风资产设定图，东方服饰纹样清晰，水墨光影，白底或干净背景。", "#84cc16"),
]
_WINDOWS_ILLEGAL_CHARS = set('\\/:*?"<>|')


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _loads(value: Optional[str], fallback: Any) -> Any:
    if value in (None, ""):
        return fallback
    return json.loads(value)


class JimengStore:
    def __init__(self, db_path: Path | str | None = None, output_root: Path | str = "output"):
        self.db_path = Path(db_path or Path(output_root) / "jimeng" / "jimeng.db")
        self.output_root = Path(output_root)
        self.output_root.mkdir(parents=True, exist_ok=True)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _ensure_columns(self, conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
        existing_columns = {
            row["name"]
            for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
        }
        for name, definition in columns.items():
            if name not in existing_columns:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")

    def init_schema(self):
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    style TEXT NOT NULL DEFAULT '',
                    default_ratio TEXT NOT NULL DEFAULT '9:16',
                    prompt_preset_id TEXT,
                    description TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS shots (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    shot_index INTEGER NOT NULL,
                    prompt TEXT NOT NULL,
                    status TEXT NOT NULL,
                    default_video_candidate_id TEXT,
                    locked_video_candidate_id TEXT,
                    last_error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_shots_project_index ON shots(project_id, shot_index);

                CREATE TABLE IF NOT EXISTS assets (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    name TEXT NOT NULL,
                    aliases TEXT NOT NULL DEFAULT '[]',
                    description TEXT NOT NULL DEFAULT '',
                    image_model TEXT NOT NULL DEFAULT 'dreamina4.0',
                    image_ratio TEXT NOT NULL DEFAULT '16:9',
                    image_params TEXT NOT NULL DEFAULT '',
                    video_prompt TEXT NOT NULL DEFAULT '',
                    image_filename TEXT,
                    image_path TEXT,
                    audio_filename TEXT,
                    audio_path TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(project_id, type, name),
                    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS asset_bindings (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    shot_id TEXT NOT NULL,
                    asset_id TEXT NOT NULL,
                    asset_type TEXT NOT NULL,
                    source TEXT NOT NULL,
                    locked INTEGER NOT NULL DEFAULT 0,
                    voice_enabled INTEGER NOT NULL DEFAULT 1,
                    slot_order INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    FOREIGN KEY(shot_id) REFERENCES shots(id) ON DELETE CASCADE,
                    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS queue_items (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    shot_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    position INTEGER NOT NULL,
                    prompt_snapshot TEXT NOT NULL,
                    prompt_preset_id TEXT,
                    prefix_prompt_snapshot TEXT NOT NULL DEFAULT '',
                    final_prompt_snapshot TEXT NOT NULL,
                    asset_snapshot TEXT NOT NULL DEFAULT '{}',
                    cli_command TEXT NOT NULL DEFAULT '',
                    poll_seconds INTEGER NOT NULL DEFAULT 30,
                    download_dir TEXT NOT NULL DEFAULT '',
                    submit_id TEXT,
                    gen_status TEXT,
                    result_url TEXT,
                    local_video_path TEXT,
                    cli_raw_output TEXT,
                    error_message TEXT,
                    submitted_at TEXT,
                    finished_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    FOREIGN KEY(shot_id) REFERENCES shots(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_queue_status_position ON queue_items(status, position);

                CREATE TABLE IF NOT EXISTS video_candidates (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    shot_id TEXT NOT NULL,
                    queue_item_id TEXT NOT NULL,
                    video_filename TEXT NOT NULL,
                    video_path TEXT NOT NULL,
                    thumbnail_path TEXT,
                    duration INTEGER,
                    ratio TEXT,
                    resolution TEXT,
                    source_url TEXT,
                    is_default INTEGER NOT NULL DEFAULT 0,
                    is_locked INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    FOREIGN KEY(shot_id) REFERENCES shots(id) ON DELETE CASCADE,
                    FOREIGN KEY(queue_item_id) REFERENCES queue_items(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS prompt_presets (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    scope TEXT NOT NULL,
                    content TEXT NOT NULL,
                    variables TEXT NOT NULL DEFAULT '[]',
                    is_default INTEGER NOT NULL DEFAULT 0,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS style_presets (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    scope TEXT NOT NULL DEFAULT 'video',
                    prompt TEXT NOT NULL DEFAULT '',
                    accent TEXT NOT NULL DEFAULT '#6478ff',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(scope, name)
                );

                CREATE TABLE IF NOT EXISTS cli_accounts (
                    id TEXT PRIMARY KEY,
                    label TEXT NOT NULL,
                    profile_dir TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'unknown',
                    total_credit TEXT,
                    user_id TEXT,
                    user_name TEXT,
                    vip_level TEXT,
                    vip_expire_at TEXT,
                    last_error TEXT,
                    is_default INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )
            self._ensure_columns(
                conn,
                "projects",
                {
                    "default_ratio": "TEXT NOT NULL DEFAULT '9:16'",
                },
            )
            self._ensure_columns(
                conn,
                "shots",
                {
                    "default_duration": "INTEGER",
                },
            )
            self._ensure_columns(
                conn,
                "assets",
                {
                    "description": "TEXT NOT NULL DEFAULT ''",
                    "image_model": "TEXT NOT NULL DEFAULT 'dreamina4.0'",
                    "image_ratio": "TEXT NOT NULL DEFAULT '16:9'",
                    "image_params": "TEXT NOT NULL DEFAULT ''",
                    "video_prompt": "TEXT NOT NULL DEFAULT ''",
                },
            )
            self._ensure_columns(
                conn,
                "asset_bindings",
                {
                    "voice_enabled": "INTEGER NOT NULL DEFAULT 1",
                },
            )
            self._ensure_columns(
                conn,
                "style_presets",
                {
                    "scope": "TEXT NOT NULL DEFAULT 'video'",
                    "accent": "TEXT NOT NULL DEFAULT '#6478ff'",
                },
            )
            self._seed_default_style_presets(conn)

    def _seed_default_style_presets(self, conn: sqlite3.Connection) -> None:
        row = conn.execute("SELECT COUNT(*) AS count FROM style_presets").fetchone()
        if int(row["count"]) > 0:
            return
        stamp = _now()
        for scope, name, prompt, accent in _DEFAULT_STYLE_PRESETS:
            conn.execute(
                """
                INSERT INTO style_presets (id, name, scope, prompt, accent, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (_id("jimeng_style"), name, scope, prompt, accent, stamp, stamp),
            )

    def create_cli_account(self, label: str) -> JimengCliAccount:
        return account_storage.create_cli_account(self, label)

    def list_cli_accounts(self) -> list[JimengCliAccount]:
        return account_storage.list_cli_accounts(self)

    def get_cli_account(self, account_id: str) -> JimengCliAccount:
        return account_storage.get_cli_account(self, account_id)

    def update_cli_account(self, account_id: str, **updates: Any) -> JimengCliAccount:
        return account_storage.update_cli_account(self, account_id, **updates)

    def set_default_cli_account(self, account_id: str) -> JimengCliAccount:
        return account_storage.set_default_cli_account(self, account_id)

    def delete_cli_account(self, account_id: str) -> None:
        return account_storage.delete_cli_account(self, account_id)

    def create_project(self, name: str, style: str = "", description: str = "", default_ratio: str = "9:16") -> JimengProject:
        return project_storage.create_project(self, name, style, description, default_ratio)

    def update_project(self, project_id: str, **updates: Any) -> JimengProject:
        return project_storage.update_project(self, project_id, **updates)

    def list_projects(self) -> list[JimengProject]:
        return project_storage.list_projects(self)

    def get_project(self, project_id: str) -> JimengProject:
        return project_storage.get_project(self, project_id)

    def delete_project(self, project_id: str) -> None:
        return project_storage.delete_project(self, project_id)

    def create_shot(self, project_id: str, prompt: str) -> JimengShot:
        return shot_storage.create_shot(self, project_id, prompt)

    def get_shot(self, project_id: str, shot_id: str | None = None) -> JimengShot:
        return shot_storage.get_shot(self, project_id, shot_id)

    def list_shots(self, project_id: str) -> list[JimengShot]:
        return shot_storage.list_shots(self, project_id)

    def update_shot(self, shot_id: str, **updates: Any) -> JimengShot:
        return shot_storage.update_shot(self, shot_id, **updates)

    def delete_shot(self, project_id: str, shot_id: str) -> None:
        return shot_storage.delete_shot(self, project_id, shot_id)

    def delete_shots(self, project_id: str, shot_ids: list[str]) -> list[str]:
        return shot_storage.delete_shots(self, project_id, shot_ids)

    def move_shot(self, project_id: str, shot_id: str, direction: str) -> JimengShot:
        return shot_storage.move_shot(self, project_id, shot_id, direction)

    def upsert_asset_file(
        self,
        project_id: str,
        asset_type: JimengAssetType | str,
        name: str,
        source_path: Path | str,
        file_kind: str,
        content: bytes | None = None,
        image_ratio: str = "16:9",
    ) -> JimengAsset:
        return asset_storage.upsert_asset_file(self, project_id, asset_type, name, source_path, file_kind, content, image_ratio)

    def create_asset(
        self,
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
        return asset_storage.create_asset(
            self,
            project_id,
            asset_type,
            name,
            aliases,
            description,
            image_model,
            image_ratio,
            image_params,
            video_prompt,
        )

    def upsert_asset_metadata(
        self,
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
        return asset_storage.upsert_asset_metadata(
            self,
            project_id,
            asset_type,
            name,
            aliases,
            description,
            image_model,
            image_ratio,
            image_params,
            video_prompt,
        )

    def update_asset(self, asset_id: str, updates: dict[str, Any]) -> JimengAsset:
        return asset_storage.update_asset(self, asset_id, updates)

    def list_assets(self, project_id: str, asset_type: JimengAssetType | str | None = None) -> list[JimengAsset]:
        return asset_storage.list_assets(self, project_id, asset_type)

    def update_asset_aliases(self, asset_id: str, aliases: list[str]) -> JimengAsset:
        return asset_storage.update_asset_aliases(self, asset_id, aliases)

    def delete_asset(self, asset_id: str) -> None:
        return asset_storage.delete_asset(self, asset_id)

    def delete_assets(self, project_id: str, asset_ids: list[str]) -> list[str]:
        return asset_storage.delete_assets(self, project_id, asset_ids)

    def asset_binding_shot_indexes(self, asset_id: str) -> list[int]:
        return asset_storage.asset_binding_shot_indexes(self, asset_id)
    def create_binding(
        self,
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
        with self._connect() as conn:
            self._validate_project_membership(conn, project_id=project_id, shot_id=shot_id, asset_id=asset_id)
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
        return self._get_binding(binding_id)

    def list_bindings(self, project_id: str, shot_id: str | None = None) -> list[JimengAssetBinding]:
        if shot_id is None:
            shot_id = project_id
            project_id = ""
        with self._connect() as conn:
            if project_id:
                self._validate_project_membership(conn, project_id=project_id, shot_id=shot_id)
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
        return [self._binding_from_row(row) for row in rows]

    def update_binding(self, binding_id: str, **updates: Any) -> JimengAssetBinding:
        allowed = {"locked", "voice_enabled", "slot_order"}
        values = {key: value for key, value in updates.items() if key in allowed}
        if values:
            if "locked" in values:
                values["locked"] = int(bool(values["locked"]))
            if "voice_enabled" in values:
                values["voice_enabled"] = int(bool(values["voice_enabled"]))
            values["updated_at"] = _now()
            assignments = ", ".join(f"{key} = ?" for key in values)
            with self._connect() as conn:
                row = conn.execute("SELECT id FROM asset_bindings WHERE id = ?", (binding_id,)).fetchone()
                if row is None:
                    raise KeyError(f"Jimeng binding not found: {binding_id}")
                conn.execute(f"UPDATE asset_bindings SET {assignments} WHERE id = ?", (*values.values(), binding_id))
        return self._get_binding(binding_id)

    def delete_binding(self, binding_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM asset_bindings WHERE id = ?", (binding_id,))

    def create_queue_item(
        self,
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
        return queue_storage.create_queue_item(
            self,
            project_id,
            shot_id,
            prefix_prompt,
            final_prompt,
            final_prompt_snapshot,
            asset_snapshot,
            prompt_preset_id,
            cli_command,
            poll_seconds,
            download_dir,
        )

    def get_queue_item(self, item_id: str) -> JimengQueueItem:
        return queue_storage.get_queue_item(self, item_id)

    def list_queue(self, project_id: str | None = None) -> list[JimengQueueItem]:
        return queue_storage.list_queue(self, project_id)

    def next_waiting_item(self) -> JimengQueueItem | None:
        return queue_storage.next_waiting_item(self)

    def running_queue_item(self) -> JimengQueueItem | None:
        return queue_storage.running_queue_item(self)

    def count_queue(self, status: JimengQueueStatus | str | None = None) -> int:
        return queue_storage.count_queue(self, status)

    def update_queue_item(self, item_id: str, **updates: Any) -> JimengQueueItem:
        return queue_storage.update_queue_item(self, item_id, **updates)

    def recover_interrupted_queue_items(self) -> dict[str, list[str]]:
        return queue_storage.recover_interrupted_queue_items(self)

    def create_video_candidate(
        self,
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
        with self._connect() as conn:
            self._validate_project_membership(
                conn,
                project_id=project_id,
                shot_id=shot_id,
                queue_item_id=queue_item_id,
            )
            if is_default:
                conn.execute(
                    "UPDATE video_candidates SET is_default = 0 WHERE shot_id = ?", (shot_id,)
                )
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
        return self._get_candidate(candidate_id)

    def create_uploaded_video_candidate(
        self,
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

        shot = self.get_shot(project_id, shot_id)
        safe_filename = Path(video_filename).name
        if not safe_filename:
            raise ValueError("video filename cannot be empty")

        upload_dir = self._safe_project_root(project_id) / "videos" / "uploads" / shot_id
        self._assert_under_output_root(upload_dir)
        upload_dir.mkdir(parents=True, exist_ok=True)

        stored_filename = f"{uuid.uuid4().hex[:8]}-{safe_filename}"
        target_path = upload_dir / stored_filename
        self._assert_under_output_root(target_path)
        temp_path = target_path.with_name(f".{target_path.name}.{uuid.uuid4().hex}.tmp")
        self._assert_under_output_root(temp_path)

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
            with self._connect() as conn:
                self._validate_project_membership(conn, project_id=project_id, shot_id=shot_id)
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
                        _json(self._asset_snapshot(conn, shot_id)),
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
                self._touch_project(conn, project_id, stamp)
        except Exception:
            target_path.unlink(missing_ok=True)
            raise

        return self._get_candidate(candidate_id)

    def list_candidates(self, project_id: str, shot_id: str | None = None) -> list[JimengVideoCandidate]:
        if shot_id is None:
            shot_id = project_id
            project_id = ""
        with self._connect() as conn:
            if project_id:
                self._validate_project_membership(conn, project_id=project_id, shot_id=shot_id)
            rows = conn.execute(
                "SELECT * FROM video_candidates WHERE shot_id = ? ORDER BY created_at ASC", (shot_id,)
            ).fetchall()
        return [self._candidate_from_row(row) for row in rows]

    def set_default_candidate(self, shot_id: str, candidate_id: str) -> JimengVideoCandidate:
        stamp = _now()
        candidate = self._get_candidate(candidate_id)
        if candidate.shot_id != shot_id:
            raise ValueError("candidate does not belong to shot")
        with self._connect() as conn:
            conn.execute("UPDATE video_candidates SET is_default = 0 WHERE shot_id = ?", (shot_id,))
            conn.execute("UPDATE video_candidates SET is_default = 1 WHERE id = ?", (candidate_id,))
            conn.execute(
                "UPDATE shots SET default_video_candidate_id = ?, updated_at = ? WHERE id = ?",
                (candidate_id, stamp, shot_id),
            )
        return self._get_candidate(candidate_id)

    def lock_candidate(self, shot_id: str, candidate_id: str, locked: bool = True) -> JimengVideoCandidate:
        stamp = _now()
        candidate = self._get_candidate(candidate_id)
        if candidate.shot_id != shot_id:
            raise ValueError("candidate does not belong to shot")
        with self._connect() as conn:
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
        return self._get_candidate(candidate_id)

    def create_prompt_preset(
        self,
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
        with self._connect() as conn:
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
        return self._get_prompt_preset(preset_id)

    def list_prompt_presets(self, enabled_only: bool = False) -> list[JimengPromptPreset]:
        with self._connect() as conn:
            if enabled_only:
                rows = conn.execute(
                    "SELECT * FROM prompt_presets WHERE enabled = 1 ORDER BY created_at ASC"
                ).fetchall()
            else:
                rows = conn.execute("SELECT * FROM prompt_presets ORDER BY created_at ASC").fetchall()
        return [self._prompt_preset_from_row(row) for row in rows]

    def set_default_prompt_preset(self, preset_id: str) -> JimengPromptPreset:
        stamp = _now()
        self._get_prompt_preset(preset_id)
        with self._connect() as conn:
            conn.execute("UPDATE prompt_presets SET is_default = 0, updated_at = ?", (stamp,))
            conn.execute(
                "UPDATE prompt_presets SET is_default = 1, updated_at = ? WHERE id = ?",
                (stamp, preset_id),
            )
        return self._get_prompt_preset(preset_id)

    def create_style_preset(self, name: str, prompt: str = "", scope: str = "video", accent: str = "#6478ff") -> JimengStylePreset:
        name = name.strip()
        prompt = prompt.strip()
        scope = self._validate_style_scope(scope)
        accent = self._normalize_style_accent(accent)
        if not name:
            raise ValueError("style name cannot be empty")
        preset_id = _id("jimeng_style")
        stamp = _now()
        try:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO style_presets (id, name, scope, prompt, accent, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (preset_id, name, scope, prompt, accent, stamp, stamp),
                )
        except sqlite3.IntegrityError as exc:
            raise ValueError("style preset with same scope and name already exists") from exc
        return self._get_style_preset(preset_id)

    def list_style_presets(self, scope: str | None = None) -> list[JimengStylePreset]:
        with self._connect() as conn:
            if scope:
                normalized_scope = self._validate_style_scope(scope)
                rows = conn.execute("SELECT * FROM style_presets WHERE scope = ? ORDER BY created_at ASC", (normalized_scope,)).fetchall()
            else:
                rows = conn.execute("SELECT * FROM style_presets ORDER BY scope ASC, created_at ASC").fetchall()
        return [self._style_preset_from_row(row) for row in rows]

    def update_style_preset(self, preset_id: str, **updates: Any) -> JimengStylePreset:
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
                values["scope"] = self._validate_style_scope(str(values["scope"]))
            if "accent" in values:
                values["accent"] = self._normalize_style_accent(str(values["accent"]))
            stamp = _now()
            values["updated_at"] = stamp
            with self._connect() as conn:
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
        return self._get_style_preset(preset_id)

    def delete_style_preset(self, preset_id: str) -> None:
        self._get_style_preset(preset_id)
        with self._connect() as conn:
            conn.execute("DELETE FROM style_presets WHERE id = ?", (preset_id,))

    def style_prompt_for(self, style_name: str, scope: str = "video") -> str:
        style_name = (style_name or "").strip()
        if not style_name:
            return ""
        scope = self._validate_style_scope(scope)
        with self._connect() as conn:
            row = conn.execute("SELECT prompt FROM style_presets WHERE scope = ? AND name = ?", (scope, style_name)).fetchone()
        if row is None:
            return style_name
        prompt = str(row["prompt"] or "").strip()
        return prompt or style_name

    def _project_root(self, project_id: str) -> Path:
        return self.output_root / "jimeng" / "projects" / project_id

    def _cli_account_profile_dir(self, account_id: str) -> Path:
        return account_storage.cli_account_profile_dir(self, account_id)

    def _safe_project_root(self, project_id: str) -> Path:
        self._validate_project_id(project_id)
        project_root = self._project_root(project_id)
        self._assert_under_output_root(project_root)
        return project_root

    def _asset_dir(self, project_id: str, asset_type: JimengAssetType, file_kind: str) -> Path:
        base = self._safe_project_root(project_id) / "assets" / _ASSET_DIRS[asset_type]
        return base / "voices" if asset_type == JimengAssetType.character and file_kind == "audio" else base

    def _validate_project_id(self, project_id: str) -> None:
        if not project_id or ".." in project_id or any(ch in project_id for ch in '\\/:*?"<>|'):
            raise ValueError("project_id contains unsafe path characters")

    def _assert_under_output_root(self, path: Path | str) -> Path:
        resolved_output = self.output_root.resolve()
        resolved_path = Path(path).resolve()
        try:
            resolved_path.relative_to(resolved_output)
        except ValueError as exc:
            raise ValueError(f"path is outside output_root: {path}") from exc
        return resolved_path

    def _safe_unlink(self, path: Path | str) -> None:
        safe_path = self._assert_under_output_root(path)
        safe_path.unlink(missing_ok=True)

    def _safe_rmtree(self, path: Path | str) -> None:
        safe_path = self._assert_under_output_root(path)
        shutil.rmtree(safe_path, ignore_errors=True)

    def _validate_asset_name(self, name: str) -> None:
        if not name or any(ch in _WINDOWS_ILLEGAL_CHARS for ch in name):
            raise ValueError('asset name cannot be empty or contain \\ / : * ? " < > |')

    def _validate_asset_image_ratio(self, ratio: str) -> None:
        if ratio not in {"16:9", "9:16"}:
            raise ValueError("asset image ratio must be 16:9 or 9:16")

    def _validate_video_ratio(self, ratio: str) -> None:
        if ratio not in {"1:1", "3:4", "16:9", "4:3", "9:16", "21:9"}:
            raise ValueError("project default ratio must be one of 1:1, 3:4, 16:9, 4:3, 9:16, 21:9")

    def _validate_style_scope(self, scope: str) -> str:
        normalized = str(scope or "video").strip().lower()
        if normalized not in {"video", "image"}:
            raise ValueError("style scope must be video or image")
        return normalized

    def _normalize_style_accent(self, accent: str) -> str:
        value = str(accent or "").strip()
        if not value:
            return "#6478ff"
        if not value.startswith("#"):
            value = f"#{value}"
        if len(value) != 7:
            return "#6478ff"
        try:
            int(value[1:], 16)
        except ValueError:
            return "#6478ff"
        return value.lower()

    def _next_shot_index(self, conn: sqlite3.Connection, project_id: str) -> int:
        return shot_storage.next_shot_index(conn, project_id)

    def _normalize_shot_indexes(self, conn: sqlite3.Connection, project_id: str) -> None:
        return shot_storage.normalize_shot_indexes(conn, project_id)

    def _normalize_queue_positions(self, conn: sqlite3.Connection, project_id: str) -> None:
        return queue_storage.normalize_queue_positions(conn, project_id)

    def _touch_project(self, conn: sqlite3.Connection, project_id: str, stamp: str) -> None:
        return project_storage.touch_project(self, conn, project_id, stamp)

    def _ensure_project_exists(self, project_id: str) -> None:
        self._validate_project_id(project_id)
        with self._connect() as conn:
            row = conn.execute("SELECT id FROM projects WHERE id = ?", (project_id,)).fetchone()
        if row is None:
            raise KeyError(f"Jimeng project not found: {project_id}")

    def _validate_project_membership(
        self,
        conn: sqlite3.Connection,
        project_id: str,
        shot_id: str | None = None,
        asset_id: str | None = None,
        queue_item_id: str | None = None,
    ) -> None:
        project = conn.execute("SELECT id FROM projects WHERE id = ?", (project_id,)).fetchone()
        if project is None:
            raise KeyError(f"Jimeng project not found: {project_id}")
        if shot_id is not None:
            shot = conn.execute("SELECT project_id FROM shots WHERE id = ?", (shot_id,)).fetchone()
            if shot is None:
                raise KeyError(f"Jimeng shot not found: {shot_id}")
            if shot["project_id"] != project_id:
                raise ValueError("shot does not belong to project")
        if asset_id is not None:
            asset = conn.execute("SELECT project_id FROM assets WHERE id = ?", (asset_id,)).fetchone()
            if asset is None:
                raise KeyError(f"Jimeng asset not found: {asset_id}")
            if asset["project_id"] != project_id:
                raise ValueError("asset does not belong to project")
        if queue_item_id is not None:
            item = conn.execute("SELECT project_id, shot_id FROM queue_items WHERE id = ?", (queue_item_id,)).fetchone()
            if item is None:
                raise KeyError(f"Jimeng queue item not found: {queue_item_id}")
            if item["project_id"] != project_id:
                raise ValueError("queue item does not belong to project")
            if shot_id is not None and item["shot_id"] != shot_id:
                raise ValueError("queue item does not belong to shot")

    def _asset_snapshot(self, conn: sqlite3.Connection, shot_id: str) -> dict[str, list[dict[str, Any]]]:
        return queue_storage.asset_snapshot_for_shot(conn, shot_id)

    def _project_from_row(self, row: sqlite3.Row) -> JimengProject:
        return project_storage.project_from_row(self, row)

    def _shot_from_row(self, row: sqlite3.Row) -> JimengShot:
        return shot_storage.shot_from_row(row)

    def _asset_from_row(self, row: sqlite3.Row) -> JimengAsset:
        return asset_storage.asset_from_row(row)

    def _get_asset(self, asset_id: str) -> JimengAsset:
        return asset_storage.get_asset(self, asset_id)

    def _binding_from_row(self, row: sqlite3.Row) -> JimengAssetBinding:
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

    def _get_binding(self, binding_id: str) -> JimengAssetBinding:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM asset_bindings WHERE id = ?", (binding_id,)).fetchone()
        if row is None:
            raise KeyError(f"Jimeng binding not found: {binding_id}")
        return self._binding_from_row(row)

    def _queue_item_from_row(self, row: sqlite3.Row) -> JimengQueueItem:
        return queue_storage.queue_item_from_row(row)

    def _candidate_from_row(self, row: sqlite3.Row) -> JimengVideoCandidate:
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

    def _get_candidate(self, candidate_id: str) -> JimengVideoCandidate:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM video_candidates WHERE id = ?", (candidate_id,)).fetchone()
        if row is None:
            raise KeyError(f"Jimeng video candidate not found: {candidate_id}")
        return self._candidate_from_row(row)

    def _prompt_preset_from_row(self, row: sqlite3.Row) -> JimengPromptPreset:
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

    def _style_preset_from_row(self, row: sqlite3.Row) -> JimengStylePreset:
        return JimengStylePreset(
            id=row["id"],
            name=row["name"],
            scope=row["scope"],
            prompt=row["prompt"],
            accent=row["accent"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def _cli_account_from_row(self, row: sqlite3.Row) -> JimengCliAccount:
        return account_storage.cli_account_from_row(row)

    def _get_prompt_preset(self, preset_id: str) -> JimengPromptPreset:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM prompt_presets WHERE id = ?", (preset_id,)).fetchone()
        if row is None:
            raise KeyError(f"Jimeng prompt preset not found: {preset_id}")
        return self._prompt_preset_from_row(row)

    def _get_style_preset(self, preset_id: str) -> JimengStylePreset:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM style_presets WHERE id = ?", (preset_id,)).fetchone()
        if row is None:
            raise KeyError(f"Jimeng style preset not found: {preset_id}")
        return self._style_preset_from_row(row)
