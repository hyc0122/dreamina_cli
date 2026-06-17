import base64
import csv
import io
import json
import os
import re
import sqlite3
import shutil
import subprocess
import threading
import time
import urllib.parse
import urllib.request
import uuid
import webbrowser
import zipfile
from collections.abc import Mapping
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel, Field, ValidationError

from .jimeng_cli import DreaminaCli, DreaminaResult, DreaminaTaskResult
from .jimeng_matching import calculate_highlights, match_assets_for_prompt, parse_csv_shots, parse_plain_text_shots
from .jimeng_models import JimengAssetType, JimengCliAccount, JimengPromptScope, JimengQueueStatus
from .jimeng_prompting import render_prompt_preset
from .jimeng_queue import JimengQueueWorker
from .jimeng_storage import JimengStore
from .api.context import (
    get_store as _context_get_store,
    reset_jimeng_store_for_tests as _context_reset_store_for_tests,
    set_jimeng_store_for_tests as _context_set_store_for_tests,
)


router = APIRouter(prefix="/jimeng", tags=["jimeng"])

_store: JimengStore | None = None
_settings: dict[str, Any] = {
    "dreamina_executable": "dreamina",
    "model_version": "seedance2.0fast",
    "poll_seconds": 30,
    "duration": 5,
    "ratio": "9:16",
    "video_resolution": "720p",
}
_JIMENG_VIDEO_RATIOS = ["1:1", "3:4", "16:9", "4:3", "9:16", "21:9"]
_JIMENG_VIDEO_MODELS = [
    "seedance2.0fast_vip",
    "seedance2.0_vip",
    "seedance2.0mini",
    "seedance2.0fast",
    "seedance2.0",
]
_JIMENG_IMAGE_MODELS = ["dreamina4.0", "dreamina4.1", "dreamina4.5", "dreamina4.6", "dreamina4.7", "dreamina5.0"]
_JIMENG_IMAGE_RESOLUTION_TYPES = ["2k", "4k"]
_JIMENG_MULTIMODAL_LIMITS = {
    "max_images": 9,
    "max_videos": 3,
    "max_audios": 3,
    "audio_min_seconds": 2,
    "audio_max_seconds": 15,
}
_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}
_AUDIO_EXTENSIONS = {"mp3", "wav", "m4a", "aac", "ogg"}
_VIDEO_EXTENSIONS = {"mp4", "mov", "m4v", "webm", "avi", "mkv"}
_IMAGE_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}
_AUDIO_MIME_TYPES = {
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/mp4",
    "audio/aac",
    "audio/ogg",
    "application/ogg",
}
_VIDEO_MIME_TYPES = {
    "video/mp4",
    "video/quicktime",
    "video/x-m4v",
    "video/webm",
    "video/x-msvideo",
    "video/x-matroska",
    "application/octet-stream",
}
_WINDOWS_ILLEGAL_ASSET_NAME_CHARS = set('\\/:*?"<>|')
_LOGIN_SESSION_AUTH_WAIT_SECONDS = 15
_LOGIN_SESSIONS: dict[str, dict[str, Any]] = {}
_LOGIN_SESSIONS_LOCK = threading.Lock()


def get_store() -> JimengStore:
    return _context_get_store()


def set_jimeng_store_for_tests(store: JimengStore) -> None:
    global _store
    _store = store
    _context_set_store_for_tests(store)


def reset_jimeng_store_for_tests() -> None:
    global _store
    _store = None
    _context_reset_store_for_tests()


class ProjectCreate(BaseModel):
    name: str
    style: str = ""
    description: str = ""
    default_ratio: str = "9:16"


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    style: Optional[str] = None
    description: Optional[str] = None
    default_ratio: Optional[str] = None
    prompt_preset_id: Optional[str] = None
    status: Optional[str] = None


class ShotCreate(BaseModel):
    prompt: str


class ShotImport(BaseModel):
    text: str
    format: str = "plain"


class ShotUpdate(BaseModel):
    prompt: Optional[str] = None
    default_duration: Optional[int] = None
    status: Optional[str] = None
    default_video_candidate_id: Optional[str] = None
    locked_video_candidate_id: Optional[str] = None
    last_error: Optional[str] = None


class MoveRequest(BaseModel):
    direction: str


class BatchReplaceRequest(BaseModel):
    find: str = ""
    replace: str = ""


class ShotBatchDelete(BaseModel):
    shot_ids: list[str] = Field(default_factory=list)


class AssetCreate(BaseModel):
    type: JimengAssetType
    name: str
    aliases: list[str] = Field(default_factory=list)
    description: str = ""
    image_model: str = "dreamina4.0"
    image_ratio: str = "16:9"
    image_params: str = ""
    video_prompt: str = ""


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    aliases: Optional[list[str]] = None
    description: Optional[str] = None
    image_model: Optional[str] = None
    image_ratio: Optional[str] = None
    image_params: Optional[str] = None
    video_prompt: Optional[str] = None


class AssetBatchDelete(BaseModel):
    asset_ids: list[str] = Field(default_factory=list)


class AssetMetadataImport(BaseModel):
    format: str = "json"
    text: str = ""


class AssetImageGenerateRequest(BaseModel):
    resolution_type: str = "2k"
    poll_seconds: Optional[int] = None
    extra_prompt: str = ""
    asset_ids: Optional[list[str]] = None
    asset_type: Optional[JimengAssetType] = None


class BindingCreate(BaseModel):
    asset_id: str
    asset_type: JimengAssetType
    source: str = "manual"
    locked: bool = False
    slot_order: Optional[int] = None


class BindingUpdate(BaseModel):
    locked: Optional[bool] = None
    voice_enabled: Optional[bool] = None
    slot_order: Optional[int] = None


class BindingReorder(BaseModel):
    binding_ids: list[str]


class QueueItemCreate(BaseModel):
    project_id: str
    shot_id: str
    prefix_prompt: str = ""
    final_prompt: Optional[str] = None
    final_prompt_snapshot: Optional[str] = None
    asset_snapshot: Optional[dict[str, Any]] = None
    prompt_preset_id: Optional[str] = None
    cli_command: str = ""
    poll_seconds: int = 30
    download_dir: str = ""


class QueueBatchCreate(BaseModel):
    items: list[QueueItemCreate]


class QueueReorder(BaseModel):
    queue_item_ids: list[str]


class CandidateLock(BaseModel):
    locked: bool = True


class SettingsUpdate(BaseModel):
    dreamina_executable: Optional[str] = None
    model_version: Optional[str] = None
    poll_seconds: Optional[int] = None
    duration: Optional[int] = None
    ratio: Optional[str] = None
    video_resolution: Optional[str] = None


class CliAccountCreate(BaseModel):
    label: str


class CliAccountUpdate(BaseModel):
    label: Optional[str] = None


class LoginSessionStart(BaseModel):
    mode: str = "login"
    open_browser: bool = True
    account_id: Optional[str] = None


class PromptPresetCreate(BaseModel):
    name: str
    scope: JimengPromptScope = JimengPromptScope.user
    content: str
    variables: list[str] = Field(default_factory=list)
    is_default: bool = False
    enabled: bool = True


class PromptPresetUpdate(BaseModel):
    name: Optional[str] = None
    scope: Optional[JimengPromptScope] = None
    content: Optional[str] = None
    variables: Optional[list[str]] = None
    is_default: Optional[bool] = None
    enabled: Optional[bool] = None


class ProjectPromptPresetRequest(BaseModel):
    prompt_preset_id: Optional[str] = None


class RenderPromptPreviewRequest(BaseModel):
    prompt_preset_id: Optional[str] = None
    content: Optional[str] = None
    camera: str = ""
    era: str = ""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


_DURATION_PATTERNS = [
    re.compile(r"(?:总时长|时长|镜头时长)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:秒|s|S)"),
    re.compile(r"\bduration\s*[:=]\s*(\d+(?:\.\d+)?)\s*s?\b", re.IGNORECASE),
]


