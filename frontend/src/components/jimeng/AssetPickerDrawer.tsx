"use client";

import clsx from "clsx";
import { Image as ImageIcon, Loader2, Save, Search, UploadCloud, X } from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import AssetMiniCard, { JIMENG_ASSET_TYPE_LABELS, jimengMediaUrl } from "@/components/jimeng/AssetMiniCard";
import { jimengApi, type JimengAsset, type JimengAssetBinding, type JimengAssetType, type JimengShot } from "@/lib/jimengApi";

export interface AssetPickerTarget {
  shot: JimengShot;
  assetType: JimengAssetType;
  assetId?: string;
}

interface AssetPickerDrawerProps {
  projectId: string;
  target: AssetPickerTarget;
  assets: JimengAsset[];
  bindings: JimengAssetBinding[];
  onClose: () => void;
  onBound: () => Promise<void>;
}

const requestErrorMessage = (error: unknown, fallback: string): string => {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  return error instanceof Error ? error.message : fallback;
};

export default function AssetPickerDrawer({ projectId, target, assets, bindings, onClose, onBound }: AssetPickerDrawerProps) {
  const [query, setQuery] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [bindingAssetId, setBindingAssetId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const boundAssetIds = useMemo(
    () => new Set(bindings.filter((binding) => binding.asset_type === target.assetType).map((binding) => binding.asset_id)),
    [bindings, target.assetType],
  );

  const filteredAssets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets
      .filter((asset) => asset.type === target.assetType)
      .filter((asset) => {
        if (!needle) {
          return true;
        }
        return asset.name.toLowerCase().includes(needle) || asset.aliases.some((alias) => alias.toLowerCase().includes(needle)) || asset.description.toLowerCase().includes(needle);
      })
      .sort((left, right) => {
        const leftBound = boundAssetIds.has(left.id) ? 0 : 1;
        const rightBound = boundAssetIds.has(right.id) ? 0 : 1;
        if (leftBound !== rightBound) {
          return leftBound - rightBound;
        }
        return left.name.localeCompare(right.name, "zh-CN");
      });
  }, [assets, boundAssetIds, query, target.assetType]);

  const selectedAsset = useMemo(
    () => filteredAssets.find((asset) => asset.id === selectedAssetId) ?? filteredAssets.find((asset) => boundAssetIds.has(asset.id)) ?? filteredAssets[0] ?? null,
    [boundAssetIds, filteredAssets, selectedAssetId],
  );

  useEffect(() => {
    setSelectedAssetId(target.assetId ?? null);
    setError(null);
    setNotice(null);
  }, [target.assetId, target.assetType, target.shot.id]);

  useEffect(() => {
    if (selectedAsset) {
      setDraftName(selectedAsset.name);
      setDraftDescription(selectedAsset.description ?? "");
    }
  }, [selectedAsset]);

  const bindAsset = async (asset: JimengAsset) => {
    setSelectedAssetId(asset.id);
    if (boundAssetIds.has(asset.id)) {
      setNotice("该资产已绑定到当前分镜，可直接在上方编辑信息。");
      return;
    }

    setBindingAssetId(asset.id);
    setError(null);
    setNotice(null);
    try {
      await jimengApi.createBinding(projectId, target.shot.id, {
        asset_id: asset.id,
        asset_type: target.assetType,
        source: "manual",
        locked: true,
      });
      setNotice(`已绑定${JIMENG_ASSET_TYPE_LABELS[target.assetType]}：${asset.name}`);
      await onBound();
    } catch (caught) {
      setError(requestErrorMessage(caught, "绑定资产失败"));
    } finally {
      setBindingAssetId(null);
    }
  };

  const saveSelectedAsset = async () => {
    if (!selectedAsset) {
      return;
    }
    const trimmedName = draftName.trim();
    if (!trimmedName) {
      setError("资产名称不能为空");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await jimengApi.updateAsset(projectId, selectedAsset.id, {
        name: trimmedName,
        description: draftDescription,
      });
      setNotice("资产信息已保存");
      await onBound();
    } catch (caught) {
      setError(requestErrorMessage(caught, "保存资产失败"));
    } finally {
      setSaving(false);
    }
  };

  const uploadSelectedImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!selectedAsset || !file) {
      return;
    }

    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      await jimengApi.uploadAssetImage(projectId, selectedAsset.id, file);
      setNotice("资产图片已上传");
      await onBound();
    } catch (caught) {
      setError(requestErrorMessage(caught, "图片上传失败"));
    } finally {
      setUploading(false);
    }
  };

  const selectedImageUrl = jimengMediaUrl(selectedAsset?.image_path);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-glass-border px-4 py-4">
        <div>
          <p className="font-display text-base font-semibold text-foreground">选择{JIMENG_ASSET_TYPE_LABELS[target.assetType]}</p>
          <p className="mt-1 text-xs leading-5 text-text-muted">分镜{target.shot.shot_index}，已绑定资产会置顶高亮，点击只查看编辑，不会重复绑定。</p>
        </div>
        <button type="button" title="关闭资产选择" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground">
          <X size={16} />
        </button>
      </div>

      {selectedAsset ? (
        <div className="border-b border-glass-border p-4">
          <div className="overflow-hidden rounded-lg border border-glass-border bg-surface-inset">
            <div className="relative aspect-video">
              {selectedImageUrl ? (
                <img src={selectedImageUrl} alt={selectedAsset.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted">
                  <ImageIcon size={24} />
                  <span className="text-xs">未上传图片</span>
                </div>
              )}
              {boundAssetIds.has(selectedAsset.id) ? (
                <span className="absolute left-2 top-2 rounded border border-cyan-300/50 bg-cyan-300/15 px-2 py-1 text-[11px] font-medium text-cyan-200">
                  已绑定
                </span>
              ) : null}
            </div>
            <div className="space-y-2 p-3">
              <input value={draftName} onChange={(event) => setDraftName(event.target.value)} className="glass-input w-full text-sm font-semibold text-foreground" />
              <textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                className="glass-input min-h-[82px] w-full resize-y text-xs leading-5 text-foreground"
                placeholder="详情描述 / 生图提示词"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveSelectedAsset}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/35 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/15 disabled:cursor-wait disabled:opacity-60"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  保存
                </button>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-glass-border bg-surface-inset px-3 py-2 text-xs font-medium text-text-secondary hover:bg-hover-bg hover:text-foreground">
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                  上传图片
                  <input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="sr-only" onChange={uploadSelectedImage} disabled={uploading} />
                </label>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="border-b border-glass-border p-4">
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="glass-input w-full pl-9 text-sm text-foreground"
            placeholder={`搜索${JIMENG_ASSET_TYPE_LABELS[target.assetType]}名称、别名或描述`}
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {filteredAssets.length > 0 ? (
          <div className="space-y-2">
            {filteredAssets.map((asset) => {
              const bound = boundAssetIds.has(asset.id);
              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => bindAsset(asset)}
                  disabled={bindingAssetId !== null && bindingAssetId !== asset.id}
                  className={clsx(
                    "w-full rounded-md text-left transition-colors disabled:cursor-wait disabled:opacity-60",
                    bound ? "cursor-default border border-cyan-300/35 bg-cyan-300/10" : "hover:bg-hover-bg",
                    selectedAsset?.id === asset.id && "ring-2 ring-primary/25",
                  )}
                >
                  <AssetMiniCard asset={asset} assetType={target.assetType} compact binding={bound ? bindings.find((binding) => binding.asset_id === asset.id) : undefined} />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-glass-border bg-surface-inset px-4 py-8 text-center">
            <p className="text-sm text-text-secondary">没有可选{JIMENG_ASSET_TYPE_LABELS[target.assetType]}</p>
            <p className="mt-2 text-xs leading-5 text-text-muted">请先在资产管理页上传或导入资产。</p>
          </div>
        )}
        {notice ? <p className="mt-3 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{notice}</p> : null}
        {error ? <p className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
      </div>
    </div>
  );
}
