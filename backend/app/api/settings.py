"""即梦 CLI 设置和多账号接口边界。

负责 CLI 路径、登录授权、积分查询、多账号 profile、能力检测和一键安装。
不要在这里放具体分镜队列提交逻辑。
"""

import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
import webbrowser
from pathlib import Path
from typing import Any

from fastapi import APIRouter

from ..jimeng_cli import DreaminaCli, DreaminaResult, DreaminaTaskResult, hidden_subprocess_kwargs
from ..jimeng_models import JimengCliAccount
from .context import _call, _dump, _model_data, _now, _settings, get_store, load_runtime_settings, save_runtime_settings
from .schemas import CliAccountCreate, CliAccountLoginJson, CliAccountUpdate, LoginSessionStart, SettingsUpdate


router = APIRouter(prefix="/jimeng", tags=["jimeng-settings"])

_JIMENG_VIDEO_RATIOS = ["1:1", "3:4", "16:9", "4:3", "9:16", "21:9"]
_JIMENG_VIDEO_MODELS = [
    "seedance2.0fast_vip",
    "seedance2.0_vip",
    "seedance2.0mini",
    "seedance2.0fast",
    "seedance2.0",
]
_DEFAULT_JIMENG_IMAGE_MODELS = ["dreamina4.0", "dreamina4.1", "dreamina4.5", "dreamina4.6", "dreamina4.7", "dreamina5.0"]
_JIMENG_IMAGE_MODEL_REGISTRY_KEY = "jimeng_image_model_versions"
_JIMENG_IMAGE_MODEL_RE = re.compile(r"^(?:dreamina)?\s*(\d+(?:\.\d+)?)$", re.IGNORECASE)
_JIMENG_IMAGE_RESOLUTION_TYPES = ["2k", "4k"]
_JIMENG_MULTIMODAL_LIMITS = {
    "max_images": 9,
    "max_videos": 3,
    "max_audios": 3,
    "audio_min_seconds": 2,
    "audio_max_seconds": 15,
}
_LOGIN_SESSION_AUTH_WAIT_SECONDS = 15
_LOGIN_SESSIONS: dict[str, dict[str, Any]] = {}
_LOGIN_SESSIONS_LOCK = threading.Lock()


@router.get("/settings")
def get_settings():
    return load_runtime_settings()


@router.put("/settings")
def update_settings(request: SettingsUpdate):
    updates = {
        key: value
        for key, value in _model_data(request, exclude_unset=True).items()
        if value is not None or key == "duration"
    }
    return save_runtime_settings(updates)


@router.get("/settings/accounts")
def list_cli_accounts():
    accounts = get_store().list_cli_accounts()
    totals = _summarize_cli_account_credits(accounts)
    return {
        "accounts": _dump(accounts),
        **totals,
    }


@router.get("/settings/accounts/isolation_diagnostics")
def cli_account_isolation_diagnostics():
    return _call(_diagnose_cli_credential_isolation)


