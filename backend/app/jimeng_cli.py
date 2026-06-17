import json
import os
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence

from .cli.parser import parse_dreamina_output


@dataclass
class DreaminaResult:
    returncode: int
    stdout: str
    stderr: str


@dataclass
class DreaminaTaskResult:
    submit_id: Optional[str] = None
    gen_status: Optional[str] = None
    result_url: Optional[str] = None
    local_paths: List[str] = field(default_factory=list)
    raw_output: str = ""
    error_message: Optional[str] = None
    error_category: Optional[str] = None


Runner = Callable[[Sequence[str], Optional[float]], DreaminaResult]
AudioDurationProbe = Callable[[Path], Optional[float]]

_VIDEO_RATIOS = {"1:1", "3:4", "16:9", "4:3", "9:16", "21:9"}
_IMAGE_RATIOS = {"21:9", "16:9", "3:2", "4:3", "1:1", "3:4", "2:3", "9:16"}
_IMAGE_MODELS = {"3.0", "3.1", "4.0", "4.1", "4.5", "4.6", "4.7", "5.0"}
_IMAGE_RESOLUTION_TYPES = {"1k", "2k", "4k"}


class DreaminaCli:
    def __init__(
        self,
        executable: str = "dreamina",
        runner: Optional[Runner] = None,
        timeout: Optional[float] = None,
        audio_duration_probe: Optional[AudioDurationProbe] = None,
        env: Optional[Dict[str, str]] = None,
    ):
        self.executable = executable
        self.runner = runner
        self.timeout = timeout
        self.audio_duration_probe = audio_duration_probe or _probe_audio_duration
        self.env = env

    @staticmethod
    def _default_runner(args: Sequence[str], timeout: Optional[float], env: Optional[Dict[str, str]] = None) -> DreaminaResult:
        completed = subprocess.run(
            list(args),
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
            env=env,
        )
        return DreaminaResult(
            returncode=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
        )

    @staticmethod
    def cli_paths(profile_dir: str | Path | None = None) -> Dict[str, str]:
        base_dir = (Path(profile_dir) if profile_dir else Path(os.path.expanduser("~"))) / ".dreamina_cli"
        return {
            "config": str(base_dir / "config.toml"),
            "tasks_db": str(base_dir / "tasks.db"),
            "logs": str(base_dir / "logs"),
        }

    def check_available(self) -> bool:
        result = self._run([self.executable, "--help"])
        return result.returncode == 0

    def login(self, debug: bool = False) -> DreaminaTaskResult:
        args = [self.executable, "login"]
        if debug:
            args.append("--debug")
        return self._run_and_parse(args)

    def relogin(self) -> DreaminaTaskResult:
        return self._run_and_parse([self.executable, "relogin"])

    def logout(self) -> DreaminaTaskResult:
        return self._run_and_parse([self.executable, "logout"])

    def user_credit(self) -> DreaminaTaskResult:
        return self._run_and_parse([self.executable, "user_credit"])

    def submit_text2image(
        self,
        prompt: str,
        ratio: str = "9:16",
        resolution_type: str = "2k",
        poll_seconds: int = 60,
        model_version: str = "",
    ) -> DreaminaTaskResult:
        _validate_image_ratio(ratio)
        normalized_model = _normalize_image_model_version(model_version)
        _validate_image_resolution_type(normalized_model, resolution_type)
        args = [
            self.executable,
            "text2image",
        ]
        _extend_model_version(args, normalized_model)
        args.extend(
            [
                "--prompt",
                prompt,
                "--ratio",
                ratio,
            ]
        )
        if resolution_type:
            args.extend(["--resolution_type", resolution_type])
        args.extend(["--poll", str(poll_seconds)])
        return self._run_and_parse(args)

    def submit_text2video(
        self,
        prompt: str,
        duration: int,
        ratio: str,
        video_resolution: str,
        poll_seconds: int,
        model_version: str = "",
    ) -> DreaminaTaskResult:
        _validate_video_ratio(ratio)
        args = [
            self.executable,
            "text2video",
        ]
        _extend_model_version(args, model_version)
        args.extend(
            [
                "--prompt",
                prompt,
                "--duration",
                str(duration),
                "--ratio",
                ratio,
                "--video_resolution",
                video_resolution,
                "--poll",
                str(poll_seconds),
            ]
        )
        return self._run_and_parse(args)

    def submit_image2video(
        self,
        image_path: Path,
        prompt: str,
        duration: int,
        ratio: str = "9:16",
        video_resolution: str = "720p",
        poll_seconds: int = 30,
        model_version: str = "",
    ) -> DreaminaTaskResult:
        # image2video infers ratio from the input image; keep ratio in the signature for old callers.
        args = [
            self.executable,
            "image2video",
            "--image",
            str(image_path),
        ]
        _extend_model_version(args, model_version)
        args.extend(
            [
                "--prompt",
                prompt,
                "--duration",
                str(duration),
                "--video_resolution",
                video_resolution,
                "--poll",
                str(poll_seconds),
            ]
        )
        return self._run_and_parse(args)

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
        images = _normalize_paths(image_paths)
        videos = _normalize_paths(video_paths)
        audios = _normalize_paths(audio_paths)
        self._validate_multimodal_references(images, videos, audios, duration)
        _validate_video_ratio(ratio)

        args = [
            self.executable,
            "multimodal2video",
        ]
        for image_path in images:
            args.extend(["--image", str(image_path)])
        for video_path in videos:
            args.extend(["--video", str(video_path)])
        for audio_path in audios:
            args.extend(["--audio", str(audio_path)])
        _extend_model_version(args, model_version)
        if prompt:
            args.extend(["--prompt", prompt])
        args.extend(
            [
                "--duration",
                str(duration),
                "--ratio",
                ratio,
                "--video_resolution",
                video_resolution,
                "--poll",
                str(poll_seconds),
            ]
        )
        return self._run_and_parse(args)

    def _validate_multimodal_references(
        self,
        images: Sequence[Path],
        videos: Sequence[Path],
        audios: Sequence[Path],
        duration: int,
    ) -> None:
        if not images and not videos:
            raise ValueError("multimodal2video requires at least one image or video")
        if len(images) > 9:
            raise ValueError("multimodal2video image references cannot exceed 9")
        if len(videos) > 3:
            raise ValueError("multimodal2video video references cannot exceed 3")
        if len(audios) > 3:
            raise ValueError("multimodal2video audio references cannot exceed 3")
        if duration < 4 or duration > 15:
            raise ValueError("multimodal2video duration must be 4-15 seconds")
        for audio_path in audios:
            audio_duration = self.audio_duration_probe(audio_path)
            if audio_duration is None:
                raise ValueError(f"could not determine audio reference duration: {audio_path}")
            if audio_duration < 2 or audio_duration > 15:
                raise ValueError("audio reference duration must be 2-15 seconds")

    def query_result(self, submit_id: str, download_dir: Optional[Path] = None) -> DreaminaTaskResult:
        args = [self.executable, "query_result", f"--submit_id={submit_id}"]
        if download_dir is not None:
            args.extend(["--download_dir", str(download_dir)])
        parsed = self._run_and_parse(args)
        if parsed.submit_id is None:
            parsed.submit_id = submit_id
        return parsed

    def list_task(
        self,
        gen_status: Optional[str] = None,
        submit_id: Optional[str] = None,
    ) -> DreaminaTaskResult:
        args = [self.executable, "list_task"]
        if gen_status:
            args.append(f"--gen_status={gen_status}")
        if submit_id:
            args.append(f"--submit_id={submit_id}")
        return self._run_and_parse(args)

    def _run(self, args: Sequence[str]) -> DreaminaResult:
        try:
            if self.runner is not None:
                return self.runner(args, self.timeout)
            return self._default_runner(args, self.timeout, self.env)
        except subprocess.TimeoutExpired as exc:
            stderr = _to_text(exc.stderr)
            timeout_message = f"dreamina command timed out after {exc.timeout} seconds"
            return DreaminaResult(
                returncode=124,
                stdout=_to_text(exc.stdout),
                stderr=f"{stderr}\n{timeout_message}".strip(),
            )
        except OSError as exc:
            return DreaminaResult(returncode=127, stdout="", stderr=str(exc))

    def _run_and_parse(self, args: Sequence[str]) -> DreaminaTaskResult:
        result = self._run(args)
        return self._parse_result(result)

    def _parse_result(self, result: DreaminaResult) -> DreaminaTaskResult:
        stdout = _to_text(result.stdout)
        stderr = _to_text(result.stderr)
        raw_output = "\n".join(part for part in (stdout.strip(), stderr.strip()) if part).strip()
        parsed = self._parse_output(raw_output)
        parsed.raw_output = raw_output

        if result.returncode != 0:
            parsed.error_message = (raw_output or f"dreamina command failed with exit code {result.returncode}").strip()

        return parsed

    def _parse_output(self, output: str) -> DreaminaTaskResult:
        parsed = parse_dreamina_output(output)
        return DreaminaTaskResult(
            submit_id=parsed.submit_id,
            gen_status=parsed.gen_status,
            result_url=parsed.result_url,
            local_paths=parsed.local_paths,
            raw_output=parsed.raw_output,
            error_message=parsed.error_message,
            error_category=parsed.error_category.value if parsed.error_category else None,
        )

    def _parse_json_output(self, data: Any, raw_output: str) -> DreaminaTaskResult:
        values = _flatten_json(data)
        result_url = (
            _first_value(values, "result_url")
            or _first_value(values, "video_url")
            or _first_http_url(values)
        )
        local_paths = _collect_local_paths(values)
        return DreaminaTaskResult(
            submit_id=_first_value(values, "submit_id"),
            gen_status=_first_value(values, "gen_status"),
            result_url=result_url,
            local_paths=local_paths,
            raw_output=raw_output,
        )

    def _parse_text_output(self, output: str) -> DreaminaTaskResult:
        urls = _URL_RE.findall(output)
        path_search_text = _URL_RE.sub("", output)
        local_paths = _unique(
            _WINDOWS_PATH_RE.findall(path_search_text) + _POSIX_PATH_RE.findall(path_search_text)
        )
        return DreaminaTaskResult(
            submit_id=_extract_named_value(output, "submit_id"),
            gen_status=_extract_named_value(output, "gen_status"),
            result_url=urls[0] if urls else None,
            local_paths=local_paths,
            raw_output=output,
        )


