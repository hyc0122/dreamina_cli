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
    clamp_video_duration_seconds,
    get_store,
    normalize_optional_video_duration_seconds,
)
from .schemas import (
    BatchReplaceRequest,
    MoveRequest,
    ShotAssetMatchRequest,
    ShotBatchDelete,
    ShotCreate,
    ShotImport,
    ShotUpdate,
    ShotVoiceAnalysisRequest,
)
from ..jimeng_models import JimengAssetType
from ..jimeng_matching import calculate_highlights, match_assets_for_prompt, parse_csv_shots, parse_plain_text_shots


router = APIRouter(prefix="/jimeng", tags=["jimeng-shots"])
DEFAULT_DURATION_WHEN_UNDETECTED = 15
VOICE_MARKERS = (
    "对话",
    "对白",
    "台词",
    "VO",
    "vo",
    "V.O",
    "v.o",
    "OS",
    "os",
    "O.S",
    "o.s",
    "画外音",
    "旁白",
    "内心",
    "独白",
    "说：",
    "问：",
    "答：",
    "喊：",
    "：\"",
    "：“",
)


def _normalize_detected_duration(duration: int | None) -> int:
    return clamp_video_duration_seconds(duration, default=DEFAULT_DURATION_WHEN_UNDETECTED)


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
def match_assets(project_id: str, request: ShotAssetMatchRequest | None = None):
    def match_target_shots():
        match_request = request or ShotAssetMatchRequest()
        assets = get_store().list_assets(project_id)
        shots = _target_shots(project_id, match_request.shot_ids)
        results = []
        for shot in shots:
            if match_request.clear_existing_auto:
                _delete_auto_bindings(project_id, shot.id)
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

    return _call(match_target_shots)


@router.post("/projects/{project_id}/shots/clear_matched_assets")
def clear_matched_assets(project_id: str, request: ShotAssetMatchRequest):
    def clear_target_shots():
        if not request.shot_ids:
            raise ValueError("请选择要删除匹配资产的分镜")
        shots = _target_shots(project_id, request.shot_ids)
        results = []
        deleted_ids: list[str] = []
        for shot in shots:
            deleted = _delete_auto_bindings(project_id, shot.id)
            deleted_ids.extend(deleted)
            results.append(
                {
                    "shot_id": shot.id,
                    "deleted": deleted,
                    "bindings": _dump(get_store().list_bindings(project_id, shot.id)),
                    "highlights": [],
                }
            )
        return {"shots": results, "deleted": deleted_ids, "deleted_count": len(deleted_ids)}

    return _call(clear_target_shots)


@router.post("/projects/{project_id}/shots/analyze_silent_voice")
def disable_silent_character_audio(project_id: str, request: ShotVoiceAnalysisRequest | None = None):
    def analyze():
        analysis_request = request or ShotVoiceAnalysisRequest()
        assets_by_id = {asset.id: asset for asset in get_store().list_assets(project_id)}
        all_shots = get_store().list_shots(project_id)
        target_shots = _target_shots(project_id, analysis_request.shot_ids)
        bindings_by_shot = {
            shot.id: get_store().list_bindings(project_id, shot.id)
            for shot in all_shots
        }
        frequent_audio_asset_ids = _frequent_audio_character_asset_ids(bindings_by_shot, assets_by_id)
        disabled: list[dict[str, Any]] = []
        skipped: list[dict[str, Any]] = []
        for shot in target_shots:
            has_voice = _shot_has_voice_content(shot.prompt)
            for binding in bindings_by_shot.get(shot.id, []):
                asset = assets_by_id.get(binding.asset_id)
                if (
                    binding.asset_type != JimengAssetType.character
                    or asset is None
                    or not asset.audio_path
                    or binding.asset_id not in frequent_audio_asset_ids
                ):
                    continue
                if has_voice:
                    skipped.append({"shot_id": shot.id, "shot_index": shot.shot_index, "binding_id": binding.id, "reason": "has_voice"})
                    continue
                if binding.voice_enabled:
                    updated = get_store().update_binding(binding.id, voice_enabled=False)
                    disabled.append(
                        {
                            "shot_id": shot.id,
                            "shot_index": shot.shot_index,
                            "binding_id": updated.id,
                            "asset_id": updated.asset_id,
                            "asset_name": asset.name,
                        }
                    )
        return {"disabled": disabled, "skipped": skipped, "disabled_count": len(disabled)}

    return _call(analyze)


def _target_shots(project_id: str, shot_ids: list[str] | None):
    all_shots = get_store().list_shots(project_id)
    if not shot_ids:
        return all_shots

    ordered_ids = list(dict.fromkeys(shot_ids))
    shot_by_id = {shot.id: shot for shot in all_shots}
    missing = [shot_id for shot_id in ordered_ids if shot_id not in shot_by_id]
    if missing:
        raise ValueError("selected shot does not belong to project")
    return [shot_by_id[shot_id] for shot_id in ordered_ids]


def _delete_auto_bindings(project_id: str, shot_id: str) -> list[str]:
    deleted: list[str] = []
    for binding in get_store().list_bindings(project_id, shot_id):
        if binding.source != "auto":
            continue
        get_store().delete_binding(binding.id)
        deleted.append(binding.id)
    return deleted


def _frequent_audio_character_asset_ids(
    bindings_by_shot: dict[str, list[Any]],
    assets_by_id: dict[str, Any],
    min_shots: int = 4,
) -> set[str]:
    shot_ids_by_asset: dict[str, set[str]] = {}
    for shot_id, bindings in bindings_by_shot.items():
        for binding in bindings:
            asset = assets_by_id.get(binding.asset_id)
            if binding.asset_type == JimengAssetType.character and asset and asset.audio_path:
                shot_ids_by_asset.setdefault(binding.asset_id, set()).add(shot_id)
    return {asset_id for asset_id, shot_ids in shot_ids_by_asset.items() if len(shot_ids) >= min_shots}


def _shot_has_voice_content(prompt: str) -> bool:
    return any(marker in prompt for marker in VOICE_MARKERS)


@router.put("/projects/{project_id}/shots/{shot_id}")
def update_shot(project_id: str, shot_id: str, request: ShotUpdate):
    def update():
        get_store().get_shot(project_id, shot_id)
        updates = _model_data(request, exclude_unset=True)
        if "default_duration" in updates:
            updates["default_duration"] = normalize_optional_video_duration_seconds(updates["default_duration"])
        return _dump(get_store().update_shot(shot_id, **updates))

    return _call(update)


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
        undetected_shots: list[dict[str, Any]] = []
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
            if not detected:
                undetected_shots.append(
                    {
                        "shot_id": shot.id,
                        "shot_index": shot.shot_index,
                        "duration": duration,
                    }
                )
        return {
            "results": results,
            "updated_count": updated_count,
            "skipped_count": skipped_count,
            "undetected_shots": undetected_shots,
        }

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
