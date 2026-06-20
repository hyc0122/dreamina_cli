"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import AssetImageModelSettingsSection from "@/components/jimeng/assets/AssetImageModelSettingsSection";
import AssetImagePromptSettingsSection from "@/components/jimeng/assets/AssetImagePromptSettingsSection";
import AssetImageSendPreviewSection from "@/components/jimeng/assets/AssetImageSendPreviewSection";
import AssetImageStyleSettingsSection from "@/components/jimeng/assets/AssetImageStyleSettingsSection";
import AssetImageTypePrefixSettingsSection from "@/components/jimeng/assets/AssetImageTypePrefixSettingsSection";
import { useModalDismiss } from "@/components/jimeng/useModalDismiss";
import type { LlmModelOption } from "@/components/jimeng/llm/modelOptions";
import { type AssetImageSettings, imagePromptForAsset } from "@/components/jimeng/assets/assetManagerShared";
import type { JimengAssetType, JimengStylePreset } from "@/lib/jimengApi";

export type AssetImageSettingsDraftSetter = Dispatch<SetStateAction<AssetImageSettings>>;
export type AssetImageSettingsTab = "model" | "prompt" | "prefix" | "style" | "preview";

const SETTINGS_TABS: Array<{ id: AssetImageSettingsTab; label: string; description: string }> = [
  { id: "model", label: "模型与尺寸", description: "模型、画幅、分辨率" },
  { id: "prompt", label: "全局提示词", description: "所有资产都会追加" },
  { id: "prefix", label: "类型前缀", description: "人物、场景、道具" },
  { id: "style", label: "风格库", description: "复用资产风格" },
  { id: "preview", label: "发送预览", description: "检查最终组合" },
];

export default function AssetImageSettingsModal({
  open,
  value,
  imageModelOptions = [],
  resolvedImageModelValue = "",
  stylePresets,
  onStylePresetsChanged,
  onClose,
  onSave,
}: {
  open: boolean;
  value: AssetImageSettings;
  imageModelOptions?: LlmModelOption[];
  resolvedImageModelValue?: string;
  stylePresets: JimengStylePreset[];
  onStylePresetsChanged: () => Promise<void>;
  onClose: () => void;
  onSave: (settings: AssetImageSettings) => void;
}) {
  const [draft, setDraft] = useState<AssetImageSettings>(value);
  const [activeTab, setActiveTab] = useState<AssetImageSettingsTab>("model");
  const [activePrefixType, setActivePrefixType] = useState<JimengAssetType>("character");
  const [previewType, setPreviewType] = useState<JimengAssetType>("character");
  const [selectedStyleId, setSelectedStyleId] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const normalizedValue = useMemo(() => ({ ...value, imageModelValue: value.imageModelValue || resolvedImageModelValue }), [resolvedImageModelValue, value]);
  const { requestClose, backdropProps } = useModalDismiss({
    open,
    dirty: JSON.stringify(draft) !== JSON.stringify(normalizedValue),
    onClose,
  });

  useEffect(() => {
    if (open) {
      setDraft(normalizedValue);
      setActiveTab("model");
      setActivePrefixType("character");
      setPreviewType("character");
      setSelectedStyleId("");
      setStatusMessage(null);
      setSaveError(null);
    }
  }, [normalizedValue, open]);

  const promptPreview = useMemo(() => imagePromptForAsset(draft, previewType), [draft, previewType]);

  if (!open) {
    return null;
  }

  const clearMessages = () => {
    setStatusMessage(null);
    setSaveError(null);
  };

  const appendStylePrompt = (promptValue: string) => {
    const preset = stylePresets.find((item) => item.id === promptValue);
    setSelectedStyleId(preset?.id ?? "");
    const prompt = (preset?.prompt ?? promptValue).trim();
    if (!prompt) {
      return;
    }
    setDraft((state) => {
      if (state.imagePromptTemplate.includes(prompt)) {
        return state;
      }
      const next = [state.imagePromptTemplate.trim(), prompt].filter(Boolean).join("\n");
      return { ...state, imagePromptTemplate: next };
    });
    setActiveTab("prompt");
    setStatusMessage(`已读取风格「${preset?.name ?? "未命名风格"}」的提示词`);
    setSaveError(null);
  };

  const saveSettings = () => {
    if (!draft.imagePromptTemplate.trim()) {
      setSaveError("请填写全局必填提示词");
      setStatusMessage(null);
      setActiveTab("prompt");
      return;
    }
    onSave({ ...draft, imageModelValue: draft.imageModelValue || resolvedImageModelValue });
    setSaveError(null);
    setStatusMessage("生图设置已保存");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4 py-6 backdrop-blur-sm" {...backdropProps}>
      <div className="modal-panel flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Image Prompt</p>
            <h2 className="mt-2 font-display text-xl font-semibold text-foreground">资产生图设置</h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">按小页面管理模型、提示词、类型前缀、风格和发送预览。</p>
          </div>
          <button type="button" title="关闭" onClick={requestClose} className="grid h-9 w-9 place-items-center rounded-lg border border-glass-border text-text-secondary hover:bg-hover-bg hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 grid min-h-0 flex-1 gap-4 lg:grid-cols-[190px_minmax(0,1fr)]">
          <nav className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
            {SETTINGS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  "min-w-[132px] rounded-lg border px-3 py-2 text-left transition-colors lg:w-full",
                  activeTab === tab.id ? "border-primary/50 bg-primary/15 text-foreground" : "border-glass-border bg-surface-inset text-text-secondary hover:bg-hover-bg hover:text-foreground",
                )}
              >
                <span className="block text-sm font-semibold">{tab.label}</span>
                <span className="mt-0.5 block text-[11px] text-text-muted">{tab.description}</span>
              </button>
            ))}
          </nav>

          <div className="min-h-0 overflow-y-auto rounded-lg border border-glass-border bg-surface-inset p-4">
            {activeTab === "model" ? (
              <AssetImageModelSettingsSection draft={draft} setDraft={setDraft} imageModelOptions={imageModelOptions} resolvedImageModelValue={resolvedImageModelValue} onDirty={clearMessages} />
            ) : null}
            {activeTab === "prompt" ? <AssetImagePromptSettingsSection draft={draft} setDraft={setDraft} onDirty={clearMessages} /> : null}
            {activeTab === "prefix" ? <AssetImageTypePrefixSettingsSection draft={draft} setDraft={setDraft} activeType={activePrefixType} onActiveTypeChange={setActivePrefixType} /> : null}
            {activeTab === "style" ? (
              <AssetImageStyleSettingsSection
                stylePresets={stylePresets}
                selectedStyleId={selectedStyleId}
                onSelectedStyleIdChange={setSelectedStyleId}
                onApply={appendStylePrompt}
                onStylePresetsChanged={onStylePresetsChanged}
              />
            ) : null}
            {activeTab === "preview" ? <AssetImageSendPreviewSection draft={draft} previewType={previewType} onPreviewTypeChange={setPreviewType} promptPreview={promptPreview} /> : null}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {statusMessage ? <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300">{statusMessage}</p> : null}
          {saveError ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200">{saveError}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={requestClose} className="rounded-lg border border-glass-border bg-surface-inset px-4 py-2 text-sm font-medium text-text-secondary hover:bg-hover-bg hover:text-foreground">
              关闭
            </button>
            <button type="button" onClick={saveSettings} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90">
              保存设置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}