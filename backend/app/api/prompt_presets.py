"""提示词模板接口边界。

负责全局视频生成模板、图片指令模板和项目默认模板绑定。
不要在这里直接调用即梦 CLI。
"""

import json
from typing import Any

from fastapi import APIRouter

from ..jimeng_models import JimengPromptScope
from ..jimeng_prompting import render_prompt_preset
from .context import _call, _dump, _model_data, _now, get_store
from .schemas import (
    ProjectPromptPresetRequest,
    PromptPresetCreate,
    PromptPresetUpdate,
    RenderPromptPreviewRequest,
)


router = APIRouter(prefix="/jimeng", tags=["jimeng-prompt-presets"])


@router.get("/prompt_presets")
def list_prompt_presets(enabled_only: bool = False):
    return _call(lambda: _dump(get_store().list_prompt_presets(enabled_only=enabled_only)))


@router.post("/prompt_presets")
def create_prompt_preset(request: PromptPresetCreate):
    return _call(
        lambda: _dump(
            get_store().create_prompt_preset(
                name=request.name,
                content=request.content,
                scope=request.scope,
                variables=request.variables,
                is_default=request.is_default,
                enabled=request.enabled,
            )
        )
    )


@router.put("/prompt_presets/{preset_id}")
def update_prompt_preset(preset_id: str, request: PromptPresetUpdate):
    return _call(lambda: _dump(_update_prompt_preset(preset_id, _model_data(request, exclude_unset=True))))


@router.delete("/prompt_presets/{preset_id}")
def delete_prompt_preset(preset_id: str):
    return _call(lambda: _delete_prompt_preset(preset_id))


@router.post("/prompt_presets/{preset_id}/default")
def set_default_prompt_preset(preset_id: str):
    return _call(lambda: _dump(get_store().set_default_prompt_preset(preset_id)))


@router.post("/projects/{project_id}/prompt_preset")
def set_project_prompt_preset(project_id: str, request: ProjectPromptPresetRequest):
    return _call(lambda: _dump(get_store().update_project(project_id, prompt_preset_id=request.prompt_preset_id)))


@router.post("/projects/{project_id}/shots/{shot_id}/render_prompt_preview")
def render_prompt_preview(project_id: str, shot_id: str, request: RenderPromptPreviewRequest = RenderPromptPreviewRequest()):
    def render():
        project = get_store().get_project(project_id)
        shot = get_store().get_shot(project_id, shot_id)
        template = request.content
        if template is None:
            preset_id = request.prompt_preset_id or project.prompt_preset_id
            template = get_store()._get_prompt_preset(preset_id).content if preset_id else ""
        result = render_prompt_preset(
            template=template,
            project=project,
            shot=shot,
            bindings=get_store().list_bindings(project_id, shot_id),
            assets=get_store().list_assets(project_id),
            camera=request.camera,
            era=request.era,
            style_prompt=get_store().style_prompt_for(project.style, scope="video"),
        )
        return _dump(result)

    return _call(render)


def _update_prompt_preset(preset_id: str, updates: dict[str, Any]):
    if updates.get("is_default"):
        get_store().set_default_prompt_preset(preset_id)
    allowed = {"name", "scope", "content", "variables", "enabled"}
    values = {key: value for key, value in updates.items() if key in allowed and value is not None}
    if "scope" in values:
        values["scope"] = JimengPromptScope(values["scope"]).value
    if "variables" in values:
        values["variables"] = json.dumps(values["variables"], ensure_ascii=False)
    if "enabled" in values:
        values["enabled"] = int(values["enabled"])
    if values:
        values["updated_at"] = _now()
        assignments = ", ".join(f"{key} = ?" for key in values)
        with get_store()._connect() as conn:
            row = conn.execute("SELECT id FROM prompt_presets WHERE id = ?", (preset_id,)).fetchone()
            if row is None:
                raise KeyError(f"Jimeng prompt preset not found: {preset_id}")
            conn.execute(f"UPDATE prompt_presets SET {assignments} WHERE id = ?", (*values.values(), preset_id))
    return get_store()._get_prompt_preset(preset_id)


def _delete_prompt_preset(preset_id: str) -> dict[str, str]:
    get_store()._get_prompt_preset(preset_id)
    with get_store()._connect() as conn:
        conn.execute("DELETE FROM prompt_presets WHERE id = ?", (preset_id,))
        conn.execute(
            "UPDATE projects SET prompt_preset_id = NULL, updated_at = ? WHERE prompt_preset_id = ?",
            (_now(), preset_id),
        )
    return {"deleted": preset_id}
