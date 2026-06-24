import type { JimengAsset, JimengAssetType, JimengCharacterKind, JimengStylePreset } from "@/lib/jimengApi";
import type { LlmModelOption } from "@/components/jimeng/llm/modelOptions";

const ASSET_IMAGE_SETTINGS_KEY = "dreamina_cli_asset_image_settings";
const PROMPT_LABEL_RE = /^\s*【[^】]+】\s*$/;

export type AssetImageRatio = "16:9" | "9:16";
export type AssetImageQuality = "auto" | "high" | "medium" | "low";
export type AssetStylePromptField =
  | "globalStylePrompt"
  | "singleCharacterStylePrompt"
  | "groupCharacterStylePrompt"
  | "sceneStylePrompt";

export interface AssetImageSettings {
  resolutionType: "2k" | "4k";
  defaultImageRatio: AssetImageRatio;
  imageQuality: AssetImageQuality;
  imageModelValue: string;
  globalStylePrompt: string;
  styleReferenceImages: string[];
  styleReferenceUseCharacter: boolean;
  styleReferenceUseScene: boolean;
  singleCharacterStylePrompt: string;
  groupCharacterStylePrompt: string;
  sceneStylePrompt: string;
  singleCharacterPromptPrefix: string;
  groupCharacterPromptPrefix: string;
  scenePromptPrefix: string;
  propPromptPrefix: string;
}

export const DEFAULT_IMAGE_SETTINGS: AssetImageSettings = {
  resolutionType: "2k",
  defaultImageRatio: "16:9",
  imageQuality: "high",
  imageModelValue: "",
  globalStylePrompt: "统一画风，干净背景，主体清晰，适合作为漫剧资产参考图。",
  styleReferenceImages: [],
  styleReferenceUseCharacter: false,
  styleReferenceUseScene: false,
  singleCharacterStylePrompt: "",
  groupCharacterStylePrompt: "",
  sceneStylePrompt: "",
  singleCharacterPromptPrefix: "单人角色资产图：保持人物五官、服装、发型稳定，适合作为后续视频参考。",
  groupCharacterPromptPrefix: "群演角色资产图：适合背景人物或配角群像，弱化主角感，服装层次清晰，面部差异明确。",
  scenePromptPrefix: "场景资产图：强调空间结构、光线、可复用背景，不要出现主体人物。",
  propPromptPrefix: "道具资产图：单体道具清晰居中，材质细节明确，背景简洁。",
};

export interface AssetFormState {
  name: string;
  aliasesText: string;
  description: string;
  imageRatio: AssetImageRatio;
  characterKind: JimengCharacterKind;
}

export type AssetViewMode = "compact" | "large" | "list";
export type AssetStyleDraft = Pick<JimengStylePreset, "name" | "prompt" | "scope" | "accent"> & { id?: string };

export const CHARACTER_KIND_LABELS: Record<JimengCharacterKind, string> = {
  single: "单人",
  group: "群演",
};

export const ASSET_IMAGE_QUALITY_OPTIONS: Array<{ value: AssetImageQuality; label: string }> = [
  { value: "high", label: "高 high" },
  { value: "medium", label: "中 medium" },
  { value: "low", label: "低 low" },
  { value: "auto", label: "自动 auto" },
];

const STYLE_ACCENTS = ["#6478ff", "#22c55e", "#f59e0b", "#a855f7", "#06b6d4", "#ef4444", "#84cc16", "#ec4899"];

export const randomStyleAccent = () => STYLE_ACCENTS[Math.floor(Math.random() * STYLE_ACCENTS.length)];

export const assetStyleDraftFromPreset = (preset: JimengStylePreset): AssetStyleDraft => ({
  id: preset.id,
  name: preset.name,
  prompt: preset.prompt,
  scope: "image",
  accent: preset.accent || "#6478ff",
});

export const normalizeCharacterKind = (value: unknown): JimengCharacterKind => {
  const normalized = String(value ?? "single").trim().toLowerCase();
  return ["group", "extras", "extra", "crowd", "群演"].includes(normalized) ? "group" : "single";
};

export const sanitizePromptPart = (value: string): string =>
  String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !PROMPT_LABEL_RE.test(line))
    .join("\n")
    .trim();

export const appendPromptPart = (current: string, next: string): string => {
  const prompt = sanitizePromptPart(next);
  if (!prompt) {
    return sanitizePromptPart(current);
  }
  const existing = sanitizePromptPart(current);
  if (existing.split(/\n{2,}|\n/).map((item) => item.trim()).includes(prompt)) {
    return existing;
  }
  return [existing, prompt].filter(Boolean).join("\n");
};

export const splitAliases = (value: string): string[] =>
  value
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

