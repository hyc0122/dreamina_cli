import { Copy, Image as ImageIcon, Loader2, Trash2, UploadCloud } from "lucide-react";
import { type ChangeEvent, useState } from "react";
import { normalizeReferenceImageUrls, type AssetImageSettings } from "@/components/jimeng/assets/assetManagerShared";
import type { AssetImageSettingsDraftSetter } from "@/components/jimeng/assets/AssetImageSettingsModal";
import { jimengApi } from "@/lib/jimengApi";

export default function AssetImageReferenceSettingsSection({
  draft,
  setDraft,
  onDirty,
}: {
  draft: AssetImageSettings;
  setDraft: AssetImageSettingsDraftSetter;
  onDirty: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const references = normalizeReferenceImageUrls(draft.styleReferenceImages);

  const updateReferences = (urls: string[]) => {
    setDraft((state) => ({ ...state, styleReferenceImages: normalizeReferenceImageUrls(urls) }));
    onDirty();
  };

  const uploadReferences = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) {
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const slots = Math.max(0, 10 - references.length);
      const selectedFiles = files.slice(0, slots);
      const uploaded = [];
      for (const file of selectedFiles) {
        const result = await jimengApi.uploadAssetReferenceImage(file);
        uploaded.push(result.url);
      }
      updateReferences([...references, ...uploaded]);
      if (files.length > selectedFiles.length) {
        setError("参考图最多保留 10 张，多余图片已跳过。");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "参考图上传失败");
    } finally {
      setUploading(false);
    }
  };

  const copyUrl = async (url: string) => {
    await navigator.clipboard?.writeText(url);
  };

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display text-lg font-semibold text-foreground">风格参考图</h3>
        <p className="mt-1 text-sm text-text-secondary">上传用于资产生图的全局参考图。上传后会自动获取图片链接，单个生图和批量生图都会使用这些链接。</p>
      </div>

      <label className="flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-4 py-5 text-center text-sm font-medium text-primary transition-colors hover:bg-primary/10">
        {uploading ? <Loader2 size={22} className="animate-spin" /> : <UploadCloud size={22} />}
        <span>{uploading ? "参考图上传中" : "上传风格参考图"}</span>
        <span className="text-xs font-normal text-text-muted">支持 png / jpg / webp，文件会按日期时间自动命名，不使用中文原文件名。</span>
        <input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={uploadReferences} disabled={uploading || references.length >= 10} />
      </label>

      {error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

      <div className="rounded-lg border border-glass-border bg-panel-bg p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">已获取链接</span>
          <span className="rounded border border-glass-border bg-surface-inset px-2 py-0.5 font-mono text-xs text-text-muted">{references.length}/10</span>
        </div>
        {references.length > 0 ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {references.map((url) => (
              <div key={url} className="grid gap-2 rounded-lg border border-glass-border bg-surface-inset p-2">
                <div className="aspect-video overflow-hidden rounded-md border border-glass-border bg-black/30">
                  <img src={url} alt="风格参考图" className="h-full w-full object-cover" />
                </div>
                <p className="truncate font-mono text-[11px] text-text-muted" title={url}>{url}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void copyUrl(url)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-glass-border bg-panel-bg px-2 py-1.5 text-xs text-text-secondary hover:bg-hover-bg hover:text-foreground">
                    <Copy size={13} />
                    复制链接
                  </button>
                  <button type="button" onClick={() => updateReferences(references.filter((item) => item !== url))} className="inline-flex items-center justify-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-200 hover:bg-red-500/15">
                    <Trash2 size={13} />
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 flex min-h-[120px] flex-col items-center justify-center rounded-lg border border-dashed border-glass-border text-center text-text-muted">
            <ImageIcon size={24} />
            <p className="mt-2 text-sm">暂无参考图，生图请求不会上传 images 参数。</p>
          </div>
        )}
      </div>
    </section>
  );
}
