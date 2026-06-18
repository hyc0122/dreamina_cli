"use client";

import clsx from "clsx";
import { ArrowLeft, CheckSquare, Download, FileAudio, FileInput, Image as ImageIcon, Loader2, Maximize2, Palette, Plus, RefreshCw, Save, Search, Settings2, Sparkles, Square, Trash2, UploadCloud, Volume2, X } from "lucide-react";
import { type ChangeEvent, useEffect, useState } from "react";
import { JIMENG_ASSET_TYPE_LABELS, jimengMediaUrl } from "@/components/jimeng/assets/AssetMiniCard";
import { useModalDismiss } from "@/components/jimeng/useModalDismiss";
import { jimengApi, type JimengAsset, type JimengAssetType, type JimengStylePreset } from "@/lib/jimengApi";
import { IMAGE_MODELS, type AssetFormState, type AssetImageRatio, type AssetImageSettings, type AssetStyleDraft, type AssetViewMode, assetStyleDraftFromPreset, formatUpdatedAt, formFromAsset, imagePromptForAsset, randomStyleAccent, requestErrorMessage, splitAliases } from "@/components/jimeng/assets/assetManagerShared";

import AssetStyleLibraryModal from "@/components/jimeng/assets/AssetStyleLibraryModal";

export default function AssetImageSettingsModal({
  open,
  value,
  stylePresets,
  onStylePresetsChanged,
  onClose,
  onSave,
}: {
  open: boolean;
  value: AssetImageSettings;
  stylePresets: JimengStylePreset[];
  onStylePresetsChanged: () => Promise<void>;
  onClose: () => void;
  onSave: (settings: AssetImageSettings) => void;
}) {
  const [draft, setDraft] = useState<AssetImageSettings>(value);
  const [activePrefixType, setActivePrefixType] = useState<JimengAssetType>("character");
  const [selectedStyleId, setSelectedStyleId] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { requestClose, backdropProps } = useModalDismiss({
    open,
    dirty: JSON.stringify(draft) !== JSON.stringify(value),
    onClose,
  });

  useEffect(() => {
    if (open) {
      setDraft(value);
      setActivePrefixType("character");
      setSelectedStyleId("");
      setStatusMessage(null);
      setSaveError(null);
    }
  }, [open, value]);

  if (!open) {
    return null;
  }

  const prefixConfig: Record<JimengAssetType, { label: string; key: keyof Pick<AssetImageSettings, "characterPromptPrefix" | "scenePromptPrefix" | "propPromptPrefix"> }> = {
    character: { label: "人物前缀提示词", key: "characterPromptPrefix" },
    scene: { label: "场景前缀提示词", key: "scenePromptPrefix" },
    prop: { label: "道具前缀提示词", key: "propPromptPrefix" },
  };
  const activePrefix = prefixConfig[activePrefixType];
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
    setStatusMessage(`已读取风格「${preset?.name ?? "未命名风格"}」的提示词`);
    setSaveError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4 py-6 backdrop-blur-sm" {...backdropProps}>
      <div className="modal-panel w-full max-w-3xl rounded-xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Image Prompt</p>
            <h2 className="mt-2 font-display text-xl font-semibold text-foreground">资产生图设置</h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">这里是资产管理页的生图设置，只用于角色、场景、道具图片生成，不参与分镜视频模板。</p>
          </div>
          <button type="button" title="关闭" onClick={requestClose} className="grid h-9 w-9 place-items-center rounded-lg border border-glass-border text-text-secondary hover:bg-hover-bg hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-glass-border bg-surface-inset p-3">
              <span className="block text-xs font-medium text-text-secondary">默认资产画幅</span>
              <div className="mt-2 inline-flex h-10 w-full rounded-md border border-glass-border bg-panel-bg p-1">
                {(["16:9", "9:16"] as const).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setDraft((state) => ({ ...state, defaultImageRatio: ratio }))}
                    className={clsx(
                      "flex-1 rounded px-3 text-xs font-medium transition-colors",
                      draft.defaultImageRatio === ratio ? "bg-primary text-white" : "text-text-secondary hover:bg-hover-bg hover:text-foreground",
                    )}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs leading-5 text-text-muted">只影响资产管理里的新建资产和批量文件上传，不影响剧本的分镜视频画幅。</p>
            </div>
            <div className="rounded-lg border border-glass-border bg-surface-inset p-3 text-xs leading-5 text-text-secondary">
              <p className="font-medium text-foreground">发送说明</p>
              <p className="mt-2">资产生图会发送：专属提示词 + 全局必填提示词 + 资产详情描述 / 生图提示词 + 资产参数配置。</p>
            </div>
          </div>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-text-secondary">全局必填提示词</span>
            <span className="block text-xs leading-5 text-text-muted">此提示词与下方专属提示词都会发给大模型。</span>
            <div className="hidden">
              <select
                value={selectedStyleId}
                onChange={(event) => appendStylePrompt(event.target.value)}
                className="glass-input h-10 w-full text-sm text-foreground"
              >
                <option value="">选择风格并附加提示词</option>
                {stylePresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <span className="inline-flex h-10 items-center rounded-lg border border-glass-border bg-surface-inset px-3 text-xs text-text-muted">
                只读取，不修改风格库
              </span>
            </div>
            <textarea
              value={draft.imagePromptTemplate}
              onChange={(event) => {
                setDraft((state) => ({ ...state, imagePromptTemplate: event.target.value }));
                setSaveError(null);
                setStatusMessage(null);
              }}
              className="glass-input min-h-[130px] w-full resize-y text-sm leading-6 text-foreground"
              placeholder="例如：统一角色脸，白底或干净背景，五官稳定，服装细节清晰，适合作为漫剧资产参考图"
            />
          </label>
          <AssetStyleLibraryModal styles={stylePresets} onApply={appendStylePrompt} onChanged={onStylePresetsChanged} />
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-5 text-text-secondary">
            <p className="font-medium text-primary">对应类型前缀是什么意思？</p>
            <p className="mt-1">它是按资产类型自动追加的生图约束：角色用“人物前缀”，场景用“场景前缀”，道具用“道具前缀”。实际发送给大模型纯文本生图接口时，会和“全局必填提示词”、资产详情描述一起组成最终图片提示词。</p>
            <p className="mt-1">用途是避免三类资产混用同一种要求：角色强调五官服装稳定，场景强调空间背景，道具强调单体材质和清晰轮廓。</p>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              {(["character", "scene", "prop"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setActivePrefixType(type)}
                  className={clsx(
                    "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    activePrefixType === type
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-glass-border bg-surface-inset text-text-secondary hover:bg-hover-bg hover:text-foreground",
                  )}
                >
                  {prefixConfig[type].label}
                </button>
              ))}
            </div>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-text-secondary">{activePrefix.label}</span>
              <textarea
                value={draft[activePrefix.key]}
                onChange={(event) => setDraft((state) => ({ ...state, [activePrefix.key]: event.target.value }))}
                className="glass-input min-h-[240px] w-full resize-y text-sm leading-6 text-foreground"
              />
            </label>
          </div>
          {statusMessage ? <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300">{statusMessage}</p> : null}
          {saveError ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200">{saveError}</p> : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={requestClose} className="rounded-lg border border-glass-border bg-surface-inset px-4 py-2 text-sm font-medium text-text-secondary hover:bg-hover-bg hover:text-foreground">
            关闭
          </button>
          <button
            type="button"
            onClick={() => {
              if (!draft.imagePromptTemplate.trim()) {
                setSaveError("请填写全局必填提示词");
                setStatusMessage(null);
                return;
              }
              onSave(draft);
              setSaveError(null);
              setStatusMessage("生图设置已保存");
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}
