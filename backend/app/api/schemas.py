"""即梦 API 请求模型。

拆分路由共用这些 Pydantic 模型，避免各业务接口继续从旧的 `jimeng_api.py` 大文件导入请求结构。
"""

from typing import Any, Optional

from pydantic import BaseModel, Field

from ..jimeng_models import JimengAssetType, JimengPromptScope


class ProjectCreate(BaseModel):
    name: str
    style: str = ""
    description: str = ""
    default_ratio: str = "9:16"


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    style: Optional[str] = None
    description: Optional[str] = None
    default_ratio: Optional[str] = None
    prompt_preset_id: Optional[str] = None
    status: Optional[str] = None


class ShotCreate(BaseModel):
    prompt: str


class ShotImport(BaseModel):
    text: str
    format: str = "plain"


class ShotUpdate(BaseModel):
    prompt: Optional[str] = None
    default_duration: Optional[int] = None
    status: Optional[str] = None
    default_video_candidate_id: Optional[str] = None
    locked_video_candidate_id: Optional[str] = None
    last_error: Optional[str] = None


class MoveRequest(BaseModel):
    direction: str


class BatchReplaceRequest(BaseModel):
    find: str = ""
    replace: str = ""


class ShotBatchDelete(BaseModel):
    shot_ids: list[str] = Field(default_factory=list)


class RenderPromptPreviewRequest(BaseModel):
    prompt_preset_id: Optional[str] = None
    content: Optional[str] = None
    camera: str = ""
    era: str = ""


class AssetCreate(BaseModel):
    type: JimengAssetType
    name: str
    aliases: list[str] = Field(default_factory=list)
    description: str = ""
    image_model: str = "dreamina4.0"
    image_ratio: str = "16:9"
    image_params: str = ""
    video_prompt: str = ""


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    aliases: Optional[list[str]] = None
    description: Optional[str] = None
    image_model: Optional[str] = None
    image_ratio: Optional[str] = None
    image_params: Optional[str] = None
    video_prompt: Optional[str] = None


class AssetBatchDelete(BaseModel):
    asset_ids: list[str] = Field(default_factory=list)


class AssetMetadataImport(BaseModel):
    format: str = "json"
    text: str = ""


class AssetImageGenerateRequest(BaseModel):
    resolution_type: str = "2k"
    poll_seconds: Optional[int] = None
    extra_prompt: str = ""
    asset_ids: Optional[list[str]] = None
    asset_type: Optional[JimengAssetType] = None


class QueueItemCreate(BaseModel):
    project_id: str
    shot_id: str
    prefix_prompt: str = ""
    final_prompt: Optional[str] = None
    final_prompt_snapshot: Optional[str] = None
    asset_snapshot: Optional[dict[str, Any]] = None
    prompt_preset_id: Optional[str] = None
    cli_command: str = ""
    poll_seconds: int = 30
    download_dir: str = ""


class QueueBatchCreate(BaseModel):
    items: list[QueueItemCreate]


class QueueReorder(BaseModel):
    queue_item_ids: list[str]


class SettingsUpdate(BaseModel):
    dreamina_executable: Optional[str] = None
    generation_provider: Optional[str] = None
    model_version: Optional[str] = None
    poll_seconds: Optional[int] = None
    duration: Optional[int] = None
    ratio: Optional[str] = None
    video_resolution: Optional[str] = None
    submit_interval_seconds: Optional[int] = Field(default=None, ge=1, le=300)
    max_in_flight: Optional[int] = Field(default=None, ge=1, le=50)
    result_poll_interval_seconds: Optional[int] = Field(default=None, ge=5, le=300)
    cli_initial_poll_seconds: Optional[int] = Field(default=None, ge=1, le=60)
    max_retry_attempts: Optional[int] = Field(default=None, ge=0, le=20)
    retry_base_seconds: Optional[int] = Field(default=None, ge=5, le=600)
    jimeng_api_base_url: Optional[str] = None
    jimeng_api_model: Optional[str] = None
    jimeng_api_generation_mode: Optional[str] = None
    jimeng_api_ratio: Optional[str] = None
    jimeng_api_duration: Optional[int] = None
    jimeng_api_concurrency: Optional[int] = None
    jimeng_api_sessions: Optional[list[dict[str, Any]]] = None


class CliAccountCreate(BaseModel):
    label: str


class CliAccountUpdate(BaseModel):
    label: Optional[str] = None


class CliAccountLoginJson(BaseModel):
    credential_json: Any


class LoginSessionStart(BaseModel):
    mode: str = "login"
    open_browser: bool = True
    account_id: Optional[str] = None


class BindingCreate(BaseModel):
    asset_id: str
    asset_type: JimengAssetType
    source: str = "manual"
    locked: bool = False
    slot_order: Optional[int] = None


class BindingUpdate(BaseModel):
    locked: Optional[bool] = None
    voice_enabled: Optional[bool] = None
    slot_order: Optional[int] = None


class BindingReorder(BaseModel):
    binding_ids: list[str]


class CandidateLock(BaseModel):
    locked: bool = True


class CandidateBatchDownload(BaseModel):
    target_dir: str = ""
    shot_ids: list[str] = Field(default_factory=list)


class CandidateExport(BaseModel):
    target_dir: str
    overwrite: bool = False


class PromptPresetCreate(BaseModel):
    name: str
    scope: JimengPromptScope = JimengPromptScope.user
    content: str
    variables: list[str] = Field(default_factory=list)
    is_default: bool = False
    enabled: bool = True


class PromptPresetUpdate(BaseModel):
    name: Optional[str] = None
    scope: Optional[JimengPromptScope] = None
    content: Optional[str] = None
    variables: Optional[list[str]] = None
    is_default: Optional[bool] = None
    enabled: Optional[bool] = None


class ProjectPromptPresetRequest(BaseModel):
    prompt_preset_id: Optional[str] = None
