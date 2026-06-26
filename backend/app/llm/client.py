"""OpenAI 兼容图片生成客户端。"""

import base64
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from .models import LlmChatCompletion, LlmGeneratedImage, LlmImageTaskStart, LlmImageTaskStatus, LlmProviderSetting

JIASU_MEDIA_HOSTS = {"api.lk888.ai", "api.lk666.ai"}
DEFAULT_JIASU_BASE_URL = "https://api.lk888.ai"
JIASU_STATUS_MAX_POLLS = 60
JIASU_STATUS_POLL_INTERVAL_SECONDS = 3
URL_OPEN_MAX_ATTEMPTS = 3
URL_OPEN_RETRY_BASE_SECONDS = 1
JIASU_MIN_IMAGE_PIXELS = 655_360
JIASU_MAX_IMAGE_PIXELS = 8_294_400
JIASU_RATIO_SIZE_MAP = {
    "16:9": "2560x1440",
    "9:16": "1440x2560",
    "1:1": "1024x1024",
    "4:3": "1280x960",
    "3:4": "960x1280",
}
JIASU_IMAGE_QUALITIES = {"auto", "high", "medium", "low"}


def _join_url(base_url: str, suffix: str) -> str:
    return f"{base_url.rstrip('/')}/{suffix.lstrip('/')}"


def _image_extension_from_url(url: str) -> str:
    ext = urllib.parse.urlparse(url).path.rsplit(".", 1)
    if len(ext) == 2 and ext[1].lower() in {"png", "jpg", "jpeg", "webp"}:
        return ext[1].lower()
    return "png"


def _jiasu_api_root(base_url: str) -> str:
    value = str(base_url or DEFAULT_JIASU_BASE_URL).strip().rstrip("/")
    for suffix in ("/v1/media/generate", "/v1/media/status", "/v1/images/generations", "/v1", "/api"):
        if value.endswith(suffix):
            value = value[: -len(suffix)]
            break
    return value or DEFAULT_JIASU_BASE_URL


def _media_generate_endpoint(base_url: str) -> str:
    return _join_url(_jiasu_api_root(base_url), "/v1/media/generate")


def _media_status_endpoint(base_url: str, task_id: object) -> str:
    encoded_task_id = urllib.parse.quote(str(task_id), safe="")
    return f"{_join_url(_jiasu_api_root(base_url), '/v1/media/status')}?task_id={encoded_task_id}"


def _openai_image_endpoint(base_url: str) -> str:
    value = str(base_url or "").strip().rstrip("/")
    if value.endswith("/v1/images/generations"):
        return value
    if value.endswith("/v1"):
        return _join_url(value, "images/generations")
    return _join_url(value, "/v1/images/generations")


def _is_jiasu_provider(settings: LlmProviderSetting) -> bool:
    base_url = str(settings.base_url or DEFAULT_JIASU_BASE_URL).strip().rstrip("/")
    parsed = urllib.parse.urlparse(base_url)
    return settings.id == "jiasuapi" or parsed.netloc in JIASU_MEDIA_HOSTS or base_url.endswith("/v1/media/generate")


def _normalized_api_key(api_key: str) -> str:
    value = str(api_key or "").strip()
    if value.lower().startswith("bearer "):
        return value[7:].strip()
    return value


def _auth_headers(settings: LlmProviderSetting) -> dict[str, str]:
    api_key = _normalized_api_key(settings.api_key)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if _is_jiasu_provider(settings):
        # 佳速文档支持多种鉴权头，保留兼容性，避免不同网关只认其中一种。
        headers["x-api-key"] = api_key
        headers["x-goog-api-key"] = api_key
    return headers


def _decode_json_response(response: Any) -> dict[str, Any]:
    payload = json.loads(response.read().decode("utf-8", errors="replace"))
    if not isinstance(payload, dict):
        raise ValueError("大模型生图接口返回格式无效")
    return payload


def _transient_request_message(exc: OSError) -> str:
    text = str(exc)
    lowered = text.lower()
    if "unexpected_eof_while_reading" in lowered or "eof occurred" in lowered:
        return "SSL 连接被远端提前断开"
    if "timed out" in lowered or "timeout" in lowered:
        return "请求超时"
    if "connection reset" in lowered or "connection aborted" in lowered or "remote end closed" in lowered:
        return "网络连接被重置"
    return text


