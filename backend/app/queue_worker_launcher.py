"""启动独立队列 worker 的本地辅助工具。"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


def _project_dir() -> Path:
    return Path(os.getenv("DREAMINA_CLI_PROJECT_DIR", Path(__file__).resolve().parents[2])).resolve()


def _data_dir(project_dir: Path) -> Path:
    return Path(os.getenv("DREAMINA_CLI_DATA_DIR", project_dir / "runtime_data")).resolve()


def _is_frozen_executable() -> bool:
    return bool(getattr(sys, "frozen", False))


def _worker_command(frozen: bool) -> list[str]:
    if frozen:
        return [sys.executable]
    return [sys.executable, "-m", "backend.app.queue_worker"]


def _launch_direct(project_dir: Path, data_dir: Path, frozen: bool) -> dict[str, Any]:
    env = os.environ.copy()
    env.update(
        {
            "DREAMINA_CLI_PROJECT_DIR": str(project_dir),
            "DREAMINA_CLI_DATA_DIR": str(data_dir),
            "DREAMINA_QUEUE_WORKER": "1",
        }
    )
    process = subprocess.Popen(
        _worker_command(frozen),
        cwd=str(project_dir),
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    return {
        "ok": True,
        "mode": "direct",
        "worker_pid": process.pid,
        "script_path": None,
        "data_dir": str(data_dir),
    }


def _launch_with_powershell_script(project_dir: Path, data_dir: Path, script_path: Path, frozen: bool) -> dict[str, Any]:
    powershell = os.getenv("DREAMINA_POWERSHELL_EXE", "powershell.exe")
    command = [
        powershell,
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(script_path),
        "-Root",
        str(project_dir),
        "-DataDir",
        str(data_dir),
        "-PythonPath",
        sys.executable,
    ]
    if frozen:
        command.append("-FrozenExecutable")

    completed = subprocess.run(
        command,
        cwd=str(project_dir),
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or "worker start script failed"
        raise RuntimeError(detail)
    try:
        payload = json.loads(completed.stdout.strip())
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"worker start script returned invalid JSON: {completed.stdout.strip()}") from exc
    payload.update(
        {
            "mode": "script",
            "script_path": str(script_path),
            "data_dir": str(data_dir),
        }
    )
    return payload


def start_queue_worker_process() -> dict[str, Any]:
    project_dir = _project_dir()
    data_dir = _data_dir(project_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    script_path = project_dir / "scripts" / "start_worker.ps1"
    frozen = _is_frozen_executable()

    if os.name == "nt" and script_path.exists():
        return _launch_with_powershell_script(project_dir, data_dir, script_path, frozen)
    return _launch_direct(project_dir, data_dir, frozen)
