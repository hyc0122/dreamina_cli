"""将 CLI 错误分类转换为持久化队列状态。"""

from dataclasses import dataclass

from ..jimeng_models import JimengQueueStatus


@dataclass(frozen=True)
class QueueFailureDecision:
    status: JimengQueueStatus
    retry_after_seconds: int | None = None


_RETRYABLE = {
    "QUEUE_FULL",
    "RATE_LIMITED",
    "PROVIDER_BUSY",
    "NETWORK_ERROR",
    "TASK_FAILED",
    "OUTPUT_PARSE_FAILED",
    "UNKNOWN_CLI_ERROR",
}
_BLOCKED = {"AUTH_REQUIRED", "CREDIT_INSUFFICIENT", "CLI_NOT_FOUND"}


def decide_queue_failure(
    category: str | None,
    *,
    attempt_count: int,
    max_retry_attempts: int,
    retry_base_seconds: int,
) -> QueueFailureDecision:
    normalized = str(category or "UNKNOWN_CLI_ERROR").strip().upper()
    if normalized in _BLOCKED:
        return QueueFailureDecision(JimengQueueStatus.blocked)
    if normalized not in _RETRYABLE or attempt_count >= max_retry_attempts:
        return QueueFailureDecision(JimengQueueStatus.failed)
    base = max(1, int(retry_base_seconds))
    delay = min(1800, base * (2 ** max(0, int(attempt_count))))
    return QueueFailureDecision(JimengQueueStatus.retry_wait, retry_after_seconds=delay)