def _urlopen_json(request: urllib.request.Request, timeout: int) -> dict[str, Any]:
    last_error: OSError | None = None
    for attempt in range(URL_OPEN_MAX_ATTEMPTS):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return _decode_json_response(response)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            if exc.code == 401:
                raise ValueError(f"大模型生图接口鉴权失败：API Key 无效或未启用。平台返回 HTTP 401: {detail}") from exc
            raise ValueError(f"大模型生图接口返回 HTTP {exc.code}: {detail}") from exc
        except OSError as exc:
            last_error = exc
            if attempt < URL_OPEN_MAX_ATTEMPTS - 1:
                time.sleep(URL_OPEN_RETRY_BASE_SECONDS * (attempt + 1))
                continue
            message = _transient_request_message(exc)
            raise ValueError(f"大模型生图接口请求失败：{message}，已重试 {URL_OPEN_MAX_ATTEMPTS} 次，请稍后再试。") from exc
    raise ValueError(f"大模型生图接口请求失败: {last_error}")


def _payload_data(payload: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data")
    return data if isinstance(data, dict) else payload


def _raise_jiasu_api_error(payload: dict[str, Any]) -> None:
    if "code" not in payload:
        return
    code = payload.get("code")
    if str(code) in {"0", "200"}:
        return
    msg = payload.get("msg") or payload.get("message") or payload.get("error") or "未知错误"
    data = payload.get("data")
    model = data.get("model") if isinstance(data, dict) else None
    suffix = f"，模型：{model}" if model else ""
    raise ValueError(f"大模型生图接口返回错误 {code}: {msg}{suffix}")


def _extract_task_id(payload: dict[str, Any]) -> object | None:
    for container in (payload, _payload_data(payload)):
        task_id = container.get("task_id") or container.get("id")
        if task_id:
            return task_id
        task_ids = container.get("任务ids") or container.get("task_ids")
        if isinstance(task_ids, list) and task_ids:
            return task_ids[0]
    return None


def _download_image(url: str, raw: dict[str, Any]) -> LlmGeneratedImage:
    last_error: OSError | None = None
    parsed = urllib.parse.urlparse(str(url))
    origin = f"{parsed.scheme}://{parsed.netloc}/" if parsed.scheme and parsed.netloc else ""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    }
    if origin:
        headers["Referer"] = origin
    for attempt in range(URL_OPEN_MAX_ATTEMPTS):
        try:
            request = urllib.request.Request(str(url), headers=headers, method="GET")
            with urllib.request.urlopen(request, timeout=120) as response:
                return LlmGeneratedImage(content=response.read(), extension=_image_extension_from_url(str(url)), raw=raw)
        except urllib.error.HTTPError as exc:
            last_error = exc
            if attempt < URL_OPEN_MAX_ATTEMPTS - 1 and exc.code in {403, 408, 429, 500, 502, 503, 504}:
                time.sleep(URL_OPEN_RETRY_BASE_SECONDS * (attempt + 1))
                continue
            detail = exc.read().decode("utf-8", errors="replace")
            suffix = f"：{detail}" if detail else ""
            raise ValueError(f"大模型生图结果图片下载失败：HTTP {exc.code}{suffix} result_url={url}") from exc
        except OSError as exc:
            last_error = exc
            if attempt < URL_OPEN_MAX_ATTEMPTS - 1:
                time.sleep(URL_OPEN_RETRY_BASE_SECONDS * (attempt + 1))
                continue
            message = _transient_request_message(exc)
            raise ValueError(f"大模型生图结果图片下载失败：{message}，已重试 {URL_OPEN_MAX_ATTEMPTS} 次，请稍后再试。 result_url={url}") from exc
    raise ValueError(f"大模型生图结果图片下载失败: {last_error} result_url={url}")


def download_text_to_image_result(url: str, raw: dict[str, Any] | None = None) -> LlmGeneratedImage:
    return _download_image(url, raw or {"result_url": url})