def _detect_duration_seconds(text: str) -> int | None:
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


def _call(fn: Callable[[], Any]) -> Any:
    try:
        return fn()
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _dump(value: Any) -> Any:
    if isinstance(value, list):
        return [_dump(item) for item in value]
    if isinstance(value, dict):
        return {key: _dump(item) for key, item in value.items()}
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if hasattr(value, "dict"):
        return value.dict()
    if is_dataclass(value):
        return asdict(value)
    return value


def _model_data(value: BaseModel, exclude_unset: bool = False) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump(exclude_unset=exclude_unset)
    return value.dict(exclude_unset=exclude_unset)


def _cli_account_env(account: JimengCliAccount) -> dict[str, str]:
    profile_dir = str(Path(account.profile_dir).resolve())
    env = os.environ.copy()
    env["HOME"] = profile_dir
    env["USERPROFILE"] = profile_dir
    return env


def _cli(timeout: float | None = None, account_id: str | None = None) -> DreaminaCli:
    env = None
    if account_id:
        account = get_store().get_cli_account(account_id)
        Path(account.profile_dir).mkdir(parents=True, exist_ok=True)
        env = _cli_account_env(account)
    return DreaminaCli(executable=str(_settings.get("dreamina_executable") or "dreamina"), timeout=timeout, env=env)


def _install_dreamina_cli() -> dict[str, Any]:
    bash = shutil.which("bash")
    if not bash:
        raise ValueError("未检测到 bash / Git Bash，无法执行官方安装命令。请先安装 Git for Windows，或手动运行 curl -s https://jimeng.jianying.com/cli | bash")

    command = "curl -s https://jimeng.jianying.com/cli | bash"
    try:
        completed = subprocess.run(
            [bash, "-lc", command],
            capture_output=True,
            text=True,
            timeout=180,
            encoding="utf-8",
            errors="replace",
        )
    except subprocess.TimeoutExpired as exc:
        return {
            "ok": False,
            "returncode": 124,
            "stdout": exc.stdout or "",
            "stderr": f"{exc.stderr or ''}\n安装命令超时".strip(),
            "command": command,
        }
    except OSError as exc:
        return {
            "ok": False,
            "returncode": 127,
            "stdout": "",
            "stderr": str(exc),
            "command": command,
        }

    return {
        "ok": completed.returncode == 0,
        "returncode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "command": command,
    }


def _worker() -> JimengQueueWorker:
    return JimengQueueWorker(
        store=get_store(),
        cli=_cli(),
        cli_factory=lambda account_id: _cli(account_id=account_id),
        poll_seconds=int(_settings.get("poll_seconds") or 30),
        duration=int(_settings.get("duration") or 5),
        ratio=str(_settings.get("ratio") or "9:16"),
        video_resolution=str(_settings.get("video_resolution") or "720p"),
        model_version=str(_settings.get("model_version") or "seedance2.0fast"),
    )


def _extract_cli_line_value(raw_output: str, key: str) -> str | None:
    prefix = f"{key.lower()}:"
    for line in raw_output.splitlines():
        stripped = line.strip()
        if stripped.lower().startswith(prefix):
            return stripped.split(":", 1)[1].strip()
    return None


def _auth_payload_from_result(result: DreaminaTaskResult | None) -> dict[str, Any] | None:
    if result is None:
        return None
    raw_output = result.raw_output or result.error_message or ""
    url = result.result_url or _extract_cli_line_value(raw_output, "verification_uri")
    if not url:
        return None
    return {
        "url": url,
        "user_code": _extract_cli_line_value(raw_output, "user_code"),
        "device_code": _extract_cli_line_value(raw_output, "device_code"),
        "poll_interval": _extract_cli_line_value(raw_output, "poll_interval"),
        "expires_at": _extract_cli_line_value(raw_output, "expires_at"),
    }


def _credit_payload_from_output(raw_output: str) -> dict[str, str | None] | None:
    total_credit = (
        _extract_cli_line_value(raw_output, "total_credit")
        or _extract_cli_line_value(raw_output, "credit")
        or _extract_cli_line_value(raw_output, "balance")
        or _extract_cli_line_value(raw_output, "remaining_credit")
    )
    if not total_credit:
        return None
    return {
        "total_credit": total_credit,
        "user_id": _extract_cli_line_value(raw_output, "user_id") or _extract_cli_line_value(raw_output, "uid"),
        "user_name": (
            _extract_cli_line_value(raw_output, "user_name")
            or _extract_cli_line_value(raw_output, "username")
            or _extract_cli_line_value(raw_output, "nickname")
            or _extract_cli_line_value(raw_output, "name")
        ),
        "vip_level": _extract_cli_line_value(raw_output, "vip_level") or _extract_cli_line_value(raw_output, "vip"),
        "vip_expire_at": (
            _extract_cli_line_value(raw_output, "vip_expire_at")
            or _extract_cli_line_value(raw_output, "vip_expired_at")
            or _extract_cli_line_value(raw_output, "vip_end_time")
            or _extract_cli_line_value(raw_output, "vip_expire_time")
        ),
    }


def _apply_credit_result_to_account(account_id: str, result: DreaminaTaskResult) -> None:
    raw_output = result.raw_output or result.error_message or ""
    payload = _credit_payload_from_output(raw_output)
    if payload:
        get_store().update_cli_account(
            account_id,
            status="logged_in",
            total_credit=payload.get("total_credit"),
            user_id=payload.get("user_id"),
            user_name=payload.get("user_name"),
            vip_level=payload.get("vip_level"),
            vip_expire_at=payload.get("vip_expire_at"),
            last_error=None,
        )
        return
    if result.error_message:
        get_store().update_cli_account(account_id, status="error", last_error=result.error_message)
    else:
        get_store().update_cli_account(account_id, status="logged_in", last_error=None)


def _query_account_credit(account_id: str) -> dict[str, Any]:
    result = _cli(timeout=20, account_id=account_id).user_credit()
    _apply_credit_result_to_account(account_id, result)
    return {"account": _dump(get_store().get_cli_account(account_id)), "result": _dump(result)}


def _check_account_login(account_id: str) -> dict[str, Any]:
    result = _cli(timeout=20, account_id=account_id).user_credit()
    logged_in = result.error_message is None
    _apply_credit_result_to_account(account_id, result)
    if not logged_in:
        get_store().update_cli_account(account_id, status="logged_out" if "login" in (result.error_message or "").lower() else "error")
    return {"logged_in": logged_in, "account": _dump(get_store().get_cli_account(account_id)), "result": _dump(result)}


def _login_args(mode: str) -> tuple[str, list[str]]:
    normalized = mode.strip().lower()
    executable = str(_settings.get("dreamina_executable") or "dreamina")
    if normalized == "login":
        return normalized, [executable, "login"]
    if normalized == "login_debug":
        return normalized, [executable, "login", "--debug"]
    if normalized == "relogin":
        return normalized, [executable, "relogin"]
    raise ValueError("mode must be login, login_debug, or relogin")


def _parse_login_result(raw_output: str, returncode: int = 0) -> DreaminaTaskResult:
    return _cli()._parse_result(DreaminaResult(returncode=returncode, stdout=raw_output, stderr=""))


def _login_session_payload(session: dict[str, Any]) -> dict[str, Any]:
    return {
        "session_id": session["session_id"],
        "account_id": session.get("account_id"),
        "mode": session["mode"],
        "status": session["status"],
        "auth": session.get("auth"),
        "auth_opened": session.get("auth_opened", False),
        "auth_open_error": session.get("auth_open_error"),
        "result": session.get("result"),
        "credit_result": session.get("credit_result"),
        "raw_output": session.get("raw_output") or "",
        "error_message": session.get("error_message"),
        "created_at": session["created_at"],
        "updated_at": session["updated_at"],
        "returncode": session.get("returncode"),
    }


