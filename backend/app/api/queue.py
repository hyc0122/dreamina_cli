"""即梦生成队列接口边界。

接口只维护 SQLite 中的队列和运行开关；实际提交、轮询与重试由独立 worker 进程执行。
"""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter

from ..jimeng_models import JimengQueueStatus, JimengShotStatus
from ..jimeng_queue import JimengQueueWorker
from ..providers import DreaminaCliProvider, JimengHubProvider
from ..queue_worker_launcher import start_queue_worker_process
from .context import _call, _dump, _model_data, _now, get_store, save_runtime_settings
from .schemas import QueueBatchCreate, QueueItemCreate, QueueReorder
from .settings import _cli


router = APIRouter(prefix="/jimeng", tags=["jimeng-queue"])


@router.get("/queue")
def list_queue(
    project_id: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    sort_order: str = "position",
):
    normalized_sort = sort_order if sort_order in {"asc", "desc", "position"} else "position"
    return _call(
        lambda: {
            "items": _dump(get_store().list_queue(project_id, created_from, created_to, normalized_sort)),
            "status": _queue_status_payload(),
        }
    )


@router.post("/queue/items")
def create_queue_item(request: QueueItemCreate):
    return _call(lambda: _dump(get_store().create_queue_item(**_model_data(request))))


@router.post("/queue/items/batch")
def create_queue_items(request: QueueBatchCreate):
    return _call(lambda: {"items": _dump([get_store().create_queue_item(**_model_data(item)) for item in request.items])})


@router.post("/queue/start")
def start_queue():
    return _call(lambda: (save_runtime_settings({"queue_enabled": True}), _queue_status_payload(started=True))[1])


@router.post("/queue/pause")
def pause_queue():
    save_runtime_settings({"queue_enabled": False})
    return {"status": _queue_status_payload(paused=True)}


@router.post("/queue/worker/start")
def start_queue_worker():
    return _call(_start_queue_worker_payload)


@router.post("/queue/items/{queue_item_id}/cancel")
def cancel_queue_item(queue_item_id: str):
    return _call(lambda: _dump(_cancel_queue_item(queue_item_id)))


@router.post("/queue/items/{queue_item_id}/retry")
def retry_queue_item(queue_item_id: str):
    return _call(
        lambda: _dump(
            get_store().update_queue_item(
                queue_item_id,
                status=JimengQueueStatus.waiting,
                submit_id=None,
                gen_status=None,
                result_url=None,
                local_video_path=None,
                cli_raw_output=None,
                error_message=None,
                attempt_count=0,
                next_attempt_at=None,
                lease_owner=None,
                lease_expires_at=None,
                submitted_at=None,
                finished_at=None,
            )
        )
    )


@router.post("/queue/items/{queue_item_id}/poll")
def poll_queue_item(queue_item_id: str):
    return _call(lambda: _dump(_poll_queue_item(queue_item_id)))


@router.delete("/queue/items/{queue_item_id}")
def delete_queue_item(queue_item_id: str):
    return _call(lambda: {"deleted_id": get_store().delete_canceled_queue_item(queue_item_id)})


@router.post("/queue/reorder")
def reorder_queue(request: QueueReorder):
    return _call(lambda: (_reorder_rows("queue_items", "id", "position", request.queue_item_ids), {"items": _dump(get_store().list_queue())})[1])


def _queue_status_payload(started: bool = False, paused: bool = False) -> dict[str, Any]:
    store = get_store()
    running_item = store.running_queue_item()
    persisted = store.get_runtime_settings()
    enabled = bool(persisted.get("queue_enabled", False))
    heartbeat_at = persisted.get("worker_heartbeat_at")
    return {
        "started": started or enabled,
        "paused": paused or not enabled,
        "worker_online": _heartbeat_is_recent(heartbeat_at),
        "worker_id": persisted.get("worker_id"),
        "worker_heartbeat_at": heartbeat_at,
        "in_flight_count": store.count_in_flight_queue_items(),
        "running_item": _dump(running_item) if running_item else None,
        "waiting_count": store.count_queue(JimengQueueStatus.waiting),
        "last_error": persisted.get("worker_last_error"),
    }


