"""大模型资产生图记录。

记录保存在 runtime data 的 llm/asset_image_records.json 中，用于在接口超时后继续按 task_id 获取远端结果。
"""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..jimeng_models import JimengAssetType
from ..jimeng_storage import JimengStore
from .client import poll_text_to_image_task
from .models import LlmGeneratedImage, LlmModelSetting, LlmProviderSetting
from .settings import load_llm_settings

PENDING_RECORD_STATUSES = {"submitted", "running", "timeout", "poll_error"}
FINAL_RECORD_STATUSES = {"succeeded", "failed", "canceled"}
MAX_FEEDBACK_ITEMS = 80


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _record_id() -> str:
    return f"llm_img_{uuid.uuid4().hex}"


def _records_path(store: JimengStore) -> Path:
    return store.db_path.parent / "llm" / "asset_image_records.json"


def _asset_type_value(value: Any) -> str:
    if isinstance(value, JimengAssetType):
        return value.value
    return str(value or "")


def _read_records(store: JimengStore) -> list[dict[str, Any]]:
    path = _records_path(store)
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"大模型生图记录文件格式错误: {path}") from exc
    if not isinstance(payload, list):
        raise ValueError(f"大模型生图记录文件格式错误: {path}")
    return [item for item in payload if isinstance(item, dict)]


def _write_records(store: JimengStore, records: list[dict[str, Any]]) -> None:
    path = _records_path(store)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(".tmp")
    temp_path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_path.replace(path)


def _feedback(message: str, level: str = "info", payload: dict[str, Any] | None = None) -> dict[str, Any]:
    item: dict[str, Any] = {"at": _now(), "level": level, "message": message}
    if payload is not None:
        item["payload"] = payload
    return item


def append_feedback(record: dict[str, Any], message: str, level: str = "info", payload: dict[str, Any] | None = None) -> dict[str, Any]:
    items = list(record.get("feedback") or [])
    items.append(_feedback(message, level, payload))
    record["feedback"] = items[-MAX_FEEDBACK_ITEMS:]
    record["updated_at"] = _now()
    return record


def create_asset_image_record(
    store: JimengStore,
    *,
    project_id: str,
    asset: Any,
    provider: LlmProviderSetting,
    model: LlmModelSetting,
    prompt: str,
    size: str,
) -> dict[str, Any]:
    stamp = _now()
    record = {
        "id": _record_id(),
        "project_id": project_id,
        "asset_id": asset.id,
        "asset_name": asset.name,
        "asset_type": _asset_type_value(asset.type),
        "provider_id": provider.id,
        "provider_name": provider.name,
        "model_id": model.id,
        "model_name": model.name,
        "size": size,
        "prompt": prompt,
        "task_id": "",
        "status": "submitted",
        "state": "",
        "progress": "",
        "result_url": "",
        "result_type": "",
        "error": "",
        "poll_count": 0,
        "last_checked_at": "",
        "last_response": {},
        "created_at": stamp,
        "updated_at": stamp,
        "feedback": [_feedback("已创建本地生图记录，等待提交大模型任务。")],
    }
    records = _read_records(store)
    records.append(record)
    _write_records(store, records)
    return record


def list_asset_image_records(store: JimengStore, project_id: str | None = None) -> list[dict[str, Any]]:
    records = _read_records(store)
    if project_id:
        records = [record for record in records if record.get("project_id") == project_id]
    return sorted(records, key=lambda item: str(item.get("updated_at") or ""), reverse=True)


def get_asset_image_record(store: JimengStore, record_id: str) -> dict[str, Any]:
    for record in _read_records(store):
        if record.get("id") == record_id:
            return record
    raise KeyError(f"大模型生图记录不存在: {record_id}")


def save_asset_image_record(store: JimengStore, record: dict[str, Any]) -> dict[str, Any]:
    records = _read_records(store)
    for index, item in enumerate(records):
        if item.get("id") == record.get("id"):
            record["updated_at"] = _now()
            records[index] = record
            _write_records(store, records)
            return record
    records.append(record)
    _write_records(store, records)
    return record


def update_asset_image_record(store: JimengStore, record_id: str, **updates: Any) -> dict[str, Any]:
    record = get_asset_image_record(store, record_id)
    record.update(updates)
    return save_asset_image_record(store, record)


def cancel_asset_image_record(store: JimengStore, record_id: str) -> dict[str, Any]:
    record = get_asset_image_record(store, record_id)
    if record.get("status") not in FINAL_RECORD_STATUSES:
        record["status"] = "canceled"
        append_feedback(record, "已手动取消，后续不会继续获取该任务。", "warning")
    return save_asset_image_record(store, record)


def delete_asset_image_record(store: JimengStore, record_id: str) -> dict[str, Any]:
    records = _read_records(store)
    kept: list[dict[str, Any]] = []
    deleted: dict[str, Any] | None = None
    for record in records:
        if record.get("id") == record_id:
            deleted = record
            continue
        kept.append(record)
    if deleted is None:
        raise KeyError(f"大模型生图记录不存在: {record_id}")
    _write_records(store, kept)
    return deleted


def mark_asset_image_record_submitted(store: JimengStore, record_id: str, task_id: str, raw: dict[str, Any]) -> dict[str, Any]:
    record = get_asset_image_record(store, record_id)
    record.update(
        {
            "task_id": task_id,
            "status": "running",
            "state": "submitted",
            "last_response": raw,
            "error": "",
        }
    )
    append_feedback(record, f"已提交大模型任务，task_id={task_id}。", "info")
    return save_asset_image_record(store, record)


