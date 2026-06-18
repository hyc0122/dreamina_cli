import type { JimengLlmProviderSetting, JimengLlmSettings } from "@/lib/jimengApi";

export const JIASU_API_BASE_URL = "https://api.lk888.ai/api";

export const createDefaultLlmProviders = (): JimengLlmProviderSetting[] => [
  {
    id: "jiasuapi",
    name: "佳速 API",
    kind: "openai_compatible",
    enabled: false,
    base_url: JIASU_API_BASE_URL,
    api_key: "",
    models: [
      { id: "gpt-4o", name: "GPT-4o", type: "text", enabled: true },
      { id: "gpt-4.1", name: "GPT-4.1", type: "text", enabled: true },
      { id: "gpt-5.1", name: "GPT-5.1", type: "text", enabled: true },
      { id: "gpt-5.2", name: "GPT-5.2", type: "text", enabled: true },
      { id: "gpt-5.4", name: "GPT-5.4", type: "image", enabled: true },
    ],
  },
];

export const DEFAULT_LLM_SETTINGS: JimengLlmSettings = {
  default_provider_id: "jiasuapi",
  default_model_id: "gpt-5.4",
  providers: createDefaultLlmProviders(),
  asset_image: {
    global_prompt: "",
    character_prefix: "角色设定图",
    scene_prefix: "场景设定图",
    prop_prefix: "道具设定图",
    size: "1024x576",
  },
};

export const normalizeLlmSettings = (settings?: Partial<JimengLlmSettings>): JimengLlmSettings => {
  const providers = settings?.providers?.length ? settings.providers : createDefaultLlmProviders();
  const defaultProviderId = settings?.default_provider_id || providers[0]?.id || DEFAULT_LLM_SETTINGS.default_provider_id;
  const provider = providers.find((item) => item.id === defaultProviderId) ?? providers[0];
  return {
    ...DEFAULT_LLM_SETTINGS,
    ...settings,
    default_provider_id: defaultProviderId,
    default_model_id:
      settings?.default_model_id ||
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

