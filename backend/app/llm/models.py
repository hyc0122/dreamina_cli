"""大模型配置与结果模型。"""

from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, Field


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
    size: str = "1024x576"


class LlmSettings(BaseModel):
    default_provider_id: str = "jiasuapi"
    default_model_id: str = "gpt-5.4"
    providers: list[LlmProviderSetting] = Field(default_factory=list)
    asset_image: LlmAssetImageSettings = Field(default_factory=LlmAssetImageSettings)


class LlmAssetImageGenerateRequest(BaseModel):
    provider_id: str | None = None
    model_id: str | None = None
    size: str | None = None
    extra_prompt: str = ""


@dataclass
class LlmGeneratedImage:
    content: bytes
    extension: str = "png"
    raw: dict[str, Any] = field(default_factory=dict)