def _decode_image_payload(payload: dict[str, Any]) -> LlmGeneratedImage | None:
    for container in (payload, _payload_data(payload)):
        candidates = container.get("data")
        if not isinstance(candidates, list):
            candidates = container.get("images")
        if isinstance(candidates, list) and candidates:
            first = candidates[0]
            if not isinstance(first, dict):
                raise ValueError("大模型生图接口返回格式无效")
            b64_value = first.get("b64_json") or first.get("base64") or first.get("image_base64")
            if b64_value:
                return LlmGeneratedImage(content=base64.b64decode(str(b64_value)), extension="png", raw=payload)
            url = first.get("url") or first.get("image_url")
            if url:
                return _download_image(str(url), payload)
        result_url = container.get("result_url") or container.get("url") or container.get("image_url")
        if result_url:
            return _download_image(str(result_url), payload)
    return None


def _require_image_payload(payload: dict[str, Any]) -> LlmGeneratedImage:
    result = _decode_image_payload(payload)
    if result is None:
        raise ValueError("大模型生图接口未返回图片数据")
    return result


def _normalize_image_quality(quality: str) -> str:
    value = str(quality or "high").strip().lower()
    return value if value in JIASU_IMAGE_QUALITIES else "high"


def _normalize_reference_images(reference_images: list[str] | tuple[str, ...] | None) -> list[str]:
    if not reference_images:
        return []
    result: list[str] = []
    for item in reference_images:
        url = str(item or "").strip()
        if url:
            result.append(url)
        if len(result) >= 10:
            break
    return result


def _jiasu_media_generate_body(
    prompt: str,
    model_id: str,
    size: str,
    quality: str = "high",
    reference_images: list[str] | tuple[str, ...] | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "size": _normalize_jiasu_image_size(size),
        "quality": _normalize_image_quality(quality),
    }
    images = _normalize_reference_images(reference_images)
    if images:
        params["images"] = images
    return {
        "model": model_id,
        "prompt": prompt,
        "params": params,
    }


def _parse_size_pixels(size: str) -> tuple[int, int] | None:
    raw = str(size or "").strip().lower().replace("*", "x").replace("×", "x")
    if "x" not in raw:
        return None
    left, right = raw.split("x", 1)
    if not left.strip().isdigit() or not right.strip().isdigit():
        return None
    width = int(left.strip())
    height = int(right.strip())
    if width <= 0 or height <= 0:
        return None
    return width, height


def _nearest_jiasu_size_for_ratio(width: int, height: int) -> str:
    ratio = width / height
    if ratio >= 1.55:
        return JIASU_RATIO_SIZE_MAP["16:9"]
    if ratio <= 0.65:
        return JIASU_RATIO_SIZE_MAP["9:16"]
    if ratio >= 1.20:
        return JIASU_RATIO_SIZE_MAP["4:3"]
    if ratio <= 0.84:
        return JIASU_RATIO_SIZE_MAP["3:4"]
    return JIASU_RATIO_SIZE_MAP["1:1"]


def _normalize_jiasu_image_size(size: str) -> str:
    raw = str(size or "auto").strip()
    if not raw:
        return "auto"
    lowered = raw.lower()
    if lowered == "auto":
        return "auto"
    ratio_size = JIASU_RATIO_SIZE_MAP.get(raw)
    if ratio_size:
        return ratio_size
    parsed = _parse_size_pixels(raw)
    if parsed is None:
        return raw
    width, height = parsed
    pixels = width * height
    if JIASU_MIN_IMAGE_PIXELS <= pixels <= JIASU_MAX_IMAGE_PIXELS:
        return f"{width}x{height}"
    return _nearest_jiasu_size_for_ratio(width, height)


def _openai_image_generate_body(prompt: str, model_id: str, size: str, quality: str = "auto") -> dict[str, Any]:
    return {
        "model": model_id,
        "prompt": prompt,
        "size": size,
        "quality": _normalize_image_quality(quality),
        "n": 1,
        "response_format": "b64_json",
    }