_URL_RE = re.compile(r"https?://[^\s\"'<>]+")
_WINDOWS_PATH_RE = re.compile(r"[A-Za-z]:\\[^\r\n\"'<>]+?\.(?:mp4|mov|webm|mkv|png|jpe?g)")
_POSIX_PATH_RE = re.compile(r"/[^\r\n\"'<>]+?\.(?:mp4|mov|webm|mkv|png|jpe?g)")


def _extend_model_version(args: list[str], model_version: str) -> None:
    if model_version:
        args.extend(["--model_version", model_version])


def _validate_video_ratio(ratio: str) -> None:
    if ratio and ratio not in _VIDEO_RATIOS:
        raise ValueError(f"unsupported video ratio: {ratio}")


def _validate_image_ratio(ratio: str) -> None:
    if ratio and ratio not in _IMAGE_RATIOS:
        raise ValueError(f"unsupported image ratio: {ratio}")


def _normalize_image_model_version(model_version: str) -> str:
    value = str(model_version or "").strip().lower()
    if value.startswith("dreamina"):
        value = value.removeprefix("dreamina").strip(" _-")
    if value and value not in _IMAGE_MODELS:
        raise ValueError(f"unsupported image model_version: {model_version}")
    return value


def _validate_image_resolution_type(model_version: str, resolution_type: str) -> None:
    value = str(resolution_type or "").strip().lower()
    if not value:
        return
    if value not in _IMAGE_RESOLUTION_TYPES:
        raise ValueError(f"unsupported image resolution_type: {resolution_type}")
    if model_version in {"3.0", "3.1"} and value == "4k":
        raise ValueError("image resolution_type 4k requires Dreamina 4.0 or newer")


