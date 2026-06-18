"""基于 SQLite 的本地队列调度器。"""

from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from ..cli.parser import classify_dreamina_error
from ..jimeng_models import JimengQueueItem, JimengQueueStatus, JimengShotStatus
from ..jimeng_queue import JimengQueueWorker
from ..jimeng_storage import JimengStore
from .error_policy import decide_queue_failure


Clock = Callable[[], datetime]
SettingsLoader = Callable[[], dict[str, Any]]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


class PersistentQueueScheduler:
    def __init__(
        self,
        store: JimengStore,
        worker: JimengQueueWorker,
        worker_id: str,
        settings_loader: SettingsLoader,
        clock: Clock = _utc_now,
    ):
        self.store = store
        self.worker = worker
        self.worker_id = worker_id
        self.settings_loader = settings_loader
        self.clock = clock

    def run_once(self):
        settings = self.settings_loader()
        if not bool(settings.get("queue_enabled", True)):
            return None

        now = self.clock()
        lease_expires = now + timedelta(seconds=60)
        poll_interval = max(5, int(settings.get("result_poll_interval_seconds", 30)))
        polling_item = self.store.claim_next_polling_item(
            worker_id=self.worker_id,
            now=now.isoformat(),
            due_before=(now - timedelta(seconds=poll_interval)).isoformat(),
            lease_expires_at=lease_expires.isoformat(),
        )
        polled = self.worker.poll_item(polling_item) if polling_item is not None else None
        if polled is not None:
            polled = self._apply_failure_policy(polled, settings, now)

        if self.store.count_in_flight_queue_items() >= int(settings.get("max_in_flight", 10)):
            return polled

        submit_blocked_until = _as_utc(self.store.get_runtime_settings().get("queue_submit_blocked_until"))
        if submit_blocked_until is not None and now < submit_blocked_until:
            return polled

        latest = _as_utc(self.store.latest_queue_submission_at())
        submit_interval = max(1, int(settings.get("submit_interval_seconds", 3)))
        if latest is not None and (now - latest).total_seconds() < submit_interval:
            return polled

        item = self.store.claim_next_waiting_item(
            worker_id=self.worker_id,
            now=now.isoformat(),
            lease_expires_at=lease_expires.isoformat(),
        )
        if item is None:
            return polled

        submitted = self.worker.submit_item(
            item,
            cli_poll_seconds=max(1, int(settings.get("cli_initial_poll_seconds", 3))),
            query_after_submit=False,
            submitted_at=now.isoformat(),
        )
        return self._apply_failure_policy(submitted, settings, now)

    def _apply_failure_policy(
        self,
        item: JimengQueueItem,
        settings: dict[str, Any],
        now: datetime,
    ) -> JimengQueueItem:
        if item.status != JimengQueueStatus.failed:
            return item
        category = classify_dreamina_error(item.error_message or item.cli_raw_output or "")
        category_value = category.value if category is not None else "UNKNOWN_CLI_ERROR"
        decision = decide_queue_failure(
            category_value,
            attempt_count=item.attempt_count,
            max_retry_attempts=max(0, int(settings.get("max_retry_attempts", 5))),
            retry_base_seconds=max(1, int(settings.get("retry_base_seconds", 30))),
        )
        attempt_count = item.attempt_count + 1
        updates: dict[str, Any] = {
            "status": decision.status,
            "attempt_count": attempt_count,
            "lease_owner": None,
            "lease_expires_at": None,
        }
        if decision.status == JimengQueueStatus.retry_wait and decision.retry_after_seconds is not None:
            retry_at = now + timedelta(seconds=decision.retry_after_seconds)
            updates.update(next_attempt_at=retry_at.isoformat(), finished_at=None)
            self.store.update_shot(item.shot_id, status=JimengShotStatus.queued)
            if category_value in {"QUEUE_FULL", "RATE_LIMITED", "PROVIDER_BUSY"}:
                self.store.update_runtime_settings({"queue_submit_blocked_until": retry_at.isoformat()})
        elif decision.status == JimengQueueStatus.blocked:
            updates.update(next_attempt_at=None, finished_at=None)
        return self.store.update_queue_item(item.id, **updates)
