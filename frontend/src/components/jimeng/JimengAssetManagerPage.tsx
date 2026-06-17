"use client";

import clsx from "clsx";
import {
  ArrowLeft,
  CheckSquare,
  Download,
  FileAudio,
  FileInput,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  UploadCloud,
  Volume2,
  X,
  type LucideIcon,
} from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import AssetMetadataImportModal from "@/components/jimeng/AssetMetadataImportModal";
import BatchUploadAssetsModal from "@/components/jimeng/BatchUploadAssetsModal";
import { JIMENG_ASSET_TYPE_LABELS, jimengMediaUrl } from "@/components/jimeng/AssetMiniCard";
import OperationOverlay from "@/components/jimeng/OperationOverlay";
import { useModalDismiss } from "@/components/jimeng/useModalDismiss";
import { jimengApi, type JimengAsset, type JimengAssetType, type JimengStylePreset } from "@/lib/jimengApi";
import { useJimengStore } from "@/store/jimengStore";

const ASSET_TABS: Array<{ type: JimengAssetType; icon: LucideIcon }> = [
  { type: "character", icon: Volume2 },
  { type: "scene", icon: ImageIcon },
  { type: "prop", icon: UploadCloud },
];

const IMAGE_MODELS = [
  { value: "dreamina4.0", label: "Dreamina 4.0" },
  { value: "dreamina4.1", label: "Dreamina 4.1" },
  { value: "dreamina4.5", label: "Dreamina 4.5" },
  { value: "dreamina4.6", label: "Dreamina 4.6" },
  { value: "dreamina4.7", label: "Dreamina 4.7" },
  { value: "dreamina5.0", label: "Dreamina 5.0" },
];

const ASSET_IMAGE_SETTINGS_KEY = "dreamina_cli_asset_image_settings";

type AssetImageRatio = "16:9" | "9:16";

interface AssetImageSettings {
  resolutionType: "2k" | "4k";
  defaultImageRatio: AssetImageRatio;
  imagePromptTemplate: string;
  characterPromptPrefix: string;
  scenePromptPrefix: string;
  propPromptPrefix: string;
}

const DEFAULT_IMAGE_SETTINGS: AssetImageSettings = {
  resolutionType: "2k",
  defaultImageRatio: "16:9",
  imagePromptTemplate: "统一画风，干净背景，主体清晰，适合作为漫剧资产参考图。",
  characterPromptPrefix: "角色资产图：保持人物五官、服装、发型稳定，适合作为后续视频参考。",
  scenePromptPrefix: "场景资产图：强调空间结构、光线、可复用背景，不要出现主体人物。",
  propPromptPrefix: "道具资产图：单体道具清晰居中，材质细节明确，背景简洁。",
};

interface AssetFormState {
  name: string;
  aliasesText: string;
  description: string;
  imageModel: string;
  imageRatio: AssetImageRatio;
}

type AssetViewMode = "compact" | "large" | "list";
type AssetStyleDraft = Pick<JimengStylePreset, "name" | "prompt" | "scope" | "accent"> & { id?: string };

const STYLE_ACCENTS = ["#6478ff", "#22c55e", "#f59e0b", "#a855f7", "#06b6d4", "#ef4444", "#84cc16", "#ec4899"];

const randomStyleAccent = () => STYLE_ACCENTS[Math.floor(Math.random() * STYLE_ACCENTS.length)];

const assetStyleDraftFromPreset = (preset: JimengStylePreset): AssetStyleDraft => ({
  id: preset.id,
  name: preset.name,
  prompt: preset.prompt,
  scope: "image",
  accent: preset.accent || "#6478ff",
});

const splitAliases = (value: string): string[] =>
  value
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

const formatUpdatedAt = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const csvEscape = (value: unknown): string => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const downloadTextFile = (filename: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const downloadBlobFile = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const requestErrorMessage = (error: unknown, fallback: string): string => {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  return error instanceof Error ? error.message : fallback;
};

const formFromAsset = (asset: JimengAsset): AssetFormState => ({
  name: asset.name,
  aliasesText: asset.aliases.join(", "),
  description: asset.description ?? "",
  imageModel: asset.image_model || "dreamina4.0",
  imageRatio: asset.image_ratio === "9:16" ? "9:16" : "16:9",
});

const readImageSettings = (): AssetImageSettings => {
  if (typeof window === "undefined") {
    return DEFAULT_IMAGE_SETTINGS;
  }
  try {
    const raw = window.localStorage.getItem(ASSET_IMAGE_SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_IMAGE_SETTINGS;
    }
    return { ...DEFAULT_IMAGE_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_IMAGE_SETTINGS;
  }
};

const writeImageSettings = (settings: AssetImageSettings) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ASSET_IMAGE_SETTINGS_KEY, JSON.stringify(settings));
  }
};

const assetGroupKey = (asset: JimengAsset): string => {
  const base = asset.name.split(/[-_—·：:]/)[0]?.trim();
  return base || asset.name;
};

const imagePromptForAsset = (settings: AssetImageSettings, assetType: JimengAssetType): string => {
  const typePrefix =
    assetType === "character"
      ? settings.characterPromptPrefix
      : assetType === "scene"
        ? settings.scenePromptPrefix
        : settings.propPromptPrefix;
  return [typePrefix, settings.imagePromptTemplate].map((item) => item.trim()).filter(Boolean).join("\n");
};

