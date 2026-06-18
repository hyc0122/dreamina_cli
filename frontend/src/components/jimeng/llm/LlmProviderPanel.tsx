"use client";

import clsx from "clsx";
import { Eye, EyeOff, Plus, ServerCog, Trash2 } from "lucide-react";
import { useState } from "react";
import type { JimengLlmProviderSetting } from "@/lib/jimengApi";
import { createDefaultLlmProviders } from "@/components/jimeng/llm/llmDefaults";
import LlmModelList from "@/components/jimeng/llm/LlmModelList";

interface LlmProviderPanelProps {
  providers: JimengLlmProviderSetting[];
  activeProviderId: string;
  defaultProviderId: string;
  defaultModelId: string;
  onActiveProviderChange: (providerId: string) => void;
  onProvidersChange: (providers: JimengLlmProviderSetting[]) => void;
  onDefaultChange: (providerId: string, modelId: string) => void;
}

const createProviderId = (providers: JimengLlmProviderSetting[]) => {
  let index = providers.length + 1;
  let id = `provider_${index}`;
  while (providers.some((provider) => provider.id === id)) {
    index += 1;
    id = `provider_${index}`;
  }
  return id;
};

export default function LlmProviderPanel({
  providers,
  activeProviderId,
  defaultProviderId,
  defaultModelId,
  onActiveProviderChange,
  onProvidersChange,
  onDefaultChange,
}: LlmProviderPanelProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const activeProvider = providers.find((provider) => provider.id === activeProviderId) ?? providers[0];

  const updateProvider = (patch: Partial<JimengLlmProviderSetting>) => {
    if (!activeProvider) {
      return;
    }
    onProvidersChange(providers.map((provider) => (provider.id === activeProvider.id ? { ...provider, ...patch } : provider)));
  };

  const addProvider = () => {
    const id = createProviderId(providers);
    onProvidersChange([
      ...providers,
      {
        id,
        name: `模型服务 ${providers.length + 1}`,
        kind: "openai_compatible",
        enabled: false,
        base_url: "",
        api_key: "",
        models: [],
      },
    ]);
    onActiveProviderChange(id);
  };

  const removeProvider = () => {
    if (!activeProvider) {
      return;
    }
    const nextProviders = providers.filter((provider) => provider.id !== activeProvider.id);
    const resolvedProviders = nextProviders.length ? nextProviders : createDefaultLlmProviders();
    onProvidersChange(resolvedProviders);
    onActiveProviderChange(resolvedProviders[0]?.id ?? "");
  };

  return (
    <section className="glass-panel rounded-xl p-5">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <ServerCog size={14} />
            模型服务
          </div>
          <h2 className="mt-2 font-display text-xl font-semibold text-foreground">大模型供应商</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            这里独立管理佳速 API / OpenAI 兼容接口，只用于资产图片纯文本生图，不影响即梦 CLI。
          </p>
        </div>
        <button
          type="button"
          onClick={addProvider}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-4 text-sm font-medium text-primary hover:bg-primary/15"
        >
          <Plus size={15} />
          添加供应商
        </button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-2 rounded-xl border border-glass-border bg-surface-inset p-3">
          {providers.map((provider) => (
            <button
              key={provider.id}
              type="button"
              onClick={() => onActiveProviderChange(provider.id)}
              className={clsx(
                "flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition",
                activeProvider?.id === provider.id
                  ? "border-primary/45 bg-primary/12 text-foreground"
                  : "border-glass-border bg-surface-card/60 text-text-secondary hover:bg-hover-bg",
              )}
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                <ServerCog size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{provider.name}</span>
                <span className="block truncate font-mono text-[11px] text-text-muted">{provider.base_url || "未设置请求地址"}</span>
              </span>
              <span
                className={clsx(
                  "rounded-full border px-2 py-0.5 text-[11px]",
                  provider.enabled ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-glass-border text-text-muted",
                )}
              >
                {provider.enabled ? "启用" : "停用"}
              </span>
            </button>
          ))}
        </div>

        {activeProvider ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-glass-border bg-surface-inset p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <ServerCog size={16} />
                    {activeProvider.name}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-text-muted">API Key 只保存在本地大模型设置文件中。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => updateProvider({ enabled: !activeProvider.enabled })}
                    className={clsx(
                      "inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium",
                      activeProvider.enabled
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                        : "border-glass-border bg-surface-card text-text-secondary",
                    )}
                  >
                    {activeProvider.enabled ? "已启用" : "未启用"}
                  </button>
                  <button
                    type="button"
                    onClick={removeProvider}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-red-400/30 bg-red-500/10 px-3 text-sm font-medium text-red-300 hover:bg-red-500/15"
                  >
                    <Trash2 size={14} />
                    删除
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-medium text-text-muted">供应商名称</span>
                  <input
                    value={activeProvider.name}
                    onChange={(event) => updateProvider({ name: event.target.value })}
                    className="glass-input h-10 w-full text-sm text-foreground"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-text-muted">接口类型</span>
                  <select
                    value={activeProvider.kind}
                    onChange={(event) => updateProvider({ kind: event.target.value })}
                    className="glass-input h-10 w-full text-sm text-foreground"
                  >
                    <option value="openai_compatible">OpenAI 标准接口</option>
                  </select>
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-xs font-medium text-text-muted">请求地址</span>
                  <input
                    value={activeProvider.base_url}
                    onChange={(event) => updateProvider({ base_url: event.target.value })}
                    placeholder="https://api.lk888.ai/api"
                    className="glass-input h-10 w-full font-mono text-sm text-foreground"
                  />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-xs font-medium text-text-muted">API 密钥</span>
                  <div className="flex gap-2">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={activeProvider.api_key}
                      onChange={(event) => updateProvider({ api_key: event.target.value })}
                      className="glass-input h-10 min-w-0 flex-1 font-mono text-sm text-foreground"
                      placeholder="sk-..."
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((visible) => !visible)}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-glass-border bg-surface-card text-text-secondary hover:bg-hover-bg hover:text-foreground"
                    >
                      {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>
              </div>
            </div>

            <LlmModelList
              providerId={activeProvider.id}
              models={activeProvider.models}
              defaultProviderId={defaultProviderId}
              defaultModelId={defaultModelId}
              onDefaultChange={onDefaultChange}
              onModelsChange={(models) => updateProvider({ models })}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

