"""资产接口边界。

负责角色、场景、道具的创建、批量上传、批量删除、描述导入导出和资产生图。
资产删除必须经过绑定检查：已绑定到分镜的资产不允许删除。
"""

import base64
import csv
import io
import json
import urllib.parse
import urllib.request
import uuid
import zipfile
from collections.abc import Mapping
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import ValidationError

from ..jimeng_cli import DreaminaTaskResult
from ..jimeng_models import JimengAssetType
from .context import _async_call, _call, _cli, _dump, _model_data, _settings, get_store
from .schemas import (
    AssetBatchDelete,
    AssetCreate,
    AssetImageGenerateRequest,
    AssetMetadataImport,
    AssetUpdate,
)


router = APIRouter(prefix="/jimeng", tags=["jimeng-assets"])

_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}
_AUDIO_EXTENSIONS = {"mp3", "wav", "m4a", "aac", "ogg"}
_IMAGE_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}
_AUDIO_MIME_TYPES = {
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/mp4",
    "audio/aac",
    "audio/ogg",
    "application/ogg",
}
_WINDOWS_ILLEGAL_ASSET_NAME_CHARS = set('\\/:*?"<>|')


@router.get("/projects/{project_id}/assets")
def list_assets(project_id: str, type: Optional[JimengAssetType] = None, asset_type: Optional[JimengAssetType] = None):
    return _call(lambda: _dump(get_store().list_assets(project_id, type or asset_type)))


@router.post("/projects/{project_id}/assets")
def create_asset(project_id: str, request: AssetCreate):
    return _call(
        lambda: _dump(
            get_store().create_asset(
                project_id,
                request.type,
                request.name,
                request.aliases,
                request.description,
                request.image_model,
                request.image_ratio,
                request.image_params,
                request.video_prompt,
                request.character_kind,
            )
        )
    )


@router.post("/projects/{project_id}/assets/batch_upload")
async def batch_upload_assets(project_id: str, request: Request):
    async def upload():
        content_type = request.headers.get("content-type", "")
        if "multipart/form-data" in content_type:
            form = await request.form()
            asset_type_value = form.get("asset_type")
            if not asset_type_value:
                raise ValueError("asset_type is required")
            asset_type = JimengAssetType(str(asset_type_value))
            image_ratio = str(form.get("image_ratio") or "16:9")
            if image_ratio not in {"16:9", "9:16"}:
                raise ValueError("image_ratio must be 16:9 or 9:16")
            uploads = form.getlist("files")
            if not uploads:
                raise ValueError("files is required")

            prepared_files = []
            for upload_file in uploads:
                filename = getattr(upload_file, "filename", None) or ""
                read = getattr(upload_file, "read", None)
                if not filename or read is None:
                    raise ValueError("files must contain uploaded files")
                asset_name = _asset_name_from_upload_filename(filename)
                upload_content_type = getattr(upload_file, "content_type", None)
                file_kind = _detect_upload_file_kind(filename, upload_content_type)
                if file_kind == "audio" and asset_type != JimengAssetType.character:
                    raise ValueError("audio assets are only supported for character")
                prepared_files.append(
                    {
                        "filename": filename,
                        "asset_name": asset_name,
                        "file_kind": file_kind,
                        "content": await upload_file.read(),
                    }
                )

            assets = [
                get_store().upsert_asset_file(
                    project_id,
                    asset_type if item["file_kind"] == "image" else JimengAssetType.character,
                    item["asset_name"],
                    Path(item["filename"]),
                    item["file_kind"],
                    content=item["content"],
                    image_ratio=image_ratio,
                )
                for item in prepared_files
            ]
            return {"assets": _dump(assets)}

        body = await request.json()
        assets = _parse_batch_asset_creates(body)
        return {
            "assets": _dump(
                [
                    get_store().create_asset(
                        project_id,
                        item.type,
                        item.name,
                        item.aliases,
                        item.description,
                        item.image_model,
                        item.image_ratio,
                        item.image_params,
                        item.video_prompt,
                        item.character_kind,
                    )
                    for item in assets
                ]
            )
        }

    return await _async_call(upload)


@router.post("/projects/{project_id}/assets/import_metadata")
def import_asset_metadata(project_id: str, request: AssetMetadataImport):
    def import_items():
        get_store().get_project(project_id)
        assets = _parse_asset_metadata_import(request)
        imported = [
            get_store().upsert_asset_metadata(
                project_id,
                item.type,
                item.name,
                item.aliases,
                item.description,
                item.image_model,
                item.image_ratio,
                item.image_params,
                item.video_prompt,
                item.character_kind,
            )
            for item in assets
        ]
        return {"assets": _dump(imported)}

    return _call(import_items)