export const splitReferenceImageUrls = (value: string): string[] =>
  value
    .split(/[\n,，、\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);

export const normalizeReferenceImageUrls = (value: unknown): string[] => {
  const values = Array.isArray(value) ? value : [value];
  const urls = values.flatMap((item) => splitReferenceImageUrls(String(item ?? "")));
  return urls.filter((url, index) => urls.indexOf(url) === index).slice(0, 10);
};
export interface ReferenceImageUrlAddResult {
  urls: string[];
  added: string[];
  invalid: string[];
  duplicateCount: number;
  skippedByLimit: number;
}

const isHttpImageReferenceUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const addReferenceImageUrls = (current: unknown, input: string, limit = 10): ReferenceImageUrlAddResult => {
  const existing = normalizeReferenceImageUrls(current);
  const candidates = splitReferenceImageUrls(input);
  const urls = [...existing];
  const added: string[] = [];
  const invalid: string[] = [];
  let duplicateCount = 0;
  let skippedByLimit = 0;

  for (const candidate of candidates) {
    if (!isHttpImageReferenceUrl(candidate)) {
      invalid.push(candidate);
      continue;
    }
    if (urls.includes(candidate) || added.includes(candidate)) {
      duplicateCount += 1;
      continue;
    }
    if (urls.length >= limit) {
      skippedByLimit += 1;
      continue;
    }
    urls.push(candidate);
    added.push(candidate);
  }

  return { urls, added, invalid, duplicateCount, skippedByLimit };
};

export const referenceImagesForAssetType = (settings: AssetImageSettings, assetType: JimengAssetType): string[] => {
  if (assetType === "character" && settings.styleReferenceUseCharacter) {
    return normalizeReferenceImageUrls(settings.styleReferenceImages);
  }
  if (assetType === "scene" && settings.styleReferenceUseScene) {
    return normalizeReferenceImageUrls(settings.styleReferenceImages);
  }
  return [];
};

export const formatUpdatedAt = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const requestErrorMessage = (error: unknown, fallback: string): string => {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  return error instanceof Error ? error.message : fallback;
};

export const formFromAsset = (asset: JimengAsset): AssetFormState => ({
  name: asset.name,
  aliasesText: asset.aliases.join(", "),
  description: asset.description ?? "",
  imageRatio: asset.image_ratio === "9:16" ? "9:16" : "16:9",
  characterKind: normalizeCharacterKind(asset.character_kind),
});

export const assetImageSizeFromSettings = (
  resolutionType: AssetImageSettings["resolutionType"],
  imageRatio: AssetImageRatio,
): string => {
  if (resolutionType === "4k") {
    return imageRatio === "9:16" ? "2160x3840" : "3840x2160";
  }
  return imageRatio === "9:16" ? "1440x2560" : "2560x1440";
};
const normalizeImageSettings = (
  raw: Partial<AssetImageSettings> & { imagePromptTemplate?: string; characterPromptPrefix?: string } = {},
): AssetImageSettings => {
  const { imagePromptTemplate, characterPromptPrefix, ...rest } = raw;
  const migratedGlobalStyle = raw.globalStylePrompt ?? imagePromptTemplate ?? DEFAULT_IMAGE_SETTINGS.globalStylePrompt;
  const migratedSingleCharacterPromptPrefix =
    raw.singleCharacterPromptPrefix ?? characterPromptPrefix ?? DEFAULT_IMAGE_SETTINGS.singleCharacterPromptPrefix;
  return {
    ...DEFAULT_IMAGE_SETTINGS,
    ...rest,
    globalStylePrompt: migratedGlobalStyle,
    styleReferenceImages: normalizeReferenceImageUrls(raw.styleReferenceImages),
    styleReferenceUseCharacter: raw.styleReferenceUseCharacter === true,
    styleReferenceUseScene: raw.styleReferenceUseScene === true,
    singleCharacterStylePrompt: raw.singleCharacterStylePrompt ?? "",
    groupCharacterStylePrompt: raw.groupCharacterStylePrompt ?? "",
    sceneStylePrompt: raw.sceneStylePrompt ?? "",
    singleCharacterPromptPrefix: migratedSingleCharacterPromptPrefix,
    groupCharacterPromptPrefix: raw.groupCharacterPromptPrefix ?? DEFAULT_IMAGE_SETTINGS.groupCharacterPromptPrefix,
  };
};

export const readImageSettings = (): AssetImageSettings => {
  if (typeof window === "undefined") {
    return DEFAULT_IMAGE_SETTINGS;
  }
  try {
    const raw = window.localStorage.getItem(ASSET_IMAGE_SETTINGS_KEY);
    return raw ? normalizeImageSettings(JSON.parse(raw)) : DEFAULT_IMAGE_SETTINGS;
  } catch {
    return DEFAULT_IMAGE_SETTINGS;
  }
};

export const writeImageSettings = (settings: AssetImageSettings) => {
  if (typeof window !== "undefined") {
    const normalized = normalizeImageSettings(settings);
    window.localStorage.setItem(ASSET_IMAGE_SETTINGS_KEY, JSON.stringify(normalized));
  }
};

export const resolveAssetImageModelOption = (
  settings: AssetImageSettings,
  imageModelOptions: LlmModelOption[],
  fallbackImageModelValue = "",
): LlmModelOption | null => {
  const saved = settings.imageModelValue ? imageModelOptions.find((model) => model.value === settings.imageModelValue) : null;
  if (saved) {
    return saved;
  }
  const fallback = fallbackImageModelValue
    ? imageModelOptions.find((model) => model.value === fallbackImageModelValue)
    : null;
  return fallback ?? imageModelOptions[0] ?? null;
};

export const assetImageModelLabel = (model: LlmModelOption | null): string => model?.label ?? "未选择可用模型";

export const assetGroupKey = (asset: JimengAsset): string => {
  const base = asset.name.split(/[-_—：:]/)[0]?.trim();
  return base || asset.name;
};

export const imagePromptForAsset = (
  settings: AssetImageSettings,
  assetType: JimengAssetType,
  characterKind: JimengCharacterKind = "single",
): string => {
  const typePrefix =
    assetType === "character"
      ? normalizeCharacterKind(characterKind) === "group"
        ? settings.groupCharacterPromptPrefix
        : settings.singleCharacterPromptPrefix
      : assetType === "scene"
        ? settings.scenePromptPrefix
        : settings.propPromptPrefix;
  const scopedStyle =
    assetType === "character"
      ? normalizeCharacterKind(characterKind) === "group"
        ? settings.groupCharacterStylePrompt
        : settings.singleCharacterStylePrompt
      : assetType === "scene"
        ? settings.sceneStylePrompt
        : "";
  return [typePrefix, settings.globalStylePrompt, scopedStyle].map(sanitizePromptPart).filter(Boolean).join("\n");
};
