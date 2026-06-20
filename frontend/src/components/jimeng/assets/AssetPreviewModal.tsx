"use client";

import { ExternalLink, X } from "lucide-react";
import { JIMENG_ASSET_TYPE_LABELS, jimengMediaUrl } from "@/components/jimeng/assets/AssetMiniCard";
import { useModalDismiss } from "@/components/jimeng/useModalDismiss";
import type { JimengAsset } from "@/lib/jimengApi";

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
    <div className="fixed inset-0 z-50 flex h-screen w-screen flex-col bg-black/95 text-white backdrop-blur-sm" {...backdropProps}>
      <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/80 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg font-semibold text-white">{asset.name}</h3>
            <p className="truncate text-xs text-white/60">
              {JIMENG_ASSET_TYPE_LABELS[asset.type]} · {asset.image_filename ?? "图片预览"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              title="新窗口打开"
              onClick={() => window.open(imageUrl, "_blank", "noopener,noreferrer")}
              className="grid h-10 w-10 place-items-center rounded-md border border-white/15 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ExternalLink size={18} />
            </button>
            <button
              type="button"
              title="关闭"
              onClick={requestClose}
              className="grid h-10 w-10 place-items-center rounded-md border border-white/15 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3">
        <img src={imageUrl} alt={asset.name} className="max-h-full max-w-full object-contain" />
      </div>
    </div>
  );
}
