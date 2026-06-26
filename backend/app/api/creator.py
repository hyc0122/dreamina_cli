"""Creator assistant LLM proxy routes."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..llm.client import call_chat_completion
from ..llm.settings import load_llm_settings
from .context import _call, get_store

router = APIRouter(prefix="/jimeng/creator", tags=["jimeng-creator"])
CREATOR_FALLBACK_ROUTE = "/creator/chat/fallback"


class CreatorChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"] = "user"
    content: str


class CreatorChatRequest(BaseModel):
    model_id: str | None = None
    messages: list[CreatorChatMessage] = Field(default_factory=list)
    prompt: str = ""
    temperature: float = 0.7
    max_tokens: int = 4096
    timeout_seconds: int = 180
    stream: bool = False


class CreatorFallbackChatRequest(CreatorChatRequest):
    fallback_model_id_1: str | None = None
    fallback_model_id_2: str | None = None


def _text_model_options(settings: Any) -> list[dict[str, str]]:
    options: list[dict[str, str]] = []
    for provider in settings.providers:
        if not provider.enabled:
            continue
        for model in provider.models:
            if str(model.type).lower() != "text" or not model.enabled:
                continue
            options.append(
                {
                    "provider_id": provider.id,
                    "provider_name": provider.name,
                    "model_id": model.id,
                    "model_name": model.name,
                    "value": f"{provider.id}:{model.id}",
                    "label": f"{provider.name} / {model.name}",
                }
            )
    return options


def _default_text_model_id(settings: Any, options: list[dict[str, str]] | None = None) -> str:
    candidates = options if options is not None else _text_model_options(settings)
    for option in candidates:
        if option["model_id"] == settings.default_model_id:
            return option["value"]
    return candidates[0]["value"] if candidates else ""


def _split_model_ref(value: str | None) -> tuple[str | None, str | None]:
    raw = str(value or "").strip()
    if not raw:
        return None, None
    if ":" in raw:
        provider_id, model_id = raw.split(":", 1)
        return provider_id.strip() or None, model_id.strip() or None
    return None, raw


def _resolve_text_model(settings: Any, model_ref: str | None):
    requested_provider_id, requested_model_id = _split_model_ref(model_ref)
    if requested_model_id is None:
        requested_provider_id, requested_model_id = _split_model_ref(_default_text_model_id(settings))
    for provider in settings.providers:
        if requested_provider_id and provider.id != requested_provider_id:
            continue
        if not provider.enabled:
            continue
        for model in provider.models:
            if model.id != requested_model_id:
                continue
            if str(model.type).lower() != "text":
                raise ValueError(f"模型不是文本模型: {model.id}")
            if not model.enabled:
                raise ValueError(f"大模型未启用: {model.name}")
            return provider, model
    raise ValueError(f"未找到启用的文本模型: {requested_model_id}")


def _request_messages(request: CreatorChatRequest) -> list[dict[str, str]]:
    messages = [{"role": item.role, "content": item.content} for item in request.messages]
    prompt = request.prompt.strip()
    if prompt:
        messages.append({"role": "user", "content": prompt})
    return messages


def _chat_with_current_settings(request: CreatorChatRequest, model_refs: list[str | None]) -> dict[str, Any]:
    settings = load_llm_settings(get_store())
    messages = _request_messages(request)
    ordered_refs: list[str | None] = []
    seen: set[str] = set()
    for model_ref in model_refs:
        key = str(model_ref or "").strip()
        if not key:
            continue
        if key in seen:
            continue
        seen.add(key)
        ordered_refs.append(model_ref)
    if not ordered_refs:
        ordered_refs.append(None)

    last_error: Exception | None = None
    for model_ref in ordered_refs:
        try:
            provider, model = _resolve_text_model(settings, model_ref)
            completion = call_chat_completion(
                provider,
                messages,
                model.id,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                timeout=request.timeout_seconds,
            )
            return {
                "content": completion.content,
                "model_id": model.id,
                "provider_id": provider.id,
            }
        except Exception as exc:  # noqa: BLE001 - fallback must preserve the last provider error.
            last_error = exc
            continue
    if last_error is not None:
        raise last_error
    raise ValueError("没有可用的文本模型")


@router.get("/model_options")
def list_creator_model_options():
    def load_options():
        settings = load_llm_settings(get_store())
        options = _text_model_options(settings)
        return {"options": options, "default_model_id": _default_text_model_id(settings, options)}

    return _call(load_options)


@router.post("/chat")
def creator_chat(request: CreatorChatRequest):
    return _call(lambda: _chat_with_current_settings(request, [request.model_id]))


@router.post("/chat/fallback")
def creator_chat_fallback(request: CreatorFallbackChatRequest):
    return _call(
        lambda: _chat_with_current_settings(
            request,
            [request.model_id, request.fallback_model_id_1, request.fallback_model_id_2],
        )
    )