import json
import mimetypes
import uuid
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Optional, Sequence

from ..jimeng_cli import DreaminaTaskResult


@dataclass
class JimengApiSession:
    label: str
    sessionid: str
    enabled: bool = True


@dataclass
class JimengApiHttpResponse:
    status_code: int
    text: str


HttpPost = Callable[[str, dict[str, str], dict[str, str], list[tuple[str, Path]], float], JimengApiHttpResponse]

_MODEL_MAP = {
    "seedance2.0fast": "jimeng-video-seedance-2.0-fast",
    "seedance2.0fast_vip": "jimeng-video-seedance-2.0-fast",
    "seedance2.0": "jimeng-video-seedance-2.0",
    "seedance2.0_vip": "jimeng-video-seedance-2.0",
    "seedance2.0mini": "jimeng-video-seedance-2.0-mini",
}


class JimengApiProvider:
    """兼容 iptag/jimeng-api 的实验视频生成通道。

    该通道使用 `Authorization: Bearer <sessionid>` 传递账号凭证，多个启用 sessionid 会按顺序轮换；
    单个 sessionid 失败时自动尝试下一个，避免一个账号失效阻塞整条队列。
    """

    def __init__(
        self,
        base_url: str = "http://localhost:5100",
        sessions: Optional[Sequence[JimengApiSession | dict[str, Any]]] = None,
        timeout: float = 1200,
        http_post: HttpPost | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.sessions = [_normalize_session(session) for session in (sessions or [])]
        self.timeout = timeout
        self.http_post = http_post or _default_http_post
        self._cursor = 0

    def submit_text2video(
        self,
        prompt: str,
        duration: int,
        ratio: str,
        video_resolution: str,
        poll_seconds: int,
        model_version: str = "",
    ) -> DreaminaTaskResult:
        fields = self._base_video_fields(prompt, duration, ratio, video_resolution, model_version)
        return self._submit(fields=fields, files=[])

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
        fields = self._base_video_fields(prompt, duration, ratio, video_resolution, model_version)
        fields["functionMode"] = "first_last_frames"
        return self._submit(fields=fields, files=[("image_file_1", Path(image_path))])

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
        images = _normalize_paths(image_paths)
        videos = _normalize_paths(video_paths)
        audios = _normalize_paths(audio_paths)
        if not images and not videos:
            raise ValueError("jimeng api omni_reference requires at least one image or video")
        if len(images) > 9:
            raise ValueError("jimeng api omni_reference image references cannot exceed 9")
        if len(videos) > 3:
            raise ValueError("jimeng api omni_reference video references cannot exceed 3")
        if len(audios) > 3:
            raise ValueError("jimeng api omni_reference audio references cannot exceed 3")

        fields = self._base_video_fields(prompt, duration, ratio, video_resolution, model_version)
        fields["functionMode"] = "omni_reference"
        files: list[tuple[str, Path]] = []
        for index, path in enumerate(images, start=1):
            _add_reference_field(fields, files, f"image_file_{index}", path)
        for index, path in enumerate(videos, start=1):
            _add_reference_field(fields, files, f"video_file_{index}", path)
        for index, path in enumerate(audios, start=1):
            _add_reference_field(fields, files, f"audio_file_{index}", path)
        return self._submit(fields=fields, files=files)

    def query_result(self, submit_id: str, download_dir: Optional[Path] = None) -> DreaminaTaskResult:
        return DreaminaTaskResult(submit_id=submit_id, gen_status="completed", raw_output="jimeng api returns final video from submit response")

    def _base_video_fields(
        self,
        prompt: str,
        duration: int,
        ratio: str,
        video_resolution: str,
        model_version: str,
    ) -> dict[str, str]:
        return {
            "model": _api_model_name(model_version),
            "prompt": prompt,
            "ratio": ratio,
            "resolution": video_resolution,
            "duration": str(duration),
            "response_format": "url",
        }

    def _submit(self, fields: dict[str, str], files: list[tuple[str, Path]]) -> DreaminaTaskResult:
        sessions = self._enabled_sessions()
        if not sessions:
            return DreaminaTaskResult(
                gen_status="failed",
                raw_output="jimeng api has no enabled sessionid",
                error_message="Jimeng API 没有启用的 sessionid，请先在即梦设置里填写并启用。",
            )

        errors: list[str] = []
        url = f"{self.base_url}/v1/videos/generations"
        ordered_sessions = self._rotated_sessions(sessions)
        for session in ordered_sessions:
            headers = {"Authorization": f"Bearer {session.sessionid}"}
            response = self.http_post(url, headers, fields, files, self.timeout)
            if 200 <= response.status_code < 300:
                result = _parse_video_response(response.text)
                result.raw_output = response.text
                if result.error_message is None:
                    return result
                errors.append(f"{session.label}: {result.error_message}")
                continue
            errors.append(f"{session.label}: HTTP {response.status_code} {response.text}".strip())

        message = "；".join(errors) or "Jimeng API request failed"
        return DreaminaTaskResult(gen_status="failed", raw_output=message, error_message=message)

    def _enabled_sessions(self) -> list[JimengApiSession]:
        return [session for session in self.sessions if session.enabled and session.sessionid.strip()]

    def _rotated_sessions(self, sessions: list[JimengApiSession]) -> list[JimengApiSession]:
        if not sessions:
            return []
        start = self._cursor % len(sessions)
        self._cursor = (self._cursor + 1) % len(sessions)
        return sessions[start:] + sessions[:start]


def _normalize_session(session: JimengApiSession | dict[str, Any]) -> JimengApiSession:
    if isinstance(session, JimengApiSession):
        return session
    return JimengApiSession(
        label=str(session.get("label") or "session"),
        sessionid=str(session.get("sessionid") or ""),
        enabled=bool(session.get("enabled", True)),
    )


def _api_model_name(model_version: str) -> str:
    normalized = str(model_version or "").strip().lower().replace("_", "")
    return _MODEL_MAP.get(normalized, model_version or "jimeng-video-seedance-2.0-fast")


def _normalize_paths(paths: Optional[Sequence[Path | str]]) -> list[Path | str]:
    if paths is None:
        return []
    return [path for path in paths if str(path)]


def _is_url(value: Path | str) -> bool:
    text = str(value)
    return text.startswith("http://") or text.startswith("https://")


def _add_reference_field(fields: dict[str, str], files: list[tuple[str, Path]], name: str, path: Path | str) -> None:
    if _is_url(path):
        fields[name] = str(path)
        return
    files.append((name, Path(path)))


def _parse_video_response(text: str) -> DreaminaTaskResult:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return DreaminaTaskResult(gen_status="failed", raw_output=text, error_message="Jimeng API returned non-JSON response")

    result_url = _find_first_url(data)
    submit_id = _find_first_value(data, {"submit_id", "task_id", "id"})
    status = _find_first_value(data, {"gen_status", "status", "state"})
    error = _find_first_value(data, {"error", "error_message", "message"}) if not result_url else None
    return DreaminaTaskResult(
        submit_id=submit_id,
        gen_status="completed" if result_url and not status else status,
        result_url=result_url,
        local_paths=[],
        raw_output=text,
        error_message=error,
    )


def _find_first_url(value: Any) -> str | None:
    if isinstance(value, dict):
        for key in ("url", "video_url", "result_url"):
            if isinstance(value.get(key), str) and value[key].startswith(("http://", "https://")):
                return value[key]
        for item in value.values():
            found = _find_first_url(item)
            if found:
                return found
    elif isinstance(value, list):
        for item in value:
            found = _find_first_url(item)
            if found:
                return found
    elif isinstance(value, str) and value.startswith(("http://", "https://")):
        return value
    return None


def _find_first_value(value: Any, keys: set[str]) -> str | None:
    if isinstance(value, dict):
        for key in keys:
            if value.get(key) not in (None, ""):
                return str(value[key])
        for item in value.values():
            found = _find_first_value(item, keys)
            if found:
                return found
    elif isinstance(value, list):
        for item in value:
            found = _find_first_value(item, keys)
            if found:
                return found
    return None


def _default_http_post(
    url: str,
    headers: dict[str, str],
    fields: dict[str, str],
    files: list[tuple[str, Path]],
    timeout: float,
) -> JimengApiHttpResponse:
    if files:
        body, content_type = _encode_multipart(fields, files)
        request_headers = {**headers, "Content-Type": content_type}
    else:
        body = json.dumps(fields, ensure_ascii=False).encode("utf-8")
        request_headers = {**headers, "Content-Type": "application/json"}
    request = urllib.request.Request(url, data=body, headers=request_headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return JimengApiHttpResponse(status_code=int(response.status), text=response.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as exc:
        return JimengApiHttpResponse(status_code=int(exc.code), text=exc.read().decode("utf-8", errors="replace"))
    except urllib.error.URLError as exc:
        return JimengApiHttpResponse(status_code=599, text=str(exc.reason))


def _encode_multipart(fields: dict[str, str], files: list[tuple[str, Path]]) -> tuple[bytes, str]:
    boundary = f"----dreamina-cli-{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode("utf-8"),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"),
                str(value).encode("utf-8"),
                b"\r\n",
            ]
        )
    for name, path in files:
        filename = path.name
        content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        chunks.extend(
            [
                f"--{boundary}\r\n".encode("utf-8"),
                f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode("utf-8"),
                f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"),
                path.read_bytes(),
                b"\r\n",
            ]
        )
    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"
