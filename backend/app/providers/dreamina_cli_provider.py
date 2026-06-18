from pathlib import Path
from typing import Optional, Sequence

from ..jimeng_cli import DreaminaCli, DreaminaTaskResult


class DreaminaCliProvider:
    """官方 dreamina CLI 视频生成通道。

    这是当前默认通道，只负责把统一 provider 调用转发给现有 `DreaminaCli`。
    """

    def __init__(self, cli: DreaminaCli):
        self.cli = cli

    def submit_text2video(
        self,
        prompt: str,
        duration: int,
        ratio: str,
        video_resolution: str,
        poll_seconds: int,
        model_version: str = "",
    ) -> DreaminaTaskResult:
        return self.cli.submit_text2video(
            prompt=prompt,
            duration=duration,
            ratio=ratio,
            video_resolution=video_resolution,
            poll_seconds=poll_seconds,
            model_version=model_version,
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
        return self.cli.submit_image2video(
            image_path=Path(image_path),
            prompt=prompt,
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
        return self.cli.submit_multimodal2video(
            image_paths=image_paths,
            video_paths=video_paths,
            audio_paths=audio_paths,
            prompt=prompt,
            duration=duration,
            ratio=ratio,
            video_resolution=video_resolution,
            poll_seconds=poll_seconds,
            model_version=model_version,
        )

    def query_result(self, submit_id: str, download_dir: Optional[Path] = None) -> DreaminaTaskResult:
        return self.cli.query_result(submit_id=submit_id, download_dir=download_dir)
