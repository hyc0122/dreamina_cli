"""大模型资产生图记录。

记录保存在 SQLite 的 llm_asset_image_records 表中；旧 JSON 文件会在首次访问时幂等导入一次，用于兼容早期版本。
"""

import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..jimeng_models import JimengAssetType
from ..jimeng_storage import JimengStore
from .client import download_text_to_image_result, poll_text_to_image_task
from .models import LlmGeneratedImage, LlmModelSetting, LlmProviderSetting
from .settings import load_llm_settings

PENDING_RECORD_STATUSES = {"submitted", "running", "timeout", "poll_error"}
FINAL_RECORD_STATUSES = {"succeeded", "failed", "canceled"}
DEFAULT_AUTO_CANCEL_MINUTES = 20
MAX_FEEDBACK_ITEMS = 80
LEGACY_JSON_MIGRATION_KEY = "llm_asset_image_records_json_migrated"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _record_id() -> str:
    return f"llm_img_{uuid.uuid4().hex}"


def _records_path(store: JimengStore) -> Path:
    return store.db_path.parent / "llm" / "asset_image_records.json"


def _record_json(record: dict[str, Any]) -> str:
    return json.dumps(record, ensure_ascii=False, separators=(",", ":"))


def _record_row(record: dict[str, Any]) -> tuple[str, str, str, str, str, str, str, str, str, str, str, str]:
    stamp = str(record.get("updated_at") or record.get("created_at") or _now())
    record.setdefault("created_at", stamp)
    record.setdefault("updated_at", stamp)
    return (
        str(record.get("id") or _record_id()),
        str(record.get("project_id") or ""),
        str(record.get("asset_id") or ""),
        str(record.get("asset_name") or ""),
        str(record.get("asset_type") or ""),
        str(record.get("provider_id") or ""),
        str(record.get("model_id") or ""),
        str(record.get("status") or ""),
        str(record.get("task_id") or ""),
        str(record.get("created_at") or ""),
        str(record.get("updated_at") or ""),
        _record_json(record),
    )