function AssetTile({
  asset,
  selected,
  checked,
  groupCount,
  viewMode,
  onClick,
  onToggleChecked,
}: {
  asset: JimengAsset;
  selected: boolean;
  checked: boolean;
  groupCount: number;
  viewMode: AssetViewMode;
  onClick: () => void;
  onToggleChecked: () => void;
}) {
  const imageUrl = jimengMediaUrl(asset.image_path);
  const compact = viewMode === "compact";
  const list = viewMode === "list";
  if (list) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={clsx(
          "flex min-h-10 items-center gap-2 rounded-lg border bg-panel-bg px-3 py-2 text-left transition-colors hover:border-primary/45",
          selected ? "border-primary/60 bg-primary/10" : "border-glass-border",
        )}
      >
        <span
          role="checkbox"
          aria-checked={checked}
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            onToggleChecked();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              onToggleChecked();
            }
          }}
          className={clsx(
            "grid h-7 w-7 shrink-0 place-items-center rounded-md border",
            checked ? "border-primary/60 bg-primary/20 text-primary" : "border-glass-border bg-surface-inset text-text-muted",
          )}
        >
          {checked ? <CheckSquare size={15} /> : <Square size={15} />}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{asset.name}</span>
        {groupCount > 1 ? <span className="shrink-0 rounded border border-primary/25 bg-primary/10 px-2 py-1 text-[11px] text-primary">{groupCount} 阶段</span> : null}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "group overflow-hidden rounded-lg border bg-panel-bg text-left transition-colors hover:border-primary/45",
        selected ? "border-primary/60 ring-2 ring-primary/20" : "border-glass-border",
      )}
    >
      <div className={clsx("relative bg-surface-inset", compact ? "h-[200px] w-[200px]" : "aspect-[16/9]")}>
        <span
          role="checkbox"
          aria-checked={checked}
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            onToggleChecked();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              onToggleChecked();
            }
          }}
          className={clsx(
            "absolute left-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-md border backdrop-blur",
            checked ? "border-primary/60 bg-primary/20 text-primary" : "border-glass-border bg-panel-bg/80 text-text-muted",
          )}
        >
          {checked ? <CheckSquare size={15} /> : <Square size={15} />}
        </span>
        {imageUrl ? (
          <img src={imageUrl} alt={asset.name} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted">
            <ImageIcon size={24} />
            {!compact ? <span className="text-xs">未上传图片</span> : null}
          </div>
        )}
        <span className="absolute bottom-2 left-2 rounded border border-glass-border bg-panel-bg/85 px-2 py-1 text-[11px] text-text-secondary backdrop-blur">
          {JIMENG_ASSET_TYPE_LABELS[asset.type]}
        </span>
        {groupCount > 1 ? (
          <span className="absolute right-2 top-2 rounded border border-primary/30 bg-primary/15 px-2 py-1 text-[11px] text-primary">
            {groupCount} 阶段
          </span>
        ) : null}
      </div>
      <div className={clsx("space-y-1 px-3", compact ? "w-[200px] py-2" : "py-3")}>
        <h3 className="truncate text-sm font-semibold text-foreground">{asset.name}</h3>
        {!compact ? <p className="line-clamp-2 min-h-[36px] text-xs leading-5 text-text-muted">{asset.description || "暂无详情描述"}</p> : null}
      </div>
    </button>
  );
}

