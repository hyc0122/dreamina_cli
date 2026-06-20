"use client";

import { ExternalLink, Loader2, Save, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import LlmProviderPanel from "@/components/jimeng/llm/LlmProviderPanel";
import { DEFAULT_LLM_SETTINGS, normalizeLlmSettings } from "@/components/jimeng/llm/llmDefaults";
import { jimengApi, type JimengLlmSettings } from "@/lib/jimengApi";

const JIASU_OFFICIAL_URL = "https://jiasuapi.com/";

const errorMessageFrom = (error: unknown, fallback: string) => {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
};

export default function LlmSettingsPage() {
  const [settings, setSettings] = useState<JimengLlmSettings>(() => normalizeLlmSettings(DEFAULT_LLM_SETTINGS));
  const [activeProviderId, setActiveProviderId] = useState(DEFAULT_LLM_SETTINGS.default_provider_id);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = normalizeLlmSettings(await jimengApi.getLlmSettings());
      setSettings(loaded);
      setActiveProviderId((current) => (loaded.providers.some((provider) => provider.id === current) ? current : loaded.default_provider_id));
    } catch (caught) {
      setError(errorMessageFrom(caught, "大模型设置加载失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveSettings = async () => {
    setLoading(true);
    setNotice(null);
    setError(null);
    try {
      const saved = normalizeLlmSettings(await jimengApi.updateLlmSettings(settings));
      setSettings(saved);
      setNotice("大模型设置已保存");
    } catch (caught) {
      setError(errorMessageFrom(caught, "大模型设置保存失败"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="flex min-h-0 flex-col gap-4 pb-4">
        <section className="glass-panel sticky top-0 z-20 rounded-xl bg-app-bg/95 px-5 py-4 backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <Sparkles size={14} />
                LLM Asset Image
              </div>
              <h2 className="mt-2 font-display text-xl font-semibold text-foreground sm:text-2xl">大模型设置</h2>
              <p className="mt-2 text-sm text-text-secondary">独立配置佳速 API / OpenAI 兼容接口，目前只用于资产图片纯文本生图。</p>
              <p className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200">
                大模型接口未完全适配，视频模型目前只做参数选择展示，提交前请先小范围验证。
              </p>
              <a
                href={JIASU_OFFICIAL_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80"
              >
                佳速 API 官方地址：https://jiasuapi.com/
                <ExternalLink size={13} />
              </a>
            </div>
            <button
              type="button"
              onClick={saveSettings}
              disabled={loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-4 text-sm font-medium text-primary hover:bg-primary/15 disabled:cursor-wait disabled:opacity-45"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              保存设置
            </button>
          </div>
          {(notice || error) && (
            <p
              className={`mt-3 rounded-md border px-3 py-2 text-sm ${
                error ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
              }`}
            >
              {error ?? notice}
            </p>
          )}
        </section>

        <LlmProviderPanel
          providers={settings.providers}
          activeProviderId={activeProviderId}
          defaultProviderId={settings.default_provider_id}
          defaultModelId={settings.default_model_id}
          onActiveProviderChange={setActiveProviderId}
          onProvidersChange={(providers) => {
            const normalized = normalizeLlmSettings({ ...settings, providers });
            setSettings(normalized);
          }}
          onDefaultChange={(providerId, modelId) => setSettings((state) => ({ ...state, default_provider_id: providerId, default_model_id: modelId }))}
        />

        <section className="glass-panel rounded-xl p-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold text-foreground">资产图片生图默认项</h3>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                这里是大模型接口侧的兜底画风和图片尺寸；资产管理里的“生图设置”是操作侧画风。
                实际生图会把两处提示词与资产详情描述拼接后发送，不是互相覆盖或冲突。
              </p>
            </div>
            <span className="rounded-md border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs text-primary">纯文本生图</span>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <label className="space-y-2 lg:col-span-2">
              <span className="text-xs font-medium text-text-muted">默认画风提示词</span>
              <textarea
                value={settings.asset_image.global_prompt}
                onChange={(event) =>
                  setSettings((state) => ({ ...state, asset_image: { ...state.asset_image, global_prompt: event.target.value } }))
                }
                className="glass-input min-h-[96px] w-full resize-y text-sm leading-6 text-foreground"
                placeholder="例如：高质量资产设定图，干净背景，主体清晰，细节稳定"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium text-text-muted">图片尺寸</span>
              <input
                value={settings.asset_image.size}
                onChange={(event) => setSettings((state) => ({ ...state, asset_image: { ...state.asset_image, size: event.target.value } }))}
                className="glass-input h-10 w-full font-mono text-sm text-foreground"
                placeholder="2560x1440"
              />
              <span className="block text-xs leading-5 text-text-muted">按图片接口传给 size 字段。</span>
            </label>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {[
              ["character_prefix", "人物前缀提示词"],
              ["scene_prefix", "场景前缀提示词"],
              ["prop_prefix", "道具前缀提示词"],
            ].map(([key, label]) => (
              <label key={key} className="space-y-2">
                <span className="text-xs font-medium text-text-muted">{label}</span>
                <textarea
                  value={settings.asset_image[key as keyof typeof settings.asset_image]}
                  onChange={(event) =>
                    setSettings((state) => ({
                      ...state,
                      asset_image: { ...state.asset_image, [key]: event.target.value },
                    }))
                  }
                  className="glass-input min-h-[84px] w-full resize-y text-sm leading-6 text-foreground"
                />
              </label>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}