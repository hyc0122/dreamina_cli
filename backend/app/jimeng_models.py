from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class JimengProjectStatus(str, Enum):
    draft = "draft"
    working = "working"
    has_failed = "has_failed"
    completed = "completed"


class JimengShotStatus(str, Enum):
    draft = "draft"
    asset_missing = "asset_missing"
    queued = "queued"
    running = "running"
    failed = "failed"
    completed = "completed"
    locked = "locked"


class JimengAssetType(str, Enum):
    character = "character"
    scene = "scene"
    prop = "prop"


class JimengQueueStatus(str, Enum):
    waiting = "waiting"
    submitting = "submitting"
    running = "running"
    polling = "polling"
    retry_wait = "retry_wait"
    blocked = "blocked"
    completed = "completed"
    failed = "failed"
    canceled = "canceled"
    orphaned = "orphaned"


class JimengPromptScope(str, Enum):
    system = "system"
    user = "user"


class JimengProject(BaseModel):
    id: str
    name: str
    style: str = ""
    default_ratio: str = "9:16"
    prompt_preset_id: Optional[str] = None
    description: str = ""
    shot_count: int = 0
    status: JimengProjectStatus = JimengProjectStatus.draft
    created_at: str
    updated_at: str


class JimengShot(BaseModel):
    id: str
    project_id: str
    shot_index: int
    prompt: str
    default_duration: Optional[int] = None
    status: JimengShotStatus = JimengShotStatus.draft
    default_video_candidate_id: Optional[str] = None
    locked_video_candidate_id: Optional[str] = None
    last_error: Optional[str] = None
    created_at: str
    updated_at: str


class JimengAsset(BaseModel):
    id: str
    project_id: str
    type: JimengAssetType
    name: str
    aliases: List[str] = Field(default_factory=list)
    description: str = ""
    image_model: str = "dreamina4.0"
    image_ratio: str = "16:9"
    image_params: str = ""
    video_prompt: str = ""
    image_filename: Optional[str] = None
    image_path: Optional[str] = None
    audio_filename: Optional[str] = None
    audio_path: Optional[str] = None
    created_at: str
    updated_at: str


class JimengAssetBinding(BaseModel):
    id: str
    project_id: str
    shot_id: str
    asset_id: str
    asset_type: JimengAssetType
    source: str
    locked: bool = False
    voice_enabled: bool = True
    slot_order: int = 0
    created_at: str
    updated_at: str


class JimengQueueItem(BaseModel):
    id: str
    project_id: str
    shot_id: str
    status: JimengQueueStatus
    position: int
    prompt_snapshot: str
    prompt_preset_id: Optional[str] = None
    prefix_prompt_snapshot: str = ""
    final_prompt_snapshot: str
    asset_snapshot: Dict[str, Any] = Field(default_factory=dict)
    cli_command: str = ""
    poll_seconds: int = 30
    download_dir: str = ""
    submit_id: Optional[str] = None
    gen_status: Optional[str] = None
    result_url: Optional[str] = None
    local_video_path: Optional[str] = None
    cli_raw_output: Optional[str] = None
    error_message: Optional[str] = None
    attempt_count: int = 0
    next_attempt_at: Optional[str] = None
    last_polled_at: Optional[str] = None
    lease_owner: Optional[str] = None
    lease_expires_at: Optional[str] = None
    submitted_at: Optional[str] = None
    finished_at: Optional[str] = None
    created_at: str
    updated_at: str


class JimengVideoCandidate(BaseModel):
    id: str
    project_id: str
    shot_id: str
    queue_item_id: str
    video_filename: str
    video_path: str
    thumbnail_path: Optional[str] = None
    duration: Optional[int] = None
    ratio: Optional[str] = None
    resolution: Optional[str] = None
    source_url: Optional[str] = None
    is_default: bool = False
    is_locked: bool = False
    created_at: str


class JimengPromptPreset(BaseModel):
    id: str
    name: str
    scope: JimengPromptScope
    content: str
    variables: List[str] = Field(default_factory=list)
    is_default: bool = False
    enabled: bool = True
    created_at: str
    updated_at: str


class JimengStylePreset(BaseModel):
    id: str
    name: str
    scope: str = "video"
    prompt: str
    accent: str = "#6478ff"
    created_at: str
    updated_at: str


class JimengCliAccount(BaseModel):
    id: str
    label: str
    profile_dir: str
    status: str = "unknown"
    total_credit: Optional[str] = None
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    vip_level: Optional[str] = None
    vip_expire_at: Optional[str] = None
    last_error: Optional[str] = None
    is_default: bool = False
    created_at: str
    updated_at: str
