import type { JimengLlmProviderSetting, JimengLlmSettings } from "@/lib/jimengApi";

export const JIASU_API_BASE_URL = "https://api.lk888.ai";
export const JIASU_DEFAULT_IMAGE_MODEL = "gpt-image-2";
export const VOLCENGINE_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
export const VOLCENGINE_ARK_TEXT_MODEL = "doubao-seed-1-6-250615";
export const VOLCENGINE_ARK_VIDEO_MODEL = "doubao-seedance-2-0-fast-260615";

const LEGACY_JIASU_BASE_URLS: Record<string, string> = {
  "https://api.lk888.ai/api": "https://api.lk888.ai",
  "https://api.lk666.ai/api": "https://api.lk666.ai",
};

const LEGACY_JIASU_MODEL_IDS: Record<string, string> = {
  "gpt-5.4": JIASU_DEFAULT_IMAGE_MODEL,
};

export const normalizeProviderBaseUrl = (baseUrl: string) => {
  const value = (baseUrl || "").trim().replace(/\/$/, "");
  return LEGACY_JIASU_BASE_URLS[value] ?? value;
};

export const createDefaultLlmProviders = (): JimengLlmProviderSetting[] => [
  {
    id: "jiasuapi",
    name: "佳速 API",
    kind: "openai_compatible",
    enabled: false,
    base_url: JIASU_API_BASE_URL,
    api_key: "",
    models: [
      { id: JIASU_DEFAULT_IMAGE_MODEL, name: "GPT Image 2", type: "image", enabled: true },
      { id: "gpt-4o", name: "GPT-4o", type: "text", enabled: true },
      { id: "gpt-4.1", name: "GPT-4.1", type: "text", enabled: true },
      { id: "gpt-5.1", name: "GPT-5.1", type: "text", enabled: true },
      { id: "gpt-5.2", name: "GPT-5.2", type: "text", enabled: true },
    ],
  },
  {
    id: "volcengine_ark",
    name: "火山方舟",
    kind: "volcengine_ark",
    enabled: false,
    base_url: VOLCENGINE_ARK_BASE_URL,
    api_key: "",
    models: [
      { id: VOLCENGINE_ARK_TEXT_MODEL, name: "Doubao Seed 1.6", type: "text", enabled: true },
      { id: VOLCENGINE_ARK_VIDEO_MODEL, name: "Seedance 2.0 Fast", type: "video", enabled: true },
    ],
  },
];

export const DEFAULT_LLM_SETTINGS: JimengLlmSettings = {
  default_provider_id: "jiasuapi",
  default_model_id: JIASU_DEFAULT_IMAGE_MODEL,
  providers: createDefaultLlmProviders(),
  asset_image: {
    global_prompt: "",
    character_prefix: "角色设定图",
    scene_prefix: "场景设定图",
    prop_prefix: "道具设定图",
    size: "2560x1440",
  },
};

export const normalizeLlmSettings = (settings?: Partial<JimengLlmSettings>): JimengLlmSettings => {
  const mergedProviders = settings?.providers?.length ? settings.providers : createDefaultLlmProviders();
  const defaultProviders = createDefaultLlmProviders();
  for (const defaultProvider of defaultProviders) {
    if (!mergedProviders.some((provider) => provider.id === defaultProvider.id)) {
      mergedProviders.push(defaultProvider);
    }
  }
  const providers = mergedProviders.map((provider) => ({
    ...provider,
    base_url: normalizeProviderBaseUrl(provider.base_url),
    models:
      provider.id === "jiasuapi"
        ? provider.models.map((model) => {
            const normalizedId = LEGACY_JIASU_MODEL_IDS[model.id] ?? model.id;
            return normalizedId === model.id ? model : { ...model, id: normalizedId, name: "GPT Image 2" };
          })
        : provider.models,
  }));
  const defaultProviderId = settings?.default_provider_id || providers[0]?.id || DEFAULT_LLM_SETTINGS.default_provider_id;
  const provider = providers.find((item) => item.id === defaultProviderId) ?? providers[0];
  const incomingDefaultModelId = settings?.default_model_id ? LEGACY_JIASU_MODEL_IDS[settings.default_model_id] ?? settings.default_model_id : undefined;
  return {
    ...DEFAULT_LLM_SETTINGS,
    ...settings,
    default_provider_id: defaultProviderId,
    default_model_id:
      incomingDefaultModelId ||
      provider?.models.find((model) => model.enabled)?.id ||
      provider?.models[0]?.id ||
      DEFAULT_LLM_SETTINGS.default_model_id,
    providers,
    asset_image: {
      ...DEFAULT_LLM_SETTINGS.asset_image,
      ...(settings?.asset_image ?? {}),
    },
  };
};
