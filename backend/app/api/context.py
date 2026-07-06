"""即梦业务共享上下文。

把存储、CLI、通用响应转换和运行设置集中在这里，避免各路由互相导入。
"""

import os
import re
import threading
from collections.abc import Callable
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel

from ..jimeng_cli import DreaminaCli
from ..jimeng_storage import JimengStore


_store: JimengStore | None = None
_store_lock = threading.Lock()
_DEFAULT_RUNTIME_SETTINGS: dict[str, Any] = {
    "dreamina_executable": "dreamina",
    "generation_provider": "dreamina_cli",
    "model_version": "seedance2.0fast",
    "poll_seconds": 30,
    "duration": 5,
    "ratio": "9:16",
    "video_resolution": "720p",
    "submit_interval_seconds": 3,
    "max_in_flight": 10,
    "result_poll_interval_seconds": 30,
    "cli_initial_poll_seconds": 3,
    "max_retry_attempts": 5,
    "retry_base_seconds": 30,
    "queue_enabled": False,
}
_STABLE_RUNTIME_SETTING_KEYS = set(_DEFAULT_RUNTIME_SETTINGS)
_REMOVED_RUNTIME_SETTING_KEYS = {
    "llm_default_provider_id",
    "llm_default_model_id",
    "llm_providers",
}
_runtime_settings: dict[str, Any] = dict(_DEFAULT_RUNTIME_SETTINGS)
MIN_VIDEO_DURATION_SECONDS = 4
MAX_VIDEO_DURATION_SECONDS = 15


def clamp_video_duration_seconds(value: Any, default: int = _DEFAULT_RUNTIME_SETTINGS["duration"]) -> int:
    if value is None or value == "":
        return default
    try:
        duration = int(round(float(value)))
    except (TypeError, ValueError):
        return default
    return min(MAX_VIDEO_DURATION_SECONDS, max(MIN_VIDEO_DURATION_SECONDS, duration))


def normalize_optional_video_duration_seconds(value: Any) -> int | None:
    if value is None:
        return None
    return clamp_video_duration_seconds(value)


def get_store() -> JimengStore:
    global _store
    if _store is None:
        with _store_lock:
            if _store is None:
                base_dir = Path(__file__).resolve().parents[2]
                project_dir = base_dir.parent
                data_dir = Path(os.getenv("DREAMINA_CLI_DATA_DIR", project_dir / "runtime_data")).resolve()
                _store = JimengStore(db_path=data_dir / "jimeng.sqlite3", output_root=data_dir / "output")
    return _store


def set_jimeng_store_for_tests(store: JimengStore) -> None:
    global _store
    with _store_lock:
        _store = store


def reset_jimeng_store_for_tests() -> None:
    global _store
    with _store_lock:
        _store = None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def call_store(fn: Callable[[], Any]) -> Any:
    try:
        return fn()
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


async def async_call_store(fn: Callable[[], Any]) -> Any:
    try:
        return await fn()
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def runtime_settings() -> dict[str, Any]:
    return _runtime_settings


def _sanitize_runtime_settings(values: dict[str, Any]) -> dict[str, Any]:
    cleaned: dict[str, Any] = {}
    for key, value in values.items():
        if key not in _STABLE_RUNTIME_SETTING_KEYS:
            continue
        if key == "duration":
            cleaned[key] = clamp_video_duration_seconds(value)
            continue
        if value is not None:
            cleaned[key] = value
    cleaned["generation_provider"] = "dreamina_cli"
    return cleaned


def load_runtime_settings() -> dict[str, Any]:
    persisted = get_store().get_runtime_settings()
    _runtime_settings.clear()
    _runtime_settings.update(_DEFAULT_RUNTIME_SETTINGS)
    _runtime_settings.update(_sanitize_runtime_settings(persisted))
    return _runtime_settings


def save_runtime_settings(updates: dict[str, Any]) -> dict[str, Any]:
    cleaned = _sanitize_runtime_settings(updates)
    removed = {key: None for key in _REMOVED_RUNTIME_SETTING_KEYS}
    get_store().update_runtime_settings({**cleaned, **removed})
    return load_runtime_settings()


def dreamina_cli(timeout: float | None = None) -> DreaminaCli:
    return DreaminaCli(executable=str(_runtime_settings.get("dreamina_executable") or "dreamina"), timeout=timeout)


def dump_api(value: Any) -> Any:
    if isinstance(value, list):
        return [dump_api(item) for item in value]
    if isinstance(value, dict):
        return {key: dump_api(item) for key, item in value.items()}
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if hasattr(value, "dict"):
        return value.dict()
    if is_dataclass(value):
        return asdict(value)
    return value


def model_data(value: BaseModel, exclude_unset: bool = False) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump(exclude_unset=exclude_unset)
    return value.dict(exclude_unset=exclude_unset)


_DURATION_PATTERNS = [
    re.compile(
        r"(?:推荐时长|建议时长|总时长|镜头时长|时长)\s*[:：]?\s*(?:约等|约|大约|大概|约为|大致)?\s*(\d+(?:\.\d+)?)\s*(?:秒|s|S)\s*(?:左右|上下)?"
    ),
    re.compile(r"(?:约等|约|大约|大概|约为|大致)\s*(\d+(?:\.\d+)?)\s*(?:秒|s|S)\s*(?:左右|上下)?"),
    re.compile(r"\bduration\s*[:=]\s*(\d+(?:\.\d+)?)\s*s?\b", re.IGNORECASE),
]


def detect_duration_seconds(text: str) -> int | None:
    for pattern in _DURATION_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        try:
            value = float(match.group(1))
        except ValueError:
            continue
        duration = int(round(value))
        return duration if duration > 0 else None
    return None


# 兼容旧模块内部命名，后续迁移完毕后再统一改成非下划线名称。
_call = call_store
_async_call = async_call_store
_cli = dreamina_cli
_detect_duration_seconds = detect_duration_seconds
_dump = dump_api
_model_data = model_data
_now = now_iso
_settings = _runtime_settings
