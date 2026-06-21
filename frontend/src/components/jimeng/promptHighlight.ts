import type { JimengAsset, JimengAssetType, JimengHighlightSpan } from "@/lib/jimengApi";

export type PromptTextSegment = {
  kind: "text";
  text: string;
};

export type PromptHighlightSegment = {
  kind: JimengAssetType;
  text: string;
  start: number;
  end: number;
};

export type PromptSegment = PromptTextSegment | PromptHighlightSegment;

type CandidateSpan = {
  assetId: string;
  assetType: JimengAssetType;
  start: number;
  end: number;
};

const CHARACTER_FIELD_PATTERN = /^[ \t]*人物[ \t]*[：:][ \t]*(.*)$/gm;
const NAME_SPLIT_PATTERN = /[、;,，；]/g;
const NAME_QUOTE_CHARS = new Set(['"', "'", "“", "”", "‘", "’", "「", "」", "『", "』", "《", "》"]);
const BRACKET_MAP: Record<string, string> = {
  "[": "(",
  "【": "(",
  "（": "(",
  "［": "(",
  "]": ")",
  "】": ")",
  "）": ")",
  "］": ")",
};
const BRACKET_OPEN_CHARS = new Set(["(", "[", "（", "【", "［"]);
const ASSET_TYPE_PRIORITY: Record<JimengAssetType, number> = {
  character: 0,
  scene: 1,
  prop: 2,
};

const isValidSpan = (promptLength: number, span: JimengHighlightSpan): boolean =>
  Number.isInteger(span.start) &&
  Number.isInteger(span.end) &&
  span.start >= 0 &&
  span.end <= promptLength &&
  span.start < span.end;

const overlaps = (firstStart: number, firstEnd: number, secondStart: number, secondEnd: number): boolean =>
  firstStart < secondEnd && secondStart < firstEnd;

const normalizeNameForMatch = (value: string): string =>
  [...value.trim()].map((char) => BRACKET_MAP[char] ?? char).filter((char) => !/\s/.test(char)).join("").toLowerCase();

const normalizeTextWithOffsets = (text: string): { text: string; offsets: number[] } => {
  const chars: string[] = [];
  const offsets: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/\s/.test(char)) {
      continue;
    }
    chars.push((BRACKET_MAP[char] ?? char).toLowerCase());
    offsets.push(index);
  }

  return { text: chars.join(""), offsets };
};

const assetKeywords = (asset: JimengAsset): string[] => {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const value of [asset.name, ...asset.aliases]) {
    const keyword = value.trim();
    if (!keyword || seen.has(keyword)) {
      continue;
    }
    seen.add(keyword);
    keywords.push(keyword);
  }

  return keywords.sort((left, right) => right.length - left.length);
};

const cleanNameTokenSpan = (value: string, valueStart: number, start: number, end: number): { text: string; start: number; end: number }[] => {
  while (start < end && (/\s/.test(value[start]) || NAME_QUOTE_CHARS.has(value[start]))) {
    start += 1;
  }
  while (end > start && (/\s/.test(value[end - 1]) || NAME_QUOTE_CHARS.has(value[end - 1]))) {
    end -= 1;
  }
  if (start >= end) {
    return [];
  }
  return [{ text: value.slice(start, end), start: valueStart + start, end: valueStart + end }];
};

const promptCharacterNameSpans = (prompt: string): { text: string; start: number; end: number }[] => {
  const spans: { text: string; start: number; end: number }[] = [];
  CHARACTER_FIELD_PATTERN.lastIndex = 0;

  for (const match of prompt.matchAll(CHARACTER_FIELD_PATTERN)) {
    const fullMatch = match[0] ?? "";
    const value = match[1] ?? "";
    const valueStart = (match.index ?? 0) + fullMatch.length - value.length;
    let tokenStart = 0;
    NAME_SPLIT_PATTERN.lastIndex = 0;
    for (const separator of value.matchAll(NAME_SPLIT_PATTERN)) {
      spans.push(...cleanNameTokenSpan(value, valueStart, tokenStart, separator.index ?? tokenStart));
      tokenStart = (separator.index ?? tokenStart) + separator[0].length;
    }
    spans.push(...cleanNameTokenSpan(value, valueStart, tokenStart, value.length));
  }

  return spans;
};

const isValidCharacterFallbackSpan = (prompt: string, start: number, end: number): boolean => {
  let nextIndex = end;
  while (nextIndex < prompt.length && /\s/.test(prompt[nextIndex])) {
    nextIndex += 1;
  }
  return nextIndex >= prompt.length || !BRACKET_OPEN_CHARS.has(prompt[nextIndex]);
};

