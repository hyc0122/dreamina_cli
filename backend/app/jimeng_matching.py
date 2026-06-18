import csv
import re
from dataclasses import dataclass
from io import StringIO
from typing import Iterable

from .jimeng_models import JimengAsset, JimengAssetType


@dataclass(frozen=True)
class ImportedJimengShot:
    prompt: str
    raw_text: str
    scene_names: list[str]
    character_names: list[str]
    prop_names: list[str]


@dataclass(frozen=True)
class AssetMatch:
    asset_id: str
    asset_type: JimengAssetType
    matched_text: str
    start: int
    end: int


@dataclass(frozen=True)
class HighlightSpan:
    text: str
    asset_type: JimengAssetType
    start: int
    end: int


@dataclass(frozen=True)
class _CandidateSpan:
    asset: JimengAsset
    text: str
    start: int
    end: int


_FIELD_PATTERN = re.compile(r"^\s*(场景|人物|道具|分镜提示词)\s*[：:]\s*(.*)$")
_SHOT_MARKER_PATTERN = re.compile(r"(?m)^\s*#\s*\d+\s*$")
_NAME_SPLIT_PATTERN = re.compile(r"[、;,，；]")
_ASSET_TYPE_PRIORITY = {
    JimengAssetType.character: 0,
    JimengAssetType.scene: 1,
    JimengAssetType.prop: 2,
}


def parse_plain_text_shots(text: str) -> list[ImportedJimengShot]:
    segments = _split_plain_text_shots(text)
    shots: list[ImportedJimengShot] = []
    for segment in segments:
        if not segment.strip():
            continue
        shot = _parse_plain_text_segment(segment)
        if shot.prompt:
            shots.append(shot)
    return shots


def parse_csv_shots(csv_text: str) -> list[ImportedJimengShot]:
    csv_text = csv_text.lstrip("\ufeff")
    reader = csv.DictReader(StringIO(csv_text))
    shots: list[ImportedJimengShot] = []

    for row in reader:
        if not row:
            continue

        prompt = (row.get("分镜提示词") or "").strip()
        raw_text = "\n".join((value or "").strip() for value in row.values() if value)
        shots.append(
            ImportedJimengShot(
                prompt=prompt,
                raw_text=raw_text,
                scene_names=_split_names(row.get("场景") or ""),
                character_names=_split_names(row.get("人物") or ""),
                prop_names=_split_names(row.get("道具") or ""),
            )
        )

    return shots


def match_assets_for_prompt(prompt: str, assets: list[JimengAsset]) -> list[AssetMatch]:
    selected = sorted(
        _select_non_overlapping_asset_spans(prompt, assets),
        key=lambda span: (
            _ASSET_TYPE_PRIORITY.get(span.asset.type, 99),
            -(span.end - span.start),
            span.start,
            span.asset.id,
        ),
    )
    return [
        AssetMatch(
            asset_id=span.asset.id,
            asset_type=span.asset.type,
            matched_text=span.text,
            start=span.start,
            end=span.end,
        )
        for span in selected
    ]


def calculate_highlights(prompt: str, assets: list[JimengAsset]) -> list[HighlightSpan]:
    selected = sorted(_select_non_overlapping_asset_spans(prompt, assets), key=lambda span: span.start)
    return [
        HighlightSpan(
            text=prompt[span.start : span.end],
            asset_type=span.asset.type,
            start=span.start,
            end=span.end,
        )
        for span in selected
    ]


def _split_plain_text_shots(text: str) -> list[str]:
    matches = list(_SHOT_MARKER_PATTERN.finditer(text))
    if not matches:
        return [text]

    segments: list[str] = []
    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        segments.append(text[start:end])
    return segments


def _parse_plain_text_segment(segment: str) -> ImportedJimengShot:
    raw_text = segment.strip()
    body = _SHOT_MARKER_PATTERN.sub("", segment, count=1).strip()
    lines = body.splitlines()
    fields: dict[str, str] = {"场景": "", "人物": "", "道具": ""}
    prompt_header_index: int | None = None
    prompt_header_value = ""
    prompt_source_lines: list[str] = []

    for index, line in enumerate(lines):
        match = _FIELD_PATTERN.match(line)
        if not match:
            prompt_source_lines.append(line)
            continue

        field_name, value = match.groups()
        if field_name == "分镜提示词":
            if prompt_header_index is None:
                prompt_header_index = index
                prompt_header_value = value.strip()
            continue

        fields[field_name] = value.strip()
        prompt_source_lines.append(line)

    if prompt_header_index is None:
        prompt = "\n".join(line.strip() for line in prompt_source_lines if line.strip())
    else:
        prompt_lines = [prompt_header_value] if prompt_header_value else []
        for line in lines[prompt_header_index + 1 :]:
            if line.strip():
                prompt_lines.append(line.strip())
        prompt = "\n".join(prompt_lines)

    return ImportedJimengShot(
        prompt=prompt.strip(),
        raw_text=raw_text,
        scene_names=_split_names(fields["场景"]),
        character_names=_split_names(fields["人物"]),
        prop_names=_split_names(fields["道具"]),
    )


def _split_names(value: str) -> list[str]:
    return [part.strip() for part in _NAME_SPLIT_PATTERN.split(value) if part.strip()]


def _select_non_overlapping_asset_spans(prompt: str, assets: list[JimengAsset]) -> list[_CandidateSpan]:
    candidates = list(_iter_candidate_spans(prompt, assets))
    candidates.sort(
        key=lambda span: (
            -(span.end - span.start),
            _ASSET_TYPE_PRIORITY.get(span.asset.type, 99),
            span.start,
            span.asset.id,
        )
    )

    selected: list[_CandidateSpan] = []
    selected_asset_ids: set[str] = set()
    occupied: list[tuple[int, int]] = []

    for candidate in candidates:
        if candidate.asset.id in selected_asset_ids:
            continue
        if any(_overlaps(candidate.start, candidate.end, start, end) for start, end in occupied):
            continue

        selected.append(candidate)
        selected_asset_ids.add(candidate.asset.id)
        occupied.append((candidate.start, candidate.end))

    return selected


def _iter_candidate_spans(prompt: str, assets: Iterable[JimengAsset]) -> Iterable[_CandidateSpan]:
    for asset in assets:
        for keyword in _asset_keywords(asset):
            start = prompt.find(keyword)
            while start != -1:
                end = start + len(keyword)
                yield _CandidateSpan(asset=asset, text=keyword, start=start, end=end)
                start = prompt.find(keyword, start + 1)


def _asset_keywords(asset: JimengAsset) -> list[str]:
    keywords: list[str] = []
    seen: set[str] = set()

    for value in [asset.name, *asset.aliases]:
        keyword = value.strip()
        if not keyword or keyword in seen:
            continue
        keywords.append(keyword)
        seen.add(keyword)

    keywords.sort(key=len, reverse=True)
    return keywords


def _overlaps(first_start: int, first_end: int, second_start: int, second_end: int) -> bool:
    return first_start < second_end and second_start < first_end
