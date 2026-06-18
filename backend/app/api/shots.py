"""分镜接口。

负责分镜导入、编辑、移动、单删、批量删除、批量替换、资产匹配和时长检测；不要在这里直接操作即梦 CLI 或资产文件上传。
"""

from typing import Any

from fastapi import APIRouter

from .context import (
    _call,
    _detect_duration_seconds,
    _dump,
    _model_data,
    get_store,
)
from .schemas import (
    BatchReplaceRequest,
    MoveRequest,
    ShotBatchDelete,
    ShotCreate,
    ShotImport,
    ShotUpdate,
)
from ..jimeng_matching import calculate_highlights, match_assets_for_prompt, parse_csv_shots, parse_plain_text_shots


router = APIRouter(prefix="/jimeng", tags=["jimeng-shots"])
MIN_VIDEO_DURATION_SECONDS = 4
MAX_VIDEO_DURATION_SECONDS = 15
DEFAULT_DURATION_WHEN_UNDETECTED = 15


def _normalize_detected_duration(duration: int | None) -> int:
    if duration is None:
        return DEFAULT_DURATION_WHEN_UNDETECTED
    return min(MAX_VIDEO_DURATION_SECONDS, max(MIN_VIDEO_DURATION_SECONDS, duration))


@router.get("/projects/{project_id}/shots")
def list_shots(project_id: str):
    return _call(lambda: _dump(get_store().list_shots(project_id)))


@router.post("/projects/{project_id}/shots")
def create_shot(project_id: str, request: ShotCreate):
    return _call(lambda: _dump(get_store().create_shot(project_id, request.prompt)))


@router.post("/projects/{project_id}/shots/import")
def import_shots(project_id: str, request: ShotImport):
    def create_imported():
        get_store().get_project(project_id)
        parsed = parse_csv_shots(request.text) if request.format.lower() == "csv" else parse_plain_text_shots(request.text)
        shots = [get_store().create_shot(project_id, item.prompt) for item in parsed]
        return {"shots": _dump(shots)}

    return _call(create_imported)


@router.post("/projects/{project_id}/shots/batch_replace")
def batch_replace_shots(project_id: str, request: BatchReplaceRequest):
    def replace():
        if not request.find:
            raise ValueError("find cannot be empty")
        shots = []
        for shot in get_store().list_shots(project_id):
            if request.find in shot.prompt:
                shots.append(get_store().update_shot(shot.id, prompt=shot.prompt.replace(request.find, request.replace)))
        return {"shots": _dump(shots)}

    return _call(replace)


@router.post("/projects/{project_id}/shots/match_assets")
def match_assets(project_id: str):
    def match_all():
        assets = get_store().list_assets(project_id)
        results = []
        for shot in get_store().list_shots(project_id):
            existing = {(binding.asset_id, binding.asset_type) for binding in get_store().list_bindings(project_id, shot.id)}
            bindings = []
            matches = match_assets_for_prompt(shot.prompt, assets)
            for match in matches:
                key = (match.asset_id, match.asset_type)
                if key in existing:
                    continue
                binding = get_store().create_binding(project_id, shot.id, match.asset_id, match.asset_type, source="auto")
                bindings.append(binding)
                existing.add(key)
            results.append(
                {
                    "shot_id": shot.id,
                    "bindings": _dump(bindings),
                    "matches": _dump(matches),
                    "highlights": _dump(calculate_highlights(shot.prompt, assets)),
                }
            )
        return {"shots": results}

    return _call(match_all)


@router.put("/projects/{project_id}/shots/{shot_id}")
def update_shot(project_id: str, shot_id: str, request: ShotUpdate):
    return _call(lambda: (get_store().get_shot(project_id, shot_id), _dump(get_store().update_shot(shot_id, **_model_data(request, exclude_unset=True))))[1])


@router.post("/projects/{project_id}/shots/{shot_id}/detect_duration")
def detect_shot_duration(project_id: str, shot_id: str):
    def detect():
        shot = get_store().get_shot(project_id, shot_id)
        duration = _detect_duration_seconds(shot.prompt)
        detected = duration is not None
        duration = _normalize_detected_duration(duration)
        updated = get_store().update_shot(shot_id, default_duration=duration)
        return {"duration": duration, "detected": detected, "shot": _dump(updated)}

    return _call(detect)


@router.post("/projects/{project_id}/shots/batch_detect_duration")
def batch_detect_project_durations(project_id: str):
    def detect_all():
        results: list[dict[str, Any]] = []
        updated_count = 0
        skipped_count = 0
        for shot in get_store().list_shots(project_id):
            duration = _detect_duration_seconds(shot.prompt)
            detected = duration is not None
            duration = _normalize_detected_duration(duration)
            updated = get_store().update_shot(shot.id, default_duration=duration)
            updated_count += 1
            results.append(
                {
                    "shot_id": shot.id,
                    "shot_index": shot.shot_index,
                    "duration": duration,
                    "updated": True,
                    "detected": detected,
                    "shot": _dump(updated),
                }
            )
        return {"results": results, "updated_count": updated_count, "skipped_count": skipped_count}

    return _call(detect_all)


@router.delete("/projects/{project_id}/shots/{shot_id}")
def delete_shot(project_id: str, shot_id: str):
    return _call(lambda: (get_store().delete_shot(project_id, shot_id), {"deleted": shot_id})[1])


@router.post("/projects/{project_id}/shots/batch_delete")
def batch_delete_shots(project_id: str, request: ShotBatchDelete):
    return _call(lambda: {"deleted": get_store().delete_shots(project_id, request.shot_ids)})


@router.post("/projects/{project_id}/shots/{shot_id}/move")
def move_shot(project_id: str, shot_id: str, request: MoveRequest):
    return _call(lambda: _dump(get_store().move_shot(project_id, shot_id, request.direction)))
