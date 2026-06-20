"use client";

import { Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { JIMENG_ASSET_TYPE_LABELS } from "@/components/jimeng/assets/AssetMiniCard";
import { ASSET_IMAGE_QUALITY_OPTIONS, type AssetImageQuality, type AssetImageSettings } from "@/components/jimeng/assets/assetManagerShared";
import { useModalDismiss } from "@/components/jimeng/useModalDismiss";
import type { JimengAssetType } from "@/lib/jimengApi";

export interface AssetBatchImageGenerateOptions {
  resolutionType: AssetImageSettings["resolutionType"];
  quality: AssetImageQuality;
  referenceImageText: string;
}

export default function AssetBatchImageGenerateModal({
  open,
  assetType,
  selectedCount,
  modelLabel,
  settings,
  generating,
  onClose,
  onSubmit,
}: {
  open: boolean;
  assetType: JimengAssetType;
  selectedCount: number;
  modelLabel: string;
  settings: AssetImageSettings;
  generating: boolean;
  onClose: () => void;
  onSubmit: (options: AssetBatchImageGenerateOptions) => Promise<void>;
}) {
  const [resolutionType, setResolutionType] = useState<AssetImageSettings["resolutionType"]>(settings.resolutionType);
  const [quality, setQuality] = useState<AssetImageQuality>(settings.imageQuality);
  const [referenceImageText, setReferenceImageText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { requestClose, backdropProps } = useModalDismiss({
    open,
    dirty: Boolean(referenceImageText.trim()) || resolutionType !== settings.resolutionType || quality !== settings.imageQuality,
    onClose,
  });

  useEffect(() => {
    if (open) {
      setResolutionType(settings.resolutionType);
      setQuality(settings.imageQuality);
      setReferenceImageText("");
      setError(null);
    }
  }, [open, settings.imageQuality, settings.resolutionType]);

  if (!open) {
    return null;
  }

  const submit = async () => {
    setError(null);
    try {
      await onSubmit({ resolutionType, quality, referenceImageText });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "批量生图失败");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4 py-6 backdrop-blur-sm" {...backdropProps}>
      <div className="modal-panel flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Batch Image</p>
            <h2 className="mt-2 font-display text-xl font-semibold text-foreground">批量生图</h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              当前选中 {selectedCount} 个{JIMENG_ASSET_TYPE_LABELS[assetType]}资产，本次参数会随提交发送，不填写参考图地址则不上传 images 参数。
            </p>
          </div>
          <button
            type="button"
            title="关闭"
            onClick={requestClose}
            disabled={generating}
            className="grid h-9 w-9 place-items-center rounded-lg border border-glass-border text-text-secondary hover:bg-hover-bg hover:text-foreground disabled:cursor-wait disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto">
          <section className="rounded-lg border border-glass-border bg-surface-inset p-4">
            <h3 className="font-display text-lg font-semibold text-foreground">模型与尺寸</h3>
            <p className="mt-1 text-sm text-text-secondary">这里控制本次批量 AI 生图使用的模型、分辨率和图片质量。</p>
            <label className="mt-4 block space-y-2 rounded-lg border border-glass-border bg-panel-bg p-3">
              <span className="text-sm font-medium text-text-secondary">全局生图模型</span>
              <div className="glass-input flex h-10 items-center text-sm font-semibold text-foreground">{modelLabel}</div>
              <span className="block text-xs leading-5 text-text-muted">模型来自资产管理全局生图模型设置。</span>
            </label>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="block space-y-2 rounded-lg border border-glass-border bg-panel-bg p-3">
                <span className="text-sm font-medium text-text-secondary">分辨率</span>
                <select value={resolutionType} onChange={(event) => setResolutionType(event.target.value as AssetImageSettings["resolutionType"])} className="glass-input h-10 w-full text-sm text-foreground">
                  <option value="2k">2k</option>
                  <option value="4k">4k</option>
                </select>
                <span className="block text-xs leading-5 text-text-muted">系统会按每个资产画幅换算为实际 size。</span>
              </label>
              <label className="block space-y-2 rounded-lg border border-glass-border bg-panel-bg p-3">
                <span className="text-sm font-medium text-text-secondary">图片质量</span>
                <select value={quality} onChange={(event) => setQuality(event.target.value as AssetImageQuality)} className="glass-input h-10 w-full text-sm text-foreground">
                  {ASSET_IMAGE_QUALITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="block text-xs leading-5 text-text-muted">默认 high，会发送到 params.quality。</span>
              </label>
            </div>
          </section>

          <section className="rounded-lg border border-glass-border bg-surface-inset p-4">
            <h3 className="font-display text-lg font-semibold text-foreground">参考图地址</h3>
            <p className="mt-1 text-sm text-text-secondary">可填写 1-10 个图片 URL，多个地址用换行、逗号或顿号分隔。</p>
            <textarea
              value={referenceImageText}
              onChange={(event) => setReferenceImageText(event.target.value)}
              className="glass-input mt-3 min-h-[110px] w-full resize-y text-sm leading-6 text-foreground"
              placeholder="https://example.com/reference.png"
            />
          </section>
        </div>

        <div className="mt-4 space-y-2">
          {error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={requestClose} disabled={generating} className="rounded-lg border border-glass-border bg-surface-inset px-4 py-2 text-sm font-medium text-text-secondary hover:bg-hover-bg hover:text-foreground disabled:cursor-wait disabled:opacity-50">
              关闭
            </button>
            <button type="button" onClick={submit} disabled={generating || selectedCount === 0} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60">
              <Sparkles size={16} />
              {generating ? "批量生图中" : "开始批量生图"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
