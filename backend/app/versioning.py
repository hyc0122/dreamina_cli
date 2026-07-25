"""应用版本读取和云端版本检测。"""

from __future__ import annotations

import html
import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_NAME = "即梦cli自动排队助手"
DEFAULT_CURRENT_VERSION = "v1.00.071"
DEFAULT_UPDATE_CHECK_URL = "https://version.j11.net/"
DEFAULT_UPDATE_DOC_URL = "https://my.feishu.cn/docx/AfO9d2Gd0ovLpLxpeN2cjm1xnF2?from=from_copylink"

_VERSION_RE = re.compile(r"v?\s*(\d+)\.(\d+)\.(\d+)", re.IGNORECASE)
_README_VERSION_RE = re.compile(r"当前版本\s*[：:]\s*(v?\s*\d+\.\d+\.\d+)", re.IGNORECASE)
_REMOTE_VERSION_PATTERNS = (
    re.compile(r'"version"\s*:\s*"?(v?\s*\d+\.\d+\.\d+)"?', re.IGNORECASE),
    re.compile(r"version\s*[:=]\s*['\"]?(v?\s*\d+\.\d+\.\d+)", re.IGNORECASE),
    _VERSION_RE,
)


def normalize_app_version(value: Any) -> str | None:
    match = _VERSION_RE.search(str(value or ""))
    if not match:
        return None
    major, minor, patch = (int(part) for part in match.groups())
    return f"v{major}.{minor:02d}.{patch:03d}"


def app_version_parts(value: Any) -> tuple[int, int, int] | None:
    match = _VERSION_RE.search(str(value or ""))
    if not match:
        return None
    return tuple(int(part) for part in match.groups())


def requires_major_line_update(current: str, latest: str) -> bool:
    current_parts = app_version_parts(current)
    latest_parts = app_version_parts(latest)
    if not current_parts or not latest_parts:
        return current != latest
    return latest_parts[:2] != current_parts[:2]


def project_root() -> Path:
    return Path(os.getenv("DREAMINA_CLI_PROJECT_DIR", Path(__file__).resolve().parents[2])).resolve()


def current_app_version(root: Path | None = None) -> str:
    root = root or project_root()
    readme = root / "README.md"
    if readme.exists():
        try:
            text = readme.read_text(encoding="utf-8")
        except OSError:
            text = ""
        match = _README_VERSION_RE.search(text)
        normalized = normalize_app_version(match.group(1) if match else "")
        if normalized:
            return normalized

    pyproject = root / "pyproject.toml"
    if pyproject.exists():
        try:
            text = pyproject.read_text(encoding="utf-8")
        except OSError:
            text = ""
        match = re.search(r'^version\s*=\s*"([^"]+)"', text, re.MULTILINE)
        normalized = normalize_app_version(match.group(1) if match else "")
        if normalized:
            return normalized

    return DEFAULT_CURRENT_VERSION


def extract_remote_version(raw_text: str) -> str | None:
    text = html.unescape(raw_text or "")
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        payload = None
    if isinstance(payload, dict):
        for key in ("version", "latest_version", "current_version"):
            normalized = normalize_app_version(payload.get(key))
            if normalized:
                return normalized

    for pattern in _REMOTE_VERSION_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        normalized = normalize_app_version(match.group(0))
        if not normalized:
            for group in match.groups():
                normalized = normalize_app_version(group)
                if normalized:
                    break
        if normalized:
            return normalized
    return None


def extract_remote_update_url(raw_text: str) -> str | None:
    text = html.unescape(raw_text or "")
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        payload = None
    if isinstance(payload, dict):
        url = payload.get("url") or payload.get("update_url") or payload.get("download_url")
        if isinstance(url, str) and url.startswith(("http://", "https://")):
            return url
    match = re.search(r"https?://[^\s\"'<>]+", text)
    return match.group(0) if match else None


def fetch_remote_version_text(url: str, timeout: float = 5.0) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "jimeng-cli-auto-queue-helper/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace")


def update_check_url() -> str:
    return (os.getenv("DREAMINA_CLI_VERSION_URL") or DEFAULT_UPDATE_CHECK_URL).strip()


def update_doc_url() -> str:
    return (os.getenv("DREAMINA_CLI_UPDATE_DOC_URL") or DEFAULT_UPDATE_DOC_URL).strip()


def build_version_status(remote_text: str | None = None) -> dict[str, Any]:
    current = current_app_version()
    source_url = update_check_url()
    doc_url = update_doc_url()
    error: str | None = None
    raw_text = remote_text

    if raw_text is None and source_url:
        try:
            raw_text = fetch_remote_version_text(source_url)
        except (OSError, TimeoutError, UnicodeError, urllib.error.URLError) as exc:
            error = str(exc)
            raw_text = ""

    latest = extract_remote_version(raw_text or "") if raw_text is not None else None
    remote_url = extract_remote_update_url(raw_text or "") if raw_text else None
    latest = latest or current
    mismatch = latest != current
    update_required = requires_major_line_update(current, latest) if mismatch else False
    if update_required:
        message = "检测到大版本更新，请更新后再打开前端。"
    elif mismatch:
        message = "检测到小版本更新，可继续使用，建议空闲时更新。"
    else:
        message = "当前已是最新版本。"

    return {
        "app_name": APP_NAME,
        "current_version": current,
        "latest_version": latest,
        "update_available": mismatch,
        "update_required": update_required,
        "update_check_url": source_url,
        "update_url": remote_url or doc_url,
        "message": message,
        "error": error,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
