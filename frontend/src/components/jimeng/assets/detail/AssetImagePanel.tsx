import { ClipboardPaste, Image as ImageIcon, Loader2, Maximize2 } from "lucide-react";
import type { ChangeEvent } from "react";
import type { JimengAsset } from "@/lib/jimengApi";

export default function AssetImagePanel({
  asset,
  imageUrl,
  uploadingImage,
  onPreview,
  onPaste,
  onUpload,
}: {
  asset: JimengAsset;
  imageUrl: string;
  uploadingImage: boolean;
  onPreview: (asset: JimengAsset) => void;
  onPaste: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="mt-3 flex items-stretch gap-2">
      <div className="relative aspect-video min-w-0 flex-1 overflow-hidden rounded-lg border border-glass-border bg-surface-inset">
        <button type="button" onClick={() => imageUrl && onPreview(asset)} disabled={!imageUrl} className="group h-full w-full disabled:cursor-default">
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
        <button
          type="button"
          title="粘贴剪贴板图片"
          onClick={onPaste}
          disabled={uploadingImage}
          className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full border border-glass-border bg-panel-bg/90 text-primary shadow-lg backdrop-blur transition-colors hover:bg-hover-bg disabled:cursor-wait disabled:opacity-60"
        >
          {uploadingImage ? <Loader2 size={16} className="animate-spin" /> : <ClipboardPaste size={16} />}
        </button>
      </div>
      <label className="flex w-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-2 text-center text-xs font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground">
        {uploadingImage ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
        <span>{asset.image_filename ? "替换图片" : "上传图片"}</span>
        <input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="sr-only" onChange={onUpload} disabled={uploadingImage} />
      </label>
    </div>
  );
}
