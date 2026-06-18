"""将分镜资产快照转换为 Dreamina CLI 全能参考文件。"""

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


@dataclass(frozen=True)
class ReferenceBundle:
    image_paths: list[str]
    video_paths: list[str]
    audio_paths: list[str]
    image_labels: list[str]
    video_labels: list[str]
    audio_labels: list[str]

    @property
    def has_any(self) -> bool:
        return bool(self.image_paths or self.video_paths or self.audio_paths)

    @property
    def has_visual(self) -> bool:
        return bool(self.image_paths or self.video_paths)

    def prompt_with_manifest(self, prompt: str) -> str:
        lines: list[str] = []
        lines.extend(f"图片{index}：{label}" for index, label in enumerate(self.image_labels, start=1))
        lines.extend(f"视频{index}：{label}" for index, label in enumerate(self.video_labels, start=1))
        lines.extend(f"音频{index}：{label}" for index, label in enumerate(self.audio_labels, start=1))
        if not lines:
            return prompt
        return "【参考素材对应关系】\n" + "\n".join(lines) + "\n\n" + prompt


def empty_reference_bundle() -> ReferenceBundle:
    return ReferenceBundle([], [], [], [], [], [])


def build_reference_bundle(snapshot: dict[str, Any] | None) -> ReferenceBundle:
    data = snapshot if isinstance(snapshot, dict) else {}
    image_entries: list[tuple[str, str]] = []
    audio_entries: list[tuple[str, str]] = []

    group_labels = {"characters": "角色", "scenes": "场景", "props": "道具"}
    for group in ("characters", "scenes", "props"):
        rows = data.get(group)
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            name = str(row.get("name") or "未命名资产")
            image_path = str(row.get("image_path") or "").strip()
            audio_path = str(row.get("audio_path") or "").strip()
            if image_path:
                image_entries.append((f'{group_labels[group]}“{name}”', image_path))
            if group == "characters" and audio_path and row.get("voice_enabled", True):
                audio_entries.append((f'角色“{name}”的音色', audio_path))

    image_entries.extend(_named_paths("附加图片", data.get("reference_image_paths")))
    video_entries = _named_paths("附加视频", data.get("reference_video_paths"))
    audio_entries.extend(_named_paths("附加音频", data.get("reference_audio_paths")))

    image_entries = _validate_and_deduplicate(image_entries)
    video_entries = _validate_and_deduplicate(video_entries)
    audio_entries = _validate_and_deduplicate(audio_entries)
    image_paths = [path for _, path in image_entries]
    video_paths = [path for _, path in video_entries]
    audio_paths = [path for _, path in audio_entries]

    if len(image_paths) > 9:
        raise ValueError(f"全能参考图片最多 9 张，当前为 {len(image_paths)} 张")
    if len(video_paths) > 3:
        raise ValueError(f"全能参考视频最多 3 段，当前为 {len(video_paths)} 段")
    if len(audio_paths) > 3:
        raise ValueError(f"全能参考音频最多 3 段，当前为 {len(audio_paths)} 段；请关闭多余角色音色")
    if audio_paths and not image_paths and not video_paths:
        raise ValueError("全能参考包含音频时，至少还需要 1 张图片或 1 段视频")

    return ReferenceBundle(
        image_paths=image_paths,
        video_paths=video_paths,
        audio_paths=audio_paths,
        image_labels=[name for name, _ in image_entries],
        video_labels=[name for name, _ in video_entries],
        audio_labels=[name for name, _ in audio_entries],
    )


def _named_paths(label: str, value: Any) -> list[tuple[str, str]]:
    if value is None:
        return []
    values: Iterable[Any] = value if isinstance(value, list) else [value]
    return [(f"{label}{index}", str(path).strip()) for index, path in enumerate(values, start=1) if str(path).strip()]


def _validate_and_deduplicate(entries: list[tuple[str, str]]) -> list[tuple[str, str]]:
    result: list[tuple[str, str]] = []
    seen: set[str] = set()
    for name, raw_path in entries:
        path = Path(raw_path).expanduser().resolve()
        key = str(path).casefold()
        if key in seen:
            continue
        if not path.is_file():
            raise ValueError(f"参考文件不存在：{name}（{raw_path}）")
        seen.add(key)
        result.append((name, str(path)))
    return result
