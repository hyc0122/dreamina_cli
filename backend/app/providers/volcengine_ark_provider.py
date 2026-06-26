import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Optional, Sequence

from ..jimeng_cli import DreaminaTaskResult
from ..llm.models import LlmProviderSetting

DEFAULT_VOLCENGINE_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
ARK_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36"


def _join_url(base_url: str, suffix: str) -> str:
    return f"{base_url.rstrip('/')}/{suffix.lstrip('/')}"


def _api_root(base_url: str) -> str:
    value = str(base_url or DEFAULT_VOLCENGINE_ARK_BASE_URL).strip().rstrip("/")
    for suffix in ("/chat/completions", "/contents/generations/tasks", "/api/v3"):
        if value.endswith(suffix):
            value = value[: -len(suffix)]
            break
    if value.endswith("/api/v3"):
        return value
    return _join_url(value, "/api/v3")


def _normalized_api_key(api_key: str) -> str:
    value = str(api_key or "").strip()
    if value.lower().startswith("bearer "):
        return value[7:].strip()
    return value


def _headers(settings: LlmProviderSetting, *, accept: str = "application/json") -> dict[str, str]:
    api_key = _normalized_api_key(settings.api_key)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": accept,
        "User-Agent": ARK_USER_AGENT,
    }
    if accept == "application/json":
        headers["Content-Type"] = "application/json"
    return headers


def _decode_json(response: Any) -> dict[str, Any]:
    payload = json.loads(response.read().decode("utf-8", errors="replace"))
    if not isinstance(payload, dict):
        raise ValueError("火山方舟接口返回格式无效")
    return payload


def _json_request(url: str, settings: LlmProviderSetting, *, method: str = "GET", body: dict[str, Any] | None = None, timeout: int = 60) -> dict[str, Any]:
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=_headers(settings), method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return _decode_json(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise ValueError(f"火山方舟接口返回 HTTP {exc.code}: {detail}") from exc


def _raw(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False)


def _status(payload: dict[str, Any]) -> str:
    return str(payload.get("status") or payload.get("state") or "unknown")


def _error(payload: dict[str, Any]) -> tuple[str | None, str | None]:
    error = payload.get("error")
    if isinstance(error, dict):
        return str(error.get("code") or "") or None, str(error.get("message") or "") or None
    if isinstance(error, str) and error:
        return None, error
    return None, None


def _download_video(url: str, target: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": ARK_USER_AGENT, "Accept": "video/mp4,video/*,*/*"}, method="GET")
    with urllib.request.urlopen(request, timeout=180) as response:
        target.write_bytes(response.read())


class VolcengineArkProvider:
    """火山方舟文生视频通道。第一版只接纯文本文生视频。"""

    def __init__(self, settings: LlmProviderSetting):
        self.settings = settings

    def submit_text2video(
        self,
        prompt: str,
        duration: int,
        ratio: str,
        video_resolution: str,
        poll_seconds: int,
        model_version: str = "",
    ) -> DreaminaTaskResult:
        if not _normalized_api_key(self.settings.api_key):
            raise ValueError("火山方舟供应商缺少 API Key")
        body = {
            "model": model_version,
            "content": [{"type": "text", "text": prompt}],
            "duration": int(duration),
            "ratio": ratio,
            "resolution": video_resolution,
        }
        payload = _json_request(
            _join_url(_api_root(self.settings.base_url), "/contents/generations/tasks"),
            self.settings,
            method="POST",
            body=body,
            timeout=180,
        )
        submit_id = payload.get("id") or payload.get("task_id")
        category, message = _error(payload)
        return DreaminaTaskResult(
            submit_id=str(submit_id) if submit_id else None,
            gen_status=_status(payload),
            raw_output=_raw(payload),
            error_category=category,
            error_message=message,
        )

    def submit_image2video(
        self,
        image_path: Path | str,
        prompt: str,
        duration: int,
        ratio: str = "9:16",
        video_resolution: str = "720p",
        poll_seconds: int = 30,
        model_version: str = "",
    ) -> DreaminaTaskResult:
        raise ValueError("火山方舟第一版仅支持纯文本文生视频")

    def submit_multimodal2video(
        self,
        image_paths: Optional[Sequence[Path | str]] = None,
        video_paths: Optional[Sequence[Path | str]] = None,
        audio_paths: Optional[Sequence[Path | str]] = None,
        prompt: str = "",
        duration: int = 5,
        ratio: str = "9:16",
        video_resolution: str = "720p",
        poll_seconds: int = 30,
        model_version: str = "",
    ) -> DreaminaTaskResult:
        raise ValueError("火山方舟第一版仅支持纯文本文生视频")

    def query_result(self, submit_id: str, download_dir: Optional[Path] = None) -> DreaminaTaskResult:
        payload = _json_request(
            _join_url(_api_root(self.settings.base_url), f"/contents/generations/tasks/{submit_id}"),
            self.settings,
            method="GET",
            timeout=60,
        )
        status = _status(payload)
        content = payload.get("content")
        result_url = content.get("video_url") if isinstance(content, dict) else None
        category, message = _error(payload)
        local_paths: list[str] = []
        if status == "succeeded" and result_url and download_dir is not None:
            download_dir = Path(download_dir)
            download_dir.mkdir(parents=True, exist_ok=True)
            target = download_dir / f"{submit_id}.mp4"
            _download_video(str(result_url), target)
            local_paths.append(str(target))
        return DreaminaTaskResult(
            submit_id=str(payload.get("id") or submit_id),
            gen_status=status,
            result_url=str(result_url) if result_url else None,
            local_paths=local_paths,
            raw_output=_raw(payload),
            error_category=category,
            error_message=message,
        )