"""视频候选结果接口边界。

负责本地上传视频、候选视频列表、默认视频、锁定视频和下载。
不要在这里提交新的即梦生成任务。
"""

import base64
import re
import shutil
import urllib.request
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Query, Request
from fastapi.responses import FileResponse, RedirectResponse

from .context import _async_call, _call, _dump, _settings, get_store
from .schemas import CandidateBatchDownload, CandidateExport, CandidateLock


router = APIRouter(prefix="/jimeng", tags=["jimeng-candidates"])

_VIDEO_EXTENSIONS = {"mp4", "mov", "m4v", "webm", "avi", "mkv"}
_VIDEO_MIME_TYPES = {
    "video/mp4",
    "video/quicktime",
    "video/x-m4v",
    "video/webm",
    "video/x-msvideo",
    "video/x-matroska",
    "application/octet-stream",
}
_WINDOWS_ILLEGAL_ASSET_NAME_CHARS = set('\\/:*?"<>|')


def _parse_ids(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


@router.get("/projects/{project_id}/candidates")
def list_project_candidates(
    project_id: str,
    shot_ids: str | None = Query(default=None),
    limit_per_shot: int = Query(default=0, ge=0, le=100),
):
    def list_bulk():
        candidates_by_shot_id = get_store().list_candidates_for_shots(
            project_id,
            _parse_ids(shot_ids),
            limit_per_shot or None,
        )
        flat_candidates = [candidate for candidates in candidates_by_shot_id.values() for candidate in candidates]
        return {
            "candidates": _dump(flat_candidates),
            "candidates_by_shot_id": {
                shot_id: _dump(candidates)
                for shot_id, candidates in candidates_by_shot_id.items()
            },
        }

    return _call(list_bulk)


@router.get("/projects/{project_id}/shots/{shot_id}/candidates")
def list_candidates(project_id: str, shot_id: str):
    return _call(lambda: _dump(get_store().list_candidates(project_id, shot_id)))


@router.post("/projects/{project_id}/shots/{shot_id}/candidates/upload")
async def upload_video_candidate(project_id: str, shot_id: str, request: Request):
    async def upload():
        get_store().get_shot(project_id, shot_id)
        filename, content, content_type = await _file_payload(request)
        _validate_upload_file(filename, content_type)
        safe_filename = _video_filename_from_upload(filename)
        return _dump(
            get_store().create_uploaded_video_candidate(
                project_id=project_id,
                shot_id=shot_id,
                video_filename=safe_filename,
                content=content,
                resolution=str(_settings.get("video_resolution") or "720p"),
                make_default=True,
            )
        )

    return await _async_call(upload)


@router.post("/projects/{project_id}/shots/{shot_id}/candidates/{candidate_id}/default")
def set_default_candidate(project_id: str, shot_id: str, candidate_id: str):
    return _call(lambda: (get_store().get_project(project_id), _dump(get_store().set_default_candidate(shot_id, candidate_id)))[1])


@router.post("/projects/{project_id}/shots/{shot_id}/candidates/{candidate_id}/lock")
def lock_candidate(project_id: str, shot_id: str, candidate_id: str, request: CandidateLock = CandidateLock()):
    return _call(lambda: (get_store().get_project(project_id), _dump(get_store().lock_candidate(shot_id, candidate_id, request.locked)))[1])


@router.get("/projects/{project_id}/shots/{shot_id}/candidates/{candidate_id}/download")
def download_candidate(project_id: str, shot_id: str, candidate_id: str):
    def get_download():
        shot = get_store().get_shot(project_id, shot_id)
        candidates = get_store().list_candidates(project_id, shot_id)
        candidate = next((item for item in candidates if item.id == candidate_id), None)
        if candidate is None:
            raise KeyError(f"Jimeng video candidate not found: {candidate_id}")
        filename = _shot_video_filename(shot.shot_index, candidate.video_filename)
        if candidate.video_path.startswith(("http://", "https://")):
            return RedirectResponse(candidate.video_path)
        path = _candidate_local_path(candidate.video_path)
        return FileResponse(path, filename=filename)

    return _call(get_download)


@router.post("/projects/{project_id}/shots/{shot_id}/candidates/{candidate_id}/export")
def export_candidate(project_id: str, shot_id: str, candidate_id: str, request: CandidateExport):
    def export():
        shot = get_store().get_shot(project_id, shot_id)
        candidate = next(
            (item for item in get_store().list_candidates(project_id, shot_id) if item.id == candidate_id),
            None,
        )
        if candidate is None:
            raise KeyError(f"Jimeng video candidate not found: {candidate_id}")
        target_dir = Path(request.target_dir).expanduser().resolve()
        target_dir.mkdir(parents=True, exist_ok=True)
        filename = _shot_video_filename(shot.shot_index, candidate.video_filename)
        target = target_dir / filename
        if target.exists() and not request.overwrite:
            raise ValueError(f"目标文件已存在：{target}")
        _copy_candidate_video(candidate.video_path, target)
        return {
            "shot_id": shot.id,
            "shot_index": shot.shot_index,
            "candidate_id": candidate.id,
            "filename": filename,
            "path": str(target),
        }

    return _call(export)


@router.post("/projects/{project_id}/shots/batch_download")
def batch_download_candidates(project_id: str, request: CandidateBatchDownload = CandidateBatchDownload()):
    def export_or_list():
        if request.target_dir.strip():
            return _export_selected_default_videos(project_id, request)
        candidates = []
        for shot in get_store().list_shots(project_id):
            candidates.extend(get_store().list_candidates(project_id, shot.id))
        return {"candidates": _dump(candidates)}

    return _call(export_or_list)


def _export_selected_default_videos(project_id: str, request: CandidateBatchDownload) -> dict:
    project = get_store().get_project(project_id)
    shots = get_store().list_shots(project_id)
    selected_ids = set(request.shot_ids)
    if selected_ids:
        shots = [shot for shot in shots if shot.id in selected_ids]
    if not shots:
        raise ValueError("no selected shots to export")

    target_root = Path(request.target_dir).expanduser().resolve()
    target_root.mkdir(parents=True, exist_ok=True)
    export_dir = _unique_export_dir(target_root, project.name)
    export_dir.mkdir(parents=True, exist_ok=False)

    files: list[dict] = []
    skipped: list[dict] = []
    for shot in sorted(shots, key=lambda item: item.shot_index):
        candidate = _default_candidate_for_shot(project_id, shot.id, shot.default_video_candidate_id)
        if candidate is None:
            skipped.append({"shot_id": shot.id, "shot_index": shot.shot_index, "reason": "没有默认视频"})
            continue
        filename = _shot_video_filename(shot.shot_index, candidate.video_filename)
        target = export_dir / filename
        try:
            _copy_candidate_video(candidate.video_path, target)
        except (OSError, ValueError, KeyError) as exc:
            skipped.append({"shot_id": shot.id, "shot_index": shot.shot_index, "reason": str(exc)})
            continue
        files.append(
            {
                "shot_id": shot.id,
                "shot_index": shot.shot_index,
                "candidate_id": candidate.id,
                "filename": filename,
                "path": str(target),
            }
        )

    return {"export_dir": str(export_dir), "files": files, "skipped": skipped}


def _default_candidate_for_shot(project_id: str, shot_id: str, default_candidate_id: str | None):
    candidates = get_store().list_candidates(project_id, shot_id)
    if default_candidate_id:
        candidate = next((item for item in candidates if item.id == default_candidate_id), None)
        if candidate is not None:
            return candidate
    return next((item for item in candidates if item.is_default), None)


def _unique_export_dir(target_root: Path, project_name: str) -> Path:
    safe_project = _safe_folder_name(project_name or "未命名剧本")
    stamp = datetime.now().strftime("%Y%m%d%H%M")
    base = target_root / f"{safe_project}{stamp}"
    if not base.exists():
        return base
    index = 2
    while True:
        candidate = target_root / f"{safe_project}{stamp}-{index}"
        if not candidate.exists():
            return candidate
        index += 1


def _safe_folder_name(value: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]+', "_", value).strip().strip(".")
    return cleaned or "未命名剧本"


def _shot_video_filename(shot_index: int, original_filename: str) -> str:
    suffix = Path(original_filename).suffix or ".mp4"
    return f"分镜{shot_index}{suffix}"


def _copy_candidate_video(candidate_path: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if candidate_path.startswith(("http://", "https://")):
        _download_remote_video(candidate_path, target)
        return
    shutil.copy2(_candidate_local_path(candidate_path), target)


def _download_remote_video(url: str, target: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "DreaminaCLIBatch/0.1"})
    try:
        with urllib.request.urlopen(request, timeout=120) as response, target.open("wb") as output:
            shutil.copyfileobj(response, output)
    except Exception:
        target.unlink(missing_ok=True)
        raise


async def _file_payload(request: Request) -> tuple[str, bytes, str | None]:
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type:
        form = await request.form()
        upload = form.get("file")
        if upload is None:
            raise ValueError("file is required")
        filename = getattr(upload, "filename", None) or "upload.bin"
        content = await upload.read()
        return filename, content, getattr(upload, "content_type", None)
    body = await request.json()
    filename = body.get("filename") or "upload.bin"
    if "content_base64" in body:
        return filename, base64.b64decode(body["content_base64"]), body.get("content_type")
    if "content" in body:
        return filename, str(body["content"]).encode("utf-8"), body.get("content_type")
    raise ValueError("content_base64 or file is required")


def _validate_upload_file(filename: str, content_type: str | None) -> None:
    ext = Path(filename).suffix.lower().lstrip(".")
    if not ext or ext not in _VIDEO_EXTENSIONS:
        raise ValueError("unsupported video file extension")
    normalized_type = (content_type or "").split(";", 1)[0].strip().lower()
    if normalized_type and normalized_type not in _VIDEO_MIME_TYPES:
        raise ValueError("unsupported video content type")


def _video_filename_from_upload(filename: str) -> str:
    if "/" in filename or "\\" in filename:
        raise ValueError('video filename cannot be empty or contain \\ / : * ? " < > |')
    video_name = Path(filename).name.strip()
    stem = Path(video_name).stem.strip()
    if (
        not video_name
        or not stem
        or stem.startswith(".")
        or any(ch in _WINDOWS_ILLEGAL_ASSET_NAME_CHARS for ch in video_name)
    ):
        raise ValueError('video filename cannot be empty or contain \\ / : * ? " < > |')
    return video_name


def _candidate_local_path(candidate_path: str) -> Path:
    path = Path(candidate_path).resolve()
    output_root = get_store().output_root.resolve()
    try:
        path.relative_to(output_root)
    except ValueError as exc:
        raise KeyError(f"Jimeng video file not found: {candidate_path}") from exc
    if not path.exists() or not path.is_file():
        raise KeyError(f"Jimeng video file not found: {candidate_path}")
    return path
