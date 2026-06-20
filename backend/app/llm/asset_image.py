"""资产图片纯文本生图。"""

import re
from typing import Any

from ..jimeng_models import JimengAssetType
from ..jimeng_storage import JimengStore
from .client import call_text_to_image
from .models import LlmAssetImageBatchGenerateRequest, LlmAssetImageGenerateRequest
from .settings import load_llm_settings, model_dump, resolve_provider_and_model
from .asset_image_records import (
    complete_asset_image_record_with_image,
    create_asset_image_record,
    mark_asset_image_record_submitted,
    mark_asset_image_record_timeout,
    public_asset_image_record,
    update_asset_image_record,
)

_ASSET_TYPE_PREFIX = {
    JimengAssetType.character: "character_prefix",
    JimengAssetType.scene: "scene_prefix",
    JimengAssetType.prop: "prop_prefix",
}
_PROMPT_LABEL_RE = re.compile(r"^\s*【[^】]+】\s*$")
_TASK_ID_ERROR_RE = re.compile(r"task_id=([^\s,，。;；]+)")


def _clean_prompt_part(value: str) -> str:
    lines = [line.strip() for line in str(value or "").splitlines()]
    return "\n".join(line for line in lines if line and not _PROMPT_LABEL_RE.match(line)).strip()


def build_asset_image_prompt(asset: Any, settings: Any, extra_prompt: str = "") -> str:
    asset_type = JimengAssetType(asset.type)
    prefix_name = _ASSET_TYPE_PREFIX[asset_type]
    extra = _clean_prompt_part(extra_prompt)
    type_prefix = "" if extra else _clean_prompt_part(getattr(settings.asset_image, prefix_name) or "")
    global_prompt = "" if extra else _clean_prompt_part(settings.asset_image.global_prompt or "")
    description = _clean_prompt_part(asset.description or "")
    image_params = _clean_prompt_part(asset.image_params or "")
    if not description:
        raise ValueError("请先填写资产详情描述 / 生图提示词")
    return "\n".join(part for part in (type_prefix, global_prompt, extra, description, image_params) if part)


def _assert_image_model(model: Any) -> None:
    model_type = str(getattr(model, "type", "") or "").lower()
    if model_type != "image":
        model_name = getattr(model, "name", None) or getattr(model, "id", "")
        raise ValueError(f"资产生图请选择图片模型，当前模型不是图片模型：{model_name}")


def _task_id_from_error(error: Exception) -> str:
    match = _TASK_ID_ERROR_RE.search(str(error))
    return match.group(1).strip() if match else ""


def generate_asset_image(store: JimengStore, project_id: str, asset_id: str, request: LlmAssetImageGenerateRequest):
    store.get_project(project_id)
    asset = store._get_asset(asset_id)
    if asset.project_id != project_id:
        raise ValueError("asset does not belong to project")

    settings = load_llm_settings(store)
    provider, model = resolve_provider_and_model(settings, request.provider_id, request.model_id)
    _assert_image_model(model)
    size = request.size or settings.asset_image.size
    prompt = build_asset_image_prompt(asset, settings, request.extra_prompt)
    record = create_asset_image_record(
        store,
        project_id=project_id,
        asset=asset,
        provider=provider,
        model=model,
        prompt=prompt,
        size=size,
    )
    try:
        generated = call_text_to_image(provider, prompt, model.id, size)
    except ValueError as exc:
        task_id = _task_id_from_error(exc)
        if not task_id:
            update_asset_image_record(store, record["id"], status="failed", error=str(exc), last_response={"error": str(exc)})
            raise
        record = mark_asset_image_record_submitted(store, record["id"], task_id, {"error": str(exc)})
        record = mark_asset_image_record_timeout(store, record["id"])
        return {
            "asset": asset,
            "provider": model_dump(provider),
            "model": model_dump(model),
            "prompt": prompt,
            "source_path": "",
            "result": record.get("last_response") or {},
            "record": public_asset_image_record(record),
            "message": "大模型生图任务已记录，当前请求超时；可在生成记录中继续获取远端结果",
        }

    record = complete_asset_image_record_with_image(store, record["id"], generated)
    updated_asset = store._get_asset(asset.id)
    return {
        "asset": updated_asset,
        "provider": model_dump(provider),
        "model": model_dump(model),
        "prompt": prompt,
        "source_path": str(record.get("source_path") or ""),
        "result": generated.raw,
        "record": public_asset_image_record(record),
        "message": "资产图片已通过大模型纯文本生成并保存",
    }


def batch_generate_asset_images(store: JimengStore, project_id: str, request: LlmAssetImageBatchGenerateRequest):
    store.get_project(project_id)
    if not request.asset_ids:
        raise ValueError("请先选择需要批量生图的资产")
    wanted = set(request.asset_ids)
    assets = [asset for asset in store.list_assets(project_id, request.asset_type) if asset.id in wanted]
    if not assets:
        raise ValueError("未找到选中的资产，请刷新后重试")

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
