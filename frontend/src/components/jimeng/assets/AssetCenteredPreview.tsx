import { Image as ImageIcon } from "lucide-react";

export default function AssetCenteredPreview({
  imageUrl,
  name,
  description,
}: {
  imageUrl: string;
  name: string;
  description?: string;
}) {
  return (
    <div className="pointer-events-none fixed left-1/2 top-1/2 z-[90] w-[min(72vw,760px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-primary/35 bg-app-bg/95 shadow-2xl shadow-black/40 backdrop-blur-xl">
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
  );
}