def _poll_jiasu_media_task(settings: LlmProviderSetting, task_id: object) -> LlmGeneratedImage:
    for attempt in range(JIASU_STATUS_MAX_POLLS):
        status = _poll_jiasu_media_status(settings, task_id)
        if status.is_final:
            if status.state == "failed":
                error = status.error or status.raw
                raise ValueError(f"大模型生图任务失败: {error}")
            if status.image is None:
                detail = status.error or "大模型生图接口未返回图片数据"
                result_url = f" result_url={status.result_url}" if status.result_url else ""
                raise ValueError(f"{detail} task_id={task_id}{result_url}")
            return status.image
        if attempt < JIASU_STATUS_MAX_POLLS - 1:
            time.sleep(JIASU_STATUS_POLL_INTERVAL_SECONDS)
    raise ValueError(f"大模型生图任务超时未完成: task_id={task_id}")


def _start_jiasu_text_to_image(
    settings: LlmProviderSetting,
    prompt: str,
    model_id: str,
    size: str,
    quality: str = "high",
    reference_images: list[str] | tuple[str, ...] | None = None,
) -> LlmImageTaskStart:
    request = urllib.request.Request(
        _media_generate_endpoint(settings.base_url),
        data=json.dumps(_jiasu_media_generate_body(prompt, model_id, size, quality, reference_images), ensure_ascii=False).encode("utf-8"),
        headers=_auth_headers(settings),
        method="POST",
    )
    payload = _urlopen_json(request, timeout=180)
    _raise_jiasu_api_error(payload)
    immediate = _decode_image_payload(payload)
    if immediate is not None:
        return LlmImageTaskStart(raw=payload, image=immediate)
    task_id = _extract_task_id(payload)
    if not task_id:
        raise ValueError(f"大模型生图接口未返回 task_id 或图片结果: {payload}")
    return LlmImageTaskStart(raw=payload, task_id=str(task_id))


def _poll_jiasu_media_status(settings: LlmProviderSetting, task_id: object) -> LlmImageTaskStatus:
    request = urllib.request.Request(
        _media_status_endpoint(settings.base_url, task_id),
        headers=_auth_headers(settings),
        method="GET",
    )
    payload = _urlopen_json(request, timeout=60)
    _raise_jiasu_api_error(payload)
    status = _payload_data(payload)
    state = str(status.get("state") or "").lower()
    is_final = status.get("is_final") is True
    error = str(status.get("error") or "") if status.get("error") else ""
    image: LlmGeneratedImage | None = None
    result_url = str(status.get("result_url") or status.get("url") or status.get("image_url") or "")
    if is_final and state != "failed":
        try:
            image = _require_image_payload(payload)
        except ValueError as exc:
            error = str(exc)
    return LlmImageTaskStatus(
        raw=payload,
        state=state,
        is_final=is_final,
        image=image,
        progress=str(status.get("progress") or ""),
        result_url=result_url,
        result_type=str(status.get("result_type") or ""),
        error=error,
    )


def _call_jiasu_text_to_image(
    settings: LlmProviderSetting,
    prompt: str,
    model_id: str,
    size: str,
    quality: str = "high",
    reference_images: list[str] | tuple[str, ...] | None = None,
) -> LlmGeneratedImage:
    started = _start_jiasu_text_to_image(settings, prompt, model_id, size, quality, reference_images)
    if started.image is not None:
        return started.image
    task_id = started.task_id
    if not task_id:
        raise ValueError(f"大模型生图接口未返回 task_id 或图片结果: {started.raw}")
    return _poll_jiasu_media_task(settings, task_id)


def _call_openai_text_to_image(settings: LlmProviderSetting, prompt: str, model_id: str, size: str, quality: str = "auto") -> LlmGeneratedImage:
    request = urllib.request.Request(
        _openai_image_endpoint(settings.base_url),
        data=json.dumps(_openai_image_generate_body(prompt, model_id, size, quality), ensure_ascii=False).encode("utf-8"),
        headers=_auth_headers(settings),
        method="POST",
    )
    return _require_image_payload(_urlopen_json(request, timeout=180))


def call_text_to_image(
    settings: LlmProviderSetting,
    prompt: str,
    model_id: str,
    size: str,
    *,
    quality: str = "auto",
    reference_images: list[str] | tuple[str, ...] | None = None,
) -> LlmGeneratedImage:
    if settings.kind != "openai_compatible":
        raise ValueError("当前仅支持 OpenAI 兼容图片接口")
    if not _normalized_api_key(settings.api_key):
        raise ValueError("大模型供应商缺少 API Key")
    if _is_jiasu_provider(settings):
        return _call_jiasu_text_to_image(settings, prompt, model_id, size, quality, reference_images)
    if _normalize_reference_images(reference_images):
        raise ValueError("当前供应商暂不支持通过参考图链接生成资产图片")
    return _call_openai_text_to_image(settings, prompt, model_id, size, quality)


