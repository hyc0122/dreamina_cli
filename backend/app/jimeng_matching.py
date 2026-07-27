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
    asset_id: str
    start: int
    end: int
    bound: bool | None = None


@dataclass(frozen=True)
class _CandidateSpan:
    asset: JimengAsset
    text: str
    start: int
    end: int


@dataclass(frozen=True)
class _StructuredToken:
    text: str
    match_text: str
    start: int
    end: int


_FIELD_PATTERN = re.compile(r"^\s*(场景|人物|道具|分镜提示词)\s*[：:]\s*(.*)$")
_STRUCTURED_FIELD_NAMES = {
    JimengAssetType.character: "人物",
    JimengAssetType.scene: "场景",
    JimengAssetType.prop: "道具",
}
_STRUCTURED_FIELD_MARKER_PATTERN = re.compile(
    r"(?m)(?:^|(?<=[。！？!?；;]))[ \t]*"
    r"(人物站位|氛围光影|预估时长|推荐时长|总时长|分镜提示词|场景|人物|道具|时间|分镜|镜号\s*\d+)"
    r"\s*[：:][ \t]*"
)
_SHOT_MARKER_PATTERN = re.compile(r"(?m)^\s*(?:#\s*\d+|小节\s*(?:\d+|[一二三四五六七八九十百千万]+))\s*[：:]?\s*$")
_NAME_SPLIT_PATTERN = re.compile(r"[、;,，；]")
_BRACKET_TRANSLATION = str.maketrans({"[": "(", "【": "(", "（": "(", "［": "(", "]": ")", "】": ")", "）": ")", "］": ")"})
_NAME_QUOTE_CHARS = "\"'“”‘’「」『』《》"
_NAME_EDGE_PUNCTUATION = "。！？!?:："
_BRACKET_OPEN_CHARS = "([（【［"
_SCENE_CONTEXT_TOKENS = {
    "内",
    "外",
    "内景",
    "外景",
    "日",
    "夜",
    "白天",
    "黑夜",
    "夜晚",
    "晚上",
    "清晨",
    "早晨",
    "上午",
    "中午",
    "下午",
    "傍晚",
    "黄昏",
    "深夜",
    "凌晨",
    "雨天",
    "雪天",
    "阴天",
    "晴天",
}
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
    selected = _select_non_overlapping_asset_spans(prompt, assets, for_binding=True)

    # 一个分镜只绑定一个场景；候选已经按完整名称长度排序，因此保留最具体的场景。
    filtered: list[_CandidateSpan] = []
    scene_selected = False
    for span in selected:
        if span.asset.type == JimengAssetType.scene:
            if scene_selected:
                continue
            scene_selected = True
        filtered.append(span)

    selected = sorted(
        filtered,
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


def calculate_highlights(
    prompt: str,
    assets: list[JimengAsset],
    bound_asset_ids: set[str] | None = None,
) -> list[HighlightSpan]:
    selected = sorted(_select_non_overlapping_asset_spans(prompt, assets, for_binding=False), key=lambda span: span.start)
    return [
        HighlightSpan(
            text=prompt[span.start : span.end],
            asset_type=span.asset.type,
            asset_id=span.asset.id,
            start=span.start,
            end=span.end,
            bound=span.asset.id in bound_asset_ids if bound_asset_ids is not None else None,
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


def _select_non_overlapping_asset_spans(
    prompt: str,
    assets: list[JimengAsset],
    *,
    for_binding: bool,
) -> list[_CandidateSpan]:
    candidates = (
        list(_iter_full_prompt_binding_candidate_spans(prompt, assets))
        if for_binding
        else list(_iter_candidate_spans(prompt, assets))
    )
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
    occupied_by_type: dict[JimengAssetType | None, list[tuple[int, int]]] = {}

    for candidate in candidates:
        if candidate.asset.id in selected_asset_ids:
            continue
        # 绑定时角色库和场景库独立查找，同名文本可分别绑定为不同资产类型；
        # 高亮展示仍共用一组占位，避免同一段文字产生重叠标签。
        occupied_key = candidate.asset.type if for_binding else None
        occupied = occupied_by_type.setdefault(occupied_key, [])
        if any(_overlaps(candidate.start, candidate.end, start, end) for start, end in occupied):
            continue

        selected.append(candidate)
        selected_asset_ids.add(candidate.asset.id)
        occupied.append((candidate.start, candidate.end))

    return selected


def _iter_full_prompt_binding_candidate_spans(
    prompt: str, assets: Iterable[JimengAsset]
) -> Iterable[_CandidateSpan]:
    assets = list(assets)
    for asset in assets:
        if asset.type not in (JimengAssetType.character, JimengAssetType.scene):
            continue
        for keyword in _asset_keywords(asset):
            yield from _iter_normalized_keyword_spans(prompt, asset, keyword)

    # 道具继续遵循“道具：”结构化列表，避免普通叙述里的常用物品被误绑定。
    for span in _iter_structured_candidate_spans(
        prompt,
        [asset for asset in assets if asset.type == JimengAssetType.prop],
    ):
        yield span


def _iter_structured_candidate_spans(prompt: str, assets: Iterable[JimengAsset]) -> Iterable[_CandidateSpan]:
    assets_by_type: dict[JimengAssetType, list[JimengAsset]] = {
        JimengAssetType.character: [],
        JimengAssetType.scene: [],
        JimengAssetType.prop: [],
    }
    for asset in assets:
        assets_by_type.setdefault(asset.type, []).append(asset)

    for asset_type in (JimengAssetType.character, JimengAssetType.scene, JimengAssetType.prop):
        for token in _structured_tokens(prompt, asset_type):
            matches = [
                _CandidateSpan(asset=asset, text=token.match_text, start=token.start, end=token.end)
                for asset in assets_by_type.get(asset_type, [])
                if _asset_matches_structured_token(asset, token, asset_type)
            ]
            matches.sort(key=lambda span: (-(span.end - span.start), span.asset.id))
            if not matches:
                continue
            yield matches[0]
            if asset_type == JimengAssetType.scene:
                break


def _structured_tokens(prompt: str, asset_type: JimengAssetType) -> list[_StructuredToken]:
    tokens: list[_StructuredToken] = []
    for value, value_start in _structured_field_values(prompt, _STRUCTURED_FIELD_NAMES[asset_type]):
        token_start = 0
        for separator in _NAME_SPLIT_PATTERN.finditer(value):
            tokens.extend(_clean_structured_token(value, value_start, token_start, separator.start(), asset_type))
            token_start = separator.end()
        tokens.extend(_clean_structured_token(value, value_start, token_start, len(value), asset_type))
    return tokens


def _structured_field_values(prompt: str, field_name: str) -> Iterable[tuple[str, int]]:
    markers = list(_STRUCTURED_FIELD_MARKER_PATTERN.finditer(prompt))
    for index, marker in enumerate(markers):
        if marker.group(1) != field_name:
            continue

        value_start = marker.end()
        line_end = prompt.find("\n", value_start)
        if line_end == -1:
            line_end = len(prompt)

        # 同一物理行里可能连续出现“场景：...。人物：...”，
        # 当前字段必须在下一个结构化字段前结束，不能吞掉后续人物或站位信息。
        next_marker_start = markers[index + 1].start() if index + 1 < len(markers) else len(prompt)
        value_end = min(line_end, next_marker_start)
        yield prompt[value_start:value_end], value_start


def _clean_structured_token(
    value: str,
    value_start: int,
    start: int,
    end: int,
    asset_type: JimengAssetType,
) -> list[_StructuredToken]:
    cleaned = _clean_name_token_span(value, value_start, start, end)
    if not cleaned:
        return []
    token_text, token_start, token_end = cleaned[0]
    if asset_type != JimengAssetType.scene:
        return [_StructuredToken(text=token_text, match_text=token_text, start=token_start, end=token_end)]

    return _scene_structured_tokens(token_text, token_start)


def _scene_structured_tokens(token_text: str, token_start: int) -> list[_StructuredToken]:
    tokens: list[_StructuredToken] = []
    seen_spans: set[tuple[int, int, str]] = set()

    def append_token(text: str, start: int) -> None:
        match_text = _strip_bracket_qualification(text)
        if not match_text or _is_scene_context_token(match_text):
            return
        end = start + len(match_text)
        identity = (start, end, _normalize_name_for_match(match_text))
        if identity in seen_spans:
            return
        seen_spans.add(identity)
        tokens.append(_StructuredToken(text=text, match_text=match_text, start=start, end=end))

    append_token(token_text, token_start)

    # 场景字段常写成“外 场景名 冬至上午”，空格两侧是环境说明，
    # 只把完整分段作为候选，避免把“大门”误匹配到更长的场景名中。
    for part in re.finditer(r"\S+", token_text):
        append_token(part.group(0), token_start + part.start())

    return tokens


def _is_scene_context_token(value: str) -> bool:
    normalized_tokens = {_normalize_name_for_match(token) for token in _SCENE_CONTEXT_TOKENS}
    return _normalize_name_for_match(value) in normalized_tokens


def _strip_bracket_qualification(value: str) -> str:
    first_bracket = min((index for index, ch in enumerate(value) if ch in _BRACKET_OPEN_CHARS), default=-1)
    return value if first_bracket == -1 else value[:first_bracket].strip()


def _asset_matches_structured_token(asset: JimengAsset, token: _StructuredToken, asset_type: JimengAssetType) -> bool:
    accepted_tokens = [token.text]
    if asset_type == JimengAssetType.scene:
        accepted_tokens.insert(0, token.match_text)
    accepted = {_normalize_name_for_match(item) for item in accepted_tokens}
    accepted.discard("")
    return any(_normalize_name_for_match(keyword) in accepted for keyword in _asset_keywords(asset))


def _iter_candidate_spans(prompt: str, assets: Iterable[JimengAsset]) -> Iterable[_CandidateSpan]:
    character_name_spans = _prompt_character_name_spans(prompt)
    for asset in assets:
        if asset.type == JimengAssetType.character:
            yield from _iter_character_candidate_spans(prompt, asset, character_name_spans)
            continue
        for keyword in _asset_keywords(asset):
            start = prompt.find(keyword)
            while start != -1:
                end = start + len(keyword)
                yield _CandidateSpan(asset=asset, text=keyword, start=start, end=end)
                start = prompt.find(keyword, start + 1)


def _iter_character_candidate_spans(
    prompt: str, asset: JimengAsset, character_name_spans: list[tuple[str, int, int]]
) -> Iterable[_CandidateSpan]:
    keywords = _asset_keywords(asset)
    if not keywords:
        return

    normalized_keywords = {_normalize_name_for_match(keyword) for keyword in keywords}
    normalized_keywords.discard("")

    if character_name_spans:
        for name, start, end in character_name_spans:
            if _normalize_name_for_match(name) in normalized_keywords:
                yield _CandidateSpan(asset=asset, text=prompt[start:end], start=start, end=end)
        return

    for keyword in keywords:
        yield from _iter_normalized_keyword_spans(prompt, asset, keyword)


def _prompt_character_name_spans(prompt: str) -> list[tuple[str, int, int]]:
    spans: list[tuple[str, int, int]] = []
    for value, value_start in _structured_field_values(prompt, "人物"):
        token_start = 0
        for separator in _NAME_SPLIT_PATTERN.finditer(value):
            spans.extend(_clean_name_token_span(value, value_start, token_start, separator.start()))
            token_start = separator.end()
        spans.extend(_clean_name_token_span(value, value_start, token_start, len(value)))
    return spans


def _clean_name_token_span(value: str, value_start: int, start: int, end: int) -> list[tuple[str, int, int]]:
    edge_chars = _NAME_QUOTE_CHARS + _NAME_EDGE_PUNCTUATION
    while start < end and (value[start].isspace() or value[start] in edge_chars):
        start += 1
    while end > start and (value[end - 1].isspace() or value[end - 1] in edge_chars):
        end -= 1
    if start >= end:
        return []
    return [(value[start:end], value_start + start, value_start + end)]


def _normalize_name_for_match(value: str) -> str:
    return "".join(ch for ch in value.strip().translate(_BRACKET_TRANSLATION).casefold() if not ch.isspace())


def _iter_normalized_keyword_spans(prompt: str, asset: JimengAsset, keyword: str) -> Iterable[_CandidateSpan]:
    normalized_prompt, offsets = _normalize_text_with_offsets(prompt)
    normalized_keyword = _normalize_name_for_match(keyword)
    if not normalized_keyword:
        return

    normalized_start = normalized_prompt.find(normalized_keyword)
    while normalized_start != -1:
        normalized_end = normalized_start + len(normalized_keyword)
        start = offsets[normalized_start]
        end = offsets[normalized_end - 1] + 1
        if asset.type != JimengAssetType.character or _is_valid_character_fallback_span(prompt, start, end):
            yield _CandidateSpan(asset=asset, text=prompt[start:end], start=start, end=end)
        normalized_start = normalized_prompt.find(normalized_keyword, normalized_start + 1)


def _normalize_text_with_offsets(text: str) -> tuple[str, list[int]]:
    chars: list[str] = []
    offsets: list[int] = []
    for index, ch in enumerate(text):
        if ch.isspace():
            continue
        chars.append(ch.translate(_BRACKET_TRANSLATION).casefold())
        offsets.append(index)
    return "".join(chars), offsets


def _is_valid_character_fallback_span(prompt: str, start: int, end: int) -> bool:
    next_index = end
    while next_index < len(prompt) and prompt[next_index].isspace():
        next_index += 1
    if next_index < len(prompt) and prompt[next_index] in _BRACKET_OPEN_CHARS:
        return False
    return True


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
