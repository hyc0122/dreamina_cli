import { ClipboardPaste, Image as ImageIcon, Loader2, Maximize2 } from "lucide-react";
import { type ChangeEvent, useState } from "react";
import AssetCenteredPreview from "@/components/jimeng/assets/AssetCenteredPreview";
import type { JimengAsset } from "@/lib/jimengApi";

export default function AssetImagePanel({
  asset,
  imageUrl,
  uploadingImage,
  magnifierEnabled,
  onMagnifierChange,
  onPreview,
  onPaste,
  onUpload,
}: {
  asset: JimengAsset;
  imageUrl: string;
  uploadingImage: boolean;
  magnifierEnabled: boolean;
  onMagnifierChange: (enabled: boolean) => void;
  onPreview: (asset: JimengAsset) => void;
  onPaste: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const [magnifierVisible, setMagnifierVisible] = useState(false);

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-glass-border bg-surface-inset px-3 py-2 text-xs">
        <span className="font-medium text-foreground">图片悬停放大</span>
        <label className="inline-flex cursor-pointer items-center gap-2 text-text-secondary">
          <input
            type="checkbox"
            checked={magnifierEnabled}
            onChange={(event) => {
              onMagnifierChange(event.target.checked);
              setMagnifierVisible(false);
            }}
            className="h-4 w-4 accent-primary"
          />
          放大开关
        </label>
      </div>
      <div className="flex items-stretch gap-2">
        <div className="relative aspect-video min-w-0 flex-1 overflow-hidden rounded-lg border border-glass-border bg-surface-inset">
          <button
            type="button"
            onClick={() => imageUrl && onPreview(asset)}
            onMouseEnter={() => setMagnifierVisible(Boolean(magnifierEnabled && imageUrl))}
            onMouseLeave={() => setMagnifierVisible(false)}
            disabled={!imageUrl}
            className="group h-full w-full disabled:cursor-default"
          >
            {imageUrl ? (
              <img src={imageUrl} alt={asset.name} className="h-full w-full object-contain p-1 transition-transform duration-200 group-hover:scale-[1.02]" />
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
          {magnifierEnabled && imageUrl && magnifierVisible ? (
            <AssetCenteredPreview imageUrl={imageUrl} name={asset.name} description={asset.description} />
          ) : null}
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
    </div>
  );
}
