import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .jimeng_cli import DreaminaTaskResult
from .jimeng_models import JimengQueueItem, JimengQueueStatus, JimengShotStatus
from .jimeng_storage import JimengStore
from .queue.references import build_reference_bundle, empty_reference_bundle


_SUCCESS_STATUSES = {"success", "completed", "complete"}
_RUNNING_STATUSES = {"querying", "running", "pending", "processing"}
_FAILED_STATUSES = {"failed", "fail", "error", "canceled", "cancelled"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (str, Path)):
        return [str(value)] if str(value) else []
    if isinstance(value, list):
        return [str(item) for item in value if item]
    return []


def _positive_int(value: Any, fallback: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed > 0 else fallback


def _string_setting(value: Any, fallback: str) -> str:
    if value is None:
        return fallback
    parsed = str(value).strip()
    return parsed or fallback


class JimengQueueWorker:
    def __init__(
        self,
        store: JimengStore,
        cli: Any,
        poll_seconds: int = 30,
        duration: int = 5,
        ratio: str = "9:16",
        video_resolution: str = "720p",
        model_version: str = "seedance2.0fast",
        cli_factory: Any | None = None,
        provider_factory: Any | None = None,
        force_provider_name: str | None = None,
    ):
        self.store = store
        self.cli = cli
        self.cli_factory = cli_factory
        self.provider_factory = provider_factory
        self.poll_seconds = poll_seconds
        self.duration = duration
        self.ratio = ratio
        self.video_resolution = video_resolution
        self.model_version = model_version
        self.paused = False
        self.force_provider_name = force_provider_name

    def start(self, max_items: int | None = None) -> list[JimengQueueItem]:
        self.recover_interrupted_items()
        processed: list[JimengQueueItem] = []
        while not self.paused:
            if max_items is not None and len(processed) >= max_items:
                break
            item = self.process_next_once()
            if item is None:
                break
            processed.append(item)
            if item.status == JimengQueueStatus.running:
                break
            if self.poll_seconds > 0:
                time.sleep(self.poll_seconds)
        return processed

    def recover_interrupted_items(self) -> dict[str, list[str]]:
        return self.store.recover_interrupted_queue_items()

    def pause(self) -> None:
        self.paused = True

    def status(self) -> dict[str, Any]:
        running_item = self.store.running_queue_item()
        return {
            "paused": self.paused,
            "running_item": self._dump_item(running_item) if running_item else None,
            "waiting_count": self.store.count_queue(JimengQueueStatus.waiting),
        }

    def process_next_once(self) -> JimengQueueItem | None:
        if self.paused:
            return None

        running_item = self.store.running_queue_item()
        if running_item is not None:
            return self._process_running_item(running_item)

        item = self.store.next_waiting_item()
        if item is None:
            return None

        return self.submit_item(item, query_after_submit=True)

    def submit_item(
        self,
        item: JimengQueueItem,
        *,
        cli_poll_seconds: int | None = None,
        query_after_submit: bool = False,
        submitted_at: str | None = None,
    ) -> JimengQueueItem:

        download_dir = self._download_dir(item)
        download_dir.mkdir(parents=True, exist_ok=True)
        snapshot = item.asset_snapshot or {}
        generation_settings = self._generation_settings(item)
        command_poll_seconds = _positive_int(cli_poll_seconds, generation_settings["poll_seconds"])
        reference_image_path = snapshot.get("reference_image_path")
        generation_mode = generation_settings["generation_mode"]
        if generation_mode == "text2video":
            references = empty_reference_bundle()
            reference_image_path = None
        else:
            try:
                references = build_reference_bundle(snapshot)
            except ValueError as exc:
                return self._fail_item(item.id, self._exception_result(exc))
        reference_image_paths = references.image_paths
        reference_video_paths = references.video_paths
        reference_audio_paths = references.audio_paths
        has_visual_reference = references.has_visual or bool(reference_image_path)
        if generation_mode == "multimodal2video" and not has_visual_reference:
            return self._fail_item(
                item.id,
                self._exception_result(ValueError("全能参考至少需要 1 张图片或 1 段视频")),
            )
        use_multimodal = generation_mode == "multimodal2video" or (
            generation_mode == "auto" and has_visual_reference
        )
        if use_multimodal and reference_image_path and not reference_image_paths:
            reference_image_paths = [str(Path(reference_image_path).expanduser().resolve())]

        provider_name = generation_settings["provider"]
        command_name = "multimodal2video" if use_multimodal else ("image2video" if reference_image_path else "text2video")
        command_prefix = "dreamina" if provider_name == "dreamina_cli" else provider_name
        command = f"{command_prefix} {command_name}"
        if generation_settings["model_version"]:
            command = f"{command} --model_version {generation_settings['model_version']}"

        item = self.store.update_queue_item(
            item.id,
            status=JimengQueueStatus.submitting,
            cli_command=command,
            poll_seconds=generation_settings["poll_seconds"],
            download_dir=str(download_dir),
            submitted_at=submitted_at or _now(),
            error_message=None,
            cli_raw_output=None,
        )
        self.store.update_shot(item.shot_id, status=JimengShotStatus.running, last_error=None)

        try:
            provider = self._provider_for_item(item)
            if use_multimodal:
                result = provider.submit_multimodal2video(
                    image_paths=reference_image_paths,
                    video_paths=reference_video_paths,
                    audio_paths=reference_audio_paths,
                    prompt=references.prompt_with_manifest(item.final_prompt_snapshot),
                    duration=generation_settings["duration"],
                    ratio=generation_settings["ratio"],
                    video_resolution=generation_settings["video_resolution"],
                    poll_seconds=command_poll_seconds,
                    model_version=generation_settings["model_version"],
                )
            elif reference_image_path:
                result = provider.submit_image2video(
                    image_path=reference_image_path,
                    prompt=item.final_prompt_snapshot,
                    duration=generation_settings["duration"],
                    video_resolution=generation_settings["video_resolution"],
                    poll_seconds=command_poll_seconds,
                    model_version=generation_settings["model_version"],
                )
            else:
                result = provider.submit_text2video(
                    prompt=item.final_prompt_snapshot,
                    duration=generation_settings["duration"],
                    ratio=generation_settings["ratio"],
                    video_resolution=generation_settings["video_resolution"],
                    poll_seconds=command_poll_seconds,
                    model_version=generation_settings["model_version"],
                )
        except Exception as exc:
            return self._fail_item(item.id, self._exception_result(exc))

        return self._handle_result(item.id, result, query_running=query_after_submit)

    def _process_running_item(self, item: JimengQueueItem) -> JimengQueueItem:
        if not item.submit_id:
            result = DreaminaTaskResult(
                gen_status="failed",
                raw_output="running queue item has no submit_id",
                error_message="running queue item has no submit_id",
            )
            return self._fail_item(item.id, result)

        download_dir = Path(item.download_dir) if item.download_dir else self._download_dir(item)
        download_dir.mkdir(parents=True, exist_ok=True)
        try:
            result = self._provider_for_item(item).query_result(item.submit_id, download_dir=download_dir)
        except Exception as exc:
            return self._fail_item(item.id, self._exception_result(exc, submit_id=item.submit_id))
        if result.submit_id is None:
            result.submit_id = item.submit_id

        return self._handle_result(item.id, result, query_running=False)

    def poll_item(self, item: JimengQueueItem) -> JimengQueueItem:
        return self._process_running_item(item)

    def _handle_result(
        self,
        item_id: str,
        result: DreaminaTaskResult,
        query_running: bool,
    ) -> JimengQueueItem:
        self._save_result_snapshot(item_id, result)
        status = self._normalized_status(result)
        if status in _RUNNING_STATUSES and result.submit_id and query_running:
            item = self.store.get_queue_item(item_id)
            download_dir = Path(item.download_dir) if item.download_dir else self._download_dir(item)
            download_dir.mkdir(parents=True, exist_ok=True)
            try:
                result = self._provider_for_item(self.store.get_queue_item(item_id)).query_result(result.submit_id, download_dir=download_dir)
            except Exception as exc:
                return self._fail_item(item_id, self._exception_result(exc, submit_id=result.submit_id))
            if result.submit_id is None:
                result.submit_id = self.store.get_queue_item(item_id).submit_id
            self._save_result_snapshot(item_id, result)
            status = self._normalized_status(result)

        if status in _RUNNING_STATUSES and result.submit_id:
            return self.store.update_queue_item(
                item_id,
                status=JimengQueueStatus.polling,
                error_message=None,
                lease_owner=None,
                lease_expires_at=None,
            )

        if self._is_success(result, status):
            return self._complete_item(item_id, result)
        if self._is_failure(result, status):
            return self._fail_item(item_id, result)
        if status in _RUNNING_STATUSES and not result.submit_id:
            missing_submit_id = DreaminaTaskResult(
                gen_status="failed",
                raw_output=result.raw_output or "running queue item has no submit_id",
                error_message="running queue item has no submit_id",
            )
            return self._fail_item(item_id, missing_submit_id)

        return self.store.get_queue_item(item_id)

    def _download_dir(self, item: JimengQueueItem) -> Path:
        return self.store.output_root / "jimeng" / "projects" / item.project_id / "videos" / item.id

    def _save_result_snapshot(self, item_id: str, result: DreaminaTaskResult) -> JimengQueueItem:
        return self.store.update_queue_item(
            item_id,
            submit_id=result.submit_id,
            gen_status=result.gen_status,
            result_url=result.result_url,
            local_video_path=self._first_local_path(result),
            cli_raw_output=result.raw_output,
            error_message=result.error_message,
        )

    def _complete_item(self, item_id: str, result: DreaminaTaskResult) -> JimengQueueItem:
        item = self.store.update_queue_item(
            item_id,
            status=JimengQueueStatus.completed,
            submit_id=result.submit_id,
            gen_status=result.gen_status,
            result_url=result.result_url,
            local_video_path=self._first_local_path(result),
            cli_raw_output=result.raw_output,
            error_message=None,
            lease_owner=None,
            lease_expires_at=None,
            finished_at=_now(),
        )
        shot = self.store.get_shot(item.shot_id)
        video_path = item.local_video_path or item.result_url or ""
        candidate = self.store.create_video_candidate(
            project_id=item.project_id,
            shot_id=item.shot_id,
            queue_item_id=item.id,
            video_filename=Path(video_path).name or f"{item.id}.mp4",
            video_path=video_path,
            duration=self._generation_settings(item)["duration"],
            ratio=self._generation_settings(item)["ratio"],
            resolution=self._generation_settings(item)["video_resolution"],
            source_url=item.result_url,
            is_default=shot.locked_video_candidate_id is None,
            is_locked=False,
        )
        updates: dict[str, Any] = {"last_error": None}
        if shot.locked_video_candidate_id:
            updates["status"] = JimengShotStatus.locked
        else:
            updates["status"] = JimengShotStatus.completed
            updates["default_video_candidate_id"] = candidate.id
        self.store.update_shot(item.shot_id, **updates)
        return self.store.get_queue_item(item.id)

    def _fail_item(self, item_id: str, result: DreaminaTaskResult) -> JimengQueueItem:
        item = self.store.update_queue_item(
            item_id,
            status=JimengQueueStatus.failed,
            submit_id=result.submit_id,
            gen_status=result.gen_status,
            result_url=result.result_url,
            local_video_path=self._first_local_path(result),
            cli_raw_output=result.raw_output,
            error_message=self._error_message(result),
            lease_owner=None,
            lease_expires_at=None,
            finished_at=_now(),
        )
        self.store.update_shot(
            item.shot_id,
            status=JimengShotStatus.failed,
            last_error=item.error_message,
        )
        return item

    def _normalized_status(self, result: DreaminaTaskResult) -> str:
        return (result.gen_status or "").strip().lower()

    def _is_success(self, result: DreaminaTaskResult, status: str) -> bool:
        return not result.error_message and status in _SUCCESS_STATUSES

    def _is_failure(self, result: DreaminaTaskResult, status: str) -> bool:
        return bool(result.error_message) or status in _FAILED_STATUSES

    def _error_message(self, result: DreaminaTaskResult) -> str:
        return result.error_message or result.raw_output or result.gen_status or "Jimeng generation failed"

    def _first_local_path(self, result: DreaminaTaskResult) -> str | None:
        return result.local_paths[0] if result.local_paths else None

    def _dump_item(self, item: JimengQueueItem) -> dict[str, Any]:
        if hasattr(item, "model_dump"):
            return item.model_dump()
        return item.dict()

    def _generation_settings(self, item: JimengQueueItem) -> dict[str, Any]:
        snapshot = item.asset_snapshot if isinstance(item.asset_snapshot, dict) else {}
        raw_settings = snapshot.get("generation_settings")
        settings = raw_settings if isinstance(raw_settings, dict) else {}
        return {
            "poll_seconds": _positive_int(settings.get("poll_seconds"), _positive_int(item.poll_seconds, self.poll_seconds)),
            "duration": _positive_int(settings.get("duration"), self.duration),
            "ratio": _string_setting(settings.get("ratio"), self.ratio),
            "video_resolution": _string_setting(settings.get("video_resolution"), self.video_resolution),
            "model_version": _string_setting(settings.get("model_version"), self.model_version),
            "account_id": _string_setting(settings.get("account_id"), ""),
            "provider": self.force_provider_name or _string_setting(settings.get("provider"), "dreamina_cli"),
            "generation_mode": _string_setting(settings.get("generation_mode"), "auto"),
        }

    def _cli_for_item(self, item: JimengQueueItem) -> Any:
        account_id = self._generation_settings(item)["account_id"]
        if account_id and self.cli_factory is not None:
            return self.cli_factory(account_id)
        return self.cli

    def _provider_for_item(self, item: JimengQueueItem) -> Any:
        settings = self._generation_settings(item)
        provider_name = settings["provider"]
        account_id = settings["account_id"]
        if self.provider_factory is not None:
            return self.provider_factory(provider_name, account_id)
        if provider_name != "dreamina_cli":
            raise ValueError(f"unknown generation provider: {provider_name}")
        return self._cli_for_item(item)

    def _exception_result(self, exc: Exception, submit_id: str | None = None) -> DreaminaTaskResult:
        message = f"{type(exc).__name__}: {exc}"
        return DreaminaTaskResult(
            submit_id=submit_id,
            gen_status="failed",
            raw_output=message,
            error_message=message,
        )

