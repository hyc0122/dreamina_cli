"""OpenAI 兼容图片生成客户端。"""

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


def _decode_openai_image_payload(payload: dict[str, Any]) -> LlmGeneratedImage:
    candidates = payload.get("data")
    if not isinstance(candidates, list):
        candidates = payload.get("images")
    if not isinstance(candidates, list) or not candidates:
        raise ValueError("大模型生图接口未返回图片数据")
    first = candidates[0]
    if not isinstance(first, dict):
        raise ValueError("大模型生图接口返回格式无效")
    b64_value = first.get("b64_json") or first.get("base64") or first.get("image_base64")
    if b64_value:
        return LlmGeneratedImage(content=base64.b64decode(str(b64_value)), extension="png", raw=payload)
    url = first.get("url") or first.get("image_url")
    if url:
        with urllib.request.urlopen(str(url), timeout=120) as response:
            return LlmGeneratedImage(content=response.read(), extension=_image_extension_from_url(str(url)), raw=payload)
    raise ValueError("大模型生图接口未返回 b64_json 或 url")


def call_text_to_image(settings: LlmProviderSetting, prompt: str, model_id: str, size: str) -> LlmGeneratedImage:
    if settings.kind != "openai_compatible":
        raise ValueError("当前仅支持 OpenAI 兼容图片接口")
    endpoint = _join_url(settings.base_url, "/v1/images/generations")
    body = {
        "model": model_id,
        "prompt": prompt,
        "size": size,
        "n": 1,
        "response_format": "b64_json",
    }
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
    return _decode_openai_image_payload(payload)