const normalizedKeywordSpans = (prompt: string, asset: JimengAsset, keyword: string): CandidateSpan[] => {
  const normalizedKeyword = normalizeNameForMatch(keyword);
  if (!normalizedKeyword) {
    return [];
  }

  const normalizedPrompt = normalizeTextWithOffsets(prompt);
  const spans: CandidateSpan[] = [];
  let normalizedStart = normalizedPrompt.text.indexOf(normalizedKeyword);
  while (normalizedStart !== -1) {
    const normalizedEnd = normalizedStart + normalizedKeyword.length;
    const start = normalizedPrompt.offsets[normalizedStart];
    const end = normalizedPrompt.offsets[normalizedEnd - 1] + 1;
    if (isValidCharacterFallbackSpan(prompt, start, end)) {
      spans.push({ assetId: asset.id, assetType: asset.type, start, end });
    }
    normalizedStart = normalizedPrompt.text.indexOf(normalizedKeyword, normalizedStart + 1);
  }

  return spans;
};

const characterCandidateSpans = (
  prompt: string,
  asset: JimengAsset,
  characterNameSpans: { text: string; start: number; end: number }[],
): CandidateSpan[] => {
  const keywords = assetKeywords(asset);
  if (keywords.length === 0) {
    return [];
  }

  const normalizedKeywords = new Set(keywords.map(normalizeNameForMatch).filter(Boolean));
  if (characterNameSpans.length > 0) {
    return characterNameSpans
      .filter((span) => normalizedKeywords.has(normalizeNameForMatch(span.text)))
      .map((span) => ({ assetId: asset.id, assetType: asset.type, start: span.start, end: span.end }));
  }

  return keywords.flatMap((keyword) => normalizedKeywordSpans(prompt, asset, keyword));
};

const exactKeywordSpans = (prompt: string, asset: JimengAsset, keyword: string): CandidateSpan[] => {
  const spans: CandidateSpan[] = [];
  let start = prompt.indexOf(keyword);
  while (start !== -1) {
    spans.push({ assetId: asset.id, assetType: asset.type, start, end: start + keyword.length });
    start = prompt.indexOf(keyword, start + 1);
  }
  return spans;
};

const candidateSpans = (prompt: string, assets: JimengAsset[]): CandidateSpan[] => {
  const characterNameSpans = promptCharacterNameSpans(prompt);
  return assets.flatMap((asset) => {
    if (asset.type === "character") {
      return characterCandidateSpans(prompt, asset, characterNameSpans);
    }
    return assetKeywords(asset).flatMap((keyword) => exactKeywordSpans(prompt, asset, keyword));
  });
};

const selectNonOverlappingSpans = (prompt: string, assets: JimengAsset[]): CandidateSpan[] => {
  const candidates = candidateSpans(prompt, assets).sort(
    (left, right) =>
      right.end - right.start - (left.end - left.start) ||
      ASSET_TYPE_PRIORITY[left.assetType] - ASSET_TYPE_PRIORITY[right.assetType] ||
      left.start - right.start ||
      left.assetId.localeCompare(right.assetId),
  );

  const selected: CandidateSpan[] = [];
  const selectedAssetIds = new Set<string>();
  const occupied: Array<{ start: number; end: number }> = [];

  for (const candidate of candidates) {
    if (selectedAssetIds.has(candidate.assetId)) {
      continue;
    }
    if (occupied.some((span) => overlaps(candidate.start, candidate.end, span.start, span.end))) {
      continue;
    }

    selected.push(candidate);
    selectedAssetIds.add(candidate.assetId);
    occupied.push({ start: candidate.start, end: candidate.end });
  }

  return selected;
};

export function calculatePromptHighlights(prompt: string, assets: JimengAsset[]): JimengHighlightSpan[] {
  return selectNonOverlappingSpans(prompt, assets)
    .sort((left, right) => left.start - right.start)
    .map((span) => ({
      text: prompt.slice(span.start, span.end),
      asset_type: span.assetType,
      start: span.start,
      end: span.end,
    }));
}

export function buildPromptSegments(prompt: string, highlights: JimengHighlightSpan[]): PromptSegment[] {
  if (prompt.length === 0) {
    return [];
  }

  const orderedHighlights = [...highlights]
    .filter((span) => isValidSpan(prompt.length, span))
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const segments: PromptSegment[] = [];
  let cursor = 0;

  for (const highlight of orderedHighlights) {
    if (highlight.start < cursor) {
      continue;
    }

    if (highlight.start > cursor) {
      segments.push({ kind: "text", text: prompt.slice(cursor, highlight.start) });
    }

    segments.push({
      kind: highlight.asset_type,
      text: prompt.slice(highlight.start, highlight.end),
      start: highlight.start,
      end: highlight.end,
    });
    cursor = highlight.end;
  }

  if (cursor < prompt.length) {
    segments.push({ kind: "text", text: prompt.slice(cursor) });
  }

  return segments;
}