def _summarize_cli_account_credits(accounts: list[JimengCliAccount]) -> dict[str, Any]:
    total = 0.0
    raw_total = 0.0
    has_numeric_credit = False
    duplicate_user_ids: set[str] = set()
    seen_user_ids: set[str] = set()
    for account in accounts:
        if account.total_credit is None:
            continue
        try:
            credit = float(account.total_credit)
            has_numeric_credit = True
        except ValueError:
            continue
        raw_total += credit
        user_key = account.user_id.strip() if account.user_id else ""
        if user_key:
            if user_key in seen_user_ids:
                duplicate_user_ids.add(user_key)
                continue
            seen_user_ids.add(user_key)
        total += credit

    def format_credit(value: float) -> str:
        return str(int(value) if value.is_integer() else value)

    return {
        "total_credit": format_credit(total) if has_numeric_credit else None,
        "raw_total_credit": format_credit(raw_total) if has_numeric_credit else None,
        "duplicate_user_ids": sorted(duplicate_user_ids),
        "total_credit_note": "检测到多个账号返回同一个 user_id，积分总额已按唯一用户去重。" if duplicate_user_ids else None,
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
    def logout_account():
        account = get_store().get_cli_account(account_id)
        result = _cli(timeout=15, account_id=account_id).logout()
        if result.error_message:
            get_store().update_cli_account(account_id, status="error", last_error=result.error_message)
        else:
            _clear_account_credential(account)
            _clear_global_credential()
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

    return _call(logout_account)


@router.post("/settings/accounts/{account_id}/login/start")
def start_cli_account_login_session(account_id: str, request: LoginSessionStart = LoginSessionStart()):
    return _call(lambda: _start_login_session(request.mode, request.open_browser, account_id))


@router.post("/settings/accounts/{account_id}/login_json")
def import_cli_account_login_json(account_id: str, request: CliAccountLoginJson):
    return _call(lambda: _import_account_login_json(account_id, request.credential_json))


@router.post("/settings/login_json")
def import_login_json(request: CliAccountLoginJson):
    return _call(lambda: _import_global_login_json(request.credential_json))


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


def _normalize_jimeng_image_model(value: Any) -> str:
    match = _JIMENG_IMAGE_MODEL_RE.fullmatch(str(value or "").strip())
    return f"dreamina{match.group(1)}" if match else ""


def _merge_jimeng_image_models(*groups: Any) -> list[str]:
    models: list[str] = []
    seen: set[str] = set()
    for group in groups:
        if isinstance(group, str):
            values = [group]
        elif isinstance(group, list):
            values = group
        else:
            values = []
        for value in values:
            model = _normalize_jimeng_image_model(value)
            if model and model not in seen:
                seen.add(model)
                models.append(model)
    return models


def _discover_jimeng_image_models() -> list[str]:
    try:
        return _merge_jimeng_image_models(_cli(timeout=10).discover_image_models())
    except Exception:
        return []


def _jimeng_image_model_versions() -> list[str]:
    store = get_store()
    persisted = store.get_runtime_settings().get(_JIMENG_IMAGE_MODEL_REGISTRY_KEY)
    discovered = _discover_jimeng_image_models()
    models = _merge_jimeng_image_models(_DEFAULT_JIMENG_IMAGE_MODELS, persisted, discovered)
    persisted_models = _merge_jimeng_image_models(persisted)
    if models != persisted_models:
        store.update_runtime_settings({_JIMENG_IMAGE_MODEL_REGISTRY_KEY: models})
    return models


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
        "image_model_versions": _jimeng_image_model_versions(),
        "image_resolution_types": _JIMENG_IMAGE_RESOLUTION_TYPES,
        "ratios": _JIMENG_VIDEO_RATIOS,
        "multimodal_limits": _JIMENG_MULTIMODAL_LIMITS,
    }


def _cli_profile_env(profile_dir_path: Path) -> dict[str, str]:
    profile_dir_path = profile_dir_path.resolve()
    appdata_dir = profile_dir_path / "AppData" / "Roaming"
    localappdata_dir = profile_dir_path / "AppData" / "Local"
    config_dir = profile_dir_path / ".config"
    cache_dir = profile_dir_path / ".cache"
    dreamina_home = profile_dir_path / ".dreamina_cli"
    for directory in (profile_dir_path, appdata_dir, localappdata_dir, config_dir, cache_dir, dreamina_home):
        directory.mkdir(parents=True, exist_ok=True)
    profile_dir = str(profile_dir_path)
    env = os.environ.copy()
    env["HOME"] = profile_dir
    env["USERPROFILE"] = profile_dir
    env["APPDATA"] = str(appdata_dir)
    env["LOCALAPPDATA"] = str(localappdata_dir)
    env["XDG_CONFIG_HOME"] = str(config_dir)
    env["XDG_CACHE_HOME"] = str(cache_dir)
    env["DREAMINA_CLI_HOME"] = str(dreamina_home)
    env["DREAMINA_CLI_CONFIG_HOME"] = str(dreamina_home)
    return env


def _cli_account_env(account: JimengCliAccount) -> dict[str, str]:
    return _cli_profile_env(Path(account.profile_dir))


def _global_credential_path() -> Path:
    return Path.home() / ".dreamina_cli" / "credential.json"


def _account_credential_path(account: JimengCliAccount) -> Path:
    return Path(account.profile_dir).resolve() / "credential.json"


def _account_credential_exists(account: JimengCliAccount) -> bool:
    return _account_credential_path(account).exists()


def _activate_account_credential(account: JimengCliAccount, *, require_exists: bool = True) -> None:
    source = _account_credential_path(account)
    target = _global_credential_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    if source.exists():
        shutil.copy2(source, target)
        return
    if target.exists():
        target.unlink()
    if require_exists:
        raise ValueError(f"账号「{account.label}」还没有保存即梦登录凭证，请先点击登录授权。")


def _capture_account_credential(account: JimengCliAccount) -> None:
    source = _global_credential_path()
    if not source.exists():
        return
    target = _account_credential_path(account)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def _clear_global_credential() -> None:
    credential = _global_credential_path()
    if credential.exists():
        credential.unlink()


def _clear_account_credential(account: JimengCliAccount) -> None:
    credential = _account_credential_path(account)
    if credential.exists():
        credential.unlink()


