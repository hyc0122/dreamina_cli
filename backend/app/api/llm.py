"""大模型设置与资产纯文本生图接口。"""

from typing import Optional

from fastapi import APIRouter

from ..llm.asset_image import batch_generate_asset_images, generate_asset_image
from ..llm.asset_image_records import (
    cancel_asset_image_record,
    delete_asset_image_record,
    list_asset_image_records,
    poll_asset_image_record,
    poll_pending_asset_image_records,
    public_asset_image_record,
)
from ..llm.models import LlmAssetImageBatchGenerateRequest, LlmAssetImageGenerateRequest, LlmAssetImageRecordPollRequest, LlmSettings
from ..llm.settings import load_llm_settings, model_dump, save_llm_settings
from .context import _call, _dump, get_store

router = APIRouter(prefix="/jimeng", tags=["jimeng-llm"])


@router.get("/llm/settings")
def get_llm_settings():
    return model_dump(load_llm_settings(get_store()))


@router.put("/llm/settings")
def update_llm_settings(request: LlmSettings):
    return model_dump(save_llm_settings(get_store(), request))


@router.post("/projects/{project_id}/assets/{asset_id}/llm_image/generate")
def generate_llm_asset_image(
    project_id: str,
    asset_id: str,
    request: Optional[LlmAssetImageGenerateRequest] = None,
):
    return _call(lambda: _dump(generate_asset_image(get_store(), project_id, asset_id, request or LlmAssetImageGenerateRequest())))


@router.post("/projects/{project_id}/assets/llm_image/batch_generate")
def batch_generate_llm_asset_images(
    project_id: str,
    request: Optional[LlmAssetImageBatchGenerateRequest] = None,
):
    return _call(lambda: _dump(batch_generate_asset_images(get_store(), project_id, request or LlmAssetImageBatchGenerateRequest())))


@router.get("/llm/asset_image_records")
def list_llm_asset_image_records(project_id: Optional[str] = None):
    return _call(lambda: {"records": _dump([public_asset_image_record(record) for record in list_asset_image_records(get_store(), project_id)])})


@router.post("/llm/asset_image_records/poll")
def poll_llm_asset_image_records(request: Optional[LlmAssetImageRecordPollRequest] = None):
    def poll_records():
        payload = request or LlmAssetImageRecordPollRequest()
        records = poll_pending_asset_image_records(
            get_store(),
            project_id=payload.project_id,
            record_ids=payload.record_ids,
            limit=payload.limit,
        )
        return {"records": _dump([public_asset_image_record(record) for record in records])}

    return _call(poll_records)


@router.post("/llm/asset_image_records/{record_id}/poll")
def poll_llm_asset_image_record(record_id: str):
    return _call(lambda: _dump(public_asset_image_record(poll_asset_image_record(get_store(), record_id))))


@router.post("/llm/asset_image_records/{record_id}/cancel")
def cancel_llm_asset_image_record(record_id: str):
    return _call(lambda: _dump(public_asset_image_record(cancel_asset_image_record(get_store(), record_id))))


@router.delete("/llm/asset_image_records/{record_id}")
def delete_llm_asset_image_record(record_id: str):
    return _call(lambda: {"deleted": delete_asset_image_record(get_store(), record_id).get("id")})