def start_text_to_image_task(
    settings: LlmProviderSetting,
    prompt: str,
    model_id: str,
    size: str,
    *,
    quality: str = "auto",
    reference_images: list[str] | tuple[str, ...] | None = None,
) -> LlmImageTaskStart:
    if settings.kind != "openai_compatible":
        raise ValueError("当前仅支持 OpenAI 兼容图片接口")
    if not _normalized_api_key(settings.api_key):
        raise ValueError("大模型供应商缺少 API Key")
    if _is_jiasu_provider(settings):
        return _start_jiasu_text_to_image(settings, prompt, model_id, size, quality, reference_images)
    if _normalize_reference_images(reference_images):
        raise ValueError("当前供应商暂不支持通过参考图链接生成资产图片")
    return LlmImageTaskStart(raw={}, image=_call_openai_text_to_image(settings, prompt, model_id, size, quality))


def poll_text_to_image_task(settings: LlmProviderSetting, task_id: object) -> LlmImageTaskStatus:
    if settings.kind != "openai_compatible":
        raise ValueError("当前仅支持 OpenAI 兼容图片接口")
    if not _normalized_api_key(settings.api_key):
        raise ValueError("大模型供应商缺少 API Key")
    if not _is_jiasu_provider(settings):
        raise ValueError("当前供应商不支持通过 task_id 查询图片任务")
    return _poll_jiasu_media_status(settings, task_id)


def _openai_chat_endpoint(base_url: str) -> str:
    value = str(base_url or "").strip().rstrip("/")
    if value.endswith("/v1/chat/completions"):
        return value
    if value.endswith("/v1"):
        return _join_url(value, "chat/completions")
    return _join_url(value, "/v1/chat/completions")


def _openai_chat_body(
    messages: list[dict[str, str]],
    model_id: str,
    temperature: float,
    max_tokens: int,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": model_id,
        "messages": messages,
        "temperature": temperature,
    }
    if max_tokens > 0:
        body["max_tokens"] = max_tokens
    return body


def _extract_chat_content(payload: dict[str, Any]) -> str:
    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0]
        if isinstance(first, dict):
            message = first.get("message")
            if isinstance(message, dict):
                content = message.get("content")
                if isinstance(content, str):
                    return content
                if isinstance(content, list):
                    parts: list[str] = []
                    for item in content:
                        if isinstance(item, dict) and isinstance(item.get("text"), str):
                            parts.append(item["text"])
                    if parts:
                        return "".join(parts)
            text = first.get("text")
            if isinstance(text, str):
                return text
    for key in ("content", "text", "response", "output_text"):
        value = payload.get(key)
        if isinstance(value, str):
            return value
    raise ValueError("大模型文本接口未返回可识别的内容")


def call_chat_completion(
    settings: LlmProviderSetting,
    messages: list[dict[str, str]],
    model_id: str,
    *,
    temperature: float = 0.7,
    max_tokens: int = 4096,
    timeout: int = 180,
) -> LlmChatCompletion:
    if settings.kind != "openai_compatible":
        raise ValueError("当前仅支持 OpenAI 兼容文本接口")
    if not _normalized_api_key(settings.api_key):
        raise ValueError("大模型供应商缺少 API Key")
    clean_messages = [
        {"role": str(item.get("role") or "user"), "content": str(item.get("content") or "")}
        for item in messages
        if str(item.get("content") or "").strip()
    ]
    if not clean_messages:
        raise ValueError("文本聊天请求缺少消息内容")
    request = urllib.request.Request(
        _openai_chat_endpoint(settings.base_url),
        data=json.dumps(_openai_chat_body(clean_messages, model_id, temperature, max_tokens), ensure_ascii=False).encode("utf-8"),
        headers=_auth_headers(settings),
        method="POST",
    )
    payload = _urlopen_json(request, timeout=max(1, int(timeout or 180)))
    _raise_jiasu_api_error(payload)
    return LlmChatCompletion(content=_extract_chat_content(payload), raw=payload)