def mark_asset_image_record_timeout(store: JimengStore, record_id: str) -> dict[str, Any]:
    record = get_asset_image_record(store, record_id)
    if record.get("status") in FINAL_RECORD_STATUSES:
        return record
    record["status"] = "timeout"
    append_feedback(record, "本次请求等待超时，记录会保留 task_id，可继续获取远端结果。", "warning")
    return save_asset_image_record(store, record)


def _save_generated_image_to_asset(store: JimengStore, project_id: str, asset_id: str, generated: LlmGeneratedImage):
    asset = store._get_asset(asset_id)
    if asset.project_id != project_id:
        raise ValueError("asset does not belong to project")
    safe_ext = generated.extension.lower().lstrip(".") or "png"
    if safe_ext not in {"png", "jpg", "jpeg", "webp"}:
        safe_ext = "png"
    generated_dir = store._asset_dir(project_id, asset.type, "image") / ".llm_generated"
    generated_dir.mkdir(parents=True, exist_ok=True)
    store._assert_under_output_root(generated_dir)
    source_path = generated_dir / f"{asset.id}-{uuid.uuid4().hex}.{safe_ext}"
    source_path.write_bytes(generated.content)
    updated_asset = store.upsert_asset_file(project_id, asset.type, asset.name, source_path, "image")
    source_path.unlink(missing_ok=True)
    return updated_asset, str(source_path)


def complete_asset_image_record_with_image(store: JimengStore, record_id: str, generated: LlmGeneratedImage) -> dict[str, Any]:
    record = get_asset_image_record(store, record_id)
    updated_asset, source_path = _save_generated_image_to_asset(
        store,
        str(record.get("project_id") or ""),
        str(record.get("asset_id") or ""),
        generated,
    )
    record.update(
        {
            "asset_name": updated_asset.name,
            "asset_type": _asset_type_value(updated_asset.type),
            "status": "succeeded",
            "state": "success",
            "progress": "100%",
            "error": "",
            "source_path": source_path,
            "asset_image_path": updated_asset.image_path,
            "asset_image_filename": updated_asset.image_filename,
            "last_response": generated.raw,
        }
    )
    append_feedback(record, "远端任务已成功，本地资产图片已保存。", "success")
    return save_asset_image_record(store, record)


def _provider_for_record(store: JimengStore, record: dict[str, Any]) -> LlmProviderSetting:
    settings = load_llm_settings(store)
    provider_id = str(record.get("provider_id") or "")
    provider = next((item for item in settings.providers if item.id == provider_id), None)
    if provider is None:
        raise ValueError(f"未找到记录对应的大模型供应商: {provider_id}")
    return provider


def poll_asset_image_record(store: JimengStore, record_id: str) -> dict[str, Any]:
    record = get_asset_image_record(store, record_id)
    if record.get("status") == "canceled":
        append_feedback(record, "记录已取消，跳过获取。", "warning")
        return save_asset_image_record(store, record)
    if record.get("status") in FINAL_RECORD_STATUSES:
        return record
    task_id = str(record.get("task_id") or "").strip()
    if not task_id:
        record["status"] = "failed"
        record["error"] = "记录缺少 task_id，无法继续获取"
        append_feedback(record, record["error"], "error")
        return save_asset_image_record(store, record)

    record["poll_count"] = int(record.get("poll_count") or 0) + 1
    record["last_checked_at"] = _now()
    try:
        provider = _provider_for_record(store, record)
        status = poll_text_to_image_task(provider, task_id)
        record.update(
            {
                "state": status.state,
                "progress": status.progress,
                "result_url": status.result_url,
                "result_type": status.result_type,
                "last_response": status.raw,
                "error": status.error,
            }
        )
        append_feedback(
            record,
            f"第 {record['poll_count']} 次获取：state={status.state or 'unknown'}，progress={status.progress or '未知'}。",
            "info",
        )
        if status.is_final:
            if status.state == "failed":
                record["status"] = "failed"
                record["error"] = status.error or "远端任务失败"
                append_feedback(record, f"远端任务失败：{record['error']}", "error")
                return save_asset_image_record(store, record)
            if status.image is None:
                record["status"] = "poll_error"
                record["error"] = "远端任务已结束，但未返回图片数据"
                append_feedback(record, record["error"], "error")
                return save_asset_image_record(store, record)
            save_asset_image_record(store, record)
            return complete_asset_image_record_with_image(store, record_id, status.image)
        record["status"] = "running"
        return save_asset_image_record(store, record)
    except Exception as exc:
        record["status"] = "poll_error"
        record["error"] = str(exc)
        append_feedback(record, f"获取失败：{exc}", "error")
        return save_asset_image_record(store, record)


def poll_pending_asset_image_records(
    store: JimengStore,
    *,
    project_id: str | None = None,
    record_ids: list[str] | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    wanted_ids = set(record_ids or [])
    records = list_asset_image_records(store, project_id)
    targets = [
        record
        for record in records
        if record.get("status") in PENDING_RECORD_STATUSES and (not wanted_ids or record.get("id") in wanted_ids)
    ]
    results: list[dict[str, Any]] = []
    for record in targets[: max(1, limit)]:
        results.append(poll_asset_image_record(store, str(record["id"])))
    return results


def public_asset_image_record(record: dict[str, Any]) -> dict[str, Any]:
    value = dict(record)
    feedback = value.get("feedback")
    value["feedback"] = feedback if isinstance(feedback, list) else []
    return value
