"""资产图片纯文本生图。"""

import uuid
from pathlib import Path
from typing import Any

from ..jimeng_models import JimengAssetType
from ..jimeng_storage import JimengStore
from .client import call_text_to_image
from .models import LlmAssetImageBatchGenerateRequest, LlmAssetImageGenerateRequest
from .settings import load_llm_settings, model_dump, resolve_provider_and_model


_ASSET_TYPE_PREFIX = {
    JimengAssetType.character: "character_prefix",
    JimengAssetType.scene: "scene_prefix",
    JimengAssetType.prop: "prop_prefix",
}


def build_asset_image_prompt(asset: Any, settings: Any, extra_prompt: str = "") -> str:
    asset_type = JimengAssetType(asset.type)
    prefix_name = _ASSET_TYPE_PREFIX[asset_type]
    type_prefix = str(getattr(settings.asset_image, prefix_name) or "").strip()
    global_prompt = str(settings.asset_image.global_prompt or "").strip()
    description = str(asset.description or "").strip()
    image_params = str(asset.image_params or "").strip()
    extra = str(extra_prompt or "").strip()
    if not description:
        raise ValueError("请先填写资产详情描述 / 生图提示词")
    return "\n".join(part for part in (type_prefix, global_prompt, extra, description, image_params) if part)


def generate_asset_image(store: JimengStore, project_id: str, asset_id: str, request: LlmAssetImageGenerateRequest):
    store.get_project(project_id)
    asset = store._get_asset(asset_id)
    if asset.project_id != project_id:
        raise ValueError("asset does not belong to project")

    settings = load_llm_settings(store)
    provider, model = resolve_provider_and_model(settings, request.provider_id, request.model_id)
    size = request.size or settings.asset_image.size
    prompt = build_asset_image_prompt(asset, settings, request.extra_prompt)
    generated = call_text_to_image(provider, prompt, model.id, size)

    safe_ext = generated.extension.lower().lstrip(".") or "png"
    if safe_ext not in {"png", "jpg", "jpeg", "webp"}:
        safe_ext = "png"
    generated_dir = store._asset_dir(project_id, asset.type, "image") / ".llm_generated"
    generated_dir.mkdir(parents=True, exist_ok=True)
    store._assert_under_output_root(generated_dir)
    source_path = generated_dir / f"{asset.id}-{uuid.uuid4().hex}.{safe_ext}"
    source_path.write_bytes(generated.content)

    updated_asset = store.upsert_asset_file(project_id, asset.type, asset.name, source_path, "image")
    source_path.unlink(missing_ok=True)
    return {
        "asset": updated_asset,
        "provider": model_dump(provider),
        "model": model_dump(model),
        "prompt": prompt,
        "source_path": str(source_path),
        "result": generated.raw,
        "message": "资产图片已通过大模型纯文本生成并保存",
    }


def batch_generate_asset_images(store: JimengStore, project_id: str, request: LlmAssetImageBatchGenerateRequest):
    store.get_project(project_id)
    if request.asset_ids:
        wanted = set(request.asset_ids)
        assets = [asset for asset in store.list_assets(project_id, request.asset_type) if asset.id in wanted]
    else:
        assets = store.list_assets(project_id, request.asset_type)

    results: list[dict[str, Any]] = []
    single_request = LlmAssetImageGenerateRequest(
        provider_id=request.provider_id,
        model_id=request.model_id,
        size=request.size,
        extra_prompt=request.extra_prompt,
    )
    for asset in assets:
        try:
            result = generate_asset_image(store, project_id, asset.id, single_request)
            results.append({"asset_id": asset.id, "asset_name": asset.name, "ok": True, **result})
        except ValueError as exc:
            results.append({"asset_id": asset.id, "asset_name": asset.name, "ok": False, "error": str(exc)})
    return {
        "results": results,
        "success_count": sum(1 for item in results if item.get("ok")),
        "failed_count": sum(1 for item in results if not item.get("ok")),
    }
