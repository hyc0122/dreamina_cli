"""大模型设置与资产纯文本生图接口。"""

from typing import Optional

from fastapi import APIRouter

from ..llm.asset_image import batch_generate_asset_images, generate_asset_image
from ..llm.models import LlmAssetImageBatchGenerateRequest, LlmAssetImageGenerateRequest, LlmSettings
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