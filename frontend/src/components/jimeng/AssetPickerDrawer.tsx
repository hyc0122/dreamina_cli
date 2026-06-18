"use client";

import clsx from "clsx";
import { CheckSquare, FileInput, Image as ImageIcon, Loader2, Plus, Save, Search, Settings2, Sparkles, Square, Trash2, UploadCloud, X } from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import AssetMiniCard, { JIMENG_ASSET_TYPE_LABELS, jimengMediaUrl } from "@/components/jimeng/AssetMiniCard";
import AssetMetadataImportModal from "@/components/jimeng/assets/AssetMetadataImportModal";
import BatchUploadAssetsModal from "@/components/jimeng/assets/BatchUploadAssetsModal";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [batchUploadOpen, setBatchUploadOpen] = useState(false);
  const [metadataImportOpen, setMetadataImportOpen] = useState(false);
  const [checkedAssetIds, setCheckedAssetIds] = useState<string[]>([]);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [assetImagePrompt, setAssetImagePrompt] = useState("统一画风，主体清晰，适合作为分镜参考资产。");
  const [assetImageResolution, setAssetImageResolution] = useState<"2k" | "4k">("2k");
  const [newAssetName, setNewAssetName] = useState("");
  const [newAssetDescription, setNewAssetDescription] = useState("");

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

  const checkedAssets = useMemo(() => filteredAssets.filter((asset) => checkedAssetIds.includes(asset.id)), [checkedAssetIds, filteredAssets]);

  useEffect(() => {
    setSelectedAssetId(target.assetId ?? null);
    setCheckedAssetIds([]);
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

  const toggleCheckedAsset = (assetId: string) => {
    setCheckedAssetIds((current) => (current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId]));
  };

  const toggleAllFilteredAssets = () => {
    const visibleIds = filteredAssets.map((asset) => asset.id);
    if (visibleIds.length === 0) {
      return;
    }
    const visibleSet = new Set(visibleIds);
    const allVisibleChecked = visibleIds.every((id) => checkedAssetIds.includes(id));
    setCheckedAssetIds((current) => (allVisibleChecked ? current.filter((id) => !visibleSet.has(id)) : Array.from(new Set([...current, ...visibleIds]))));
  };

  const createAssetFromDrawer = async () => {
    const trimmedName = newAssetName.trim();
    if (!trimmedName) {
      setError("资产名称为必填项");
      return;
    }

    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const created = await jimengApi.createAsset(projectId, {
        type: target.assetType,
        name: trimmedName,
        aliases: [],
        description: newAssetDescription,
        image_model: "dreamina4.6",
        image_ratio: "16:9",
      });
      setSelectedAssetId(created.id);
      setCheckedAssetIds([created.id]);
      setNewAssetName("");
      setNewAssetDescription("");
      setCreateOpen(false);
      setNotice(`已新建${JIMENG_ASSET_TYPE_LABELS[target.assetType]}：${created.name}`);
      await onBound();
    } catch (caught) {
      setError(requestErrorMessage(caught, "新建资产失败"));
    } finally {
      setCreating(false);
    }
  };

  const batchGenerateCheckedAssets = async () => {
    if (checkedAssetIds.length === 0) {
      setError("请先勾选需要生图的资产，或点击全选当前。");
      return;
    }

    setBatchGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const result = await jimengApi.batchGenerateAssetImages(projectId, {
        asset_ids: checkedAssetIds,
        asset_type: target.assetType,
        resolution_type: assetImageResolution,
        extra_prompt: assetImagePrompt,
      });
      setNotice(`批量生图完成：成功 ${result.success_count} 个，失败 ${result.failed_count} 个。`);
      await onBound();
    } catch (caught) {
      setError(requestErrorMessage(caught, "批量生图失败"));
    } finally {
      setBatchGenerating(false);
    }
  };

  const batchDeleteCheckedAssets = async () => {
    if (checkedAssetIds.length === 0) {
      setError("请先勾选需要删除的资产。");
      return;
    }
    const confirmed = window.confirm(`确定删除 ${checkedAssetIds.length} 个资产吗？已绑定到分镜的资产会被后端拦截并提示分镜序号。`);
    if (!confirmed) {
      return;
    }

    setBatchDeleting(true);
    setError(null);
    setNotice(null);
    try {
      await jimengApi.batchDeleteAssets(projectId, checkedAssetIds);
      setNotice(`已删除 ${checkedAssetIds.length} 个资产。`);
      setCheckedAssetIds([]);
      await onBound();
    } catch (caught) {
      setError(requestErrorMessage(caught, "批量删除失败"));
    } finally {
      setBatchDeleting(false);
    }
  };

  const selectedImageUrl = jimengMediaUrl(selectedAsset?.image_path, selectedAsset?.updated_at);
  const allFilteredChecked = filteredAssets.length > 0 && filteredAssets.every((asset) => checkedAssetIds.includes(asset.id));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-glass-border px-3 py-2.5">
        <div>
          <p className="font-display text-base font-semibold text-foreground">选择{JIMENG_ASSET_TYPE_LABELS[target.assetType]}</p>
          <p className="mt-1 text-xs leading-5 text-text-muted">分镜{target.shot.shot_index}，已绑定资产会置顶高亮，点击只查看编辑，不会重复绑定。</p>
        </div>
        <button type="button" title="关闭资产选择" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground">
          <X size={16} />
        </button>
      </div>

      <div className="border-b border-glass-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              settingsOpen ? "border-primary/45 bg-primary/15 text-primary" : "border-glass-border bg-surface-inset text-text-secondary hover:bg-hover-bg hover:text-foreground",
            )}
          >
            <Settings2 size={14} />
            生图设置
          </button>
          <button
            type="button"
            onClick={batchGenerateCheckedAssets}
            disabled={batchGenerating || checkedAssetIds.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/35 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15 disabled:cursor-wait disabled:opacity-50"
          >
            {batchGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            批量生图
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen((open) => !open)}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              createOpen ? "border-primary/45 bg-primary/15 text-primary" : "border-glass-border bg-surface-inset text-text-secondary hover:bg-hover-bg hover:text-foreground",
            )}
          >
            <Plus size={14} />
            新建资产
          </button>
          <button
            type="button"
            onClick={batchDeleteCheckedAssets}
            disabled={batchDeleting || checkedAssetIds.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-400/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-200 transition-colors hover:bg-red-500/15 disabled:cursor-wait disabled:opacity-50"
          >
            {batchDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            批量删除
          </button>
          <button
            type="button"
            onClick={() => setBatchUploadOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-glass-border bg-surface-inset px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground"
          >
            <UploadCloud size={14} />
            批量上传图片/音色
          </button>
          <button
            type="button"
            onClick={() => setMetadataImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-glass-border bg-surface-inset px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground"
          >
            <FileInput size={14} />
            导入资产描述
          </button>
        </div>

        {settingsOpen ? (
          <div className="mt-2 rounded-md border border-glass-border bg-surface-inset p-2.5">
            <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
              <label className="text-xs font-medium text-text-secondary">
                分辨率
                <select
                  value={assetImageResolution}
                  onChange={(event) => setAssetImageResolution(event.target.value as "2k" | "4k")}
                  className="glass-input mt-1 w-full text-xs"
                >
                  <option value="2k">2K</option>
                  <option value="4k">4K</option>
                </select>
              </label>
              <label className="text-xs font-medium text-text-secondary">
                生图附加提示词
                <textarea
                  value={assetImagePrompt}
                  onChange={(event) => setAssetImagePrompt(event.target.value)}
                  className="glass-input mt-1 min-h-[68px] w-full resize-y text-xs leading-5 text-foreground"
                  placeholder="会作为 extra_prompt 附带到勾选资产的生图请求里。"
                />
              </label>
            </div>
          </div>
        ) : null}

        {createOpen ? (
          <div className="mt-2 rounded-md border border-glass-border bg-surface-inset p-2.5">
            <div className="grid gap-2">
              <input
                value={newAssetName}
                onChange={(event) => setNewAssetName(event.target.value)}
                className="glass-input text-sm text-foreground"
                placeholder={`${JIMENG_ASSET_TYPE_LABELS[target.assetType]}名称（必填）`}
              />
              <textarea
                value={newAssetDescription}
                onChange={(event) => setNewAssetDescription(event.target.value)}
                className="glass-input min-h-[72px] resize-y text-xs leading-5 text-foreground"
                placeholder="详情描述 / 生图提示词"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={createAssetFromDrawer}
                  disabled={creating}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  创建到当前类型
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-text-muted">
          <button
            type="button"
            onClick={toggleAllFilteredAssets}
            disabled={filteredAssets.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-glass-border bg-surface-inset px-2.5 py-1.5 font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {allFilteredChecked ? <CheckSquare size={14} /> : <Square size={14} />}
            全选当前
          </button>
          <span>当前已选 {checkedAssets.length} 个，筛选结果 {filteredAssets.length} 个</span>
        </div>
      </div>

      {selectedAsset ? (
        <div className="border-b border-glass-border p-3">
          <div className="grid overflow-hidden rounded-lg border border-glass-border bg-surface-inset xl:grid-cols-[minmax(128px,0.82fr)_minmax(0,1.18fr)]">
            <div className="relative aspect-video xl:aspect-[4/3]">
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
            <div className="space-y-2 p-2.5">
              <input value={draftName} onChange={(event) => setDraftName(event.target.value)} className="glass-input w-full text-sm font-semibold text-foreground" />
              <textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                className="glass-input min-h-[64px] w-full resize-y text-xs leading-5 text-foreground"
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

      <div className="border-b border-glass-border p-3">
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

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {filteredAssets.length > 0 ? (
          <div className="space-y-1.5">
            {filteredAssets.map((asset) => {
              const bound = boundAssetIds.has(asset.id);
              const checked = checkedAssetIds.includes(asset.id);
              const hoverImageUrl = jimengMediaUrl(asset.image_path, asset.updated_at);
              return (
                <div
                  key={asset.id}
                  className={clsx(
                    "group/asset relative flex items-stretch gap-1.5 rounded-md transition-colors",
                    bound ? "border border-cyan-300/35 bg-cyan-300/10" : "hover:bg-hover-bg",
                    selectedAsset?.id === asset.id && "ring-2 ring-primary/25",
                  )}
                >
                  <button
                    type="button"
                    title={checked ? "取消选择" : "选择资产"}
                    onClick={() => toggleCheckedAsset(asset.id)}
                    className="grid w-8 shrink-0 place-items-center text-text-secondary transition-colors hover:text-primary"
                  >
                    {checked ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => bindAsset(asset)}
                    disabled={bindingAssetId !== null && bindingAssetId !== asset.id}
                    className="min-w-0 flex-1 rounded-md text-left transition-colors disabled:cursor-wait disabled:opacity-60"
                  >
                    <AssetMiniCard asset={asset} assetType={target.assetType} compact binding={bound ? bindings.find((binding) => binding.asset_id === asset.id) : undefined} />
                  </button>
                  <div className="pointer-events-none absolute right-2 top-1/2 z-30 hidden w-64 -translate-y-1/2 overflow-hidden rounded-lg border border-primary/30 bg-app-bg/95 shadow-2xl shadow-black/30 backdrop-blur-xl group-hover/asset:block">
                    <div className="aspect-video bg-black/35">
                      {hoverImageUrl ? (
                        <img src={hoverImageUrl} alt={asset.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-text-muted">
                          <ImageIcon size={28} />
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-semibold text-foreground">{asset.name}</p>
                        <span className="shrink-0 rounded border border-glass-border bg-surface-inset px-1.5 py-0.5 text-[10px] text-text-muted">
                          {JIMENG_ASSET_TYPE_LABELS[asset.type]}
                        </span>
                      </div>
                      <p className="line-clamp-3 text-xs leading-5 text-text-secondary">{asset.description || "暂无描述"}</p>
                    </div>
                  </div>
                </div>
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
      <BatchUploadAssetsModal
        projectId={projectId}
        open={batchUploadOpen}
        defaultImageRatio="16:9"
        onClose={() => setBatchUploadOpen(false)}
        onUploaded={async () => {
          setBatchUploadOpen(false);
          await onBound();
        }}
      />
      <AssetMetadataImportModal
        projectId={projectId}
        open={metadataImportOpen}
        onClose={() => setMetadataImportOpen(false)}
        onImported={async () => {
          setMetadataImportOpen(false);
          await onBound();
        }}
      />
    </div>
  );
}
