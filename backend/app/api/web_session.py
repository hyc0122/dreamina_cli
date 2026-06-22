"""Standalone Jimeng web-session test endpoints."""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from .context import _call, _dump, _now, get_store
from ..web_session_client import (
    build_history_query_payload,
    build_jimeng_cookie,
    build_text_to_video_payload,
    extract_submit_identity,
    jimeng_web_request,
    parse_poll_result,
)


router = APIRouter(prefix="/jimeng/web-session", tags=["jimeng-web-session"])


class WebSessionAccountCreate(BaseModel):
    label: str
    sessionid: str
    enabled: bool = True
    max_concurrency: int = Field(default=1, ge=1, le=20)
    cooldown_seconds: int = Field(default=0, ge=0, le=3600)


class WebSessionAccountUpdate(BaseModel):
    label: str | None = None
    sessionid: str | None = None
    enabled: bool | None = None
    max_concurrency: int | None = Field(default=None, ge=1, le=20)
    cooldown_seconds: int | None = Field(default=None, ge=0, le=3600)


class WebSessionTaskCreate(BaseModel):
    account_id: str
    prompt: str
    model: str = "seedance2.0fast"
    ratio: str = "9:16"
    duration: int = Field(default=5, ge=4, le=15)
    resolution: str = "720p"


@router.get("/accounts")
def list_web_session_accounts():
    return _call(lambda: {"accounts": _dump(get_store().list_web_session_accounts())})


@router.post("/accounts")
def create_web_session_account(request: WebSessionAccountCreate):
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
def update_web_session_account(account_id: str, request: WebSessionAccountUpdate):
    updates = request.model_dump(exclude_unset=True)
    return _call(lambda: _dump(get_store().update_web_session_account(account_id, **updates)))


@router.delete("/accounts/{account_id}")
def delete_web_session_account(account_id: str):
    return _call(lambda: {"deleted": get_store().delete_web_session_account(account_id)})


@router.get("/tasks")
def list_web_session_tasks(account_id: str | None = None, limit: int = 100):
    return _call(lambda: {"tasks": _dump(get_store().list_web_session_tasks(account_id=account_id, limit=limit))})


@router.post("/tasks")
def create_and_submit_web_session_task(request: WebSessionTaskCreate):
    return _call(lambda: _dump(_create_and_submit_web_session_task(request)))


@router.post("/tasks/{task_id}/poll")
def poll_web_session_task(task_id: str):
    return _call(lambda: _dump(_poll_web_session_task(task_id)))


def _create_and_submit_web_session_task(request: WebSessionTaskCreate):
    store = get_store()
    account = store.get_web_session_account_secret(request.account_id)
    if not bool(account.get("enabled")):
        raise ValueError("账号已禁用，不能提交任务")
    task = store.create_web_session_task(
        account_id=request.account_id,
        prompt=request.prompt,
        model=request.model,
        ratio=request.ratio,
        duration=request.duration,
        resolution=request.resolution,
    )
    payload = build_text_to_video_payload(
        prompt=request.prompt,
        model=request.model,
        ratio=request.ratio,
        duration=request.duration,
        resolution=request.resolution,
    )
    try:
        response = jimeng_web_request(
            "/mweb/v1/aigc_draft/generate",
            payload,
            build_jimeng_cookie(str(account.get("sessionid") or "")),
        )
    except Exception as exc:
        return store.update_web_session_task(task.id, status="failed", error_message=str(exc), finished_at=_now())
    submit_id, history_id = extract_submit_identity(response, fallback_submit_id=str(payload.get("submit_id") or ""))
    status = "polling" if submit_id or history_id else "failed"
    error_message = None if status == "polling" else _response_error(response)
    return store.update_web_session_task(
        task.id,
        status=status,
        submit_id=submit_id,
        history_id=history_id,
        raw_submit_response=response,
        error_message=error_message,
        submitted_at=_now(),
        finished_at=_now() if status == "failed" else None,
    )


def _poll_web_session_task(task_id: str):
    store = get_store()
    task = store.get_web_session_task(task_id)
    account = store.get_web_session_account_secret(task.account_id)
    lookup_id = task.history_id or task.submit_id
    if not lookup_id:
        raise ValueError("任务没有 submit_id/history_id，无法轮询")
    try:
        response = jimeng_web_request(
            "/mweb/v1/get_history_by_ids",
            build_history_query_payload(lookup_id),
            build_jimeng_cookie(str(account.get("sessionid") or "")),
        )
    except Exception as exc:
        return store.update_web_session_task(task_id, status="failed", error_message=str(exc), last_polled_at=_now())
    parsed = parse_poll_result(response, lookup_id)
    status = str(parsed.get("status") or "polling")
    updates: dict[str, Any] = {
        "status": status if status != "unknown" else "polling",
        "result_url": parsed.get("result_url"),
        "raw_poll_response": response,
        "error_message": parsed.get("error_message"),
        "last_polled_at": _now(),
    }
    if updates["status"] in {"completed", "failed"}:
        updates["finished_at"] = _now()
    return store.update_web_session_task(task_id, **updates)


def _response_error(response: dict[str, Any]) -> str:
    return str(response.get("errmsg") or response.get("error") or "网页接口未返回 submit_id/history_id")