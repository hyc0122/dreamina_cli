import { AlertCircle, Copy, Image as ImageIcon, Link as LinkIcon, Loader2, Maximize2, Plus, Trash2, UploadCloud } from "lucide-react";
import { type ChangeEvent, useState } from "react";
import AssetCenteredPreview from "@/components/jimeng/assets/AssetCenteredPreview";
import {
  addReferenceImageUrls,
  normalizeReferenceImageUrls,
  type AssetImageSettings,
} from "@/components/jimeng/assets/assetManagerShared";
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
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState("");
  const [imageLoadErrors, setImageLoadErrors] = useState<Record<string, boolean>>({});
  const [hoverPreviewUrl, setHoverPreviewUrl] = useState<string | null>(null);
  const [pinnedPreviewUrl, setPinnedPreviewUrl] = useState<string | null>(null);
  const references = normalizeReferenceImageUrls(draft.styleReferenceImages);
  const previewUrl = pinnedPreviewUrl || hoverPreviewUrl;

  const updateReferences = (urls: string[]) => {
    setDraft((state) => ({ ...state, styleReferenceImages: normalizeReferenceImageUrls(urls) }));
    onDirty();
    setCopiedNotice(null);
  };

  const updateReferenceUsage = (key: "styleReferenceUseCharacter" | "styleReferenceUseScene", checked: boolean) => {
    setDraft((state) => ({ ...state, [key]: checked }));
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

  const addManualLinks = () => {
    const value = linkInput.trim();
    if (!value) {
      setError("请先粘贴图片链接。");
      return;
    }
    const result = addReferenceImageUrls(references, value, 10);
    updateReferences(result.urls);
    setLinkInput("");
    const warnings = [];
    if (result.invalid.length > 0) warnings.push(`已跳过 ${result.invalid.length} 个无效链接`);
    if (result.duplicateCount > 0) warnings.push(`已跳过 ${result.duplicateCount} 个重复链接`);
    if (result.skippedByLimit > 0) warnings.push(`最多保留 10 张，已跳过 ${result.skippedByLimit} 个链接`);
    setError(warnings.length > 0 ? `${warnings.join("；")}。` : null);
    setCopiedNotice(result.added.length > 0 ? `已添加 ${result.added.length} 个参考图链接` : null);
  };

  const removeReference = (url: string) => {
    updateReferences(references.filter((item) => item !== url));
    setHoverPreviewUrl((current) => (current === url ? null : current));
    setPinnedPreviewUrl((current) => (current === url ? null : current));
    setImageLoadErrors((current) => {
      const next = { ...current };
      delete next[url];
      return next;
    });
  };

  const copyUrl = async (url: string) => {
    await navigator.clipboard?.writeText(url);
    setCopiedNotice("已复制参考图链接");
  };

  const copyAllUrls = async () => {
    await navigator.clipboard?.writeText(references.join("\n"));
    setCopiedNotice(`已复制 ${references.length} 个参考图链接`);
  };

  return (
    <section className="space-y-4">
      <div>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold text-foreground">风格参考图</h3>
            <p className="mt-1 text-sm text-text-secondary">上传图片或粘贴图片链接，作为资产生图的全局参考图。只有勾选使用范围后，单个生图和批量生图才会发送这些链接。</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground">
              <input
                type="checkbox"
                checked={draft.styleReferenceUseCharacter}
                onChange={(event) => updateReferenceUsage("styleReferenceUseCharacter", event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              角色使用
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground">
              <input
                type="checkbox"
                checked={draft.styleReferenceUseScene}
                onChange={(event) => updateReferenceUsage("styleReferenceUseScene", event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              场景使用
            </label>
          </div>
        </div>
      </div>

      <label className="flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-4 py-5 text-center text-sm font-medium text-primary transition-colors hover:bg-primary/10">
        {uploading ? <Loader2 size={22} className="animate-spin" /> : <UploadCloud size={22} />}
        <span>{uploading ? "参考图上传中" : "上传风格参考图"}</span>
        <span className="text-xs font-normal text-text-muted">支持 png / jpg / webp，文件会按日期时间自动命名，不使用中文原文件名。</span>
        <input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={uploadReferences} disabled={uploading || references.length >= 10} />
      </label>

      <div className="rounded-lg border border-glass-border bg-panel-bg p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <LinkIcon size={16} className="text-primary" />
          手动添加图片链接
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <textarea
            value={linkInput}
            onChange={(event) => setLinkInput(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                addManualLinks();
              }
            }}
            className="glass-input min-h-[72px] resize-y p-3 text-sm leading-5 text-foreground"
            placeholder="粘贴图片链接，多个链接可用换行、逗号或空格分隔"
          />
          <button
            type="button"
            onClick={addManualLinks}
            disabled={references.length >= 10 || !linkInput.trim()}
            className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Plus size={16} />
            添加链接
          </button>
        </div>
        <p className="mt-2 text-xs text-text-muted">不会提前下载校验外链，只由下方小图自然加载；加载失败不影响保存链接。</p>
      </div>

      {error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

      <div className="rounded-lg border border-glass-border bg-panel-bg p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-sm font-semibold text-foreground">已获取链接</span>
            {copiedNotice ? <p className="mt-1 text-xs text-primary">{copiedNotice}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded border border-glass-border bg-surface-inset px-2 py-0.5 font-mono text-xs text-text-muted">{references.length}/10</span>
            <button
              type="button"
              onClick={() => void copyAllUrls()}
              disabled={references.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-glass-border bg-surface-inset px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Copy size={13} />
              复制全部链接
            </button>
          </div>
        </div>
        {references.length > 0 ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {references.map((url, index) => {
              const loadFailed = imageLoadErrors[url] === true;
              const pinned = pinnedPreviewUrl === url;
              return (
                <div key={url} className="grid gap-2 rounded-lg border border-glass-border bg-surface-inset p-2">
                  <button
                    type="button"
                    title={pinned ? "再次点击取消固定放大" : "点击固定居中放大"}
                    onClick={() => setPinnedPreviewUrl((current) => (current === url ? null : url))}
                    onMouseEnter={() => setHoverPreviewUrl(url)}
                    onMouseLeave={() => setHoverPreviewUrl(null)}
                    onFocus={() => setHoverPreviewUrl(url)}
                    onBlur={() => setHoverPreviewUrl(null)}
                    className="group relative aspect-video overflow-hidden rounded-md border border-glass-border bg-black/30 text-left"
                  >
                    {loadFailed ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted">
                        <AlertCircle size={22} />
                        <span className="text-xs">图片加载失败</span>
                      </div>
                    ) : (
                      <img
                        src={url}
                        alt={`风格参考图 ${index + 1}`}
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                        onError={() => setImageLoadErrors((current) => ({ ...current, [url]: true }))}
                      />
                    )}
                    <span className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-md border border-glass-border bg-panel-bg/85 text-foreground opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                      <Maximize2 size={15} />
                    </span>
                    {pinned ? <span className="absolute left-2 top-2 rounded bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">已固定</span> : null}
                  </button>
                  <p className="truncate font-mono text-[11px] text-text-muted" title={url}>{url}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void copyUrl(url)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-glass-border bg-panel-bg px-2 py-1.5 text-xs text-text-secondary hover:bg-hover-bg hover:text-foreground">
                      <Copy size={13} />
                      复制链接
                    </button>
                    <button type="button" onClick={() => removeReference(url)} className="inline-flex items-center justify-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-200 hover:bg-red-500/15">
                      <Trash2 size={13} />
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 flex min-h-[120px] flex-col items-center justify-center rounded-lg border border-dashed border-glass-border text-center text-text-muted">
            <ImageIcon size={24} />
            <p className="mt-2 text-sm">暂无参考图，生图请求不会上传 images 参数。</p>
          </div>
        )}
      </div>
      {previewUrl ? <AssetCenteredPreview imageUrl={previewUrl} name="风格参考图" description={previewUrl} /> : null}
    </section>
  );
}