def _cli(timeout: float | None = None, account_id: str | None = None) -> DreaminaCli:
    env = None
    if account_id:
        account = get_store().get_cli_account(account_id)
        _activate_account_credential(account)
    return DreaminaCli(executable=str(_settings.get("dreamina_executable") or "dreamina"), timeout=timeout, env=env)


def _diagnose_cli_credential_isolation() -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="dreamina-empty-profile-") as temp_dir:
        profile_dir = Path(temp_dir).resolve()
        env = _cli_profile_env(profile_dir)
        result = DreaminaCli(
            executable=str(_settings.get("dreamina_executable") or "dreamina"),
            timeout=20,
            env=env,
        ).user_credit()

    raw_output = result.raw_output or result.error_message or ""
    payload = _credit_payload_from_output(raw_output)
    if payload:
        return {
            "supported": False,
            "status": "global_credentials_detected",
            "message": "即梦 CLI 在空 profile 下仍返回已登录账号，说明当前 Windows 环境读取的是全局登录态。",
            "empty_profile_user_id": payload.get("user_id"),
            "empty_profile_total_credit": payload.get("total_credit"),
            "raw_output": raw_output,
        }

    if result.error_message:
        return {
            "supported": True,
            "status": "empty_profile_logged_out",
            "message": "空 profile 未读取到已登录账号，可以继续按账号 profile 尝试隔离授权。",
            "empty_profile_user_id": None,
            "empty_profile_total_credit": None,
            "raw_output": raw_output,
        }

    return {
        "supported": None,
        "status": "unknown",
        "message": "即梦 CLI 空 profile 返回结果无法判断登录态隔离能力。",
        "empty_profile_user_id": None,
        "empty_profile_total_credit": None,
        "raw_output": raw_output,
    }


