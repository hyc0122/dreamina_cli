"use client";

import { Image as ImageIcon } from "lucide-react";
import { createPortal } from "react-dom";

export default function AssetCenteredPreview({
  imageUrl,
  name,
  description,
}: {
  imageUrl: string;
  name: string;
  description?: string;
}) {
  const preview = (
    <div className="pointer-events-none fixed inset-0 z-[120] flex items-center justify-center px-4 py-6">
      <div className="w-[min(86vw,760px)] overflow-hidden rounded-xl border border-primary/35 bg-app-bg/95 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="flex max-h-[72vh] min-h-[240px] items-center justify-center bg-black/35">
          {imageUrl ? (
            <img src={imageUrl} alt={`${name} 放大预览`} className="max-h-[72vh] w-full object-contain" />
          ) : (
            <div className="flex h-72 w-full flex-col items-center justify-center gap-2 text-text-muted">
              <ImageIcon size={34} />
              <span className="text-sm">未上传图片</span>
            </div>
          )}
        </div>
        <div className="space-y-1.5 p-3">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          {description ? <p className="line-clamp-2 text-xs leading-5 text-text-secondary">{description}</p> : null}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return preview;
  }

  return createPortal(preview, document.body);
}
