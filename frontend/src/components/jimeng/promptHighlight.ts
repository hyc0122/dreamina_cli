import type { JimengAssetType, JimengHighlightSpan } from "@/lib/jimengApi";

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

const isValidSpan = (promptLength: number, span: JimengHighlightSpan): boolean =>
  Number.isInteger(span.start) &&
  Number.isInteger(span.end) &&
  span.start >= 0 &&
  span.end <= promptLength &&
  span.start < span.end;

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
