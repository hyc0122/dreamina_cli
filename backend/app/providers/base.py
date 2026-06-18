from pathlib import Path
from typing import Optional, Protocol, Sequence

from ..jimeng_cli import DreaminaTaskResult


class VideoGenerationProvider(Protocol):
    """视频生成通道统一边界。

    队列只依赖这个协议，不关心底层是官方 dreamina CLI，还是兼容即梦网页接口的 HTTP API。
    """

    def submit_text2video(
        self,
        prompt: str,
        duration: int,
        ratio: str,
        video_resolution: str,
        poll_seconds: int,
        model_version: str = "",
    ) -> DreaminaTaskResult:
        ...

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
        ...

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
        ...

    def query_result(self, submit_id: str, download_dir: Optional[Path] = None) -> DreaminaTaskResult:
        ...