def _normalize_paths(paths: Optional[Sequence[Path | str]]) -> List[Path]:
    if paths is None:
        return []
    return [Path(path) for path in paths if str(path)]


def _probe_audio_duration(path: Path) -> Optional[float]:
    ffprobe = _find_ffprobe()
    if not ffprobe:
        return None
    try:
        completed = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=10,
            encoding="utf-8",
            errors="replace",
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if completed.returncode != 0:
        return None
    try:
        return float(completed.stdout.strip())
    except ValueError:
        return None


def _find_ffprobe() -> Optional[str]:
    found = shutil.which("ffprobe")
    if found:
        return found
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None
    ffmpeg_path = Path(ffmpeg)
    candidate = ffmpeg_path.with_name("ffprobe.exe" if ffmpeg_path.suffix.lower() == ".exe" else "ffprobe")
    return str(candidate) if candidate.exists() else None


def _to_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value)


def _extract_named_value(text: str, name: str) -> Optional[str]:
    pattern = re.compile(
        rf"\b{re.escape(name)}\b\s*[:=]\s*[\"']?([A-Za-z0-9_.:-]+)",
        re.IGNORECASE,
    )
    match = pattern.search(text)
    return match.group(1).rstrip(".,;") if match else None


def _flatten_json(data: Any) -> List[tuple[str, Any]]:
    values: List[tuple[str, Any]] = []

    def visit(value: Any, key: str = "") -> None:
        if isinstance(value, dict):
            for child_key, child_value in value.items():
                visit(child_value, str(child_key))
        elif isinstance(value, list):
            for item in value:
                visit(item, key)
        else:
            values.append((key, value))

    visit(data)
    return values


def _first_value(values: List[tuple[str, Any]], key: str) -> Optional[str]:
    for candidate_key, value in values:
        if candidate_key == key and value is not None:
            return str(value)
    return None


def _first_http_url(values: List[tuple[str, Any]]) -> Optional[str]:
    for _, value in values:
        if isinstance(value, str):
            match = _URL_RE.search(value)
            if match:
                return match.group(0)
    return None


def _collect_local_paths(values: List[tuple[str, Any]]) -> List[str]:
    paths: List[str] = []
    for key, value in values:
        if not isinstance(value, str):
            continue
        lower_key = key.lower()
        if value.startswith(("http://", "https://")):
            continue
        if "path" in lower_key or lower_key in {"file", "filename", "download"}:
            paths.append(value)
    return _unique(paths)


def _unique(values: List[str]) -> List[str]:
    seen = set()
    unique_values = []
    for value in values:
        if value not in seen:
            seen.add(value)
            unique_values.append(value)
    return unique_values