@router.get("/projects/{project_id}/assets/export_metadata")
def export_asset_metadata(project_id: str):
    return _call(lambda: {"assets": _dump(get_store().list_assets(project_id))})


@router.get("/projects/{project_id}/assets/export_images")
def export_asset_images(project_id: str, asset_type: Optional[JimengAssetType] = None):
    def build_zip():
        get_store().get_project(project_id)
        assets = get_store().list_assets(project_id, asset_type)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for asset in assets:
                if not asset.image_path:
                    continue
                path = Path(asset.image_path)
                try:
                    get_store()._assert_under_output_root(path)
                except ValueError:
                    continue
                if not path.exists() or not path.is_file():
                    continue
                archive_name = f"{asset.type.value}/{asset.image_filename or path.name}"
                archive.write(path, archive_name)
        buffer.seek(0)
        filename = f"{project_id}-asset-images.zip"
        return StreamingResponse(
            buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    return _call(build_zip)


@router.post("/projects/{project_id}/assets/batch_generate_images")
def batch_generate_asset_images(project_id: str, request: Optional[AssetImageGenerateRequest] = None):
    return _call(lambda: _batch_generate_asset_images(project_id, request or AssetImageGenerateRequest()))


@router.post("/projects/{project_id}/assets/batch_delete")
def batch_delete_assets(project_id: str, request: AssetBatchDelete):
    return _call(lambda: {"deleted": get_store().delete_assets(project_id, request.asset_ids)})


@router.put("/projects/{project_id}/assets/{asset_id}")
def update_asset(project_id: str, asset_id: str, request: AssetUpdate):
    return _call(
        lambda: (
            get_store().get_project(project_id),
            _dump(get_store().update_asset(asset_id, _model_data(request, exclude_unset=True))),
        )[1]
    )


@router.delete("/projects/{project_id}/assets/{asset_id}")
def delete_asset(project_id: str, asset_id: str):
    return _call(lambda: (get_store().get_project(project_id), get_store().delete_asset(asset_id), {"deleted": asset_id})[2])


@router.post("/projects/{project_id}/assets/{asset_id}/image")
async def upload_asset_image(project_id: str, asset_id: str, request: Request):
    async def upload():
        asset = get_store()._get_asset(asset_id)
        if asset.project_id != project_id:
            raise ValueError("asset does not belong to project")
        filename, content, content_type = await _file_payload(request)
        _validate_upload_file(filename, content_type, "image")
        return _dump(get_store().upsert_asset_file(project_id, asset.type, asset.name, Path(filename), "image", content=content))

    return await _async_call(upload)


@router.post("/projects/{project_id}/assets/{asset_id}/image/generate")
def generate_asset_image(project_id: str, asset_id: str, request: Optional[AssetImageGenerateRequest] = None):
    return _call(lambda: _generate_asset_image(project_id, asset_id, request or AssetImageGenerateRequest()))


@router.post("/projects/{project_id}/assets/{asset_id}/voice")
async def upload_asset_voice(project_id: str, asset_id: str, request: Request):
    async def upload():
        asset = get_store()._get_asset(asset_id)
        if asset.project_id != project_id:
            raise ValueError("asset does not belong to project")
        filename, content, content_type = await _file_payload(request)
        _validate_upload_file(filename, content_type, "audio")
        return _dump(get_store().upsert_asset_file(project_id, asset.type, asset.name, Path(filename), "audio", content=content))

    return await _async_call(upload)


@router.get("/projects/{project_id}/assets/{asset_id}/voice")
def get_asset_voice(project_id: str, asset_id: str):
    def get_voice():
        asset = get_store()._get_asset(asset_id)
        if asset.project_id != project_id:
            raise ValueError("asset does not belong to project")
        return {"audio_filename": asset.audio_filename, "audio_path": asset.audio_path}

    return _call(get_voice)


def _validate_upload_file(filename: str, content_type: str | None, file_kind: str) -> None:
    ext = Path(filename).suffix.lower().lstrip(".")
    if file_kind == "image":
        allowed_exts = _IMAGE_EXTENSIONS
        allowed_mimes = _IMAGE_MIME_TYPES
    elif file_kind == "audio":
        allowed_exts = _AUDIO_EXTENSIONS
        allowed_mimes = _AUDIO_MIME_TYPES
    else:
        raise ValueError("file_kind must be 'image' or 'audio'")
    if not ext or ext not in allowed_exts:
        raise ValueError(f"unsupported {file_kind} file extension")
    normalized_type = (content_type or "").split(";", 1)[0].strip().lower()
    if normalized_type and normalized_type != "application/octet-stream" and normalized_type not in allowed_mimes:
        raise ValueError(f"unsupported {file_kind} content type")


def _asset_name_from_upload_filename(filename: str) -> str:
    if "/" in filename or "\\" in filename:
        raise ValueError('asset name cannot be empty or contain \\ / : * ? " < > |')
    asset_name = Path(filename).stem.strip()
    if (
        not asset_name
        or asset_name.startswith(".")
        or any(ch in _WINDOWS_ILLEGAL_ASSET_NAME_CHARS for ch in asset_name)
    ):
        raise ValueError('asset name cannot be empty or contain \\ / : * ? " < > |')
    return asset_name


def _parse_batch_asset_creates(body: Any) -> list[AssetCreate]:
    if not isinstance(body, list):
        raise ValueError("batch_upload JSON body must be a list")

    assets: list[AssetCreate] = []
    for item in body:
        if not isinstance(item, Mapping):
            raise ValueError("batch_upload JSON items must be objects")
        try:
            assets.append(AssetCreate(**dict(item)))
        except (TypeError, ValidationError) as exc:
            raise ValueError("invalid batch_upload asset item") from exc
    return assets


def _split_aliases(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if value in (None, ""):
        return []
    text = str(value)
    for separator in ("|", "，", "、", "\n"):
        text = text.replace(separator, ",")
    return [item.strip() for item in text.split(",") if item.strip()]


def _asset_create_from_mapping(item: Mapping[str, Any], index: int | None = None) -> AssetCreate:
    data = dict(item)
    if "asset_type" in data and "type" not in data:
        data["type"] = data["asset_type"]
    if "detail" in data and "description" not in data:
        data["description"] = data["detail"]
    if "prompt" in data and "description" not in data:
        data["description"] = data["prompt"]
    if "ratio" in data and "image_ratio" not in data:
        data["image_ratio"] = data["ratio"]
    if "model" in data and "image_model" not in data:
        data["image_model"] = data["model"]
    for role_kind in ("kind", "role_kind", "角色分类", "人物分类"):
        if role_kind in data and "character_kind" not in data:
            data["character_kind"] = data[role_kind]
            break
    data["aliases"] = _split_aliases(data.get("aliases"))
    try:
        return AssetCreate(**data)
    except (TypeError, ValueError, ValidationError) as exc:
        prefix = f"第 {index} 条资产描述无效" if index is not None else "资产描述无效"
        raise ValueError(f"{prefix}: {exc}") from exc


def _parse_asset_metadata_import(request: AssetMetadataImport) -> list[AssetCreate]:
    text = request.text.strip()
    if not text:
        raise ValueError("asset metadata import text cannot be empty")
    import_format = request.format.strip().lower()
    if import_format == "json":
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ValueError(f"资产描述 JSON 格式错误：{exc.msg}，位置 {exc.pos}") from exc
        items = data.get("assets") if isinstance(data, dict) else data
        if not isinstance(items, list):
            raise ValueError("asset metadata JSON must be a list or {assets: [...]}")
        parsed: list[AssetCreate] = []
        for index, item in enumerate(items, start=1):
            if not isinstance(item, Mapping):
                raise ValueError(f"第 {index} 条资产描述必须是对象")
            parsed.append(_asset_create_from_mapping(item, index))
        return parsed
    if import_format == "csv":
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            raise ValueError("asset metadata CSV header is required")
        parsed = []
        for index, row in enumerate(reader, start=1):
            parsed.append(_asset_create_from_mapping(row, index))
        return parsed
    raise ValueError("asset metadata format must be json or csv")


def _detect_upload_file_kind(filename: str, content_type: str | None) -> str:
    ext = Path(filename).suffix.lower().lstrip(".")
    normalized_type = (content_type or "").split(";", 1)[0].strip().lower()
    if ext in _IMAGE_EXTENSIONS:
        _validate_upload_file(filename, content_type, "image")
        return "image"
    if ext in _AUDIO_EXTENSIONS:
        _validate_upload_file(filename, content_type, "audio")
        return "audio"
    if normalized_type in _IMAGE_MIME_TYPES:
        _validate_upload_file(filename, content_type, "image")
        return "image"
    if normalized_type in _AUDIO_MIME_TYPES:
        _validate_upload_file(filename, content_type, "audio")
        return "audio"
    raise ValueError("unsupported asset file type")


def _asset_image_prompt(asset: Any, extra_prompt: str = "") -> str:
    description = str(getattr(asset, "description", "") or "").strip()
    image_params = str(getattr(asset, "image_params", "") or "").strip()
    extra = str(extra_prompt or "").strip()
    if not description:
        raise ValueError("请先填写资产详情描述 / 生图提示词")
    return "\n".join(part for part in (extra, description, image_params) if part)


def _asset_image_model_version(image_model: str) -> str:
    value = str(image_model or "").strip().lower()
    if value.startswith("dreamina"):
        value = value.removeprefix("dreamina").strip(" _-")
    return value or "4.0"


def _first_existing_image_path(result: DreaminaTaskResult) -> Path | None:
    for item in result.local_paths:
        path = Path(item)
        if path.suffix.lower().lstrip(".") in _IMAGE_EXTENSIONS and path.exists():
            return path
    return None


def _image_extension_from_url(url: str) -> str:
    ext = Path(urllib.parse.urlparse(url).path).suffix.lower().lstrip(".")
    return ext if ext in _IMAGE_EXTENSIONS else "png"


def _download_result_url_to_asset_source(url: str, target_dir: Path) -> Path:
    target_dir.mkdir(parents=True, exist_ok=True)
    ext = _image_extension_from_url(url)
    target_path = target_dir / f"result-{uuid.uuid4().hex}.{ext}"
    get_store()._assert_under_output_root(target_path)
    try:
        with urllib.request.urlopen(url, timeout=60) as response:
            target_path.write_bytes(response.read())
    except Exception as exc:
        target_path.unlink(missing_ok=True)
        raise ValueError("即梦返回了结果 URL，但下载图片失败") from exc
    return target_path


def _generate_asset_image(project_id: str, asset_id: str, request: AssetImageGenerateRequest) -> dict[str, Any]:
    store = get_store()
    store.get_project(project_id)
    asset = store._get_asset(asset_id)
    if asset.project_id != project_id:
        raise ValueError("asset does not belong to project")

    prompt = _asset_image_prompt(asset, request.extra_prompt)
    poll_seconds = request.poll_seconds or max(60, int(_settings.get("poll_seconds") or 30))
    generated_dir = store._asset_dir(project_id, asset.type, "image") / ".generated"
    generated_dir.mkdir(parents=True, exist_ok=True)
    store._assert_under_output_root(generated_dir)

    cli = _cli(timeout=poll_seconds + 90)
    submit_result = cli.submit_text2image(
        prompt=prompt,
        ratio=asset.image_ratio,
        resolution_type=request.resolution_type or "2k",
        poll_seconds=poll_seconds,
        model_version=_asset_image_model_version(asset.image_model),
    )
    final_result = submit_result
    if submit_result.submit_id:
        for _ in range(3):
            queried_result = cli.query_result(submit_result.submit_id, download_dir=generated_dir)
            if queried_result.local_paths or queried_result.result_url or queried_result.error_message:
                final_result = queried_result
            if _first_existing_image_path(queried_result) or queried_result.result_url or queried_result.error_message:
                break

    if final_result.error_message:
        raw = (final_result.raw_output or "").strip()
        detail = raw or final_result.error_message
        if detail == "dreamina command failed with exit code 1":
            detail = (
                "即梦 CLI 生图失败：dreamina text2image 返回 exit code 1，但 CLI 没有输出具体原因。"
                "请在“即梦设置”确认已登录、额度正常，并检查模型版本/画幅/分辨率是否被当前账号支持。"
            )
        raise ValueError(detail)

    image_source = _first_existing_image_path(final_result) or _first_existing_image_path(submit_result)
    cleanup_source = False
    if image_source is None and final_result.result_url:
        image_source = _download_result_url_to_asset_source(final_result.result_url, generated_dir)
        cleanup_source = True

    if image_source is None:
        submit_id_text = f"，submit_id: {submit_result.submit_id}" if submit_result.submit_id else ""
        raise ValueError(f"资产生图已提交但暂未下载到本地图片{submit_id_text}，请稍后重试或在即梦 CLI 中查询结果")

    updated_asset = store.upsert_asset_file(project_id, asset.type, asset.name, image_source, "image")
    if cleanup_source:
        image_source.unlink(missing_ok=True)
    return {
        "asset": _dump(updated_asset),
        "result": _dump(final_result),
        "source_path": str(image_source),
        "message": "资产图片已生成并保存",
    }


def _batch_generate_asset_images(project_id: str, request: AssetImageGenerateRequest) -> dict[str, Any]:
    store = get_store()
    store.get_project(project_id)
    if not request.asset_ids:
        raise ValueError("请先选择需要批量生图的资产")
    wanted = set(request.asset_ids)
    assets = [asset for asset in store.list_assets(project_id, request.asset_type) if asset.id in wanted]
    if not assets:
        raise ValueError("未找到选中的资产，请刷新后重试")

    results: list[dict[str, Any]] = []
    for asset in assets:
        try:
            result = _generate_asset_image(project_id, asset.id, request)
            results.append({"asset_id": asset.id, "asset_name": asset.name, "ok": True, **result})
        except ValueError as exc:
            results.append({"asset_id": asset.id, "asset_name": asset.name, "ok": False, "error": str(exc)})
    return {
        "results": results,
        "success_count": sum(1 for item in results if item.get("ok")),
        "failed_count": sum(1 for item in results if not item.get("ok")),
    }


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
