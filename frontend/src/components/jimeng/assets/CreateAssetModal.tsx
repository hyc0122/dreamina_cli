"use client";

import clsx from "clsx";
import { FileAudio, Image as ImageIcon, Loader2, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { JIMENG_ASSET_TYPE_LABELS } from "@/components/jimeng/assets/AssetMiniCard";
import { useModalDismiss } from "@/components/jimeng/useModalDismiss";
import { jimengApi, type JimengAsset, type JimengAssetType } from "@/lib/jimengApi";
import { CHARACTER_KIND_LABELS, type AssetFormState, type AssetImageRatio, requestErrorMessage, splitAliases } from "@/components/jimeng/assets/assetManagerShared";

const createEmptyDraft = (imageRatio: AssetImageRatio): AssetFormState => ({
  name: "",
  aliasesText: "",
  description: "",
  imageModel: "dreamina4.0",
  imageRatio,
  characterKind: "single",
});

export default function CreateAssetModal({
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
  const [draft, setDraft] = useState<AssetFormState>(() => createEmptyDraft(defaultImageRatio));
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
      setDraft(createEmptyDraft(defaultImageRatio));
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
        ...(assetType === "character" ? { character_kind: draft.characterKind } : {}),
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
      <div className="modal-panel w-full max-w-2xl rounded-xl p-5">
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
          {assetType === "character" ? (
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-text-secondary">角色分类</span>
              <div className="inline-flex h-10 w-full rounded-md border border-glass-border bg-surface-inset p-1">
                {(["single", "group"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => updateDraft("characterKind", kind)}
                    className={clsx(
                      "flex-1 rounded px-3 text-xs font-medium transition-colors",
                      draft.characterKind === kind ? "bg-primary text-white" : "text-text-secondary hover:bg-hover-bg hover:text-foreground",
                    )}
                  >
                    {CHARACTER_KIND_LABELS[kind]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
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