def _get_login_session_payload(session_id: str) -> dict[str, Any]:
    with _LOGIN_SESSIONS_LOCK:
        session = _LOGIN_SESSIONS.get(session_id)
        if session is None:
            raise KeyError(f"Jimeng login session not found: {session_id}")
        return _login_session_payload(dict(session))


def _set_login_session_failed(session_id: str, message: str) -> None:
    result = DreaminaTaskResult(raw_output=message, error_message=message)
    with _LOGIN_SESSIONS_LOCK:
        session = _LOGIN_SESSIONS.get(session_id)
        if session is None:
            return
        session.update(
            {
                "status": "failed",
                "result": _dump(result),
                "raw_output": message,
                "error_message": message,
                "updated_at": _now(),
            }
        )


def _append_login_session_output(session_id: str, text: str) -> None:
    auth_url_to_open: str | None = None
    with _LOGIN_SESSIONS_LOCK:
        session = _LOGIN_SESSIONS.get(session_id)
        if session is None or session.get("status") == "canceled":
            return
        raw_output = f"{session.get('raw_output') or ''}{text}"
        parsed = _parse_login_result(raw_output)
        auth = _auth_payload_from_result(parsed)
        session["raw_output"] = raw_output
        session["result"] = _dump(parsed)
        session["auth"] = auth or session.get("auth")
        if auth and session.get("status") in {"starting", "running"}:
            session["status"] = "waiting_auth"
        elif session.get("status") == "starting":
            session["status"] = "running"
        if auth and session.get("open_browser") and not session.get("auth_opened"):
            auth_url_to_open = str(auth["url"])
            session["auth_opened"] = True
        session["updated_at"] = _now()

    if auth_url_to_open:
        try:
            webbrowser.open(auth_url_to_open, new=2)
        except Exception as exc:  # pragma: no cover - depends on the user's desktop browser.
            with _LOGIN_SESSIONS_LOCK:
                session = _LOGIN_SESSIONS.get(session_id)
                if session is not None:
                    session["auth_open_error"] = str(exc)
                    session["updated_at"] = _now()


def _finish_login_session(session_id: str, returncode: int) -> None:
    with _LOGIN_SESSIONS_LOCK:
        session = _LOGIN_SESSIONS.get(session_id)
        if session is None or session.get("status") == "canceled":
            return
        raw_output = session.get("raw_output") or ""
        account_id = session.get("account_id")

    parsed = _parse_login_result(raw_output, returncode=returncode)
    auth = _auth_payload_from_result(parsed)
    has_credit_payload = _credit_payload_from_output(raw_output) is not None
    if has_credit_payload:
        parsed.error_message = None
    completed = (returncode == 0 and parsed.error_message is None) or has_credit_payload
    credit_result = _cli(timeout=20, account_id=account_id).user_credit() if completed else None
    if account_id and credit_result is not None:
        _apply_credit_result_to_account(account_id, credit_result)

    with _LOGIN_SESSIONS_LOCK:
        session = _LOGIN_SESSIONS.get(session_id)
        if session is None or session.get("status") == "canceled":
            return
        session.update(
            {
                "status": "completed" if completed else "failed",
                "result": _dump(parsed),
                "credit_result": _dump(credit_result) if credit_result else None,
                "auth": auth or session.get("auth"),
                "raw_output": raw_output,
                "error_message": parsed.error_message,
                "returncode": returncode,
                "updated_at": _now(),
            }
        )


def _read_login_process(session_id: str) -> None:
    with _LOGIN_SESSIONS_LOCK:
        session = _LOGIN_SESSIONS.get(session_id)
        process: Any = session.get("process") if session else None
    if process is None:
        return

    try:
        if process.stdout is not None:
            for line in process.stdout:
                _append_login_session_output(session_id, line)
        returncode = process.wait()
        _finish_login_session(session_id, returncode)
    except Exception as exc:  # pragma: no cover - defensive background guard.
        _set_login_session_failed(session_id, str(exc))


def _start_login_session(mode: str, open_browser: bool = True, account_id: str | None = None) -> dict[str, Any]:
    normalized, args = _login_args(mode)
    env = None
    if account_id:
        account = get_store().get_cli_account(account_id)
        Path(account.profile_dir).mkdir(parents=True, exist_ok=True)
        env = _cli_account_env(account)
    session_id = uuid.uuid4().hex
    created_at = _now()
    session: dict[str, Any] = {
        "session_id": session_id,
        "mode": normalized,
        "status": "starting",
        "auth": None,
        "result": None,
        "credit_result": None,
        "raw_output": "",
        "error_message": None,
        "created_at": created_at,
        "updated_at": created_at,
        "returncode": None,
        "account_id": account_id,
        "process": None,
        "open_browser": open_browser,
        "auth_opened": False,
        "auth_open_error": None,
    }

    with _LOGIN_SESSIONS_LOCK:
        _LOGIN_SESSIONS[session_id] = session

    try:
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        process = subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            creationflags=creationflags,
            env=env,
        )
    except OSError as exc:
        _set_login_session_failed(session_id, str(exc))
        return _get_login_session_payload(session_id)

    with _LOGIN_SESSIONS_LOCK:
        session["process"] = process
        session["status"] = "running"
        session["updated_at"] = _now()

    thread = threading.Thread(target=_read_login_process, args=(session_id,), daemon=True)
    thread.start()

    deadline = time.monotonic() + _LOGIN_SESSION_AUTH_WAIT_SECONDS
    while time.monotonic() < deadline:
        with _LOGIN_SESSIONS_LOCK:
            current = _LOGIN_SESSIONS.get(session_id)
            if current and (current.get("auth") or current.get("status") in {"completed", "failed", "canceled"}):
                return _login_session_payload(dict(current))
        time.sleep(0.2)

    return _get_login_session_payload(session_id)


def _cancel_login_session(session_id: str) -> dict[str, Any]:
    with _LOGIN_SESSIONS_LOCK:
        session = _LOGIN_SESSIONS.get(session_id)
        if session is None:
            raise KeyError(f"Jimeng login session not found: {session_id}")
        process: Any = session.get("process")
        session["status"] = "canceled"
        session["updated_at"] = _now()
        session["error_message"] = "login session canceled"

    if process is not None and process.poll() is None:
        process.terminate()

    return _get_login_session_payload(session_id)


def _update_project(project_id: str, updates: dict[str, Any]):
    return get_store().update_project(project_id, **updates)


def _update_asset(asset_id: str, updates: dict[str, Any]):
    return get_store().update_asset(asset_id, updates)


def _update_prompt_preset(preset_id: str, updates: dict[str, Any]):
    if updates.get("is_default"):
        get_store().set_default_prompt_preset(preset_id)
    allowed = {"name", "scope", "content", "variables", "enabled"}
    values = {key: value for key, value in updates.items() if key in allowed and value is not None}
    if "scope" in values:
        values["scope"] = JimengPromptScope(values["scope"]).value
    if "variables" in values:
        values["variables"] = json.dumps(values["variables"], ensure_ascii=False)
    if "enabled" in values:
        values["enabled"] = int(values["enabled"])
    if values:
        values["updated_at"] = _now()
        assignments = ", ".join(f"{key} = ?" for key in values)
        with get_store()._connect() as conn:
            row = conn.execute("SELECT id FROM prompt_presets WHERE id = ?", (preset_id,)).fetchone()
            if row is None:
                raise KeyError(f"Jimeng prompt preset not found: {preset_id}")
            conn.execute(f"UPDATE prompt_presets SET {assignments} WHERE id = ?", (*values.values(), preset_id))
    return get_store()._get_prompt_preset(preset_id)


def _delete_prompt_preset(preset_id: str) -> dict[str, str]:
    get_store()._get_prompt_preset(preset_id)
    with get_store()._connect() as conn:
        conn.execute("DELETE FROM prompt_presets WHERE id = ?", (preset_id,))
        conn.execute(
            "UPDATE projects SET prompt_preset_id = NULL, updated_at = ? WHERE prompt_preset_id = ?",
            (_now(), preset_id),
        )
    return {"deleted": preset_id}


