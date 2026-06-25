"""独立即梦队列 worker 进程入口。"""

import os
import socket
import time
from datetime import datetime, timezone
from typing import Any, Callable

from .api.context import dreamina_cli, get_store, load_runtime_settings
from .jimeng_queue import JimengQueueWorker
from .jimeng_storage import JimengStore
from .providers import DreaminaCliProvider, JimengHubProvider
from .queue.scheduler import PersistentQueueScheduler


Clock = Callable[[], datetime]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class QueueWorkerRuntime:
    def __init__(
        self,
        *,
        store: JimengStore,
        scheduler: Any,
        worker_id: str,
        clock: Clock = _utc_now,
        process_id: int | None = None,
    ):
        self.store = store
        self.scheduler = scheduler
        self.worker_id = worker_id
        self.clock = clock
        self.process_id = process_id if process_id is not None else os.getpid()

    def run_once(self) -> Any:
        now = self.clock().isoformat()
        self.store.update_runtime_settings(
            {
                "worker_id": self.worker_id,
                "worker_pid": self.process_id,
                "worker_heartbeat_at": now,
                "worker_last_error": None,
            }
        )
        try:
            return self.scheduler.run_once()
        except Exception as exc:
            self.store.update_runtime_settings(
                {
                    "worker_heartbeat_at": now,
                    "worker_last_error": f"{type(exc).__name__}: {exc}",
                }
            )
            return None


def build_runtime() -> QueueWorkerRuntime:
    store = get_store()
    settings = load_runtime_settings()
    provider = DreaminaCliProvider(dreamina_cli())

    def provider_factory(provider_name: str, account_id: str | None = None) -> Any:
        if provider_name == "jimeng_hub":
            return JimengHubProvider(store, account_id=account_id)
        return DreaminaCliProvider(dreamina_cli())

    worker = JimengQueueWorker(
        store=store,
        cli=provider,
        provider_factory=provider_factory,
        poll_seconds=int(settings.get("poll_seconds") or 30),
        duration=int(settings.get("duration") or 5),
        ratio=str(settings.get("ratio") or "9:16"),
        video_resolution=str(settings.get("video_resolution") or "720p"),
        model_version=str(settings.get("model_version") or "seedance2.0fast"),
    )
    worker_id = f"{socket.gethostname()}-{os.getpid()}"
    scheduler = PersistentQueueScheduler(
        store=store,
        worker=worker,
        worker_id=worker_id,
        settings_loader=lambda: load_runtime_settings().copy(),
    )
    worker.recover_interrupted_items()
    return QueueWorkerRuntime(store=store, scheduler=scheduler, worker_id=worker_id)


def main() -> None:
    runtime = build_runtime()
    while True:
        runtime.run_once()
        time.sleep(0.5)


if __name__ == "__main__":
    main()
