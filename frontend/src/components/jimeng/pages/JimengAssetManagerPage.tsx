"use client";

import clsx from "clsx";
import { ArrowLeft, CheckSquare, Download, FileInput, Image as ImageIcon, Loader2, Plus, RefreshCw, Search, Settings2, Sparkles, Square, Trash2, UploadCloud, Volume2, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import AssetBrowser from "@/components/jimeng/assets/AssetBrowser";
import AssetDetailPanel from "@/components/jimeng/assets/AssetDetailPanel";
import AssetImageSettingsModal from "@/components/jimeng/assets/AssetImageSettingsModal";
import AssetMetadataImportModal from "@/components/jimeng/assets/AssetMetadataImportModal";
import { JIMENG_ASSET_TYPE_LABELS } from "@/components/jimeng/assets/AssetMiniCard";
import AssetPreviewModal from "@/components/jimeng/assets/AssetPreviewModal";
import AssetToolbar from "@/components/jimeng/assets/AssetToolbar";
import BatchUploadAssetsModal from "@/components/jimeng/assets/BatchUploadAssetsModal";
import CreateAssetModal from "@/components/jimeng/assets/CreateAssetModal";
import { type AssetImageSettings, type AssetViewMode, assetGroupKey, assetImageModelLabel, imagePromptForAsset, readImageSettings, requestErrorMessage, resolveAssetImageModelOption, writeImageSettings } from "@/components/jimeng/assets/assetManagerShared";
import { buildLlmModelOptions, encodeLlmModelValue, parseLlmModelValue, type LlmModelOption } from "@/components/jimeng/llm/modelOptions";
import OperationOverlay from "@/components/jimeng/OperationOverlay";
import { jimengApi, type JimengAsset, type JimengAssetType, type JimengStylePreset } from "@/lib/jimengApi";
import { useJimengStore } from "@/store/jimengStore";

const ASSET_TABS: Array<{ type: JimengAssetType; icon: LucideIcon }> = [
  { type: "character", icon: Volume2 },
  { type: "scene", icon: ImageIcon },
  { type: "prop", icon: UploadCloud },
];

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
  const [imageModelOptions, setImageModelOptions] = useState<LlmModelOption[]>([]);
  const [fallbackImageModelValue, setFallbackImageModelValue] = useState("");

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

  useEffect(() => {
    jimengApi
      .getLlmSettings()
      .then((settings) => {
        const options = buildLlmModelOptions(settings, "image");
        const defaultValue = encodeLlmModelValue(settings.default_provider_id, settings.default_model_id);
        const fallback = options.find((model) => model.value === defaultValue)?.value ?? options[0]?.value ?? "";
        setImageModelOptions(options);
        setFallbackImageModelValue(fallback);
      })
      .catch(() => {
        setImageModelOptions([]);
        setFallbackImageModelValue("");
      });
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

  const resolvedImageModelOption = useMemo(
    () => resolveAssetImageModelOption(imageSettings, imageModelOptions, fallbackImageModelValue),
    [fallbackImageModelValue, imageModelOptions, imageSettings],
  );
  const resolvedImageModelValue = resolvedImageModelOption?.value ?? "";
  const resolvedImageModelLabel = assetImageModelLabel(resolvedImageModelOption);

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
      const selectedLlmModel = parseLlmModelValue(resolvedImageModelValue);
      const result = await jimengApi.batchGenerateAssetImagesWithLlm(currentProject.id, {
        asset_ids: targets.map((asset) => asset.id),
        asset_type: activeType,
        provider_id: selectedLlmModel?.providerId,
        model_id: selectedLlmModel?.modelId,
        extra_prompt: imagePromptForAsset(imageSettings, activeType),
      });      setNotice(`批量生图完成：成功 ${result.success_count}，失败 ${result.failed_count}`);
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
      <OperationOverlay open={batchGenerating} title="批量生图中，请等待..." subtitle="正在调用大模型生成资产图片，完成后会自动刷新资产库。" />
      <div className="flex flex-col gap-5 pb-4">
      <AssetToolbar projectName={currentProject.name}>
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
      </AssetToolbar>

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
                <AssetBrowser
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
          globalImageModelValue={resolvedImageModelValue}
          globalImageModelLabel={resolvedImageModelLabel}
          onSettingsOpen={() => setSettingsOpen(true)}
          onSettingsChange={saveImageSettings}
          onRefresh={refreshProject}
          onPreview={setPreviewAsset}
          onSelectAsset={setSelectedAssetId}
        />
      </div>

      <BatchUploadAssetsModal projectId={currentProject.id} open={batchOpen} defaultImageRatio={imageSettings.defaultImageRatio} onClose={() => setBatchOpen(false)} onUploaded={refreshProject} />
      <AssetMetadataImportModal projectId={currentProject.id} open={metadataImportOpen} onClose={() => setMetadataImportOpen(false)} onImported={refreshProject} />
      <AssetImageSettingsModal open={settingsOpen} value={imageSettings} imageModelOptions={imageModelOptions} resolvedImageModelValue={resolvedImageModelValue} stylePresets={stylePresets} onStylePresetsChanged={reloadAssetStylePresets} onClose={() => setSettingsOpen(false)} onSave={saveImageSettings} />
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
