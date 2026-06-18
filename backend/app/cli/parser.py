import json
import re
from typing import Any, Optional

from .errors import DreaminaErrorCategory
from .models import DreaminaParsedOutput


_URL_RE = re.compile(r"https?://[^\s\"'<>]+")
_WINDOWS_PATH_RE = re.compile(r"[A-Za-z]:\\[^\r\n\"'<>]+?\.(?:mp4|mov|webm|mkv|png|jpe?g)")
_POSIX_PATH_RE = re.compile(r"/[^\r\n\"'<>]+?\.(?:mp4|mov|webm|mkv|png|jpe?g)")


def classify_dreamina_error(output: str) -> Optional[DreaminaErrorCategory]:
    text = output.lower()
    if not text.strip():
        return None
    if "队列已满" in output or "queue is full" in text or "queue full" in text:
        return DreaminaErrorCategory.QUEUE_FULL
    if "too many requests" in text or "rate limit" in text or "请求过于频繁" in output:
        return DreaminaErrorCategory.RATE_LIMITED
    if "server busy" in text or "provider busy" in text or "服务繁忙" in output or "系统繁忙" in output:
        return DreaminaErrorCategory.PROVIDER_BUSY
    if "not found" in text or "不是内部或外部命令" in text or "no such file" in text:
        return DreaminaErrorCategory.CLI_NOT_FOUND
    if "login" in text or "登录" in output or "token" in text or "oauth" in text:
        return DreaminaErrorCategory.AUTH_REQUIRED
    if "credit" in text or "balance" in text or "积分" in output or "余额" in output:
        if "insufficient" in text or "不足" in output or "not enough" in text:
            return DreaminaErrorCategory.CREDIT_INSUFFICIENT
    if "invalid" in text or "unsupported" in text or "参数" in output:
        if "model" in text or "模型" in output:
            return DreaminaErrorCategory.MODEL_UNSUPPORTED
        return DreaminaErrorCategory.INVALID_ARGUMENT
    if "network" in text or "timeout" in text or "timed out" in text or "连接" in output:
        return DreaminaErrorCategory.NETWORK_ERROR
    if "failed" in text or "失败" in output or "error" in text:
        return DreaminaErrorCategory.TASK_FAILED
    return None


def parse_dreamina_output(output: str) -> DreaminaParsedOutput:
    text = output.strip()
    if not text:
        return DreaminaParsedOutput(raw_output=output)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        parsed = _parse_text_output(output)
    else:
        parsed = _parse_json_output(data, output)
    parsed.error_category = classify_dreamina_error(output)
    if parsed.error_category and not parsed.error_message:
        parsed.error_message = output.strip()
    return parsed


def _parse_json_output(data: Any, raw_output: str) -> DreaminaParsedOutput:
    values = _flatten_json(data)
    result_url = _first_value(values, "result_url") or _first_value(values, "video_url") or _first_http_url(values)
    return DreaminaParsedOutput(
        submit_id=_first_value(values, "submit_id"),
        gen_status=_first_value(values, "gen_status"),
        result_url=result_url,
        local_paths=_collect_local_paths(values),
        raw_output=raw_output,
    )


def _parse_text_output(output: str) -> DreaminaParsedOutput:
    urls = _URL_RE.findall(output)
    path_search_text = _URL_RE.sub("", output)
    local_paths = _unique(_WINDOWS_PATH_RE.findall(path_search_text) + _POSIX_PATH_RE.findall(path_search_text))
    return DreaminaParsedOutput(
        submit_id=_extract_named_value(output, "submit_id"),
        gen_status=_extract_named_value(output, "gen_status"),
        result_url=urls[0] if urls else None,
        local_paths=local_paths,
        raw_output=output,
    )


def _extract_named_value(text: str, name: str) -> Optional[str]:
    pattern = re.compile(rf"{re.escape(name)}\s*[:=]\s*([^\r\n,;]+)", re.IGNORECASE)
    match = pattern.search(text)
    return match.group(1).strip() if match else None


def _flatten_json(data: Any) -> list[tuple[str, Any]]:
    values: list[tuple[str, Any]] = []

    def visit(value: Any, key: str = "") -> None:
        if isinstance(value, dict):
            for child_key, child_value in value.items():
                visit(child_value, str(child_key))
        elif isinstance(value, list):
            for child in value:
                visit(child, key)
        else:
            values.append((key, value))

    visit(data)
    return values


def _first_value(values: list[tuple[str, Any]], key: str) -> Optional[str]:
    lowered = key.lower()
    for item_key, value in values:
        if item_key.lower() == lowered and value not in (None, ""):
            return str(value)
    return None


def _first_http_url(values: list[tuple[str, Any]]) -> Optional[str]:
    for _, value in values:
        if isinstance(value, str):
            match = _URL_RE.search(value)
            if match:
                return match.group(0)
    return None


def _collect_local_paths(values: list[tuple[str, Any]]) -> list[str]:
    paths: list[str] = []
    for _, value in values:
        if not isinstance(value, str):
            continue
        paths.extend(_WINDOWS_PATH_RE.findall(value))
        paths.extend(_POSIX_PATH_RE.findall(value))
    return _unique(paths)


def _unique(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        if value not in result:
            result.append(value)
    return result
