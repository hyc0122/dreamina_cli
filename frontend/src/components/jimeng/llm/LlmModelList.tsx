"use client";

import clsx from "clsx";
import { Bot, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { JimengLlmModelSetting } from "@/lib/jimengApi";

interface LlmModelListProps {
  providerId: string;
  models: JimengLlmModelSetting[];
  defaultProviderId: string;
  defaultModelId: string;
  onModelsChange: (models: JimengLlmModelSetting[]) => void;
  onDefaultChange: (providerId: string, modelId: string) => void;
}

const createModelId = (name: string, models: JimengLlmModelSetting[]) => {
  const base = name.trim().replace(/\s+/g, "-") || `model-${models.length + 1}`;
  let id = base;
  let index = 2;
  while (models.some((model) => model.id === id)) {
    id = `${base}-${index}`;
    index += 1;
  }
  return id;
};

export default function LlmModelList({
  providerId,
  models,
  defaultProviderId,
  defaultModelId,
  onModelsChange,
  onDefaultChange,
}: LlmModelListProps) {
  const [draftName, setDraftName] = useState("");

  const updateModel = (modelId: string, patch: Partial<JimengLlmModelSetting>) => {
    onModelsChange(models.map((model) => (model.id === modelId ? { ...model, ...patch } : model)));
  };

  const addModel = () => {
    const name = draftName.trim();
    if (!name) {
      return;
    }
    onModelsChange([...models, { id: createModelId(name, models), name, type: "image", enabled: true }]);
    setDraftName("");
  };

  return (
    <div className="rounded-xl border border-glass-border bg-surface-inset p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-base font-semibold text-foreground">模型列表</h3>
          <p className="mt-1 text-xs text-text-muted">当前纯文本资产生图会使用默认图片模型。</p>
        </div>
        <div className="flex gap-2">
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addModel();
              }
            }}
            placeholder="添加模型名称"
            className="glass-input h-9 w-44 text-sm text-foreground"
          />
          <button
            type="button"
            onClick={addModel}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 text-sm font-medium text-primary hover:bg-primary/15"
          >
            <Plus size={14} />
            添加
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        {models.map((model) => {
          const isDefault = providerId === defaultProviderId && model.id === defaultModelId;
          return (
            <div key={model.id} className="rounded-lg border border-glass-border bg-surface-card/70 p-3">
              <div className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-inset text-foreground">
                  <Bot size={16} />
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <input
                    value={model.name}
                    onChange={(event) => updateModel(model.id, { name: event.target.value })}
                    className="glass-input h-9 w-full text-sm font-semibold text-foreground"
                  />
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={model.type}
                      onChange={(event) => updateModel(model.id, { type: event.target.value })}
                      className="glass-input h-8 w-28 text-xs text-foreground"
                    >
                      <option value="image">图片模型</option>
                      <option value="text">文本模型</option>
                      <option value="video">视频模型</option>
                      <option value="audio">音频模型</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => updateModel(model.id, { enabled: !model.enabled })}
                      className={clsx(
                        "inline-flex h-8 items-center rounded-md border px-2 text-xs",
                        model.enabled ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-glass-border text-text-muted",
                      )}
                    >
                      {model.enabled ? "启用" : "停用"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDefaultChange(providerId, model.id)}
                      className={clsx(
                        "inline-flex h-8 items-center rounded-md border px-2 text-xs",
                        isDefault ? "border-primary/35 bg-primary/10 text-primary" : "border-glass-border text-text-muted hover:bg-hover-bg",
                      )}
                    >
                      默认
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onModelsChange(models.filter((item) => item.id !== model.id))}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-400/25 text-red-300 hover:bg-red-500/10"
                  title="删除模型"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
        {models.length === 0 ? (
          <div className="rounded-lg border border-dashed border-glass-border bg-surface-card/50 p-6 text-center text-sm text-text-muted">
            还没有模型。可以添加一个图片模型后设为默认。
          </div>
        ) : null}
      </div>
    </div>
  );
}

