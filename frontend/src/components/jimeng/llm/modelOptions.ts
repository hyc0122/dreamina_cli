import type { JimengLlmSettings } from "@/lib/jimengApi";

export interface LlmModelOption {
  value: string;
  label: string;
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  type: string;
}

export const encodeLlmModelValue = (providerId: string, modelId: string): string =>
  `llm:${encodeURIComponent(providerId)}:${encodeURIComponent(modelId)}`;

export const parseLlmModelValue = (value: string): { providerId: string; modelId: string } | null => {
  if (!value.startsWith("llm:")) {
    return null;
  }
  const [, providerId, modelId] = value.split(":");
  if (!providerId || !modelId) {
    return null;
  }
  return {
    providerId: decodeURIComponent(providerId),
    modelId: decodeURIComponent(modelId),
  };
};

export const buildLlmModelOptions = (settings: JimengLlmSettings | null | undefined, type: "image" | "video"): LlmModelOption[] =>
  (settings?.providers ?? []).flatMap((provider) =>
    provider.models
      .filter((model) => provider.enabled && model.enabled && model.type === type)
      .map((model) => ({
        value: encodeLlmModelValue(provider.id, model.id),
        label: `${provider.name} / ${model.name}`,
        providerId: provider.id,
        providerName: provider.name,
        modelId: model.id,
        modelName: model.name,
        type: model.type,
      })),
  );
