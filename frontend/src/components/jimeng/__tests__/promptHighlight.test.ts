import { describe, expect, it } from "vitest";
import type { JimengHighlightSpan } from "@/lib/jimengApi";
import { buildPromptSegments } from "../promptHighlight";

const span = (
  text: string,
  asset_type: JimengHighlightSpan["asset_type"],
  start: number,
  end: number,
): JimengHighlightSpan => ({ text, asset_type, start, end });

describe("buildPromptSegments", () => {
  it("splits plain text around ordered character, scene, and prop highlights", () => {
    const prompt = "阿晴走进旧车站，拿起银色钥匙。";

    expect(
      buildPromptSegments(prompt, [
        span("银色钥匙", "prop", 10, 14),
        span("阿晴", "character", 0, 2),
        span("旧车站", "scene", 4, 7),
      ]),
    ).toEqual([
      { kind: "character", text: "阿晴", start: 0, end: 2 },
      { kind: "text", text: "走进" },
      { kind: "scene", text: "旧车站", start: 4, end: 7 },
      { kind: "text", text: "，拿起" },
      { kind: "prop", text: "银色钥匙", start: 10, end: 14 },
      { kind: "text", text: "。" },
    ]);
  });

  it("returns one text segment when highlights are empty", () => {
    expect(buildPromptSegments("无匹配提示词", [])).toEqual([{ kind: "text", text: "无匹配提示词" }]);
  });

  it("ignores empty, out-of-bounds, and overlapping highlights", () => {
    const prompt = "角色在雨巷里举伞";

    expect(
      buildPromptSegments(prompt, [
        span("", "character", 0, 0),
        span("越界", "prop", -1, 2),
        span("雨巷", "scene", 3, 5),
        span("重叠", "character", 4, 7),
        span("举伞", "prop", 6, 8),
        span("越界", "scene", 8, 20),
      ]),
    ).toEqual([
      { kind: "text", text: "角色在" },
      { kind: "scene", text: "雨巷", start: 3, end: 5 },
      { kind: "text", text: "里" },
      { kind: "prop", text: "举伞", start: 6, end: 8 },
    ]);
  });
});
