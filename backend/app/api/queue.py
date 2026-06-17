"""即梦生成队列接口边界。

负责队列创建、批量入队、启动、暂停、取消、重试、排序和状态查询。
队列执行细节放在 `jimeng_queue.py`，不要在接口层直接轮询 CLI。
"""

from fastapi import APIRouter

from .. import jimeng_api as legacy


router = APIRouter(prefix="/jimeng", tags=["jimeng-queue"])


@router.get("/queue")
def list_queue(project_id: str | None = None):
    return legacy.list_queue(project_id)


@router.post("/queue/items")
def create_queue_item(request: legacy.QueueItemCreate):
    return legacy.create_queue_item(request)


@router.post("/queue/items/batch")
def create_queue_items(request: legacy.QueueBatchCreate):
    return legacy.create_queue_items(request)


@router.post("/queue/start")
def start_queue():
    return legacy.start_queue()


@router.post("/queue/pause")
def pause_queue():
    return legacy.pause_queue()


@router.post("/queue/items/{queue_item_id}/cancel")
def cancel_queue_item(queue_item_id: str):
    return legacy.cancel_queue_item(queue_item_id)


@router.post("/queue/items/{queue_item_id}/retry")
def retry_queue_item(queue_item_id: str):
    return legacy.retry_queue_item(queue_item_id)


@router.post("/queue/reorder")
def reorder_queue(request: legacy.QueueReorder):
    return legacy.reorder_queue(request)
