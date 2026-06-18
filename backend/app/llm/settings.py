"""大模型设置读写。

设置独立存放在 runtime data 的 llm/settings.json，不混入即梦 CLI runtime settings。
"""

import json
from pathlib import Path
from typing import Any

from ..jimeng_storage import JimengStore
from .models import LlmAssetImageSettings, LlmModelSetting, LlmProviderSetting, LlmSettings


def default_llm_settings() -> LlmSettings:
    return LlmSettings(
        default_provider_id="jiasuapi",
        default_model_id="gpt-5.4",
        providers=[
            LlmProviderSetting(
                id="jiasuapi",
                name="佳速 API",
                kind="openai_compatible",
                enabled=False,
                base_url="https://api.lk888.ai/api",
                api_key="",
                models=[
                    LlmModelSetting(id="gpt-4o", name="GPT-4o", type="text", enabled=True),
                    LlmModelSetting(id="gpt-4.1", name="GPT-4.1", type="text", enabled=True),
                    LlmModelSetting(id="gpt-5.1", name="GPT-5.1", type="text", enabled=True),
                    LlmModelSetting(id="gpt-5.2", name="GPT-5.2", type="text", enabled=True),
                    LlmModelSetting(id="gpt-5.4", name="GPT-5.4", type="image", enabled=True),
                ],
            )
        ],
        asset_image=LlmAssetImageSettings(),
    )


def llm_settings_path(store: JimengStore) -> Path:
    return store.db_path.parent / "llm" / "settings.json"


def model_dump(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return value.dict()


def load_llm_settings(store: JimengStore) -> LlmSettings:
    path = llm_settings_path(store)
    if not path.exists():
        return default_llm_settings()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"大模型设置文件格式错误: {path}") from exc
    base = model_dump(default_llm_settings())
    base.update(data)
    return LlmSettings(**base)


def save_llm_settings(store: JimengStore, settings: LlmSettings) -> LlmSettings:
    path = llm_settings_path(store)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(model_dump(settings), ensure_ascii=False, indent=2), encoding="utf-8")
    return load_llm_settings(store)


def resolve_provider_and_model(settings: LlmSettings, provider_id: str | None = None, model_id: str | None = None):
    resolved_provider_id = provider_id or settings.default_provider_id
    provider = next((item for item in settings.providers if item.id == resolved_provider_id), None)
    if provider is None:
        raise ValueError(f"未找到大模型供应商: {resolved_provider_id}")
    if not provider.enabled:
        raise ValueError(f"大模型供应商未启用: {provider.name}")
    if not provider.api_key:
        raise ValueError(f"大模型供应商缺少 API Key: {provider.name}")

    resolved_model_id = model_id or settings.default_model_id
    model = next((item for item in provider.models if item.id == resolved_model_id), None)
    if model is None:
        raise ValueError(f"未找到大模型: {resolved_model_id}")
    if not model.enabled:
        raise ValueError(f"大模型未启用: {model.name}")
    return provider, model