function AssetDetailPanel({
  projectId,
  asset,
  groupedAssets,
  settings,
  onSettingsOpen,
  onSettingsChange,
  onRefresh,
  onPreview,
  onSelectAsset,
}: {
  projectId: string;
  asset: JimengAsset | null;
  groupedAssets: JimengAsset[];
  settings: AssetImageSettings;
  onSettingsOpen: () => void;
  onSettingsChange: (settings: AssetImageSettings) => void;
  onRefresh: () => Promise<void>;
  onPreview: (asset: JimengAsset) => void;
  onSelectAsset: (assetId: string) => void;
}) {
  const [form, setForm] = useState<AssetFormState | null>(() => (asset ? formFromAsset(asset) : null));
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const imageUrl = jimengMediaUrl(asset?.image_path);
  const voiceUrl = jimengMediaUrl(asset?.audio_path);
  const isCharacter = asset?.type === "character";

  useEffect(() => {
    setForm(asset ? formFromAsset(asset) : null);
    setNotice(null);
    setError(null);
  }, [asset]);

  const updateForm = <K extends keyof AssetFormState>(key: K, value: AssetFormState[K]) => {
    setForm((state) => (state ? { ...state, [key]: value } : state));
  };

  const buildMetadataPayload = () => ({
    name: form?.name.trim() ?? "",
    aliases: splitAliases(form?.aliasesText ?? ""),
    description: form?.description ?? "",
    image_model: form?.imageModel ?? "dreamina4.0",
    image_ratio: form?.imageRatio ?? "16:9",
  });

  const saveMetadata = async () => {
    if (!asset || !form) {
      return;
    }
    if (!form.name.trim()) {
      setError("资产名称不能为空");
      return;
    }
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      await jimengApi.updateAsset(projectId, asset.id, buildMetadataPayload());
      setNotice("资产信息已保存");
      await onRefresh();
    } catch (caught) {
      setError(requestErrorMessage(caught, "资产信息保存失败"));
    } finally {
      setSaving(false);
    }
  };

  const generateImage = async () => {
    if (!asset || !form) {
      return;
    }
    if (!form.name.trim()) {
      setError("资产名称不能为空");
      return;
    }
    if (!form.description.trim()) {
      setError("请先填写详情描述 / 生图提示词");
      return;
    }
    setGeneratingImage(true);
    setNotice(null);
    setError(null);
    try {
      await jimengApi.updateAsset(projectId, asset.id, buildMetadataPayload());
      const response = await jimengApi.generateAssetImage(projectId, asset.id, {
        resolution_type: settings.resolutionType,
        extra_prompt: imagePromptForAsset(settings, asset.type),
      });
      const submitId = response.result.submit_id ? `，submit_id：${response.result.submit_id}` : "";
      setNotice(`${response.message || "资产图片已生成"}${submitId}`);
      await onRefresh();
    } catch (caught) {
      setError(requestErrorMessage(caught, "资产生图失败"));
    } finally {
      setGeneratingImage(false);
    }
  };

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!asset || !file) {
      return;
    }
    setUploadingImage(true);
    setError(null);
    try {
      await jimengApi.uploadAssetImage(projectId, asset.id, file);
      await onRefresh();
    } catch (caught) {
      setError(requestErrorMessage(caught, "图片上传失败"));
    } finally {
      setUploadingImage(false);
    }
  };

  const uploadVoice = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!asset || !file) {
      return;
    }
    setUploadingVoice(true);
    setError(null);
    try {
      await jimengApi.uploadAssetVoice(projectId, asset.id, file);
      await onRefresh();
    } catch (caught) {
      setError(requestErrorMessage(caught, "音色上传失败"));
    } finally {
      setUploadingVoice(false);
    }
  };

  const deleteAsset = async () => {
    if (!asset || !window.confirm(`删除资产「${asset.name}」？`)) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await jimengApi.deleteAsset(projectId, asset.id);
      await onRefresh();
    } catch (caught) {
      setError(requestErrorMessage(caught, "删除失败"));
    } finally {
      setDeleting(false);
    }
  };

  if (!asset || !form) {
    return (
      <aside className="glass-panel flex min-h-[620px] flex-col items-center justify-center rounded-xl p-6 text-center">
        <ImageIcon size={28} className="text-text-muted" />
        <h3 className="mt-3 font-display text-lg font-semibold text-foreground">选择一个资产</h3>
        <p className="mt-2 text-sm text-text-secondary">左侧点击角色、场景或道具后，这里会显示详情编辑和生图操作。</p>
      </aside>
    );
  }

  return (
    <aside className="glass-panel sticky top-4 max-h-[calc(100vh-120px)] overflow-y-auto rounded-xl p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Asset Detail</p>
          <h2 className="mt-1 flex flex-wrap items-baseline gap-2 font-display text-lg font-semibold text-foreground">
            <span>{asset.name}</span>
            <span className="font-mono text-[11px] font-normal text-text-muted">更新 {formatUpdatedAt(asset.updated_at)}</span>
          </h2>
        </div>
        <button
          type="button"
          title="删除资产"
          onClick={deleteAsset}
          disabled={deleting}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-red-500/25 text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-50"
        >
          {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
        </button>
      </div>

      <div className="mt-3 flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => imageUrl && onPreview(asset)}
          disabled={!imageUrl}
          className="group relative aspect-video min-w-0 flex-1 overflow-hidden rounded-lg border border-glass-border bg-surface-inset disabled:cursor-default"
        >
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
        <label className="flex w-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-2 text-center text-xs font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground">
          {uploadingImage ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
          <span>{asset.image_filename ? "替换图片" : "上传图片"}</span>
          <input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="sr-only" onChange={uploadImage} disabled={uploadingImage} />
        </label>
      </div>

      {groupedAssets.length > 1 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {groupedAssets.map((item) => {
            const url = jimengMediaUrl(item.image_path);
            const active = item.id === asset.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectAsset(item.id)}
                className={clsx(
                  "w-20 shrink-0 overflow-hidden rounded-lg border text-left transition-colors",
                  active ? "border-primary/70 bg-primary/10" : "border-glass-border bg-surface-inset hover:border-primary/40",
                )}
                title={item.name}
              >
                <div className="aspect-[16/9] bg-surface-inset">
                  {url ? <img src={url} alt={item.name} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-text-muted"><ImageIcon size={14} /></div>}
                </div>
                <p className="truncate px-1.5 py-1 text-[11px] text-text-secondary">{item.name}</p>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mt-3 space-y-2.5">
        {isCharacter ? (
          <div className="rounded-lg border border-glass-border bg-surface-inset p-2">
            <div className="flex items-center justify-between gap-2 text-xs text-text-secondary">
              <span className="inline-flex min-w-0 items-center gap-2">
                <FileAudio size={14} />
                <span className="shrink-0">音色文件</span>
                <span className="min-w-0 truncate font-mono text-foreground">{asset.audio_filename ?? "未上传"}</span>
              </span>
              <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-glass-border bg-panel-bg px-2 py-1 font-medium transition-colors hover:bg-hover-bg hover:text-foreground">
                {uploadingVoice ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
                <span>{asset.audio_filename ? "替换" : "上传"}</span>
                <input
                  type="file"
                  accept=".mp3,.wav,.m4a,.aac,.ogg,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/ogg,application/ogg"
                  className="sr-only"
                  onChange={uploadVoice}
                  disabled={uploadingVoice}
                />
              </label>
            </div>
            {voiceUrl ? <audio controls src={voiceUrl} className="mt-2 h-8 w-full" /> : null}
          </div>
        ) : null}

        <div className="grid gap-2 lg:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-text-secondary">资产/文件名</span>
            <input value={form.name} onChange={(event) => updateForm("name", event.target.value)} className="glass-input w-full text-sm text-foreground" />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium text-text-secondary">别名</span>
            <input
              value={form.aliasesText}
              onChange={(event) => updateForm("aliasesText", event.target.value)}
              className="glass-input w-full text-sm text-foreground"
              placeholder="逗号、顿号或换行分隔"
            />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">详情描述 / 生图提示词</span>
          <textarea
            value={form.description}
            onChange={(event) => updateForm("description", event.target.value)}
            className="glass-input min-h-[120px] w-full resize-y text-sm leading-6 text-foreground"
            placeholder="用于生成资产图片的提示词"
          />
        </label>

        <div className="grid gap-2 sm:grid-cols-3 sm:items-end">
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-text-secondary">生图模型</span>
            <select value={form.imageModel} onChange={(event) => updateForm("imageModel", event.target.value)} className="glass-input h-10 w-full text-sm text-foreground">
              {IMAGE_MODELS.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-text-secondary">画幅</span>
            <div className="inline-flex h-10 w-full rounded-md border border-glass-border bg-surface-inset p-1">
              {(["16:9", "9:16"] as const).map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => updateForm("imageRatio", ratio)}
                  className={clsx(
                    "flex-1 rounded px-3 text-xs font-medium transition-colors",
                    form.imageRatio === ratio ? "bg-primary text-white" : "text-text-secondary hover:bg-hover-bg hover:text-foreground",
                  )}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-text-secondary">分辨率</span>
            <select
              value={settings.resolutionType}
              onChange={(event) => onSettingsChange({ ...settings, resolutionType: event.target.value as "2k" | "4k" })}
              className="glass-input h-10 w-full text-sm text-foreground"
            >
              <option value="2k">2k</option>
              <option value="4k">4k</option>
            </select>
          </label>
        </div>

        <div className="rounded-lg border border-glass-border bg-surface-inset p-3 text-xs leading-5 text-text-secondary">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-foreground">全局必填提示词与专属前缀</span>
            <button type="button" onClick={onSettingsOpen} className="text-primary hover:text-primary/80">设置</button>
          </div>
          <p className="mt-1 line-clamp-3">{imagePromptForAsset(settings, asset.type) || "未设置，将只发送资产详情描述。"}</p>
          <p className="mt-1 text-text-muted">发送给即梦时会按资产类型拼接在资产详情描述前。</p>
        </div>

        {notice ? <p className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{notice}</p> : null}
        {error ? <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={saveMetadata}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15 disabled:cursor-wait disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            保存信息
          </button>
          <button
            type="button"
            onClick={generateImage}
            disabled={generatingImage || saving || uploadingImage}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
          >
            {generatingImage ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {generatingImage ? "生图中" : "AI 生图"}
          </button>
        </div>
      </div>
    </aside>
  );
}

function AssetStyleLibraryPanel({
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

function AssetImageSettingsModal({
  open,
  value,
  stylePresets,
  onStylePresetsChanged,
  onClose,
  onSave,
}: {
  open: boolean;
  value: AssetImageSettings;
  stylePresets: JimengStylePreset[];
  onStylePresetsChanged: () => Promise<void>;
  onClose: () => void;
  onSave: (settings: AssetImageSettings) => void;
}) {
  const [draft, setDraft] = useState<AssetImageSettings>(value);
  const [activePrefixType, setActivePrefixType] = useState<JimengAssetType>("character");
  const [selectedStyleId, setSelectedStyleId] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { requestClose, backdropProps } = useModalDismiss({
    open,
    dirty: JSON.stringify(draft) !== JSON.stringify(value),
    onClose,
  });

  useEffect(() => {
    if (open) {
      setDraft(value);
      setActivePrefixType("character");
      setSelectedStyleId("");
      setStatusMessage(null);
      setSaveError(null);
    }
  }, [open, value]);

  if (!open) {
    return null;
  }

  const prefixConfig: Record<JimengAssetType, { label: string; key: keyof Pick<AssetImageSettings, "characterPromptPrefix" | "scenePromptPrefix" | "propPromptPrefix"> }> = {
    character: { label: "人物前缀提示词", key: "characterPromptPrefix" },
    scene: { label: "场景前缀提示词", key: "scenePromptPrefix" },
    prop: { label: "道具前缀提示词", key: "propPromptPrefix" },
  };
  const activePrefix = prefixConfig[activePrefixType];
  const appendStylePrompt = (promptValue: string) => {
    const preset = stylePresets.find((item) => item.id === promptValue);
    setSelectedStyleId(preset?.id ?? "");
    const prompt = (preset?.prompt ?? promptValue).trim();
    if (!prompt) {
      return;
    }
    setDraft((state) => {
      if (state.imagePromptTemplate.includes(prompt)) {
        return state;
      }
      const next = [state.imagePromptTemplate.trim(), prompt].filter(Boolean).join("\n");
      return { ...state, imagePromptTemplate: next };
    });
    setStatusMessage(`已读取风格「${preset?.name ?? "未命名风格"}」的提示词`);
    setSaveError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4 py-6 backdrop-blur-sm" {...backdropProps}>
      <div className="glass-panel w-full max-w-3xl rounded-xl bg-elevated p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Image Prompt</p>
            <h2 className="mt-2 font-display text-xl font-semibold text-foreground">资产生图设置</h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">这里是资产管理页的生图设置，只用于角色、场景、道具图片生成，不参与分镜视频模板。</p>
          </div>
          <button type="button" title="关闭" onClick={requestClose} className="grid h-9 w-9 place-items-center rounded-lg border border-glass-border text-text-secondary hover:bg-hover-bg hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-glass-border bg-surface-inset p-3">
              <span className="block text-xs font-medium text-text-secondary">默认资产画幅</span>
              <div className="mt-2 inline-flex h-10 w-full rounded-md border border-glass-border bg-panel-bg p-1">
                {(["16:9", "9:16"] as const).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setDraft((state) => ({ ...state, defaultImageRatio: ratio }))}
                    className={clsx(
                      "flex-1 rounded px-3 text-xs font-medium transition-colors",
                      draft.defaultImageRatio === ratio ? "bg-primary text-white" : "text-text-secondary hover:bg-hover-bg hover:text-foreground",
                    )}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs leading-5 text-text-muted">只影响资产管理里的新建资产和批量文件上传，不影响剧本的分镜视频画幅。</p>
            </div>
            <div className="rounded-lg border border-glass-border bg-surface-inset p-3 text-xs leading-5 text-text-secondary">
              <p className="font-medium text-foreground">发送说明</p>
              <p className="mt-2">资产生图会发送：专属提示词 + 全局必填提示词 + 资产详情描述 / 生图提示词 + 资产参数配置。</p>
            </div>
          </div>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-text-secondary">全局必填提示词</span>
            <span className="block text-xs leading-5 text-text-muted">此提示词与下方专属提示词都会发给大模型。</span>
            <div className="hidden">
              <select
                value={selectedStyleId}
                onChange={(event) => appendStylePrompt(event.target.value)}
                className="glass-input h-10 w-full text-sm text-foreground"
              >
                <option value="">选择风格并附加提示词</option>
                {stylePresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <span className="inline-flex h-10 items-center rounded-lg border border-glass-border bg-surface-inset px-3 text-xs text-text-muted">
                只读取，不修改风格库
              </span>
            </div>
            <textarea
              value={draft.imagePromptTemplate}
              onChange={(event) => {
                setDraft((state) => ({ ...state, imagePromptTemplate: event.target.value }));
                setSaveError(null);
                setStatusMessage(null);
              }}
              className="glass-input min-h-[130px] w-full resize-y text-sm leading-6 text-foreground"
              placeholder="例如：统一角色脸，白底或干净背景，五官稳定，服装细节清晰，适合作为漫剧资产参考图"
            />
          </label>
          <AssetStyleLibraryPanel styles={stylePresets} onApply={appendStylePrompt} onChanged={onStylePresetsChanged} />
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-5 text-text-secondary">
            <p className="font-medium text-primary">对应类型前缀是什么意思？</p>
            <p className="mt-1">它是按资产类型自动追加的生图约束：角色用“人物前缀”，场景用“场景前缀”，道具用“道具前缀”。实际发送给即梦 text2image 时，会和“全局必填提示词”、资产详情描述一起组成最终图片提示词。</p>
            <p className="mt-1">用途是避免三类资产混用同一种要求：角色强调五官服装稳定，场景强调空间背景，道具强调单体材质和清晰轮廓。</p>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              {(["character", "scene", "prop"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setActivePrefixType(type)}
                  className={clsx(
                    "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    activePrefixType === type
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-glass-border bg-surface-inset text-text-secondary hover:bg-hover-bg hover:text-foreground",
                  )}
                >
                  {prefixConfig[type].label}
                </button>
              ))}
            </div>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-text-secondary">{activePrefix.label}</span>
              <textarea
                value={draft[activePrefix.key]}
                onChange={(event) => setDraft((state) => ({ ...state, [activePrefix.key]: event.target.value }))}
                className="glass-input min-h-[240px] w-full resize-y text-sm leading-6 text-foreground"
              />
            </label>
          </div>
          {statusMessage ? <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300">{statusMessage}</p> : null}
          {saveError ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200">{saveError}</p> : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={requestClose} className="rounded-lg border border-glass-border bg-surface-inset px-4 py-2 text-sm font-medium text-text-secondary hover:bg-hover-bg hover:text-foreground">
            关闭
          </button>
          <button
            type="button"
            onClick={() => {
              if (!draft.imagePromptTemplate.trim()) {
                setSaveError("请填写全局必填提示词");
                setStatusMessage(null);
                return;
              }
              onSave(draft);
              setSaveError(null);
              setStatusMessage("生图设置已保存");
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateAssetModal({
  projectId,
  assetType,
  defaultImageRatio,
  open,
  onClose,
  onCreated,
}: {
  projectId: string;
  assetType: JimengAssetType;
  defaultImageRatio: AssetImageRatio;
  open: boolean;
  onClose: () => void;
  onCreated: (asset: JimengAsset) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<AssetFormState>({
    name: "",
    aliasesText: "",
    description: "",
    imageModel: "dreamina4.0",
    imageRatio: defaultImageRatio,
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = Boolean(draft.name.trim() || draft.aliasesText.trim() || draft.description.trim() || imageFile || voiceFile);
  const { requestClose, backdropProps } = useModalDismiss({
    open,
    dirty,
    onClose,
  });

  useEffect(() => {
    if (open) {
      setDraft({ name: "", aliasesText: "", description: "", imageModel: "dreamina4.0", imageRatio: defaultImageRatio });
      setImageFile(null);
      setVoiceFile(null);
      setError(null);
    }
  }, [assetType, defaultImageRatio, open]);

  if (!open) {
    return null;
  }

  const updateDraft = <K extends keyof AssetFormState>(key: K, value: AssetFormState[K]) => {
    setDraft((state) => ({ ...state, [key]: value }));
  };

  const submit = async () => {
    const name = draft.name.trim();
    if (!name) {
      setError("请输入资产/文件名");
      return;
    }
    setSaving(true);
    setError(null);
    let created: JimengAsset | null = null;
    try {
      created = await jimengApi.createAsset(projectId, {
        type: assetType,
        name,
        aliases: splitAliases(draft.aliasesText),
        description: draft.description.trim(),
        image_model: draft.imageModel,
        image_ratio: draft.imageRatio,
      });
      let finalAsset = created;
      if (imageFile) {
        finalAsset = await jimengApi.uploadAssetImage(projectId, finalAsset.id, imageFile);
      }
      if (assetType === "character" && voiceFile) {
        finalAsset = await jimengApi.uploadAssetVoice(projectId, finalAsset.id, voiceFile);
      }
      await onCreated(finalAsset);
      onClose();
    } catch (caught) {
      if (created) {
        await onCreated(created);
        setError(requestErrorMessage(caught, "资产已创建，但文件上传失败，请在右侧详情里重新上传"));
        return;
      }
      setError(requestErrorMessage(caught, "新建资产失败"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4 py-6 backdrop-blur-sm" {...backdropProps}>
      <div className="w-full max-w-2xl rounded-xl border border-glass-border bg-elevated p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Create Asset</p>
            <h3 className="mt-1 font-display text-xl font-semibold text-foreground">新建{JIMENG_ASSET_TYPE_LABELS[assetType]}资产</h3>
          </div>
          <button type="button" onClick={requestClose} className="grid h-9 w-9 place-items-center rounded-lg border border-glass-border text-text-secondary hover:bg-hover-bg hover:text-foreground">
            <X size={17} />
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">资产/文件名 <span className="text-red-300">*</span></span>
              <input value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} className="glass-input w-full text-sm text-foreground" placeholder="必填，例如：许禾" required />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">别名</span>
              <input value={draft.aliasesText} onChange={(event) => updateDraft("aliasesText", event.target.value)} className="glass-input w-full text-sm text-foreground" placeholder="逗号、顿号或换行分隔" />
            </label>
          </div>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-text-secondary">详情描述 / 生图提示词</span>
            <textarea value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} className="glass-input min-h-[120px] w-full resize-y text-sm leading-6 text-foreground" />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-text-secondary">生图模型</span>
              <select value={draft.imageModel} onChange={(event) => updateDraft("imageModel", event.target.value)} className="glass-input h-10 w-full text-sm text-foreground">
                {IMAGE_MODELS.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-text-secondary">画幅</span>
              <div className="inline-flex h-10 w-full rounded-md border border-glass-border bg-surface-inset p-1">
                {(["16:9", "9:16"] as const).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => updateDraft("imageRatio", ratio)}
                    className={clsx(
                      "flex-1 rounded px-3 text-xs font-medium transition-colors",
                      draft.imageRatio === ratio ? "bg-primary text-white" : "text-text-secondary hover:bg-hover-bg hover:text-foreground",
                    )}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={clsx("grid gap-3", assetType === "character" ? "md:grid-cols-2" : "md:grid-cols-1")}>
            <label className="flex min-h-24 cursor-pointer flex-col justify-center rounded-lg border border-dashed border-glass-border bg-surface-inset px-4 py-3 transition-colors hover:border-primary/50 hover:bg-primary/5">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                <ImageIcon size={16} className="text-primary" />
                上传图片
              </span>
              <span className="mt-1 truncate text-xs text-text-muted">{imageFile ? imageFile.name : "可选，支持 png / jpg / webp"}</span>
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) => {
                  setImageFile(event.target.files?.[0] ?? null);
                  setError(null);
                }}
                disabled={saving}
              />
            </label>
            {assetType === "character" ? (
              <label className="flex min-h-24 cursor-pointer flex-col justify-center rounded-lg border border-dashed border-glass-border bg-surface-inset px-4 py-3 transition-colors hover:border-primary/50 hover:bg-primary/5">
                <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                  <FileAudio size={16} className="text-primary" />
                  上传音色
                </span>
                <span className="mt-1 truncate text-xs text-text-muted">{voiceFile ? voiceFile.name : "可选，支持 mp3 / wav / m4a / aac / ogg"}</span>
                <input
                  type="file"
                  accept=".mp3,.wav,.m4a,.aac,.ogg,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/ogg,application/ogg"
                  className="sr-only"
                  onChange={(event) => {
                    setVoiceFile(event.target.files?.[0] ?? null);
                    setError(null);
                  }}
                  disabled={saving}
                />
              </label>
            ) : null}
          </div>
          {error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={requestClose} disabled={saving} className="rounded-lg border border-glass-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-hover-bg hover:text-foreground disabled:cursor-wait disabled:opacity-60">
            取消
          </button>
          <button type="button" onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            创建资产
          </button>
        </div>
      </div>
    </div>
  );
}

export default function JimengAssetManagerPage() {
  const currentProject = useJimengStore((state) => state.currentProject);
  const assets = useJimengStore((state) => state.assets);
  const loading = useJimengStore((state) => state.loading);
  const storeError = useJimengStore((state) => state.error);
  const loadProjectData = useJimengStore((state) => state.loadProjectData);
  const setActivePage = useJimengStore((state) => state.setActivePage);
  const [activeType, setActiveType] = useState<JimengAssetType>("character");
  const [query, setQuery] = useState("");
  const [batchOpen, setBatchOpen] = useState(false);
  const [metadataImportOpen, setMetadataImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<JimengAsset | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [assetViewMode, setAssetViewMode] = useState<AssetViewMode>("compact");
  const [notice, setNotice] = useState<string | null>(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [imageSettings, setImageSettings] = useState<AssetImageSettings>(() => readImageSettings());
  const [stylePresets, setStylePresets] = useState<JimengStylePreset[]>([]);

  const refreshProject = useCallback(async () => {
    if (currentProject?.id) {
      await loadProjectData(currentProject.id);
    }
  }, [currentProject?.id, loadProjectData]);

  useEffect(() => {
    void refreshProject();
  }, [refreshProject]);

  useEffect(() => {
    jimengApi
      .listStylePresets("image")
      .then(setStylePresets)
      .catch(() => setStylePresets([]));
  }, []);

  const reloadAssetStylePresets = async () => {
    const presets = await jimengApi.listStylePresets("image");
    setStylePresets(presets);
  };

  const counts = useMemo(
    () =>
      ASSET_TABS.reduce(
        (result, item) => ({
          ...result,
          [item.type]: assets.filter((asset) => asset.type === item.type).length,
        }),
        {} as Record<JimengAssetType, number>,
      ),
    [assets],
  );

  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return assets
      .filter((asset) => asset.type === activeType)
      .filter((asset) => {
        if (!normalizedQuery) {
          return true;
        }
        const haystack = [asset.name, ...asset.aliases, asset.description, asset.image_model].join(" ").toLowerCase();
        return haystack.includes(normalizedQuery);
      });
  }, [activeType, assets, query]);

  useEffect(() => {
    if (!selectedAssetId || !filteredAssets.some((asset) => asset.id === selectedAssetId)) {
      setSelectedAssetId(null);
    }
  }, [filteredAssets, selectedAssetId]);

  useEffect(() => {
    setSelectedAssetIds((ids) => ids.filter((id) => assets.some((asset) => asset.id === id)));
  }, [assets]);

  const groupedByName = useMemo(() => {
    const groups = new Map<string, JimengAsset[]>();
    for (const asset of assets.filter((item) => item.type === activeType)) {
      const key = assetGroupKey(asset);
      groups.set(key, [...(groups.get(key) ?? []), asset]);
    }
    return groups;
  }, [activeType, assets]);

  const selectedAsset = useMemo(() => assets.find((asset) => asset.id === selectedAssetId) ?? null, [assets, selectedAssetId]);
  const selectedGroup = useMemo(() => (selectedAsset ? (groupedByName.get(assetGroupKey(selectedAsset)) ?? [selectedAsset]) : []), [groupedByName, selectedAsset]);
  const allFilteredSelected = filteredAssets.length > 0 && filteredAssets.every((asset) => selectedAssetIds.includes(asset.id));

  const saveImageSettings = (settings: AssetImageSettings) => {
    setImageSettings(settings);
    writeImageSettings(settings);
    setNotice("资产生图设置已保存");
  };

  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds((ids) => (ids.includes(assetId) ? ids.filter((id) => id !== assetId) : [...ids, assetId]));
  };

  const toggleAllFilteredAssets = () => {
    const filteredIds = filteredAssets.map((asset) => asset.id);
    if (allFilteredSelected) {
      setSelectedAssetIds((ids) => ids.filter((id) => !filteredIds.includes(id)));
      return;
    }
    setSelectedAssetIds((ids) => [...ids, ...filteredIds.filter((id) => !ids.includes(id))]);
  };

  const handleAssetCreated = async (asset: JimengAsset) => {
    setSelectedAssetId(asset.id);
    await refreshProject();
    setNotice(`已新建资产：${asset.name}`);
  };

  const batchDeleteAssets = async () => {
    if (!currentProject || selectedAssetIds.length === 0) {
      return;
    }
    if (!window.confirm(`批量删除选中的 ${selectedAssetIds.length} 个资产？已绑定到分镜的资产会被拦截，需先解除绑定。`)) {
      return;
    }
    setNotice(null);
    try {
      const response = await jimengApi.batchDeleteAssets(currentProject.id, selectedAssetIds);
      setSelectedAssetIds([]);
      setSelectedAssetId(null);
      await refreshProject();
      setNotice(`已删除 ${response.deleted.length} 个资产`);
    } catch (caught) {
      setNotice(requestErrorMessage(caught, "批量删除资产失败"));
    }
  };

  const exportMetadata = async (format: "json" | "csv") => {
    if (!currentProject) {
      return;
    }
    const response = await jimengApi.exportAssetMetadata(currentProject.id);
    const filenameBase = `${currentProject.name || "jimeng"}-assets`;
    if (format === "json") {
      downloadTextFile(`${filenameBase}.json`, JSON.stringify({ assets: response.assets }, null, 2), "application/json;charset=utf-8");
      setNotice("已导出资产描述 JSON");
      return;
    }
    const headers = ["type", "name", "aliases", "description", "image_model", "image_ratio", "image_params", "image_filename", "image_path", "audio_filename", "audio_path"];
    const rows = response.assets.map((asset) =>
      headers
        .map((key) => {
          const value = key === "aliases" ? asset.aliases.join("|") : (asset as unknown as Record<string, unknown>)[key];
          return csvEscape(value);
        })
        .join(","),
    );
    downloadTextFile(`${filenameBase}.csv`, [headers.join(","), ...rows].join("\n"), "text/csv;charset=utf-8");
    setNotice("已导出资产描述 CSV");
  };

  const exportImages = async () => {
    if (!currentProject) {
      return;
    }
    const blob = await jimengApi.exportAssetImages(currentProject.id);
    downloadBlobFile(`${currentProject.name || currentProject.id}-asset-images.zip`, blob);
    setNotice("已导出资产图片包");
  };

  const batchGenerateImages = async () => {
    if (!currentProject) {
      return;
    }
    const targets = filteredAssets.filter((asset) => asset.description.trim());
    if (targets.length === 0) {
      setNotice("当前筛选结果没有可生图资产，请先填写详情描述");
      return;
    }
    if (!window.confirm(`将为当前筛选出的 ${targets.length} 个${JIMENG_ASSET_TYPE_LABELS[activeType]}资产批量生图，是否继续？`)) {
      return;
    }
    setBatchGenerating(true);
    setNotice(null);
    try {
      const result = await jimengApi.batchGenerateAssetImages(currentProject.id, {
        asset_ids: targets.map((asset) => asset.id),
        asset_type: activeType,
        resolution_type: imageSettings.resolutionType,
        extra_prompt: imagePromptForAsset(imageSettings, activeType),
      });
      setNotice(`批量生图完成：成功 ${result.success_count}，失败 ${result.failed_count}`);
      await refreshProject();
    } catch (caught) {
      setNotice(requestErrorMessage(caught, "批量生图失败"));
    } finally {
      setBatchGenerating(false);
    }
  };

  if (!currentProject) {
    return (
      <section className="glass-panel flex min-h-[420px] flex-col items-center justify-center rounded-lg p-8 text-center">
        <ArrowLeft size={24} className="text-primary" />
        <h2 className="mt-4 font-display text-xl font-semibold text-foreground">还没有选择项目</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">请先回到剧本列表选择一个 Jimeng 项目。</p>
        <button type="button" onClick={() => setActivePage("projects")} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90">
          <ArrowLeft size={16} />
          <span>回剧本列表</span>
        </button>
      </section>
    );
  }

  return (
    <section className="h-full overflow-y-auto pr-1">
      <OperationOverlay open={batchGenerating} title="批量生图中，请等待..." subtitle="正在调用即梦生成资产图片，完成后会自动刷新资产库。" />
      <div className="flex flex-col gap-5 pb-4">
      <div className="sticky top-0 z-20 flex flex-col gap-4 border-b border-glass-border bg-app-bg/95 pb-4 pt-1 backdrop-blur-xl xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Asset Studio</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-foreground">{currentProject.name}</h2>
          <p className="mt-2 text-sm text-text-secondary">管理角色、场景、道具、资产图片、角色音色和图片生图指令。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={refreshProject} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-3 py-2 text-sm font-medium text-text-secondary hover:bg-hover-bg hover:text-foreground disabled:cursor-wait disabled:opacity-60">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            <span>刷新</span>
          </button>
          <button type="button" onClick={() => setSettingsOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-3 py-2 text-sm font-medium text-text-secondary hover:bg-hover-bg hover:text-foreground">
            <Settings2 size={16} />
            <span>生图设置</span>
          </button>
          <button type="button" onClick={batchGenerateImages} disabled={batchGenerating} className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/15 disabled:cursor-wait disabled:opacity-60">
            {batchGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            <span>{batchGenerating ? "批量生图中" : "批量生图"}</span>
          </button>
          <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90">
            <Plus size={16} />
            <span>新建资产</span>
          </button>
          <button type="button" onClick={() => void batchDeleteAssets()} disabled={selectedAssetIds.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-45">
            <Trash2 size={16} />
            <span>批量删除资产</span>
          </button>
          <button type="button" onClick={() => setBatchOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-3 py-2 text-sm font-medium text-text-secondary hover:bg-hover-bg hover:text-foreground">
            <UploadCloud size={16} />
            <span>批量上传图片/音色</span>
          </button>
          <button type="button" onClick={() => setMetadataImportOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-3 py-2 text-sm font-medium text-text-secondary hover:bg-hover-bg hover:text-foreground">
            <FileInput size={16} />
            <span>导入资产描述</span>
          </button>
          <button type="button" onClick={() => void exportMetadata("json")} className="inline-flex items-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-3 py-2 text-sm font-medium text-text-secondary hover:bg-hover-bg hover:text-foreground">
            <Download size={16} />
            <span>导出 JSON</span>
          </button>
          <button type="button" onClick={() => void exportMetadata("csv")} className="inline-flex items-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-3 py-2 text-sm font-medium text-text-secondary hover:bg-hover-bg hover:text-foreground">
            <Download size={16} />
            <span>导出 CSV</span>
          </button>
          <button type="button" onClick={() => void exportImages()} className="inline-flex items-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-3 py-2 text-sm font-medium text-text-secondary hover:bg-hover-bg hover:text-foreground">
            <Download size={16} />
            <span>导出图片包</span>
          </button>
        </div>
      </div>

      {notice ? <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{notice}</p> : null}
      {storeError ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{storeError}</p> : null}

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          {ASSET_TABS.map((item) => {
            const Icon = item.icon;
            const active = activeType === item.type;
            return (
              <button
                key={item.type}
                type="button"
                onClick={() => setActiveType(item.type)}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  active ? "border-primary/50 bg-primary/15 text-foreground" : "border-glass-border bg-surface-inset text-text-secondary hover:bg-hover-bg hover:text-foreground",
                )}
              >
                <Icon size={16} className={active ? "text-primary" : ""} />
                <span>{JIMENG_ASSET_TYPE_LABELS[item.type]}</span>
                <span className="rounded border border-glass-border bg-surface-inset px-1.5 py-0.5 font-mono text-[11px] text-text-muted">{counts[item.type] ?? 0}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={toggleAllFilteredAssets}
            disabled={filteredAssets.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
          >
            {allFilteredSelected ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
            <span>{allFilteredSelected ? "取消全选" : "全选资产"}</span>
            <span className="rounded border border-glass-border bg-panel-bg px-1.5 py-0.5 font-mono text-[11px] text-text-muted">{selectedAssetIds.length}</span>
          </button>
        </div>

        <div className="flex w-full flex-col gap-2 xl:w-auto xl:flex-row xl:items-center">
          <div className="inline-flex rounded-lg border border-glass-border bg-surface-inset p-1">
            {[
              ["compact", "小图标"],
              ["large", "大图标"],
              ["list", "列表"],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setAssetViewMode(mode as AssetViewMode)}
                className={clsx(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  assetViewMode === mode ? "bg-primary text-white" : "text-text-secondary hover:bg-hover-bg hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="relative block w-full xl:w-96">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称、别名、描述"
              className="w-full rounded-lg border border-glass-border bg-input-bg py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-primary/60"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-h-[520px]">
          {filteredAssets.length > 0 ? (
            <div
              className={clsx(
                "grid",
                assetViewMode === "compact"
                  ? "gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,200px))]"
                  : assetViewMode === "list"
                    ? "gap-2 grid-cols-1 md:grid-cols-2 2xl:grid-cols-3"
                    : "gap-4 sm:grid-cols-2 2xl:grid-cols-3",
              )}
            >
              {filteredAssets.map((asset) => (
                <AssetTile
                  key={asset.id}
                  asset={asset}
                  selected={asset.id === selectedAssetId}
                  checked={selectedAssetIds.includes(asset.id)}
                  groupCount={groupedByName.get(assetGroupKey(asset))?.length ?? 1}
                  viewMode={assetViewMode}
                  onClick={() => {
                    setSelectedAssetId(asset.id);
                  }}
                  onToggleChecked={() => toggleAssetSelection(asset.id)}
                />
              ))}
            </div>
          ) : (
            <div className="glass-panel flex min-h-[300px] flex-col items-center justify-center rounded-lg p-8 text-center">
              <ImageIcon size={26} className="text-text-muted" />
              <h3 className="mt-3 font-display text-lg font-semibold text-foreground">暂无{JIMENG_ASSET_TYPE_LABELS[activeType]}资产</h3>
              <p className="mt-2 text-sm text-text-secondary">可以批量上传图片/音色，也可以先导入资产描述清单。</p>
            </div>
          )}
        </div>

        <AssetDetailPanel
          projectId={currentProject.id}
          asset={selectedAsset}
          groupedAssets={selectedGroup}
          settings={imageSettings}
          onSettingsOpen={() => setSettingsOpen(true)}
          onSettingsChange={saveImageSettings}
          onRefresh={refreshProject}
          onPreview={setPreviewAsset}
          onSelectAsset={setSelectedAssetId}
        />
      </div>

      <BatchUploadAssetsModal projectId={currentProject.id} open={batchOpen} defaultImageRatio={imageSettings.defaultImageRatio} onClose={() => setBatchOpen(false)} onUploaded={refreshProject} />
      <AssetMetadataImportModal projectId={currentProject.id} open={metadataImportOpen} onClose={() => setMetadataImportOpen(false)} onImported={refreshProject} />
      <AssetImageSettingsModal open={settingsOpen} value={imageSettings} stylePresets={stylePresets} onStylePresetsChanged={reloadAssetStylePresets} onClose={() => setSettingsOpen(false)} onSave={saveImageSettings} />
      <CreateAssetModal
        projectId={currentProject.id}
        assetType={activeType}
        defaultImageRatio={imageSettings.defaultImageRatio}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleAssetCreated}
      />
      {previewAsset ? <AssetPreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} /> : null}
      </div>
    </section>
  );
}

function AssetPreviewModal({ asset, onClose }: { asset: JimengAsset; onClose: () => void }) {
  const imageUrl = jimengMediaUrl(asset.image_path);
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
