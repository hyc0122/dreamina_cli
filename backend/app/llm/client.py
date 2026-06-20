"""大模型图片生成客户端。"""

import base64
import json
import urllib.parse
import urllib.request
from typing import Any

from .models import LlmGeneratedImage, LlmProviderSetting


def _join_url(base_url: str, suffix: str) -> str:
    return f"{base_url.rstrip('/')}/{suffix.lstrip('/')}"


def _image_extension_from_url(url: str) -> str:
    ext = urllib.parse.urlparse(url).path.rsplit(".", 1)
    if len(ext) == 2 and ext[1].lower() in {"png", "jpg", "jpeg", "webp"}:
        return ext[1].lower()
    return "png"


def _image_endpoint_suffix(settings: LlmProviderSetting) -> str:
    base_url = str(settings.base_url or "").lower()
    if settings.id == "jiasuapi" or "lk888.ai" in base_url:
        return "/v1/media/generate"
    return "/v1/images/generations"


def _candidate_dicts(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        candidates: list[dict[str, Any]] = []
        for item in value:
            candidates.extend(_candidate_dicts(item))
        return candidates
    if not isinstance(value, dict):
        return []
    if any(
        key in value
        for key in (
            "b64_json",
            "base64",
            "image_base64",
            "url",
            "image_url",
            "media_url",
            "file_url",
            "output_url",
        )
    ):
        return [value]
    candidates = []
    for key in ("data", "images", "image", "image_urls", "urls", "media", "output", "outputs", "result", "results"):
        if key in value:
            candidates.extend(_candidate_dicts(value[key]))
    return candidates


def _decode_base64_image(value: str) -> bytes:
    payload = value.split(",", 1)[1] if value.startswith("data:") and "," in value else value
    return base64.b64decode(payload)


def _decode_image_payload(payload: dict[str, Any]) -> LlmGeneratedImage:
    candidates = _candidate_dicts(payload)
    if not candidates:
        raise ValueError("大模型生图接口未返回图片数据")
    first = candidates[0]
    b64_value = first.get("b64_json") or first.get("base64") or first.get("image_base64")
    if b64_value:
        return LlmGeneratedImage(content=_decode_base64_image(str(b64_value)), extension="png", raw=payload)
    url = first.get("url") or first.get("image_url") or first.get("media_url") or first.get("file_url") or first.get("output_url")
    if url:
        with urllib.request.urlopen(str(url), timeout=120) as response:
            return LlmGeneratedImage(content=response.read(), extension=_image_extension_from_url(str(url)), raw=payload)
    raise ValueError("大模型生图接口未返回 base64 或 url")


def call_text_to_image(settings: LlmProviderSetting, prompt: str, model_id: str, size: str) -> LlmGeneratedImage:
    if settings.kind != "openai_compatible":
        raise ValueError("当前仅支持 OpenAI 兼容图片接口")
    endpoint_suffix = _image_endpoint_suffix(settings)
    endpoint = _join_url(settings.base_url, endpoint_suffix)
    body = {
        "model": model_id,
        "prompt": prompt,
        "size": size,
        "n": 1,
    }
    if endpoint_suffix != "/v1/media/generate":
        body["response_format"] = "b64_json"
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            payload = json.loads(response.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise ValueError(f"大模型生图接口返回 HTTP {exc.code}: {detail}") from exc
    except OSError as exc:
        raise ValueError(f"大模型生图接口请求失败: {exc}") from exc
    return _decode_image_payload(payload)
