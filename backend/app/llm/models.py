"""大模型配置与生成结果模型。"""

from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, Field

from ..jimeng_models import JimengAssetType


class LlmModelSetting(BaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    type: str = "image"
    enabled: bool = True


class LlmProviderSetting(BaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    kind: str = "openai_compatible"
    enabled: bool = False
    base_url: str = ""
    api_key: str = ""
    models: list[LlmModelSetting] = Field(default_factory=list)


class LlmAssetImageSettings(BaseModel):
    global_prompt: str = ""
    character_prefix: str = "角色设定图"
    scene_prefix: str = "场景设定图"
    prop_prefix: str = "道具设定图"
    size: str = "2560x1440"


class LlmSettings(BaseModel):
    default_provider_id: str = "jiasuapi"
    default_model_id: str = "gpt-image-2"
    providers: list[LlmProviderSetting] = Field(default_factory=list)
    asset_image: LlmAssetImageSettings = Field(default_factory=LlmAssetImageSettings)


class LlmAssetImageGenerateRequest(BaseModel):
    provider_id: str | None = None
    model_id: str | None = None
    size: str | None = None
    extra_prompt: str = ""


class LlmAssetImageBatchGenerateRequest(LlmAssetImageGenerateRequest):
    asset_ids: list[str] = Field(default_factory=list)
    asset_type: JimengAssetType | None = None


class LlmAssetImageRecordPollRequest(BaseModel):
    project_id: str | None = None
    record_ids: list[str] = Field(default_factory=list)
    limit: int = 20


class LlmAssetImageRecordBatchDeleteRequest(BaseModel):
    record_ids: list[str] = Field(default_factory=list)


@dataclass
class LlmGeneratedImage:
    content: bytes
    extension: str = "png"
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class LlmImageTaskStart:
    raw: dict[str, Any] = field(default_factory=dict)
    image: LlmGeneratedImage | None = None
    task_id: str | None = None


@dataclass
class LlmImageTaskStatus:
    raw: dict[str, Any] = field(default_factory=dict)
    state: str = ""
    is_final: bool = False
    image: LlmGeneratedImage | None = None
    progress: str = ""
    result_url: str = ""
    result_type: str = ""
    error: str = ""
