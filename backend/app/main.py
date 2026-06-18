import os
import json
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.router import router as jimeng_router
from .services.directory_picker import pick_directory_dialog, select_directory


BASE_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = Path(os.getenv("DREAMINA_CLI_PROJECT_DIR", BASE_DIR.parent)).resolve()
DATA_DIR = Path(os.getenv("DREAMINA_CLI_DATA_DIR", PROJECT_DIR / "runtime_data")).resolve()
OUTPUT_DIR = DATA_DIR / "output"
RUNTIME_HOST = os.getenv("DREAMINA_DESKTOP_HOST", "127.0.0.1")
RUNTIME_PORT = int(os.getenv("DREAMINA_DESKTOP_BOUND_PORT") or os.getenv("DREAMINA_DESKTOP_PORT") or "62100")
STARTED_AT = datetime.now(timezone.utc).isoformat()
DEFAULT_SCAN_START = 62100
DEFAULT_SCAN_END = 62199

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
(OUTPUT_DIR / "jimeng").mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Dreamina CLI Batch API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(jimeng_router)
app.mount("/files/jimeng", StaticFiles(directory=str(OUTPUT_DIR / "jimeng")), name="files_jimeng")
app.mount("/files", StaticFiles(directory=str(OUTPUT_DIR)), name="files")


@app.get("/health")
def health_check():
    return _runtime_identity(is_current=True)


@app.get("/runtime/instances")
def runtime_instances(start: int = DEFAULT_SCAN_START, end: int = DEFAULT_SCAN_END):
    current = _runtime_identity(is_current=True)
    others = _discover_other_instances(RUNTIME_HOST, start, end)
    instances = [current]
    seen = {(str(current.get("project_dir")), str(current.get("data_dir")), int(current.get("port") or 0))}
    for item in others:
        key = (str(item.get("project_dir")), str(item.get("data_dir")), int(item.get("port") or 0))
        if key in seen:
            continue
        item["is_current"] = False
        instances.append(item)
        seen.add(key)
    return {"instances": instances, "scan_range": {"start": start, "end": end}}


@app.post("/runtime/shutdown")
def runtime_shutdown():
    _schedule_shutdown()
    return {"ok": True, "message": "shutdown scheduled"}


@app.post("/runtime/select-directory")
def runtime_select_directory(request: Request):
    client_host = request.client.host if request.client else ""
    try:
        path = select_directory(client_host, pick_directory_dialog)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"path": path}


def _runtime_identity(is_current: bool = False) -> dict[str, object]:
    return {
        "ok": True,
        "app": "dreamina_cli",
        "pid": os.getpid(),
        "host": RUNTIME_HOST,
        "port": RUNTIME_PORT,
        "started_at": STARTED_AT,
        "project_dir": str(PROJECT_DIR),
        "data_dir": str(DATA_DIR),
        "output_dir": str(OUTPUT_DIR),
        "is_current": is_current,
    }


def _fetch_instance_health(host: str, port: int, timeout: float = 0.12) -> dict[str, object] | None:
    try:
        with urllib.request.urlopen(f"http://{host}:{port}/health", timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (OSError, TimeoutError, ValueError, urllib.error.URLError):
        return None
    if payload.get("app") != "dreamina_cli":
        return None
    payload["host"] = payload.get("host") or host
    payload["port"] = int(payload.get("port") or port)
    payload["is_current"] = False
    return payload


def _discover_other_instances(host: str = RUNTIME_HOST, start: int = DEFAULT_SCAN_START, end: int = DEFAULT_SCAN_END) -> list[dict[str, object]]:
    if end < start:
        start, end = end, start
    ports = list(range(max(1, start), min(65535, end) + 1))
    found: list[dict[str, object]] = []
    with ThreadPoolExecutor(max_workers=24) as executor:
        futures = {executor.submit(_fetch_instance_health, host, port): port for port in ports}
        for future in as_completed(futures):
            item = future.result()
            if item is not None:
                found.append(item)
    return sorted(found, key=lambda item: int(item.get("port") or 0))


def _schedule_shutdown(delay: float = 0.4) -> None:
    def shutdown_later() -> None:
        time.sleep(delay)
        os._exit(0)

    threading.Thread(target=shutdown_later, daemon=True).start()