def _install_dreamina_cli() -> dict[str, Any]:
    bash = shutil.which("bash")
    if not bash:
        raise ValueError("未检测到 bash / Git Bash，无法执行官方安装命令。请先安装 Git for Windows，或手动运行 curl -s https://jimeng.jianying.com/cli | bash")

    command = "curl -s https://jimeng.jianying.com/cli | bash"
    try:
        completed = subprocess.run(
            [bash, "-lc", command],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            timeout=180,
            encoding="utf-8",
            errors="replace",
            **hidden_subprocess_kwargs(),
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


def _extract_cli_line_value(raw_output: str, key: str) -> str | None:
    prefix = f"{key.lower()}:"
    for line in raw_output.splitlines():
        stripped = line.strip()
        if stripped.lower().startswith(prefix):
            return stripped.split(":", 1)[1].strip()
    return None


def _json_value_to_string(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _iter_json_dicts(value: Any):
    if isinstance(value, dict):
        yield value
        for item in value.values():
            yield from _iter_json_dicts(item)
    elif isinstance(value, list):
        for item in value:
            yield from _iter_json_dicts(item)


def _first_json_value(data: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    for key in keys:
        if key in data:
            return _json_value_to_string(data.get(key))
    return None


def _parse_json_credit_payload(raw_output: str) -> dict[str, str | None] | None:
    decoder = json.JSONDecoder()
    parsed_values: list[Any] = []
    stripped = raw_output.strip()
    if stripped:
        try:
            parsed_values.append(json.loads(stripped))
        except json.JSONDecodeError:
            for index, character in enumerate(raw_output):
                if character not in "{[":
                    continue
                try:
                    parsed, _ = decoder.raw_decode(raw_output[index:])
                except json.JSONDecodeError:
                    continue
                parsed_values.append(parsed)

    for parsed in parsed_values:
        for data in _iter_json_dicts(parsed):
            total_credit = _first_json_value(data, ("total_credit", "credit", "balance", "remaining_credit"))
            if total_credit is None or total_credit == "":
                continue
            return {
                "total_credit": total_credit,
                "user_id": _first_json_value(data, ("user_id", "uid")),
                "user_name": _first_json_value(data, ("user_name", "username", "nickname", "name")),
                "vip_level": _first_json_value(data, ("vip_level", "vip")),
                "vip_expire_at": _first_json_value(
                    data,
                    ("vip_expire_at", "vip_expired_at", "vip_end_time", "vip_expire_time"),
                ),
            }
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
    json_payload = _parse_json_credit_payload(raw_output)
    if json_payload:
        return json_payload
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
    _capture_account_credential(get_store().get_cli_account(account_id))
    _apply_credit_result_to_account(account_id, result)
    return {"account": _dump(get_store().get_cli_account(account_id)), "result": _dump(result)}


def _import_account_login_json(account_id: str, credential_json: Any) -> dict[str, Any]:
    account = get_store().get_cli_account(account_id)
    _clear_global_credential()
    get_store().update_cli_account(account_id, status="auth_required", last_error=None)
    result = _cli(timeout=30).login_with_json(credential_json)
    if result.error_message:
        get_store().update_cli_account(account_id, status="error", last_error=result.error_message)
        return {"account": _dump(get_store().get_cli_account(account_id)), "result": _dump(result), "credit_result": None}

    _capture_account_credential(account)
    if not _account_credential_exists(account):
        message = "即梦 JSON 登录已返回成功，但没有捕获到 credential.json，请确认 JSON 是否来自即梦 CLI 登录页。"
        failed = DreaminaTaskResult(raw_output=message, error_message=message)
        get_store().update_cli_account(account_id, status="error", last_error=message)
        return {"account": _dump(get_store().get_cli_account(account_id)), "result": _dump(result), "credit_result": _dump(failed)}

    credit_result = _cli(timeout=20, account_id=account_id).user_credit()
    _apply_credit_result_to_account(account_id, credit_result)
    return {
        "account": _dump(get_store().get_cli_account(account_id)),
        "result": _dump(result),
        "credit_result": _dump(credit_result),
    }


def _import_global_login_json(credential_json: Any) -> dict[str, Any]:
    _clear_global_credential()
    result = _cli(timeout=30).login_with_json(credential_json)
    if result.error_message:
        return {"result": _dump(result), "credit_result": None}
    credit_result = _cli(timeout=20).user_credit()
    return {"result": _dump(result), "credit_result": _dump(credit_result)}


def _check_account_login(account_id: str) -> dict[str, Any]:
    try:
        result = _cli(timeout=20, account_id=account_id).user_credit()
    except ValueError as exc:
        get_store().update_cli_account(account_id, status="logged_out", last_error=str(exc))
        result = DreaminaTaskResult(raw_output=str(exc), error_message=str(exc))
        return {"logged_in": False, "account": _dump(get_store().get_cli_account(account_id)), "result": _dump(result)}
    _capture_account_credential(get_store().get_cli_account(account_id))
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
    _refresh_waiting_auth_session(session_id)
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
    waiting_for_browser_auth = bool(auth) and not completed
    credit_result = None
    if completed and account_id:
        account = get_store().get_cli_account(account_id)
        _capture_account_credential(account)
        if not _account_credential_exists(account):
            waiting_for_browser_auth = bool(auth)
            completed = False
            if not waiting_for_browser_auth:
                parsed.error_message = "即梦授权流程结束，但没有捕获到 credential.json，请重新点击登录授权。"
        else:
            credit_result = _cli(timeout=20, account_id=account_id).user_credit()
            _apply_credit_result_to_account(account_id, credit_result)
    elif completed:
        credit_result = _cli(timeout=20).user_credit()

    with _LOGIN_SESSIONS_LOCK:
        session = _LOGIN_SESSIONS.get(session_id)
        if session is None or session.get("status") == "canceled":
            return
        session.update(
            {
                "status": "completed" if completed else ("waiting_auth" if waiting_for_browser_auth else "failed"),
                "result": _dump(parsed),
                "credit_result": _dump(credit_result) if credit_result else None,
                "auth": auth or session.get("auth"),
                "raw_output": raw_output,
                "error_message": None if waiting_for_browser_auth else parsed.error_message,
                "returncode": returncode,
                "updated_at": _now(),
            }
        )


def _refresh_waiting_auth_session(session_id: str) -> None:
    with _LOGIN_SESSIONS_LOCK:
        session = _LOGIN_SESSIONS.get(session_id)
        if session is None or session.get("status") != "waiting_auth":
            return
        account_id = session.get("account_id")
    if not account_id:
        return

    account = get_store().get_cli_account(account_id)
    if _global_credential_path().exists():
        _capture_account_credential(account)
    if not _account_credential_exists(account):
        return

    try:
        credit_result = _cli(timeout=20, account_id=account_id).user_credit()
    except ValueError:
        return
    _apply_credit_result_to_account(account_id, credit_result)
    with _LOGIN_SESSIONS_LOCK:
        session = _LOGIN_SESSIONS.get(session_id)
        if session is None or session.get("status") != "waiting_auth":
            return
        session.update(
            {
                "status": "completed" if credit_result.error_message is None else "failed",
                "credit_result": _dump(credit_result),
                "error_message": credit_result.error_message,
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
        _clear_global_credential()
        get_store().update_cli_account(account.id, status="auth_required", last_error=None)
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
        process = subprocess.Popen(
            args,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            env=env,
            **hidden_subprocess_kwargs(),
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
