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

      </div>
    </div>
  );
}
