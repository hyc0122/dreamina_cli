"""剧本项目接口。

负责项目创建、列表、详情、修改、复制和删除；不要在这里放分镜、资产、队列或 CLI 登录逻辑。
"""

from pathlib import Path
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from .context import _call, _dump, _model_data, get_store
from .schemas import ProjectCreate, ProjectUpdate


router = APIRouter(prefix="/jimeng", tags=["jimeng-projects"])


class StylePresetCreate(BaseModel):
    name: str
    prompt: str = ""
    scope: str = "video"
    accent: str = "#6478ff"


class StylePresetUpdate(BaseModel):
    name: Optional[str] = None
    prompt: Optional[str] = None
    scope: Optional[str] = None
    accent: Optional[str] = None


@router.get("/style_presets")
def list_style_presets(scope: Optional[str] = None):
    return _call(lambda: _dump(get_store().list_style_presets(scope)))


@router.post("/style_presets")
def create_style_preset(request: StylePresetCreate):
    return _call(lambda: _dump(get_store().create_style_preset(request.name, request.prompt, request.scope, request.accent)))


@router.put("/style_presets/{preset_id}")
def update_style_preset(preset_id: str, request: StylePresetUpdate):
    return _call(lambda: _dump(get_store().update_style_preset(preset_id, **_model_data(request, exclude_unset=True))))


@router.delete("/style_presets/{preset_id}")
def delete_style_preset(preset_id: str):
    return _call(lambda: (get_store().delete_style_preset(preset_id), {"deleted": preset_id})[1])


@router.get("/projects")
def list_projects():
    return _call(lambda: _dump(get_store().list_projects()))


@router.post("/projects")
def create_project(request: ProjectCreate):
    def create():
        created = get_store().create_project(
            request.name,
            request.style,
            request.description,
            request.default_ratio,
        )
        if request.inherit_source_project_id and request.inherit_source_shot_id:
            _inherit_assets_from_source_shot(
                target_project_id=created.id,
                source_project_id=request.inherit_source_project_id,
                source_shot_id=request.inherit_source_shot_id,
            )
        return _dump(get_store().get_project(created.id))

    return _call(create)


@router.get("/projects/{project_id}")
def get_project(project_id: str):
    return _call(lambda: _dump(get_store().get_project(project_id)))


@router.put("/projects/{project_id}")
def update_project(project_id: str, request: ProjectUpdate):
    return _call(lambda: _dump(get_store().update_project(project_id, **_model_data(request, exclude_unset=True))))


@router.delete("/projects/{project_id}")
def delete_project(project_id: str):
    return _call(lambda: (get_store().delete_project(project_id), {"deleted": project_id})[1])


@router.post("/projects/{project_id}/duplicate")
def duplicate_project(project_id: str):
    def duplicate():
        source = get_store().get_project(project_id)
        created = get_store().create_project(f"{source.name} Copy", source.style, source.description, source.default_ratio)
        get_store().update_project(created.id, prompt_preset_id=source.prompt_preset_id)
        asset_map: dict[str, str] = {}
        for asset in get_store().list_assets(project_id):
            copied = get_store().create_asset(
                created.id,
                asset.type,
                asset.name,
                asset.aliases,
                asset.description,
                asset.image_model,
                asset.image_ratio,
                asset.image_params,
                asset.video_prompt,
                asset.character_kind,
            )
            asset_map[asset.id] = copied.id
        for shot in get_store().list_shots(project_id):
            new_shot = get_store().create_shot(created.id, shot.prompt)
            if shot.default_duration:
                get_store().update_shot(new_shot.id, default_duration=shot.default_duration)
            for binding in get_store().list_bindings(project_id, shot.id):
                if binding.asset_id in asset_map:
                    get_store().create_binding(
                        created.id,
                        new_shot.id,
                        asset_map[binding.asset_id],
                        binding.asset_type,
                        binding.source,
                        binding.locked,
                        binding.slot_order,
                    )
        return _dump(get_store().get_project(created.id))

    return _call(duplicate)


def _inherit_assets_from_source_shot(target_project_id: str, source_project_id: str, source_shot_id: str) -> None:
    store = get_store()
    store.get_project(target_project_id)
    store.get_shot(source_project_id, source_shot_id)
    source_asset_by_id = {asset.id: asset for asset in store.list_assets(source_project_id)}
    copied_asset_ids: set[str] = set()
    for binding in store.list_bindings(source_project_id, source_shot_id):
        if binding.asset_id in copied_asset_ids:
            continue
        source_asset = source_asset_by_id.get(binding.asset_id)
        if source_asset is None:
            continue
        copied = store.create_asset(
            target_project_id,
            source_asset.type,
            source_asset.name,
            source_asset.aliases,
            source_asset.description,
            source_asset.image_model,
            source_asset.image_ratio,
            source_asset.image_params,
            source_asset.video_prompt,
            source_asset.character_kind,
        )
        _copy_asset_file_if_present(target_project_id, copied.type, copied.name, source_asset.image_path, "image", copied.image_ratio)
        _copy_asset_file_if_present(target_project_id, copied.type, copied.name, source_asset.audio_path, "audio", copied.image_ratio)
        copied_asset_ids.add(binding.asset_id)


def _copy_asset_file_if_present(
    target_project_id: str,
    asset_type,
    asset_name: str,
    source_path: str | None,
    file_kind: str,
    image_ratio: str,
) -> None:
    if not source_path:
        return
    source = Path(source_path)
    if not source.exists() or not source.is_file():
        return
    get_store().upsert_asset_file(target_project_id, asset_type, asset_name, source, file_kind, image_ratio=image_ratio)
