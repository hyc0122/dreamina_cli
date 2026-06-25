"""Production JiMengHub endpoints.

This module keeps the formal JiMengHub URL separate from the older web-session
test URL while reusing the same local account/task storage and signed client.
"""

from fastapi import APIRouter

from .context import _call, _dump, get_store
from .web_session import (
    WebSessionAccountCreate,
    WebSessionAccountUpdate,
    WebSessionTaskCreate,
    _create_and_submit_web_session_task,
    _poll_web_session_task,
)


router = APIRouter(prefix="/jimeng/hub", tags=["jimeng-hub"])


@router.get("/accounts")
def list_jimeng_hub_accounts():
    return _call(lambda: {"accounts": _dump(get_store().list_web_session_accounts())})


@router.post("/accounts")
def create_jimeng_hub_account(request: WebSessionAccountCreate):
    return _call(
        lambda: _dump(
            get_store().create_web_session_account(
                label=request.label,
                sessionid=request.sessionid,
                enabled=request.enabled,
                max_concurrency=request.max_concurrency,
                cooldown_seconds=request.cooldown_seconds,
            )
        )
    )


@router.put("/accounts/{account_id}")
def update_jimeng_hub_account(account_id: str, request: WebSessionAccountUpdate):
    updates = request.model_dump(exclude_unset=True)
    return _call(lambda: _dump(get_store().update_web_session_account(account_id, **updates)))


@router.delete("/accounts/{account_id}")
def delete_jimeng_hub_account(account_id: str):
    return _call(lambda: {"deleted": get_store().delete_web_session_account(account_id)})


@router.get("/tasks")
def list_jimeng_hub_tasks(account_id: str | None = None, limit: int = 100):
    return _call(lambda: {"tasks": _dump(get_store().list_web_session_tasks(account_id=account_id, limit=limit))})


@router.post("/tasks")
def create_and_submit_jimeng_hub_task(request: WebSessionTaskCreate):
    return _call(lambda: _dump(_create_and_submit_web_session_task(request)))


@router.post("/tasks/{task_id}/poll")
def poll_jimeng_hub_task(task_id: str):
    return _call(lambda: _dump(_poll_web_session_task(task_id)))