def _insert_records(conn: Any, records: list[dict[str, Any]], *, replace: bool) -> None:
    statement = "INSERT OR REPLACE" if replace else "INSERT OR IGNORE"
    conn.executemany(
        f"""
        {statement} INTO llm_asset_image_records (
            id, project_id, asset_id, asset_name, asset_type, provider_id, model_id,
            status, task_id, created_at, updated_at, record_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [_record_row(record) for record in records if record.get("id")],
    )


def _legacy_records(store: JimengStore) -> list[dict[str, Any]]:
    path = _records_path(store)
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"large model image record file has invalid JSON: {path}") from exc
    if not isinstance(payload, list):
        raise ValueError(f"large model image record file must be a list: {path}")
    return [item for item in payload if isinstance(item, dict) and item.get("id")]


def _import_legacy_records(store: JimengStore) -> None:
    if store.get_runtime_settings().get(LEGACY_JSON_MIGRATION_KEY):
        return
    records = _legacy_records(store)
    with store._connect() as conn:
        if records:
            _insert_records(conn, records, replace=False)
    store.update_runtime_settings({LEGACY_JSON_MIGRATION_KEY: _now()})


def _asset_type_value(value: Any) -> str:
    if isinstance(value, JimengAssetType):
        return value.value
    return str(value or "")


def _read_records(
    store: JimengStore,
    *,
    project_id: str | None = None,
    status: str | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> list[dict[str, Any]]:
    _import_legacy_records(store)
    clauses: list[str] = []
    params: list[Any] = []
    if project_id:
        clauses.append("project_id = ?")
        params.append(project_id)
    if status:
        clauses.append("status = ?")
        params.append(status)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    limit_sql = ""
    if limit is not None and limit > 0:
        limit_sql = "LIMIT ? OFFSET ?"
        params.extend([limit, max(0, offset)])
    with store._connect() as conn:
        rows = conn.execute(
            f"""
            SELECT record_json
            FROM llm_asset_image_records
            {where}
            ORDER BY created_at DESC, updated_at DESC
            {limit_sql}
            """,
            params,
        ).fetchall()
    records: list[dict[str, Any]] = []
    for row in rows:
        try:
            record = json.loads(row["record_json"])
        except json.JSONDecodeError:
            continue
        if isinstance(record, dict):
            records.append(record)
    return records


def _count_records(store: JimengStore, *, project_id: str | None = None, status: str | None = None) -> int:
    _import_legacy_records(store)
    clauses: list[str] = []
    params: list[Any] = []
    if project_id:
        clauses.append("project_id = ?")
        params.append(project_id)
    if status:
        clauses.append("status = ?")
        params.append(status)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with store._connect() as conn:
        row = conn.execute(f"SELECT COUNT(*) AS count FROM llm_asset_image_records {where}", params).fetchone()
    return int(row["count"] if row else 0)


def _write_records(store: JimengStore, records: list[dict[str, Any]]) -> None:
    with store._connect() as conn:
        conn.execute("DELETE FROM llm_asset_image_records")
        _insert_records(conn, records, replace=True)


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
    quality: str = "high",
    reference_images: list[str] | None = None,
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
        "quality": quality,
        "reference_images": list(reference_images or []),
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


def list_asset_image_records(
    store: JimengStore,
    project_id: str | None = None,
    status: str | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> list[dict[str, Any]]:
    records = _read_records(store, project_id=project_id, status=status, limit=limit, offset=offset)
    return sorted(records, key=lambda item: str(item.get("created_at") or item.get("updated_at") or ""), reverse=True)


def count_asset_image_records(store: JimengStore, project_id: str | None = None, status: str | None = None) -> int:
    return _count_records(store, project_id=project_id, status=status)


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


def _auto_cancel_record_if_expired(store: JimengStore, record: dict[str, Any], auto_cancel_minutes: int | None) -> dict[str, Any] | None:
    if not auto_cancel_minutes or auto_cancel_minutes <= 0:
        return None
    if record.get("status") not in PENDING_RECORD_STATUSES:
        return None
    created_at = _parse_time(record.get("created_at") or record.get("updated_at"))
    if created_at is None:
        return None
    elapsed_seconds = (datetime.now(timezone.utc) - created_at).total_seconds()
    if elapsed_seconds < auto_cancel_minutes * 60:
        return None
    record["status"] = "canceled"
    record["error"] = f"超过 {auto_cancel_minutes} 分钟未获取成功，已自动取消继续获取"
    append_feedback(record, record["error"], "warning", {"auto_cancel_minutes": auto_cancel_minutes})
    return save_asset_image_record(store, record)


def delete_asset_image_records(store: JimengStore, record_ids: list[str]) -> list[dict[str, Any]]:
    wanted = set(record_ids)
    if not wanted:
        return []
    records = _read_records(store)
    kept: list[dict[str, Any]] = []
    deleted: list[dict[str, Any]] = []
    for record in records:
        if record.get("id") in wanted:
            deleted.append(record)
            continue
        kept.append(record)
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
    history_dir = store._asset_dir(project_id, asset.type, "image") / ".llm_history"
    history_dir.mkdir(parents=True, exist_ok=True)
    store._assert_under_output_root(history_dir)
    history_path = history_dir / f"{asset.id}-{uuid.uuid4().hex}.{safe_ext}"
    store._assert_under_output_root(history_path)
    shutil.copyfile(source_path, history_path)
    updated_asset = store.upsert_asset_file(project_id, asset.type, asset.name, source_path, "image")
    source_path.unlink(missing_ok=True)
    return updated_asset, str(history_path)


def complete_asset_image_record_with_image(store: JimengStore, record_id: str, generated: LlmGeneratedImage) -> dict[str, Any]:
    record = get_asset_image_record(store, record_id)
    updated_asset, history_path = _save_generated_image_to_asset(
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
            "source_path": history_path,
            "asset_image_path": history_path,
            "asset_image_filename": Path(history_path).name,
            "asset_current_image_path": updated_asset.image_path,
            "asset_current_image_filename": updated_asset.image_filename,
            "last_response": generated.raw,
        }
    )
    append_feedback(record, "远端任务已成功，本地资产图片已保存。", "success")
    return save_asset_image_record(store, record)


def apply_asset_image_record_to_asset(store: JimengStore, record_id: str) -> dict[str, Any]:
    record = get_asset_image_record(store, record_id)
    if record.get("status") != "succeeded":
        raise ValueError("只能使用已成功保存的历史资产图")
    project_id = str(record.get("project_id") or "")
    asset_id = str(record.get("asset_id") or "")
    image_path = Path(str(record.get("asset_image_path") or record.get("source_path") or ""))
    if not image_path.exists():
        raise ValueError("历史资产图文件不存在，无法应用")
    asset = store._get_asset(asset_id)
    if asset.project_id != project_id:
        raise ValueError("asset does not belong to project")
    updated_asset = store.upsert_asset_file(project_id, asset.type, asset.name, image_path, "image")
    record.update(
        {
            "asset_name": updated_asset.name,
            "asset_type": _asset_type_value(updated_asset.type),
            "asset_current_image_path": updated_asset.image_path,
            "asset_current_image_filename": updated_asset.image_filename,
        }
    )
    append_feedback(record, "已将这张历史生成图应用为当前资产图。", "success")
    return {"asset": updated_asset, "record": save_asset_image_record(store, record)}


def _provider_for_record(store: JimengStore, record: dict[str, Any]) -> LlmProviderSetting:
    settings = load_llm_settings(store)
    provider_id = str(record.get("provider_id") or "")
    provider = next((item for item in settings.providers if item.id == provider_id), None)
    if provider is None:
        raise ValueError(f"未找到记录对应的大模型供应商: {provider_id}")
    return provider


def poll_asset_image_record(
    store: JimengStore,
    record_id: str,
    auto_cancel_minutes: int | None = DEFAULT_AUTO_CANCEL_MINUTES,
    force: bool = False,
) -> dict[str, Any]:
    record = get_asset_image_record(store, record_id)
    if record.get("status") == "succeeded":
        return record
    if record.get("status") == "canceled" and not force:
        append_feedback(record, "记录已取消，跳过获取。", "warning")
        return save_asset_image_record(store, record)
    if record.get("status") in FINAL_RECORD_STATUSES and not force:
        return record
    if force and record.get("status") in {"failed", "canceled"}:
        append_feedback(record, "已手动重新获取该记录。", "info")
    expired_record = _auto_cancel_record_if_expired(store, record, auto_cancel_minutes)
    if expired_record is not None:
        return expired_record
    task_id = str(record.get("task_id") or "").strip()
    if not task_id:
        result_url = str(record.get("result_url") or "").strip()
        if result_url:
            record["poll_count"] = int(record.get("poll_count") or 0) + 1
            record["last_checked_at"] = _now()
            try:
                generated = download_text_to_image_result(result_url, record.get("last_response") if isinstance(record.get("last_response"), dict) else {"result_url": result_url})
                record["error"] = ""
                record["last_response"] = generated.raw
                append_feedback(record, f"第 {record['poll_count']} 次按结果图地址重新下载成功。", "success", {"result_url": result_url})
                save_asset_image_record(store, record)
                return complete_asset_image_record_with_image(store, record_id, generated)
            except Exception as exc:
                record["status"] = "poll_error"
                record["error"] = str(exc)
                append_feedback(record, f"按结果图地址重新下载失败：{exc}", "error", {"result_url": result_url})
                return save_asset_image_record(store, record)
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
    auto_cancel_minutes: int | None = DEFAULT_AUTO_CANCEL_MINUTES,
    force: bool = False,
) -> list[dict[str, Any]]:
    wanted_ids = set(record_ids or [])
    records = list_asset_image_records(store, project_id)
    targets = [
        record
        for record in records
        if (not wanted_ids or record.get("id") in wanted_ids)
        and (
            record.get("status") in PENDING_RECORD_STATUSES
            or (force and bool(wanted_ids) and record.get("status") in {"failed", "canceled"})
        )
    ]
    results: list[dict[str, Any]] = []
    for record in targets[: max(1, limit)]:
        results.append(poll_asset_image_record(store, str(record["id"]), auto_cancel_minutes=auto_cancel_minutes, force=force))
    return results


def public_asset_image_record(record: dict[str, Any]) -> dict[str, Any]:
    value = dict(record)
    feedback = value.get("feedback")
    value["feedback"] = feedback if isinstance(feedback, list) else []
    return value
