"use client";

import clsx from "clsx";
import { ArrowLeft, CheckSquare, Download, FileAudio, FileInput, Image as ImageIcon, Loader2, Maximize2, Palette, Plus, RefreshCw, Save, Search, Settings2, Sparkles, Square, Trash2, UploadCloud, Volume2, X } from "lucide-react";
import { type ChangeEvent, useEffect, useState } from "react";
import { JIMENG_ASSET_TYPE_LABELS, jimengMediaUrl } from "@/components/jimeng/assets/AssetMiniCard";
import { useModalDismiss } from "@/components/jimeng/useModalDismiss";
import { jimengApi, type JimengAsset, type JimengAssetType, type JimengStylePreset } from "@/lib/jimengApi";
import { IMAGE_MODELS, type AssetFormState, type AssetImageRatio, type AssetImageSettings, type AssetStyleDraft, type AssetViewMode, assetStyleDraftFromPreset, formatUpdatedAt, formFromAsset, imagePromptForAsset, randomStyleAccent, requestErrorMessage, splitAliases } from "@/components/jimeng/assets/assetManagerShared";

export default function AssetStyleLibraryModal({
  styles,
  onApply,
  onChanged,
}: {
  styles: JimengStylePreset[];
  onApply: (prompt: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<AssetStyleDraft[]>(styles.map(assetStyleDraftFromPreset));
  const [activeIndex, setActiveIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = draft[activeIndex] ?? draft[0];

  useEffect(() => {
    setDraft(styles.map(assetStyleDraftFromPreset));
    setActiveIndex(0);
    setMessage(null);
    setError(null);
  }, [styles]);

  const updateActive = (updates: Partial<AssetStyleDraft>) => {
    setDraft((items) => items.map((item, index) => (index === activeIndex ? { ...item, ...updates } : item)));
  };

  const addStyle = () => {
    const next: AssetStyleDraft = {
      name: `资产风格 ${draft.length + 1}`,
      prompt: "",
      scope: "image",
      accent: randomStyleAccent(),
    };
    setDraft((items) => [...items, next]);
    setActiveIndex(draft.length);
  };

  const removeActive = () => {
    setDraft((items) => {
      const next = items.filter((_, index) => index !== activeIndex);
      setActiveIndex(Math.max(0, Math.min(activeIndex, next.length - 1)));
      return next;
    });
  };

  const saveStyles = async () => {
    const normalized = draft.map((item) => ({ ...item, name: item.name.trim(), prompt: item.prompt.trim(), scope: "image" as const, accent: item.accent || "#6478ff" })).filter((item) => item.name);
    const names = normalized.map((item) => item.name);
    if (new Set(names).size !== names.length) {
      setError("资产风格名称不能重复");
      return;
    }
    const originalIds = new Set(styles.map((item) => item.id));
    const incomingIds = new Set(normalized.map((item) => item.id).filter(Boolean) as string[]);
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      for (const preset of styles) {
        if (!incomingIds.has(preset.id)) {
          await jimengApi.deleteStylePreset(preset.id);
        }
      }
      for (const item of normalized) {
        const payload = { name: item.name, prompt: item.prompt, scope: "image" as const, accent: item.accent };
        if (item.id && originalIds.has(item.id)) {
          await jimengApi.updateStylePreset(item.id, payload);
        } else {
          await jimengApi.createStylePreset(payload);
        }
      }
      await onChanged();
      setMessage("资产风格库已保存");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存资产风格库失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-glass-border bg-surface-inset p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          <Palette size={16} className="text-primary" />
          资产生图风格库
        </div>
        <button type="button" onClick={addStyle} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15">
          <Plus size={14} />
          新增风格
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-text-muted">这套风格只用于资产生图，可一键附加到上方“全局必填提示词”，不会影响剧本视频风格。</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {draft.map((styleItem, index) => (
          <button
            key={`${styleItem.id ?? "new"}-${index}`}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={clsx(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
              index === activeIndex ? "bg-primary/12 text-foreground" : "bg-panel-bg text-text-secondary hover:bg-hover-bg hover:text-foreground",
            )}
            style={{ borderColor: index === activeIndex ? styleItem.accent : undefined }}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: styleItem.accent }} />
            <span>{styleItem.name || "未命名风格"}</span>
          </button>
        ))}
      </div>

      {active ? (
        <div className="mt-3 rounded-lg border border-glass-border bg-panel-bg p-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto_auto]">
            <input value={active.name} onChange={(event) => updateActive({ name: event.target.value })} className="glass-input min-w-0 text-sm text-foreground" placeholder="风格名称" />
            <input value={active.accent} onChange={(event) => updateActive({ accent: event.target.value })} className="glass-input h-10 w-full text-sm text-foreground" type="color" />
            <button type="button" onClick={() => onApply(active.prompt)} disabled={!active.prompt.trim()} className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-45">
              附加到必填词
            </button>
            <button type="button" onClick={removeActive} className="rounded-lg border border-red-500/25 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/10">
              删除
            </button>
          </div>
          <textarea value={active.prompt} onChange={(event) => updateActive({ prompt: event.target.value })} className="glass-input mt-2 min-h-[96px] w-full resize-y text-sm leading-6 text-foreground" placeholder="资产风格提示词，例如：3D资产设定图，干净背景，主体清晰，适合作为视频参考图。" />
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-glass-border bg-panel-bg p-4 text-center text-xs text-text-muted">还没有资产风格，点击“新增风格”。</div>
      )}
      {message ? <p className="mt-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{message}</p> : null}
      {error ? <p className="mt-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={() => void saveStyles()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/15 disabled:cursor-wait disabled:opacity-60">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          保存资产风格库
        </button>
      </div>
    </div>
  );
}