def _reorder_rows(table: str, id_column: str, position_column: str, ids: list[str]) -> None:
    with get_store()._connect() as conn:
        for position, row_id in enumerate(ids, start=1):
            conn.execute(
                f"UPDATE {table} SET {position_column} = ?, updated_at = ? WHERE {id_column} = ?",
                (position, _now(), row_id),
            )


def _validate_upload_file(filename: str, content_type: str | None, file_kind: str) -> None:
    ext = Path(filename).suffix.lower().lstrip(".")
    if file_kind == "image":
        allowed_exts = _IMAGE_EXTENSIONS
        allowed_mimes = _IMAGE_MIME_TYPES
    elif file_kind == "audio":
        allowed_exts = _AUDIO_EXTENSIONS
        allowed_mimes = _AUDIO_MIME_TYPES
    elif file_kind == "video":
        allowed_exts = _VIDEO_EXTENSIONS
        allowed_mimes = _VIDEO_MIME_TYPES
    else:
        raise ValueError("file_kind must be 'image', 'audio', or 'video'")
    if not ext or ext not in allowed_exts:
        raise ValueError(f"unsupported {file_kind} file extension")
    normalized_type = (content_type or "").split(";", 1)[0].strip().lower()
    if normalized_type and normalized_type != "application/octet-stream" and normalized_type not in allowed_mimes:
        raise ValueError(f"unsupported {file_kind} content type")


def _asset_name_from_upload_filename(filename: str) -> str:
    if "/" in filename or "\\" in filename:
        raise ValueError('asset name cannot be empty or contain \\ / : * ? " < > |')
    asset_name = Path(filename).stem.strip()
    if (
        not asset_name
        or asset_name.startswith(".")
        or any(ch in _WINDOWS_ILLEGAL_ASSET_NAME_CHARS for ch in asset_name)
    ):
        raise ValueError('asset name cannot be empty or contain \\ / : * ? " < > |')
    return asset_name


def _video_filename_from_upload(filename: str) -> str:
    if "/" in filename or "\\" in filename:
        raise ValueError('video filename cannot be empty or contain \\ / : * ? " < > |')
    video_name = Path(filename).name.strip()
    stem = Path(video_name).stem.strip()
    if (
        not video_name
        or not stem
        or stem.startswith(".")
        or any(ch in _WINDOWS_ILLEGAL_ASSET_NAME_CHARS for ch in video_name)
    ):
        raise ValueError('video filename cannot be empty or contain \\ / : * ? " < > |')
    return video_name


def _parse_batch_asset_creates(body: Any) -> list[AssetCreate]:
    if not isinstance(body, list):
        raise ValueError("batch_upload JSON body must be a list")

    assets: list[AssetCreate] = []
    for item in body:
        if not isinstance(item, Mapping):
            raise ValueError("batch_upload JSON items must be objects")
        try:
            assets.append(AssetCreate(**dict(item)))
        except (TypeError, ValidationError) as exc:
            raise ValueError("invalid batch_upload asset item") from exc
    return assets


