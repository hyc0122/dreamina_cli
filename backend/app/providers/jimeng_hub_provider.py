import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable, Optional, Sequence

from ..jimeng_cli import DreaminaTaskResult
from ..web_session_client import (
    WEB_GENERATE_EXTRA_PARAMS,
    build_history_query_payload,
    build_text_to_video_payload,
    create_web_session_client,
    extract_submit_identity,
    parse_poll_result,
    web_session_error_message,
)


HUB_MODEL_MAP = {
    "hub-seedance2.0-fast": "seedance2.0fast",
    "hub-seedance2.0-mini": "seedance2.0mini",
    "hub-seedance2.0": "seedance2.0",
    "hub-seedance2.0-fast-vip": "seedance2.0fast_vip",
    "hub-seedance2.0-vip": "seedance2.0_vip",
}


def normalize_hub_model_version(value: str | None) -> str:
    text = str(value or "").strip()
    return HUB_MODEL_MAP.get(text, text or "seedance2.0fast")


def _attr(value: Any, key: str, default: Any = None) -> Any:
    if isinstance(value, dict):
        return value.get(key, default)
    return getattr(value, key, default)


def _json(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False)
    except TypeError:
        return str(value)


class JimengHubProvider:
    """JiMengHub 网页 Cookie 视频生成通道。

    队列里的 submit_id 保存本地 web_session_video_tasks.id；真实即梦 submit_id
    和 history_id 存在 web-session 任务记录里，这样后续轮询可以找回提交账号。
    """

    def __init__(
        self,
        store: Any,
        *,
        account_id: str | None = None,
        client_factory: Callable[[dict[str, Any]], Any] | None = None,
        downloader: Callable[[str, Path, str], Path | None] | None = None,
    ):
        self.store = store
        self.account_id = str(account_id or "").strip()
        self.client_factory = client_factory or self._default_client
        self.downloader = downloader or self._download_result

    def submit_text2video(
        self,
        prompt: str,
        duration: int,
        ratio: str,
        video_resolution: str,
        poll_seconds: int,
        model_version: str = "",
    ) -> DreaminaTaskResult:
        account = self._select_account()
        model = normalize_hub_model_version(model_version)
        task = self.store.create_web_session_task(
            account_id=str(account["id"]),
            prompt=prompt,
            model=model,
            ratio=ratio,
            duration=duration,
            resolution=video_resolution,
        )
        payload = build_text_to_video_payload(
            prompt=prompt,
            model=model,
            ratio=ratio,
            duration=duration,
            resolution=video_resolution,
        )
        try:
            response = self.client_factory(account).signed_post(
                "/mweb/v1/aigc_draft/generate",
                payload,
                extra_params=WEB_GENERATE_EXTRA_PARAMS,
            )
        except Exception as exc:
            self.store.update_web_session_task(
                task.id,
                status="failed",
                error_message=str(exc),
            )
            return DreaminaTaskResult(
                submit_id=task.id,
                gen_status="failed",
                raw_output=str(exc),
                error_message=str(exc),
            )

        if self._is_submit_error(response):
            error_message = web_session_error_message(response, account.get("cookie_json"))
            self.store.update_web_session_task(
                task.id,
                status="failed",
                raw_submit_response=response,
                error_message=error_message,
            )
            return DreaminaTaskResult(
                submit_id=task.id,
                gen_status="failed",
                raw_output=_json(response),
                error_message=error_message,
            )

        submit_id, history_id = extract_submit_identity(response, fallback_submit_id=str(payload.get("submit_id") or ""))
        if not submit_id and not history_id:
            error_message = "JiMengHub 网页接口未返回 submit_id/history_id"
            self.store.update_web_session_task(
                task.id,
                status="failed",
                raw_submit_response=response,
                error_message=error_message,
            )
            return DreaminaTaskResult(
                submit_id=task.id,
                gen_status="failed",
                raw_output=_json(response),
                error_message=error_message,
            )

        self.store.update_web_session_task(
            task.id,
            status="polling",
            submit_id=submit_id,
            history_id=history_id,
            raw_submit_response=response,
        )
        return DreaminaTaskResult(
            submit_id=task.id,
            gen_status="running",
            raw_output=_json(response),
        )

    def submit_image2video(
        self,
        image_path: Path | str,
        prompt: str,
        duration: int,
        ratio: str = "9:16",
        video_resolution: str = "720p",
        poll_seconds: int = 30,
        model_version: str = "",
    ) -> DreaminaTaskResult:
        prompt_with_reference = f"{prompt}\n\n[参考图片] {image_path}"
        return self.submit_text2video(
            prompt=prompt_with_reference,
            duration=duration,
            ratio=ratio,
            video_resolution=video_resolution,
            poll_seconds=poll_seconds,
            model_version=model_version,
        )

    def submit_multimodal2video(
        self,
        image_paths: Optional[Sequence[Path | str]] = None,
        video_paths: Optional[Sequence[Path | str]] = None,
        audio_paths: Optional[Sequence[Path | str]] = None,
        prompt: str = "",
        duration: int = 5,
        ratio: str = "9:16",
        video_resolution: str = "720p",
        poll_seconds: int = 30,
        model_version: str = "",
    ) -> DreaminaTaskResult:
        references: list[str] = []
        references.extend(f"[参考图片] {path}" for path in image_paths or [])
        references.extend(f"[参考视频] {path}" for path in video_paths or [])
        references.extend(f"[参考音频] {path}" for path in audio_paths or [])
        prompt_with_references = prompt if not references else f"{prompt}\n\n" + "\n".join(references)
        return self.submit_text2video(
            prompt=prompt_with_references,
            duration=duration,
            ratio=ratio,
            video_resolution=video_resolution,
            poll_seconds=poll_seconds,
            model_version=model_version,
        )

    def query_result(self, submit_id: str, download_dir: Optional[Path] = None) -> DreaminaTaskResult:
        task = self.store.get_web_session_task(submit_id)
        lookup_id = _attr(task, "history_id") or _attr(task, "submit_id")
        if not lookup_id:
            return DreaminaTaskResult(
                submit_id=submit_id,
                gen_status="failed",
                raw_output="JiMengHub 任务没有 submit_id/history_id",
                error_message="JiMengHub 任务没有 submit_id/history_id，无法轮询",
            )

        account = self.store.get_web_session_account_secret(_attr(task, "account_id"))
        try:
            response = self.client_factory(account).signed_post(
                "/mweb/v1/get_history_by_ids",
                build_history_query_payload(str(lookup_id)),
            )
        except Exception as exc:
            self.store.update_web_session_task(submit_id, status="polling", error_message=str(exc))
            return DreaminaTaskResult(
                submit_id=submit_id,
                gen_status="running",
                raw_output=str(exc),
            )

        parsed = parse_poll_result(response, str(lookup_id))
        status = str(parsed.get("status") or "polling")
        result_url = parsed.get("result_url")
        local_paths: list[str] = []
        download_error: str | None = None
        if status == "completed" and result_url and download_dir:
            try:
                downloaded = self.downloader(str(result_url), Path(download_dir), submit_id)
                if downloaded:
                    local_paths.append(str(downloaded))
            except Exception as exc:
                download_error = f"JiMengHub 结果下载失败：{exc}"

        self.store.update_web_session_task(
            submit_id,
            status=status if status != "unknown" else "polling",
            result_url=result_url,
            raw_poll_response=response,
            error_message=parsed.get("error_message") or download_error,
        )

        mapped_status = "completed" if status == "completed" else "failed" if status == "failed" else "running"
        return DreaminaTaskResult(
            submit_id=submit_id,
            gen_status=mapped_status,
            result_url=str(result_url) if result_url else None,
            local_paths=local_paths,
            raw_output=_json(response) if not download_error else f"{_json(response)}\n{download_error}",
            error_message=str(parsed.get("error_message") or "") or None,
        )

    def _select_account(self) -> dict[str, Any]:
        if self.account_id:
            account = self.store.get_web_session_account_secret(self.account_id)
            self._ensure_account_enabled(account)
            return dict(account)

        for account in self.store.list_web_session_accounts():
            if bool(_attr(account, "enabled")):
                secret = self.store.get_web_session_account_secret(str(_attr(account, "id")))
                self._ensure_account_enabled(secret)
                return dict(secret)
        raise ValueError("JiMengHub 没有可用账号，请先添加并启用 Cookie 账号")

    def _ensure_account_enabled(self, account: dict[str, Any]) -> None:
        if not bool(account.get("enabled", True)):
            raise ValueError("JiMengHub 账号已禁用，不能提交任务")

    def _default_client(self, account: dict[str, Any]) -> Any:
        return create_web_session_client(str(account.get("sessionid") or ""), account.get("cookie_json"))

    def _download_result(self, url: str, download_dir: Path, task_id: str) -> Path | None:
        download_dir.mkdir(parents=True, exist_ok=True)
        suffix = Path(url.split("?", 1)[0]).suffix or ".mp4"
        output_path = download_dir / f"{task_id}{suffix}"
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                output_path.write_bytes(response.read())
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"HTTP {exc.code}: {exc.reason}") from exc
        return output_path

    def _is_submit_error(self, response: dict[str, Any]) -> bool:
        if not isinstance(response, dict):
            return True
        if "ret" in response and str(response.get("ret")) != "0":
            return True
        data = response.get("data")
        return bool(isinstance(data, dict) and data.get("aigc_data") is None and (response.get("errmsg") or data.get("fail_code")))
