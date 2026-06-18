"use client";

import clsx from "clsx";
import { ArrowLeft, CheckSquare, Download, FileAudio, FileInput, Image as ImageIcon, Loader2, Maximize2, Palette, Plus, RefreshCw, Save, Search, Settings2, Sparkles, Square, Trash2, UploadCloud, Volume2, X } from "lucide-react";
import { type ChangeEvent, useEffect, useState } from "react";
import { JIMENG_ASSET_TYPE_LABELS, jimengMediaUrl } from "@/components/jimeng/assets/AssetMiniCard";
import { useModalDismiss } from "@/components/jimeng/useModalDismiss";
import { jimengApi, type JimengAsset, type JimengAssetType, type JimengStylePreset } from "@/lib/jimengApi";
import { IMAGE_MODELS, type AssetFormState, type AssetImageRatio, type AssetImageSettings, type AssetStyleDraft, type AssetViewMode, assetStyleDraftFromPreset, formatUpdatedAt, formFromAsset, imagePromptForAsset, randomStyleAccent, requestErrorMessage, splitAliases } from "@/components/jimeng/assets/assetManagerShared";

export default function AssetPreviewModal({ asset, onClose }: { asset: JimengAsset; onClose: () => void }) {
  const imageUrl = jimengMediaUrl(asset.image_path, asset.updated_at);
  const { requestClose, backdropProps } = useModalDismiss({
    open: Boolean(imageUrl),
    onClose,
  });

  if (!imageUrl) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4 py-6 backdrop-blur-sm" {...backdropProps}>
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-xl border border-glass-border bg-elevated shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-glass-border bg-surface-inset px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg font-semibold text-foreground">{asset.name}</h3>
            <p className="text-xs text-text-muted">
              {JIMENG_ASSET_TYPE_LABELS[asset.type]} · {asset.image_filename ?? "图片预览"}
            </p>
          </div>
          <button type="button" title="关闭" onClick={requestClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-glass-border text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[78vh] overflow-auto bg-surface-inset p-3">
          <img src={imageUrl} alt={asset.name} className="mx-auto max-h-[74vh] max-w-full object-contain" />
        </div>
      </div>
    </div>
  );
}
