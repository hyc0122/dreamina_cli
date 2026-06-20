import type { JimengAsset, JimengAssetType, JimengCharacterKind, JimengStylePreset } from "@/lib/jimengApi";
import type { LlmModelOption } from "@/components/jimeng/llm/modelOptions";

export const IMAGE_MODELS = [
  { value: "dreamina4.0", label: "Dreamina 4.0" },
  { value: "dreamina4.1", label: "Dreamina 4.1" },
  { value: "dreamina4.5", label: "Dreamina 4.5" },
  { value: "dreamina4.6", label: "Dreamina 4.6" },
  { value: "dreamina4.7", label: "Dreamina 4.7" },
  { value: "dreamina5.0", label: "Dreamina 5.0" },
];

const ASSET_IMAGE_SETTINGS_KEY = "dreamina_cli_asset_image_settings";
const PROMPT_LABEL_RE = /^\s*【[^】]+】\s*$/;

export type AssetImageRatio = "16:9" | "9:16";
export type AssetStylePromptField =
  | "globalStylePrompt"
  | "singleCharacterStylePrompt"
  | "groupCharacterStylePrompt"
  | "sceneStylePrompt";

export interface AssetImageSettings {
  resolutionType: "2k" | "4k";
  defaultImageRatio: AssetImageRatio;
  imageModelValue: string;
  globalStylePrompt: string;
  singleCharacterStylePrompt: string;
  groupCharacterStylePrompt: string;
  sceneStylePrompt: string;
  characterPromptPrefix: string;
  scenePromptPrefix: string;
  propPromptPrefix: string;
}

export const DEFAULT_IMAGE_SETTINGS: AssetImageSettings = {
  resolutionType: "2k",
  defaultImageRatio: "16:9",
  imageModelValue: "",
  globalStylePrompt: "统一画风，干净背景，主体清晰，适合作为漫剧资产参考图。",
  singleCharacterStylePrompt: "",
  groupCharacterStylePrompt: "",
  sceneStylePrompt: "",
  characterPromptPrefix: "角色资产图：保持人物五官、服装、发型稳定，适合作为后续视频参考。",
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
const normalizeImageSettings = (raw: Partial<AssetImageSettings> & { imagePromptTemplate?: string } = {}): AssetImageSettings => {
  const { imagePromptTemplate, ...rest } = raw;
  const migratedGlobalStyle = raw.globalStylePrompt ?? imagePromptTemplate ?? DEFAULT_IMAGE_SETTINGS.globalStylePrompt;
  return {
    ...DEFAULT_IMAGE_SETTINGS,
    ...rest,
    globalStylePrompt: migratedGlobalStyle,
    singleCharacterStylePrompt: raw.singleCharacterStylePrompt ?? "",
    groupCharacterStylePrompt: raw.groupCharacterStylePrompt ?? "",
    sceneStylePrompt: raw.sceneStylePrompt ?? "",
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
      ? settings.characterPromptPrefix
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
