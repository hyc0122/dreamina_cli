"use client";

import clsx from "clsx";
import { ArrowLeft, CheckSquare, Download, FileAudio, FileInput, Image as ImageIcon, Loader2, Maximize2, Palette, Plus, RefreshCw, Save, Search, Settings2, Sparkles, Square, Trash2, UploadCloud, Volume2, X } from "lucide-react";
import { type ChangeEvent, useEffect, useState } from "react";
import { JIMENG_ASSET_TYPE_LABELS, jimengMediaUrl } from "@/components/jimeng/assets/AssetMiniCard";
import { useModalDismiss } from "@/components/jimeng/useModalDismiss";
import { jimengApi, type JimengAsset, type JimengAssetType, type JimengStylePreset } from "@/lib/jimengApi";
import { type AssetFormState, type AssetImageRatio, type AssetImageSettings, type AssetStyleDraft, type AssetViewMode, assetStyleDraftFromPreset, formatUpdatedAt, formFromAsset, imagePromptForAsset, randomStyleAccent, requestErrorMessage, splitAliases } from "@/components/jimeng/assets/assetManagerShared";
import { parseLlmModelValue } from "@/components/jimeng/llm/modelOptions";

export default function AssetDetailPanel({
  projectId,
  asset,
  groupedAssets,
  settings,
  globalImageModelValue,
  globalImageModelLabel,
  onSettingsOpen,
  onSettingsChange,
  onRefresh,
  onPreview,
  onSelectAsset,
}: {
  projectId: string;
  asset: JimengAsset | null;
  groupedAssets: JimengAsset[];
  settings: AssetImageSettings;
  globalImageModelValue: string;
  globalImageModelLabel: string;
  onSettingsOpen: () => void;
  onSettingsChange: (settings: AssetImageSettings) => void;
  onRefresh: () => Promise<void>;
  onPreview: (asset: JimengAsset) => void;
  onSelectAsset: (assetId: string) => void;
}) {
  const [form, setForm] = useState<AssetFormState | null>(() => (asset ? formFromAsset(asset) : null));
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const imageUrl = jimengMediaUrl(asset?.image_path, asset?.updated_at);
  const voiceUrl = jimengMediaUrl(asset?.audio_path, asset?.updated_at);
  const isCharacter = asset?.type === "character";

  useEffect(() => {
    setForm(asset ? formFromAsset(asset) : null);
    setNotice(null);
    setError(null);
  }, [asset]);

  const updateForm = <K extends keyof AssetFormState>(key: K, value: AssetFormState[K]) => {
    setForm((state) => (state ? { ...state, [key]: value } : state));
  };

  const buildMetadataPayload = () => ({
    name: form?.name.trim() ?? "",
    aliases: splitAliases(form?.aliasesText ?? ""),
    description: form?.description ?? "",
    image_ratio: form?.imageRatio ?? "16:9",
  });

  const saveMetadata = async () => {
    if (!asset || !form) {
      return;
    }
    if (!form.name.trim()) {
      setError("资产名称不能为空");
      return;
    }
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      await jimengApi.updateAsset(projectId, asset.id, buildMetadataPayload());
      setNotice("资产信息已保存");
      await onRefresh();
    } catch (caught) {
      setError(requestErrorMessage(caught, "资产信息保存失败"));
    } finally {
      setSaving(false);
    }
  };

  const generateImage = async () => {
    if (!asset || !form) {
      return;
    }
    if (!form.name.trim()) {
      setError("资产名称不能为空");
      return;
    }
    if (!form.description.trim()) {
      setError("请先填写详情描述 / 生图提示词");
      return;
    }
    setGeneratingImage(true);
    setNotice(null);
    setError(null);
    try {
      await jimengApi.updateAsset(projectId, asset.id, buildMetadataPayload());
      const selectedLlmModel = parseLlmModelValue(globalImageModelValue);
      const response = await jimengApi.generateAssetImageWithLlm(projectId, asset.id, {
        provider_id: selectedLlmModel?.providerId,
        model_id: selectedLlmModel?.modelId,
        extra_prompt: imagePromptForAsset(settings, asset.type),
      });
      const submitId = response.result.submit_id ? `，submit_id：${response.result.submit_id}` : "";
      setNotice(`${response.message || "资产图片已生成"}${submitId}`);
      await onRefresh();
    } catch (caught) {
      setError(requestErrorMessage(caught, "资产生图失败"));
    } finally {
      setGeneratingImage(false);
    }
  };

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!asset || !file) {
      return;
    }
    setUploadingImage(true);
    setNotice(null);
    setError(null);
    try {
      await jimengApi.uploadAssetImage(projectId, asset.id, file);
      await onRefresh();
      setNotice(asset.image_filename ? "图片已替换，预览已刷新。" : "图片已上传，预览已刷新。");
    } catch (caught) {
      setError(requestErrorMessage(caught, "图片上传失败"));
    } finally {
      setUploadingImage(false);
    }
  };

  const uploadVoice = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!asset || !file) {
      return;
    }
    setUploadingVoice(true);
    setNotice(null);
    setError(null);
    try {
      await jimengApi.uploadAssetVoice(projectId, asset.id, file);
      await onRefresh();
      setNotice(asset.audio_filename ? "音色已替换，可以直接试听。" : "音色已上传，可以直接试听。");
    } catch (caught) {
      setError(requestErrorMessage(caught, "音色上传失败"));
    } finally {
      setUploadingVoice(false);
    }
  };

  const deleteAsset = async () => {
    if (!asset || !window.confirm(`删除资产「${asset.name}」？`)) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await jimengApi.deleteAsset(projectId, asset.id);
      await onRefresh();
    } catch (caught) {
      setError(requestErrorMessage(caught, "删除失败"));
    } finally {
      setDeleting(false);
    }
  };

  if (!asset || !form) {
    return (
      <aside className="glass-panel flex min-h-[620px] flex-col items-center justify-center rounded-xl p-6 text-center">
        <ImageIcon size={28} className="text-text-muted" />
        <h3 className="mt-3 font-display text-lg font-semibold text-foreground">选择一个资产</h3>
        <p className="mt-2 text-sm text-text-secondary">左侧点击角色、场景或道具后，这里会显示详情编辑和生图操作。</p>
      </aside>
    );
  }

  return (
    <aside className="glass-panel sticky top-4 max-h-[calc(100vh-120px)] overflow-y-auto rounded-xl p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Asset Detail</p>
          <h2 className="mt-1 flex flex-wrap items-baseline gap-2 font-display text-lg font-semibold text-foreground">
            <span>{asset.name}</span>
            <span className="font-mono text-[11px] font-normal text-text-muted">更新 {formatUpdatedAt(asset.updated_at)}</span>
          </h2>
        </div>
        <button
          type="button"
          title="删除资产"
          onClick={deleteAsset}
          disabled={deleting}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-red-500/25 px-3 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-50"
        >
          {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          <span>删除资产</span>
        </button>
      </div>

      <div className="mt-3 flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => imageUrl && onPreview(asset)}
          disabled={!imageUrl}
          className="group relative aspect-video min-w-0 flex-1 overflow-hidden rounded-lg border border-glass-border bg-surface-inset disabled:cursor-default"
        >
          {imageUrl ? (
            <img src={imageUrl} alt={asset.name} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted">
              <ImageIcon size={30} />
              <span className="text-xs">未上传图片</span>
            </div>
          )}
          {imageUrl ? (
            <span className="absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-md border border-glass-border bg-panel-bg/80 text-foreground opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
              <Maximize2 size={15} />
            </span>
          ) : null}
        </button>
        <label className="flex w-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-2 text-center text-xs font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground">
          {uploadingImage ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
          <span>{asset.image_filename ? "替换图片" : "上传图片"}</span>
          <input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="sr-only" onChange={uploadImage} disabled={uploadingImage} />
        </label>
      </div>

      {groupedAssets.length > 1 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {groupedAssets.map((item) => {
            const url = jimengMediaUrl(item.image_path, item.updated_at);
            const active = item.id === asset.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectAsset(item.id)}
                className={clsx(
                  "w-20 shrink-0 overflow-hidden rounded-lg border text-left transition-colors",
                  active ? "border-primary/70 bg-primary/10" : "border-glass-border bg-surface-inset hover:border-primary/40",
                )}
                title={item.name}
              >
                <div className="aspect-[16/9] bg-surface-inset">
                  {url ? <img src={url} alt={item.name} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-text-muted"><ImageIcon size={14} /></div>}
                </div>
                <p className="truncate px-1.5 py-1 text-[11px] text-text-secondary">{item.name}</p>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mt-3 space-y-2.5">
        {isCharacter ? (
          <div className="rounded-lg border border-glass-border bg-surface-inset p-2">
            <div className="flex items-center justify-between gap-2 text-xs text-text-secondary">
              <span className="inline-flex min-w-0 items-center gap-2">
                <FileAudio size={14} />
                <span className="shrink-0">音色文件</span>
                <span className="min-w-0 truncate font-mono text-foreground">{asset.audio_filename ?? "未上传"}</span>
              </span>
              <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-glass-border bg-panel-bg px-2 py-1 font-medium transition-colors hover:bg-hover-bg hover:text-foreground">
                {uploadingVoice ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
                <span>{asset.audio_filename ? "替换" : "上传"}</span>
                <input
                  type="file"
                  accept=".mp3,.wav,.m4a,.aac,.ogg,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/ogg,application/ogg"
                  className="sr-only"
                  onChange={uploadVoice}
                  disabled={uploadingVoice}
                />
              </label>
            </div>
            {voiceUrl ? <audio controls src={voiceUrl} className="mt-2 h-8 w-full" /> : null}
          </div>
        ) : null}

        <div className="grid gap-2 lg:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-text-secondary">资产/文件名</span>
            <input value={form.name} onChange={(event) => updateForm("name", event.target.value)} className="glass-input w-full text-sm text-foreground" />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium text-text-secondary">别名</span>
            <input
              value={form.aliasesText}
              onChange={(event) => updateForm("aliasesText", event.target.value)}
              className="glass-input w-full text-sm text-foreground"
              placeholder="逗号、顿号或换行分隔"
            />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">详情描述 / 生图提示词</span>
          <textarea
            value={form.description}
            onChange={(event) => updateForm("description", event.target.value)}
            className="glass-input min-h-[120px] w-full resize-y text-sm leading-6 text-foreground"
            placeholder="用于生成资产图片的提示词"
          />
        </label>

        <div className="grid gap-2 sm:grid-cols-3 sm:items-end">
          <div className="rounded-lg border border-glass-border bg-surface-inset p-2.5 sm:col-span-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-text-secondary">全局生图模型</span>
              <button type="button" onClick={onSettingsOpen} className="text-xs font-medium text-primary hover:text-primary/80">
                设置
              </button>
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-foreground" title={globalImageModelLabel}>{globalImageModelLabel}</p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <span className="block text-xs font-medium text-text-secondary">画幅</span>
            <div className="inline-flex h-10 w-full rounded-md border border-glass-border bg-surface-inset p-1">
              {(["16:9", "9:16"] as const).map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => updateForm("imageRatio", ratio)}
                  className={clsx(
                    "flex-1 rounded px-3 text-xs font-medium transition-colors",
                    form.imageRatio === ratio ? "bg-primary text-white" : "text-text-secondary hover:bg-hover-bg hover:text-foreground",
                  )}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-text-secondary">分辨率</span>
            <select
              value={settings.resolutionType}
              onChange={(event) => onSettingsChange({ ...settings, resolutionType: event.target.value as "2k" | "4k" })}
              className="glass-input h-10 w-full text-sm text-foreground"
            >
              <option value="2k">2k</option>
              <option value="4k">4k</option>
            </select>
          </label>
        </div>
        <div className="rounded-lg border border-glass-border bg-surface-inset p-3 text-xs leading-5 text-text-secondary">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-foreground">全局必填提示词与专属前缀</span>
            <button type="button" onClick={onSettingsOpen} className="text-primary hover:text-primary/80">设置</button>
          </div>
          <p className="mt-1 line-clamp-3">{imagePromptForAsset(settings, asset.type) || "未设置，将只发送资产详情描述。"}</p>
          <p className="mt-1 text-text-muted">发送给大模型纯文本生图时，会按资产类型拼接在资产详情描述前。</p>
        </div>

        {notice ? <p className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{notice}</p> : null}
        {error ? <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={saveMetadata}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15 disabled:cursor-wait disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            保存信息
          </button>
          <button
            type="button"
            onClick={generateImage}
            disabled={generatingImage || saving || uploadingImage}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
          >
            {generatingImage ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {generatingImage ? "生图中" : "AI 生图"}
          </button>
        </div>
      </div>
    </aside>
  );
}