def _heartbeat_is_recent(value: Any, max_age_seconds: int = 15) -> bool:
    if not value:
        return False
    try:
        parsed = datetime.fromisoformat(str(value))
    except ValueError:
        return False
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - parsed).total_seconds() <= max_age_seconds



def _cancel_queue_item(queue_item_id: str):
    store = get_store()
    item = store.get_queue_item(queue_item_id)
    updated = store.update_queue_item(
        queue_item_id,
        status=JimengQueueStatus.canceled,
        error_message=None,
        lease_owner=None,
        lease_expires_at=None,
        finished_at=_now(),
    )
    _restore_shot_status_after_queue_cancel(updated.project_id, updated.shot_id, item.id)
    return updated


def _poll_queue_item(queue_item_id: str):
    store = get_store()
    item = store.get_queue_item(queue_item_id)
    if not item.submit_id:
        raise ValueError("当前队列任务没有 submit_id，无法手动拉取")
    worker = JimengQueueWorker(
        store=store,
        cli=_cli(),
        provider_factory=_provider_factory,
    )
    return worker.poll_item(item)


def _restore_shot_status_after_queue_cancel(project_id: str, shot_id: str, canceled_item_id: str) -> None:
    store = get_store()
    active_statuses = {
        JimengQueueStatus.waiting,
        JimengQueueStatus.submitting,
        JimengQueueStatus.running,
        JimengQueueStatus.polling,
        JimengQueueStatus.retry_wait,
    }
    other_active_items = [
        item
        for item in store.list_queue(project_id)
        if item.id != canceled_item_id and item.shot_id == shot_id and item.status in active_statuses
    ]
    if other_active_items:
        running_statuses = {JimengQueueStatus.submitting, JimengQueueStatus.running, JimengQueueStatus.polling}
        next_status = JimengShotStatus.running if any(item.status in running_statuses for item in other_active_items) else JimengShotStatus.queued
        store.update_shot(shot_id, status=next_status, last_error=None)
        return

    shot = store.get_shot(project_id, shot_id)
    candidates = store.list_candidates(project_id, shot_id)
    if shot.locked_video_candidate_id or any(candidate.is_locked for candidate in candidates):
        next_status = JimengShotStatus.locked
    elif shot.default_video_candidate_id or candidates:
        next_status = JimengShotStatus.completed
    else:
        next_status = JimengShotStatus.draft
    store.update_shot(shot_id, status=next_status, last_error=None)


def _start_queue_worker_payload() -> dict[str, Any]:
    status = _queue_status_payload()
    if status["worker_online"]:
        return {"started": False, "message": "worker already online", "status": status}

    result = start_queue_worker_process()
    get_store().update_runtime_settings(
        {
            "worker_launch_pid": result.get("worker_pid"),
            "worker_launch_mode": result.get("mode"),
            "worker_launch_script": result.get("script_path"),
            "worker_launch_at": _now(),
            "worker_last_error": None,
        }
    )
    return {
        "started": True,
        "message": "worker start requested",
        "worker_pid": result.get("worker_pid"),
        "mode": result.get("mode"),
        "script_path": result.get("script_path"),
        "status": _queue_status_payload(),
    }


def _provider_factory(provider_name: str, account_id: str | None = None) -> Any:
    """保留旧测试和扩展调用使用的官方单账号 provider 工厂。"""
    if provider_name == "jimeng_hub":
        return JimengHubProvider(get_store(), account_id=account_id)
    return DreaminaCliProvider(_cli())


def _reorder_rows(table: str, id_column: str, position_column: str, ids: list[str]) -> None:
    with get_store()._connect() as conn:
        for position, row_id in enumerate(ids, start=1):
            conn.execute(
                f"UPDATE {table} SET {position_column} = ?, updated_at = ? WHERE {id_column} = ?",
                (position, _now(), row_id),
            )
