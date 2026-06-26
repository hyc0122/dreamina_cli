"""视频生成 provider 工厂。"""

from collections.abc import Callable
from typing import Any

from ..jimeng_storage import JimengStore
from ..llm.settings import load_llm_settings
from .dreamina_cli_provider import DreaminaCliProvider
from .volcengine_ark_provider import VolcengineArkProvider


def build_video_generation_provider(
    *,
    store: JimengStore,
    provider_name: str,
    account_id: str | None,
    cli_factory: Callable[[], Any],
) -> Any:
    legacy_cli_providers = {"dreamina_cli", "jimeng_api", "jimeng_hub", "web_session"}
    if provider_name in legacy_cli_providers:
        return DreaminaCliProvider(cli_factory())
    if provider_name != "volcengine_ark":
        raise ValueError(f"未知视频生成通道: {provider_name}")
    if not account_id:
        raise ValueError("火山方舟视频生成缺少大模型供应商 ID")

    settings = load_llm_settings(store)
    provider = next((item for item in settings.providers if item.id == account_id), None)
    if provider is None:
        raise ValueError(f"未找到火山方舟供应商: {account_id}")
    if provider.kind != "volcengine_ark":
        raise ValueError(f"供应商不是火山方舟类型: {provider.name}")
    if not provider.enabled:
        raise ValueError(f"火山方舟供应商未启用: {provider.name}")
    if not provider.api_key:
        raise ValueError(f"火山方舟供应商缺少 API Key: {provider.name}")
    return VolcengineArkProvider(provider)