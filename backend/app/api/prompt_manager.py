"""提示词管理 API。

提示词管理是独立工具，只复用全局运行目录，不复用漫剧项目的业务表。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..prompt_manager import PromptManagerStore
from .context import _call, get_store


router = APIRouter(prefix="/jimeng/prompt-manager", tags=["jimeng-prompt-manager"])

_prompt_manager_store: PromptManagerStore | None = None
_prompt_manager_runtime_dir: Path | None = None


class PromptTemplateCreate(BaseModel):
    category: str
    type: str
    name: str
    content: str = ""
    content_separator: str = ""
    record_separator: str = ""
    output_start: str = ""
    output_end: str = ""
    sop_prompt: str = ""
    variables: list[str] = Field(default_factory=list)


class PromptTemplateUpdate(BaseModel):
    name: str | None = None
    content: str | None = None
    content_separator: str | None = None
    record_separator: str | None = None
    output_start: str | None = None
    output_end: str | None = None
    sop_prompt: str | None = None
    variables: list[str] | None = None
    enabled: bool | None = None


def _runtime_data_dir() -> Path:
    return Path(get_store().db_path).parent


def prompt_manager_store() -> PromptManagerStore:
    global _prompt_manager_runtime_dir, _prompt_manager_store
    runtime_dir = _runtime_data_dir()
    if _prompt_manager_store is None or _prompt_manager_runtime_dir != runtime_dir:
        _prompt_manager_runtime_dir = runtime_dir
        _prompt_manager_store = PromptManagerStore(runtime_dir)
    return _prompt_manager_store


def _template_update_payload(payload: PromptTemplateUpdate) -> dict[str, Any]:
    if hasattr(payload, "model_dump"):
        return payload.model_dump(exclude_unset=True)
    return payload.dict(exclude_unset=True)


@router.get("/templates")
def list_templates(type: str | None = None, category: str | None = None) -> list[dict[str, Any]]:
    return _call(lambda: prompt_manager_store().list_templates(type=type, category=category))


@router.post("/templates")
def create_template(payload: PromptTemplateCreate) -> dict[str, Any]:
    return _call(lambda: prompt_manager_store().create_template(**payload.model_dump()))


@router.put("/templates/{template_id}")
def update_template(template_id: str, payload: PromptTemplateUpdate) -> dict[str, Any]:
    return _call(lambda: prompt_manager_store().update_template(template_id, **_template_update_payload(payload)))


@router.delete("/templates/{template_id}")
def delete_template(template_id: str) -> dict[str, str]:
    return _call(lambda: prompt_manager_store().delete_template(template_id))


@router.post("/templates/{template_id}/duplicate")
def duplicate_template(template_id: str) -> dict[str, Any]:
    return _call(lambda: prompt_manager_store().duplicate_template(template_id))


@router.get("/templates/{template_id}/full-prompt")
def build_full_prompt(template_id: str) -> dict[str, str]:
    return _call(lambda: {"full_prompt": prompt_manager_store().build_full_prompt(template_id)})