def _split_aliases(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if value in (None, ""):
        return []
    text = str(value)
    for separator in ("|", "，", "、", "\n"):
        text = text.replace(separator, ",")
    return [item.strip() for item in text.split(",") if item.strip()]


def _asset_create_from_mapping(item: Mapping[str, Any]) -> AssetCreate:
    data = dict(item)
    if "asset_type" in data and "type" not in data:
        data["type"] = data["asset_type"]
    if "detail" in data and "description" not in data:
        data["description"] = data["detail"]
    if "prompt" in data and "description" not in data:
        data["description"] = data["prompt"]
    if "ratio" in data and "image_ratio" not in data:
        data["image_ratio"] = data["ratio"]
    if "model" in data and "image_model" not in data:
        data["image_model"] = data["model"]
    data["aliases"] = _split_aliases(data.get("aliases"))
    return AssetCreate(**data)


def _parse_asset_metadata_import(request: AssetMetadataImport) -> list[AssetCreate]:
    text = request.text.strip()
    if not text:
        raise ValueError("asset metadata import text cannot be empty")
    import_format = request.format.strip().lower()
    if import_format == "json":
        data = json.loads(text)
        items = data.get("assets") if isinstance(data, dict) else data
        if not isinstance(items, list):
            raise ValueError("asset metadata JSON must be a list or {assets: [...]}")
        return [_asset_create_from_mapping(item) for item in items if isinstance(item, Mapping)]
    if import_format == "csv":
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            raise ValueError("asset metadata CSV header is required")
        return [_asset_create_from_mapping(row) for row in reader]
    raise ValueError("asset metadata format must be json or csv")


def _detect_upload_file_kind(filename: str, content_type: str | None) -> str:
    ext = Path(filename).suffix.lower().lstrip(".")
    normalized_type = (content_type or "").split(";", 1)[0].strip().lower()
    if ext in _IMAGE_EXTENSIONS:
        _validate_upload_file(filename, content_type, "image")
        return "image"
    if ext in _AUDIO_EXTENSIONS:
        _validate_upload_file(filename, content_type, "audio")
        return "audio"
    if normalized_type in _IMAGE_MIME_TYPES:
        _validate_upload_file(filename, content_type, "image")
        return "image"
    if normalized_type in _AUDIO_MIME_TYPES:
        _validate_upload_file(filename, content_type, "audio")
        return "audio"
    raise ValueError("unsupported asset file type")


def _asset_image_prompt(asset: Any, extra_prompt: str = "") -> str:
    description = str(getattr(asset, "description", "") or "").strip()
    image_params = str(getattr(asset, "image_params", "") or "").strip()
    extra = str(extra_prompt or "").strip()
    if not description:
        raise ValueError("请先填写资产详情描述 / 生图提示词")
    return "\n".join(part for part in (extra, description, image_params) if part)


def _asset_image_model_version(image_model: str) -> str:
    value = str(image_model or "").strip().lower()
    if value.startswith("dreamina"):
        value = value.removeprefix("dreamina").strip(" _-")
    return value or "4.0"


def _first_existing_image_path(result: DreaminaTaskResult) -> Path | None:
    for item in result.local_paths:
        path = Path(item)
        if path.suffix.lower().lstrip(".") in _IMAGE_EXTENSIONS and path.exists():
            return path
    return None


def _image_extension_from_url(url: str) -> str:
    ext = Path(urllib.parse.urlparse(url).path).suffix.lower().lstrip(".")
    return ext if ext in _IMAGE_EXTENSIONS else "png"


def _download_result_url_to_asset_source(url: str, target_dir: Path) -> Path:
    target_dir.mkdir(parents=True, exist_ok=True)
    ext = _image_extension_from_url(url)
    target_path = target_dir / f"result-{uuid.uuid4().hex}.{ext}"
    get_store()._assert_under_output_root(target_path)
    try:
        with urllib.request.urlopen(url, timeout=60) as response:
            target_path.write_bytes(response.read())
    except Exception as exc:
        target_path.unlink(missing_ok=True)
        raise ValueError("即梦返回了结果 URL，但下载图片失败") from exc
    return target_path


def _generate_asset_image(project_id: str, asset_id: str, request: AssetImageGenerateRequest) -> dict[str, Any]:
    store = get_store()
    store.get_project(project_id)
    asset = store._get_asset(asset_id)
    if asset.project_id != project_id:
        raise ValueError("asset does not belong to project")

    prompt = _asset_image_prompt(asset, request.extra_prompt)
    poll_seconds = request.poll_seconds or max(60, int(_settings.get("poll_seconds") or 30))
    generated_dir = store._asset_dir(project_id, asset.type, "image") / ".generated"
    generated_dir.mkdir(parents=True, exist_ok=True)
    store._assert_under_output_root(generated_dir)

    cli = _cli(timeout=poll_seconds + 90)
    submit_result = cli.submit_text2image(
        prompt=prompt,
        ratio=asset.image_ratio,
        resolution_type=request.resolution_type or "2k",
        poll_seconds=poll_seconds,
        model_version=_asset_image_model_version(asset.image_model),
    )
    final_result = submit_result
    if submit_result.submit_id:
        queried_result = cli.query_result(submit_result.submit_id, download_dir=generated_dir)
        if queried_result.local_paths or queried_result.result_url or queried_result.error_message:
            final_result = queried_result

    if final_result.error_message:
        raw = (final_result.raw_output or "").strip()
        detail = raw or final_result.error_message
        if detail == "dreamina command failed with exit code 1":
            detail = (
                "即梦 CLI 生图失败：dreamina text2image 返回 exit code 1，但 CLI 没有输出具体原因。"
                "请在“即梦设置”确认已登录、额度正常，并检查模型版本/画幅/分辨率是否被当前账号支持。"
            )
        raise ValueError(detail)

    image_source = _first_existing_image_path(final_result) or _first_existing_image_path(submit_result)
    cleanup_source = False
    if image_source is None and final_result.result_url:
        image_source = _download_result_url_to_asset_source(final_result.result_url, generated_dir)
        cleanup_source = True

    if image_source is None:
        submit_id_text = f"，submit_id: {submit_result.submit_id}" if submit_result.submit_id else ""
        raise ValueError(f"资产生图已提交但暂未下载到本地图片{submit_id_text}，请稍后重试或在即梦 CLI 中查询结果")

    updated_asset = store.upsert_asset_file(project_id, asset.type, asset.name, image_source, "image")
    if cleanup_source:
        image_source.unlink(missing_ok=True)
    return {
        "asset": _dump(updated_asset),
        "result": _dump(final_result),
        "source_path": str(image_source),
        "message": "资产图片已生成并保存",
    }


def _batch_generate_asset_images(project_id: str, request: AssetImageGenerateRequest) -> dict[str, Any]:
    store = get_store()
    store.get_project(project_id)
    if request.asset_ids:
        wanted = set(request.asset_ids)
        assets = [asset for asset in store.list_assets(project_id, request.asset_type) if asset.id in wanted]
    else:
        assets = store.list_assets(project_id, request.asset_type)

    results: list[dict[str, Any]] = []
    for asset in assets:
        try:
            result = _generate_asset_image(project_id, asset.id, request)
            results.append({"asset_id": asset.id, "asset_name": asset.name, "ok": True, **result})
        except ValueError as exc:
            results.append({"asset_id": asset.id, "asset_name": asset.name, "ok": False, "error": str(exc)})
    return {
        "results": results,
        "success_count": sum(1 for item in results if item.get("ok")),
        "failed_count": sum(1 for item in results if not item.get("ok")),
    }


async def _file_payload(request: Request) -> tuple[str, bytes, str | None]:
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type:
        form = await request.form()
        upload = form.get("file")
        if upload is None:
            raise ValueError("file is required")
        filename = getattr(upload, "filename", None) or "upload.bin"
        content = await upload.read()
        return filename, content, getattr(upload, "content_type", None)
    body = await request.json()
    filename = body.get("filename") or "upload.bin"
    if "content_base64" in body:
        return filename, base64.b64decode(body["content_base64"]), body.get("content_type")
    if "content" in body:
        return filename, str(body["content"]).encode("utf-8"), body.get("content_type")
    raise ValueError("content_base64 or file is required")


def _queue_status_payload(started: bool = False, paused: bool = False) -> dict[str, Any]:
    store = get_store()
    running_item = store.running_queue_item()
    return {
        "started": started,
        "paused": paused,
        "running_item": _dump(running_item) if running_item else None,
        "waiting_count": store.count_queue(JimengQueueStatus.waiting),
    }


def _candidate_local_path(candidate_path: str) -> Path:
    path = Path(candidate_path).resolve()
    output_root = get_store().output_root.resolve()
    try:
        path.relative_to(output_root)
    except ValueError as exc:
        raise KeyError(f"Jimeng video file not found: {candidate_path}") from exc
    if not path.exists() or not path.is_file():
        raise KeyError(f"Jimeng video file not found: {candidate_path}")
    return path


@router.get("/projects")
def list_projects():
    return _call(lambda: _dump(get_store().list_projects()))


@router.post("/projects")
def create_project(request: ProjectCreate):
    return _call(lambda: _dump(get_store().create_project(request.name, request.style, request.description, request.default_ratio)))


@router.get("/projects/{project_id}")
def get_project(project_id: str):
    return _call(lambda: _dump(get_store().get_project(project_id)))


@router.put("/projects/{project_id}")
def update_project(project_id: str, request: ProjectUpdate):
    return _call(lambda: _dump(_update_project(project_id, _model_data(request, exclude_unset=True))))


@router.delete("/projects/{project_id}")
def delete_project(project_id: str):
    return _call(lambda: (get_store().delete_project(project_id), {"deleted": project_id})[1])


@router.post("/projects/{project_id}/duplicate")
def duplicate_project(project_id: str):
    def duplicate():
        source = get_store().get_project(project_id)
        created = get_store().create_project(f"{source.name} Copy", source.style, source.description, source.default_ratio)
        _update_project(created.id, {"prompt_preset_id": source.prompt_preset_id})
        asset_map: dict[str, str] = {}
        for asset in get_store().list_assets(project_id):
            copied = get_store().create_asset(
                created.id,
                asset.type,
                asset.name,
                asset.aliases,
                asset.description,
                asset.image_model,
                asset.image_ratio,
                asset.image_params,
                asset.video_prompt,
            )
            asset_map[asset.id] = copied.id
        for shot in get_store().list_shots(project_id):
            new_shot = get_store().create_shot(created.id, shot.prompt)
            for binding in get_store().list_bindings(project_id, shot.id):
                if binding.asset_id in asset_map:
                    get_store().create_binding(
                        created.id,
                        new_shot.id,
                        asset_map[binding.asset_id],
                        binding.asset_type,
                        binding.source,
                        binding.locked,
                        binding.slot_order,
                    )
        return _dump(get_store().get_project(created.id))

    return _call(duplicate)


@router.get("/projects/{project_id}/shots")
def list_shots(project_id: str):
    return _call(lambda: _dump(get_store().list_shots(project_id)))


@router.post("/projects/{project_id}/shots")
def create_shot(project_id: str, request: ShotCreate):
    return _call(lambda: _dump(get_store().create_shot(project_id, request.prompt)))


@router.post("/projects/{project_id}/shots/import")
def import_shots(project_id: str, request: ShotImport):
    def create_imported():
        get_store().get_project(project_id)
        parsed = parse_csv_shots(request.text) if request.format.lower() == "csv" else parse_plain_text_shots(request.text)
        shots = [get_store().create_shot(project_id, item.prompt) for item in parsed]
        return {"shots": _dump(shots)}

    return _call(create_imported)


@router.post("/projects/{project_id}/shots/batch_replace")
def batch_replace_shots(project_id: str, request: BatchReplaceRequest):
    def replace():
        if not request.find:
            raise ValueError("find cannot be empty")
        shots = []
        for shot in get_store().list_shots(project_id):
            if request.find in shot.prompt:
                shots.append(get_store().update_shot(shot.id, prompt=shot.prompt.replace(request.find, request.replace)))
        return {"shots": _dump(shots)}

    return _call(replace)


@router.post("/projects/{project_id}/shots/match_assets")
def match_assets(project_id: str):
    def match_all():
        assets = get_store().list_assets(project_id)
        results = []
        for shot in get_store().list_shots(project_id):
            existing = {(binding.asset_id, binding.asset_type) for binding in get_store().list_bindings(project_id, shot.id)}
            bindings = []
            for match in match_assets_for_prompt(shot.prompt, assets):
                key = (match.asset_id, match.asset_type)
                if key in existing:
                    continue
                binding = get_store().create_binding(project_id, shot.id, match.asset_id, match.asset_type, source="auto")
                bindings.append(binding)
                existing.add(key)
            results.append(
                {
                    "shot_id": shot.id,
                    "bindings": _dump(bindings),
                    "matches": _dump(match_assets_for_prompt(shot.prompt, assets)),
                    "highlights": _dump(calculate_highlights(shot.prompt, assets)),
                }
            )
        return {"shots": results}

    return _call(match_all)


@router.put("/projects/{project_id}/shots/{shot_id}")
def update_shot(project_id: str, shot_id: str, request: ShotUpdate):
    return _call(lambda: (get_store().get_shot(project_id, shot_id), _dump(get_store().update_shot(shot_id, **_model_data(request, exclude_unset=True))))[1])


@router.post("/projects/{project_id}/shots/{shot_id}/detect_duration")
def detect_shot_duration(project_id: str, shot_id: str):
    def detect():
        shot = get_store().get_shot(project_id, shot_id)
        duration = _detect_duration_seconds(shot.prompt)
        if duration is None:
            raise ValueError("未在分镜提示词中识别到时长描述")
        updated = get_store().update_shot(shot_id, default_duration=duration)
        return {"duration": duration, "shot": _dump(updated)}

    return _call(detect)


@router.post("/projects/{project_id}/shots/batch_detect_duration")
def batch_detect_project_durations(project_id: str):
    def detect_all():
        results: list[dict[str, Any]] = []
        updated_count = 0
        skipped_count = 0
        for shot in get_store().list_shots(project_id):
            duration = _detect_duration_seconds(shot.prompt)
            if duration is None:
                skipped_count += 1
                results.append({"shot_id": shot.id, "shot_index": shot.shot_index, "duration": None, "updated": False})
                continue
            updated = get_store().update_shot(shot.id, default_duration=duration)
            updated_count += 1
            results.append(
                {
                    "shot_id": shot.id,
                    "shot_index": shot.shot_index,
                    "duration": duration,
                    "updated": True,
                    "shot": _dump(updated),
                }
            )
        return {"results": results, "updated_count": updated_count, "skipped_count": skipped_count}

    return _call(detect_all)


@router.delete("/projects/{project_id}/shots/{shot_id}")
def delete_shot(project_id: str, shot_id: str):
    return _call(lambda: (get_store().delete_shot(project_id, shot_id), {"deleted": shot_id})[1])


@router.post("/projects/{project_id}/shots/batch_delete")
def batch_delete_shots(project_id: str, request: ShotBatchDelete):
    return _call(lambda: {"deleted": get_store().delete_shots(project_id, request.shot_ids)})


@router.post("/projects/{project_id}/shots/{shot_id}/move")
def move_shot(project_id: str, shot_id: str, request: MoveRequest):
    return _call(lambda: _dump(get_store().move_shot(project_id, shot_id, request.direction)))


@router.get("/projects/{project_id}/assets")
def list_assets(
    project_id: str,
    type: Optional[JimengAssetType] = None,
    asset_type: Optional[JimengAssetType] = None,
):
    return _call(lambda: _dump(get_store().list_assets(project_id, type or asset_type)))


@router.post("/projects/{project_id}/assets")
def create_asset(project_id: str, request: AssetCreate):
    return _call(
        lambda: _dump(
            get_store().create_asset(
                project_id,
                request.type,
                request.name,
                request.aliases,
                request.description,
                request.image_model,
                request.image_ratio,
                request.image_params,
                request.video_prompt,
            )
        )
    )


@router.post("/projects/{project_id}/assets/batch_upload")
async def batch_upload_assets(project_id: str, request: Request):
    async def upload():
        content_type = request.headers.get("content-type", "")
        if "multipart/form-data" in content_type:
            form = await request.form()
            asset_type_value = form.get("asset_type")
            if not asset_type_value:
                raise ValueError("asset_type is required")
            asset_type = JimengAssetType(str(asset_type_value))
            image_ratio = str(form.get("image_ratio") or "16:9")
            if image_ratio not in {"16:9", "9:16"}:
                raise ValueError("image_ratio must be 16:9 or 9:16")
            uploads = form.getlist("files")
            if not uploads:
                raise ValueError("files is required")

            prepared_files = []
            for upload_file in uploads:
                filename = getattr(upload_file, "filename", None) or ""
                read = getattr(upload_file, "read", None)
                if not filename or read is None:
                    raise ValueError("files must contain uploaded files")
                asset_name = _asset_name_from_upload_filename(filename)
                upload_content_type = getattr(upload_file, "content_type", None)
                file_kind = _detect_upload_file_kind(filename, upload_content_type)
                if file_kind == "audio" and asset_type != JimengAssetType.character:
                    raise ValueError("audio assets are only supported for character")
                prepared_files.append(
                    {
                        "filename": filename,
                        "asset_name": asset_name,
                        "file_kind": file_kind,
                        "content": await upload_file.read(),
                    }
                )

            assets = [
                get_store().upsert_asset_file(
                    project_id,
                    asset_type if item["file_kind"] == "image" else JimengAssetType.character,
                    item["asset_name"],
                    Path(item["filename"]),
                    item["file_kind"],
                    content=item["content"],
                    image_ratio=image_ratio,
                )
                for item in prepared_files
            ]
            return {"assets": _dump(assets)}

        body = await request.json()
        assets = _parse_batch_asset_creates(body)
        return {
            "assets": _dump(
                [
                    get_store().create_asset(
                        project_id,
                        item.type,
                        item.name,
                        item.aliases,
                        item.description,
                        item.image_model,
                        item.image_ratio,
                        item.image_params,
                        item.video_prompt,
                    )
                    for item in assets
                ]
            )
        }

    return await _async_call(upload)


@router.post("/projects/{project_id}/assets/import_metadata")
def import_asset_metadata(project_id: str, request: AssetMetadataImport):
    def import_items():
        get_store().get_project(project_id)
        assets = _parse_asset_metadata_import(request)
        imported = [
            get_store().upsert_asset_metadata(
                project_id,
                item.type,
                item.name,
                item.aliases,
                item.description,
                item.image_model,
                item.image_ratio,
                item.image_params,
                item.video_prompt,
            )
            for item in assets
        ]
        return {"assets": _dump(imported)}

    return _call(import_items)


@router.get("/projects/{project_id}/assets/export_metadata")
def export_asset_metadata(project_id: str):
    return _call(lambda: {"assets": _dump(get_store().list_assets(project_id))})


@router.get("/projects/{project_id}/assets/export_images")
def export_asset_images(project_id: str, asset_type: Optional[JimengAssetType] = None):
    def build_zip():
        get_store().get_project(project_id)
        assets = get_store().list_assets(project_id, asset_type)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for asset in assets:
                if not asset.image_path:
                    continue
                path = Path(asset.image_path)
                try:
                    get_store()._assert_under_output_root(path)
                except ValueError:
                    continue
                if not path.exists() or not path.is_file():
                    continue
                archive_name = f"{asset.type.value}/{asset.image_filename or path.name}"
                archive.write(path, archive_name)
        buffer.seek(0)
        filename = f"{project_id}-asset-images.zip"
        return StreamingResponse(
            buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    return _call(build_zip)


@router.post("/projects/{project_id}/assets/batch_generate_images")
def batch_generate_asset_images(project_id: str, request: Optional[AssetImageGenerateRequest] = None):
    return _call(lambda: _batch_generate_asset_images(project_id, request or AssetImageGenerateRequest()))


@router.post("/projects/{project_id}/assets/batch_delete")
def batch_delete_assets(project_id: str, request: AssetBatchDelete):
    return _call(lambda: {"deleted": get_store().delete_assets(project_id, request.asset_ids)})


@router.put("/projects/{project_id}/assets/{asset_id}")
def update_asset(project_id: str, asset_id: str, request: AssetUpdate):
    return _call(lambda: (get_store().get_project(project_id), _dump(_update_asset(asset_id, _model_data(request, exclude_unset=True))))[1])


@router.delete("/projects/{project_id}/assets/{asset_id}")
def delete_asset(project_id: str, asset_id: str):
    return _call(lambda: (get_store().get_project(project_id), get_store().delete_asset(asset_id), {"deleted": asset_id})[2])


@router.post("/projects/{project_id}/assets/{asset_id}/image")
async def upload_asset_image(project_id: str, asset_id: str, request: Request):
    async def upload():
        asset = get_store()._get_asset(asset_id)
        if asset.project_id != project_id:
            raise ValueError("asset does not belong to project")
        filename, content, content_type = await _file_payload(request)
        _validate_upload_file(filename, content_type, "image")
        return _dump(get_store().upsert_asset_file(project_id, asset.type, asset.name, Path(filename), "image", content=content))

    return await _async_call(upload)


@router.post("/projects/{project_id}/assets/{asset_id}/image/generate")
def generate_asset_image(project_id: str, asset_id: str, request: Optional[AssetImageGenerateRequest] = None):
    return _call(lambda: _generate_asset_image(project_id, asset_id, request or AssetImageGenerateRequest()))


@router.post("/projects/{project_id}/assets/{asset_id}/voice")
async def upload_asset_voice(project_id: str, asset_id: str, request: Request):
    async def upload():
        asset = get_store()._get_asset(asset_id)
        if asset.project_id != project_id:
            raise ValueError("asset does not belong to project")
        filename, content, content_type = await _file_payload(request)
        _validate_upload_file(filename, content_type, "audio")
        return _dump(get_store().upsert_asset_file(project_id, asset.type, asset.name, Path(filename), "audio", content=content))

    return await _async_call(upload)


@router.get("/projects/{project_id}/assets/{asset_id}/voice")
def get_asset_voice(project_id: str, asset_id: str):
    def get_voice():
        asset = get_store()._get_asset(asset_id)
        if asset.project_id != project_id:
            raise ValueError("asset does not belong to project")
        return {"audio_filename": asset.audio_filename, "audio_path": asset.audio_path}

    return _call(get_voice)


async def _async_call(fn: Callable[[], Any]) -> Any:
    try:
        return await fn()
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/projects/{project_id}/shots/{shot_id}/bindings")
def list_bindings(project_id: str, shot_id: str):
    return _call(lambda: _dump(get_store().list_bindings(project_id, shot_id)))


@router.post("/projects/{project_id}/shots/{shot_id}/bindings")
def create_binding(project_id: str, shot_id: str, request: BindingCreate):
    return _call(
        lambda: _dump(
            get_store().create_binding(
                project_id,
                shot_id,
                request.asset_id,
                request.asset_type,
                request.source,
                request.locked,
                request.slot_order,
            )
        )
    )


@router.delete("/projects/{project_id}/shots/{shot_id}/bindings/{binding_id}")
def delete_binding(project_id: str, shot_id: str, binding_id: str):
    return _call(lambda: (get_store().list_bindings(project_id, shot_id), get_store().delete_binding(binding_id), {"deleted": binding_id})[2])


@router.put("/projects/{project_id}/shots/{shot_id}/bindings/{binding_id}")
def update_binding(project_id: str, shot_id: str, binding_id: str, request: BindingUpdate):
    def update():
        current = {binding.id for binding in get_store().list_bindings(project_id, shot_id)}
        if binding_id not in current:
            raise ValueError("binding does not belong to shot")
        return _dump(get_store().update_binding(binding_id, **_model_data(request, exclude_unset=True)))

    return _call(update)


@router.post("/projects/{project_id}/shots/{shot_id}/bindings/reorder")
def reorder_bindings(project_id: str, shot_id: str, request: BindingReorder):
    def reorder():
        current = {binding.id for binding in get_store().list_bindings(project_id, shot_id)}
        if any(binding_id not in current for binding_id in request.binding_ids):
            raise ValueError("binding does not belong to shot")
        _reorder_rows("asset_bindings", "id", "slot_order", request.binding_ids)
        return {"bindings": _dump(get_store().list_bindings(project_id, shot_id))}

    return _call(reorder)


@router.get("/queue")
def list_queue(project_id: Optional[str] = None):
    return _call(lambda: {"items": _dump(get_store().list_queue(project_id)), "status": _queue_status_payload()})


@router.post("/queue/items")
def create_queue_item(request: QueueItemCreate):
    return _call(lambda: _dump(get_store().create_queue_item(**_model_data(request))))


@router.post("/queue/items/batch")
def create_queue_items(request: QueueBatchCreate):
    return _call(lambda: {"items": _dump([get_store().create_queue_item(**_model_data(item)) for item in request.items])})


@router.post("/queue/start")
def start_queue():
    return _call(lambda: _queue_status_payload(started=True, paused=False))


@router.post("/queue/pause")
def pause_queue():
    return {"status": _queue_status_payload(started=False, paused=True)}


@router.post("/queue/items/{queue_item_id}/cancel")
def cancel_queue_item(queue_item_id: str):
    return _call(lambda: _dump(get_store().update_queue_item(queue_item_id, status=JimengQueueStatus.canceled, error_message=None)))


@router.post("/queue/items/{queue_item_id}/retry")
def retry_queue_item(queue_item_id: str):
    return _call(
        lambda: _dump(
            get_store().update_queue_item(
                queue_item_id,
                status=JimengQueueStatus.waiting,
                submit_id=None,
                gen_status=None,
                result_url=None,
                local_video_path=None,
                cli_raw_output=None,
                error_message=None,
                submitted_at=None,
                finished_at=None,
            )
        )
    )


@router.post("/queue/reorder")
def reorder_queue(request: QueueReorder):
    return _call(lambda: (_reorder_rows("queue_items", "id", "position", request.queue_item_ids), {"items": _dump(get_store().list_queue())})[1])


@router.get("/projects/{project_id}/shots/{shot_id}/candidates")
def list_candidates(project_id: str, shot_id: str):
    return _call(lambda: _dump(get_store().list_candidates(project_id, shot_id)))


@router.post("/projects/{project_id}/shots/{shot_id}/candidates/upload")
async def upload_video_candidate(project_id: str, shot_id: str, request: Request):
    async def upload():
        get_store().get_shot(project_id, shot_id)
        filename, content, content_type = await _file_payload(request)
        _validate_upload_file(filename, content_type, "video")
        safe_filename = _video_filename_from_upload(filename)
        return _dump(
            get_store().create_uploaded_video_candidate(
                project_id=project_id,
                shot_id=shot_id,
                video_filename=safe_filename,
                content=content,
                resolution=str(_settings.get("video_resolution") or "720p"),
                make_default=True,
            )
        )

    return await _async_call(upload)


@router.post("/projects/{project_id}/shots/{shot_id}/candidates/{candidate_id}/default")
def set_default_candidate(project_id: str, shot_id: str, candidate_id: str):
    return _call(lambda: (get_store().get_project(project_id), _dump(get_store().set_default_candidate(shot_id, candidate_id)))[1])


@router.post("/projects/{project_id}/shots/{shot_id}/candidates/{candidate_id}/lock")
def lock_candidate(project_id: str, shot_id: str, candidate_id: str, request: CandidateLock = CandidateLock()):
    return _call(lambda: (get_store().get_project(project_id), _dump(get_store().lock_candidate(shot_id, candidate_id, request.locked)))[1])


@router.get("/projects/{project_id}/shots/{shot_id}/candidates/{candidate_id}/download")
def download_candidate(project_id: str, shot_id: str, candidate_id: str):
    def get_download():
        candidates = get_store().list_candidates(project_id, shot_id)
        candidate = next((item for item in candidates if item.id == candidate_id), None)
        if candidate is None:
            raise KeyError(f"Jimeng video candidate not found: {candidate_id}")
        if candidate.video_path.startswith(("http://", "https://")):
            return RedirectResponse(candidate.video_path)
        path = _candidate_local_path(candidate.video_path)
        return FileResponse(path, filename=candidate.video_filename)

    return _call(get_download)


@router.post("/projects/{project_id}/shots/batch_download")
def batch_download_candidates(project_id: str):
    def list_all():
        candidates = []
        for shot in get_store().list_shots(project_id):
            candidates.extend(get_store().list_candidates(project_id, shot.id))
        return {"candidates": _dump(candidates)}

    return _call(list_all)


@router.get("/settings")
def get_settings():
    return _settings


@router.get("/settings/accounts")
def list_cli_accounts():
    accounts = get_store().list_cli_accounts()
    total = 0.0
    has_numeric_credit = False
    for account in accounts:
        if account.total_credit is None:
            continue
        try:
            total += float(account.total_credit)
            has_numeric_credit = True
        except ValueError:
            continue
    return {
        "accounts": _dump(accounts),
        "total_credit": str(int(total) if total.is_integer() else total) if has_numeric_credit else None,
    }


@router.post("/settings/accounts")
def create_cli_account(request: CliAccountCreate):
    return _call(lambda: _dump(get_store().create_cli_account(request.label)))


@router.put("/settings/accounts/{account_id}")
def update_cli_account(account_id: str, request: CliAccountUpdate):
    return _call(lambda: _dump(get_store().update_cli_account(account_id, **_model_data(request, exclude_unset=True))))


@router.delete("/settings/accounts/{account_id}")
def delete_cli_account(account_id: str):
    return _call(lambda: (get_store().delete_cli_account(account_id), {"deleted": account_id})[1])


@router.post("/settings/accounts/{account_id}/default")
def set_default_cli_account(account_id: str):
    return _call(lambda: _dump(get_store().set_default_cli_account(account_id)))


@router.post("/settings/accounts/{account_id}/check_login")
def check_cli_account_login(account_id: str):
    return _call(lambda: _check_account_login(account_id))


@router.post("/settings/accounts/{account_id}/query_credit")
def query_cli_account_credit(account_id: str):
    return _call(lambda: _query_account_credit(account_id))


@router.post("/settings/accounts/{account_id}/logout")
def logout_cli_account(account_id: str):
    def logout():
        result = _cli(timeout=15, account_id=account_id).logout()
        if result.error_message:
            get_store().update_cli_account(account_id, status="error", last_error=result.error_message)
        else:
            get_store().update_cli_account(
                account_id,
                status="logged_out",
                total_credit=None,
                user_id=None,
                user_name=None,
                vip_level=None,
                vip_expire_at=None,
                last_error=None,
            )
        return {"account": _dump(get_store().get_cli_account(account_id)), "result": _dump(result)}

    return _call(logout)


@router.post("/settings/accounts/{account_id}/login/start")
def start_cli_account_login_session(account_id: str, request: LoginSessionStart = LoginSessionStart()):
    return _call(lambda: _start_login_session(request.mode, request.open_browser, account_id))


@router.put("/settings")
def update_settings(request: SettingsUpdate):
    _settings.update({key: value for key, value in _model_data(request, exclude_unset=True).items() if value is not None})
    return _settings


@router.post("/settings/check_cli")
def check_cli():
    return {"available": _cli(timeout=10).check_available()}


@router.post("/settings/install_cli")
def install_cli():
    return _call(_install_dreamina_cli)


@router.post("/settings/check_login")
def check_login():
    result = _cli(timeout=20).user_credit()
    return {"logged_in": result.error_message is None, "result": _dump(result)}


@router.post("/settings/login/start")
def start_login_session(request: LoginSessionStart = LoginSessionStart()):
    return _call(lambda: _start_login_session(request.mode, request.open_browser, request.account_id))


@router.get("/settings/login_sessions/{session_id}")
def get_login_session(session_id: str):
    return _call(lambda: _get_login_session_payload(session_id))


@router.post("/settings/login_sessions/{session_id}/cancel")
def cancel_login_session(session_id: str):
    return _call(lambda: _cancel_login_session(session_id))


@router.post("/settings/login")
def login():
    return _dump(_cli(timeout=15).login(debug=False))


@router.post("/settings/login_debug")
def login_debug():
    return _dump(_cli(timeout=20).login(debug=True))


@router.post("/settings/relogin")
def relogin():
    return _dump(_cli(timeout=15).relogin())


@router.post("/settings/logout")
def logout():
    return _dump(_cli(timeout=15).logout())


@router.post("/settings/query_credit")
def query_credit():
    return _dump(_cli(timeout=20).user_credit())


@router.get("/settings/cli_paths")
def cli_paths():
    paths = DreaminaCli.cli_paths()
    return {"config": paths.get("config"), "tasks": paths.get("tasks_db"), "logs": paths.get("logs")}


@router.get("/settings/cli_capabilities")
def cli_capabilities():
    return {
        "commands": [
            "login",
            "relogin",
            "logout",
            "user_credit",
            "text2image",
            "text2video",
            "image2video",
            "multimodal2video",
            "query_result",
            "list_task",
        ],
        "supports_text2image": True,
        "supports_text2video": True,
        "supports_image2video": True,
        "supports_multimodal2video": True,
        "model_versions": _JIMENG_VIDEO_MODELS,
        "image_model_versions": _JIMENG_IMAGE_MODELS,
        "image_resolution_types": _JIMENG_IMAGE_RESOLUTION_TYPES,
        "ratios": _JIMENG_VIDEO_RATIOS,
        "multimodal_limits": _JIMENG_MULTIMODAL_LIMITS,
    }


@router.get("/prompt_presets")
def list_prompt_presets(enabled_only: bool = False):
    return _call(lambda: _dump(get_store().list_prompt_presets(enabled_only=enabled_only)))


@router.post("/prompt_presets")
def create_prompt_preset(request: PromptPresetCreate):
    return _call(
        lambda: _dump(
            get_store().create_prompt_preset(
                name=request.name,
                content=request.content,
                scope=request.scope,
                variables=request.variables,
                is_default=request.is_default,
                enabled=request.enabled,
            )
        )
    )


@router.put("/prompt_presets/{preset_id}")
def update_prompt_preset(preset_id: str, request: PromptPresetUpdate):
    return _call(lambda: _dump(_update_prompt_preset(preset_id, _model_data(request, exclude_unset=True))))


@router.delete("/prompt_presets/{preset_id}")
def delete_prompt_preset(preset_id: str):
    return _call(lambda: _delete_prompt_preset(preset_id))


@router.post("/prompt_presets/{preset_id}/default")
def set_default_prompt_preset(preset_id: str):
    return _call(lambda: _dump(get_store().set_default_prompt_preset(preset_id)))


@router.post("/projects/{project_id}/prompt_preset")
def set_project_prompt_preset(project_id: str, request: ProjectPromptPresetRequest):
    return _call(lambda: _dump(_update_project(project_id, {"prompt_preset_id": request.prompt_preset_id})))


@router.post("/projects/{project_id}/shots/{shot_id}/render_prompt_preview")
def render_prompt_preview(project_id: str, shot_id: str, request: RenderPromptPreviewRequest = RenderPromptPreviewRequest()):
    def render():
        project = get_store().get_project(project_id)
        shot = get_store().get_shot(project_id, shot_id)
        template = request.content
        if template is None:
            preset_id = request.prompt_preset_id or project.prompt_preset_id
            template = get_store()._get_prompt_preset(preset_id).content if preset_id else ""
        result = render_prompt_preset(
            template=template,
            project=project,
            shot=shot,
            bindings=get_store().list_bindings(project_id, shot_id),
            assets=get_store().list_assets(project_id),
            camera=request.camera,
            era=request.era,
            style_prompt=get_store().style_prompt_for(project.style, scope="video"),
        )
        return _dump(result)

    return _call(render)


