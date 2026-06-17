"use client";

import { ArrowLeft, Clapperboard, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AssetPickerDrawer, { type AssetPickerTarget } from "@/components/jimeng/AssetPickerDrawer";
import BatchSubmitSettingsModal from "@/components/jimeng/BatchSubmitSettingsModal";
import ConfirmMissingPropsModal from "@/components/jimeng/ConfirmMissingPropsModal";
import ShotDetailPanel from "@/components/jimeng/ShotDetailPanel";
import ShotProductionTable from "@/components/jimeng/ShotProductionTable";
import {
  DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS,
  type JimengAssetType,
  type JimengShot,
  type JimengVideoGenerationSettings,
} from "@/lib/jimengApi";
import { useJimengStore } from "@/store/jimengStore";

const errorMessageFrom = (error: unknown): string => (error instanceof Error ? error.message : "提交分镜失败");

export default function JimengWorkbenchPage() {
  const currentProject = useJimengStore((state) => state.currentProject);
  const shots = useJimengStore((state) => state.shots);
  const assets = useJimengStore((state) => state.assets);
  const bindingsByShotId = useJimengStore((state) => state.bindingsByShotId);
  const highlightsByShotId = useJimengStore((state) => state.highlightsByShotId);
  const promptPresets = useJimengStore((state) => state.promptPresets);
  const selectedShotIds = useJimengStore((state) => state.selectedShotIds);
  const selectedShotId = useJimengStore((state) => state.selectedShotId);
  const rightPanelMode = useJimengStore((state) => state.rightPanelMode);
  const loading = useJimengStore((state) => state.loading);
  const storeError = useJimengStore((state) => state.error);
  const loadProjectData = useJimengStore((state) => state.loadProjectData);
  const setActivePage = useJimengStore((state) => state.setActivePage);
  const setRightPanelMode = useJimengStore((state) => state.setRightPanelMode);
  const submitShots = useJimengStore((state) => state.submitShots);

  const [focusedShotId, setFocusedShotId] = useState<string | null>(null);
  const [assetPickerTarget, setAssetPickerTarget] = useState<AssetPickerTarget | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generationSettings, setGenerationSettings] = useState<JimengVideoGenerationSettings>(DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS);
  const [batchSettingsOpen, setBatchSettingsOpen] = useState(false);
  const [confirmMissingPropsOpen, setConfirmMissingPropsOpen] = useState(false);
  const [missingPropShotIndexes, setMissingPropShotIndexes] = useState<number[]>([]);
  const [pendingSubmitShotIds, setPendingSubmitShotIds] = useState<string[]>([]);
  const [pendingGenerationSettings, setPendingGenerationSettings] = useState<JimengVideoGenerationSettings>(
    DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS,
  );
  const submittingRef = useRef(false);
  const workbenchLoadHandledProjectId = useRef<string | null>(null);
  const syncedDurationKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const projectId = currentProject?.id;
    if (!projectId) {
      workbenchLoadHandledProjectId.current = null;
      return;
    }
    if (workbenchLoadHandledProjectId.current === projectId) {
      return;
    }

    const hasDataForProject =
      shots.some((shot) => shot.project_id === projectId) ||
      assets.some((asset) => asset.project_id === projectId) ||
      promptPresets.length > 0;

    if (loading || hasDataForProject) {
      workbenchLoadHandledProjectId.current = projectId;
      return;
    }

    workbenchLoadHandledProjectId.current = projectId;
    void loadProjectData(projectId);
  }, [assets, currentProject?.id, loadProjectData, loading, promptPresets.length, shots]);

  useEffect(() => {
    if (focusedShotId && !shots.some((shot) => shot.id === focusedShotId)) {
      setFocusedShotId(null);
    }
  }, [focusedShotId, shots]);

  useEffect(() => {
    const ratio = currentProject?.default_ratio;
    if (!ratio) {
      return;
    }
    setGenerationSettings((settings) => ({ ...settings, ratio }));
    setPendingGenerationSettings((settings) => ({ ...settings, ratio }));
  }, [currentProject?.default_ratio, currentProject?.id]);

  const currentPreset = useMemo(
    () => promptPresets.find((preset) => preset.id === currentProject?.prompt_preset_id) ?? null,
    [currentProject?.prompt_preset_id, promptPresets],
  );
  const promptPresetName = currentPreset?.name ?? (currentProject?.prompt_preset_id ? "模板未加载" : "未设置模板");
  const selectedShotSet = useMemo(() => new Set(selectedShotIds), [selectedShotIds]);
  const selectedShots = useMemo(() => shots.filter((shot) => selectedShotSet.has(shot.id)), [selectedShotSet, shots]);
  const focusedShot = useMemo(() => {
    const preferredId = focusedShotId ?? selectedShotId ?? selectedShotIds[0] ?? null;
    return shots.find((shot) => shot.id === preferredId) ?? shots[0] ?? null;
  }, [focusedShotId, selectedShotId, selectedShotIds, shots]);

  useEffect(() => {
    if (!focusedShot?.default_duration) {
      return;
    }
    const syncKey = `${focusedShot.id}:${focusedShot.default_duration}`;
    if (syncedDurationKeyRef.current === syncKey) {
      return;
    }
    syncedDurationKeyRef.current = syncKey;
    setGenerationSettings((settings) => ({
      ...settings,
      duration: focusedShot.default_duration ?? settings.duration,
    }));
  }, [focusedShot?.default_duration, focusedShot?.id]);

  const bindingTypesForShot = useCallback(
    (shot: JimengShot) => new Set((bindingsByShotId[shot.id] ?? []).map((binding) => binding.asset_type)),
    [bindingsByShotId],
  );

  const submitNow = useCallback(async (shotIds: string[], settings: JimengVideoGenerationSettings) => {
    if (!currentProject || submittingRef.current) {
      return false;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);

    try {
      await submitShots(shotIds, settings);
      await loadProjectData(currentProject.id);
      setConfirmMissingPropsOpen(false);
      setBatchSettingsOpen(false);
      setPendingSubmitShotIds([]);
      setSubmitError(null);
      return true;
    } catch (error) {
      setSubmitError(errorMessageFrom(error));
      return false;
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [currentProject, loadProjectData, submitShots]);

  const requestSubmitShots = useCallback((targetShots: JimengShot[], settings: JimengVideoGenerationSettings) => {
    if (submittingRef.current) {
      return;
    }
    if (!currentProject) {
      return;
    }
    if (targetShots.length === 0) {
      setSubmitError("请先选择要提交的分镜");
      return;
    }

    const missingRequired = targetShots
      .map((shot) => {
        const bindingTypes = bindingTypesForShot(shot);
        const missing: string[] = [];
        if (!bindingTypes.has("character")) {
          missing.push("角色");
        }
        if (!bindingTypes.has("scene")) {
          missing.push("场景");
        }
        return { shot, missing };
      })
      .filter((item) => item.missing.length > 0);

    if (missingRequired.length > 0) {
      setSubmitError(
        missingRequired
          .map((item) => `分镜${item.shot.shot_index} 缺少${item.missing.join("、")}`)
          .join("；"),
      );
      return;
    }

    const missingProps = targetShots.filter((shot) => !bindingTypesForShot(shot).has("prop"));
    if (missingProps.length > 0) {
      setSubmitError(null);
      setPendingSubmitShotIds(targetShots.map((shot) => shot.id));
      setPendingGenerationSettings(settings);
      setMissingPropShotIndexes(missingProps.map((shot) => shot.shot_index));
      setConfirmMissingPropsOpen(true);
      return;
    }

    void submitNow(targetShots.map((shot) => shot.id), settings);
  }, [bindingTypesForShot, currentProject, submitNow]);

  const handleSubmitSelected = useCallback(
    (settings: JimengVideoGenerationSettings = generationSettings) => {
      requestSubmitShots(selectedShots, settings);
    },
    [generationSettings, requestSubmitShots, selectedShots],
  );

  const handleSubmitCurrent = useCallback(() => {
    if (!focusedShot) {
      setSubmitError("请先选择一个分镜");
      return;
    }
    requestSubmitShots([focusedShot], generationSettings);
  }, [focusedShot, generationSettings, requestSubmitShots]);

  const openAssetPicker = useCallback(
    (shot: JimengShot, assetType: JimengAssetType, assetId?: string) => {
      setFocusedShotId(shot.id);
      setAssetPickerTarget({ shot, assetType, assetId });
      setRightPanelMode("asset_picker");
    },
    [setRightPanelMode],
  );

  const previewShot = useCallback(
    (shotId: string) => {
      setFocusedShotId(shotId);
      setAssetPickerTarget(null);
      setRightPanelMode("preview");
    },
    [setRightPanelMode],
  );

  const closeAssetPicker = useCallback(() => {
    setAssetPickerTarget(null);
    setRightPanelMode("preview");
  }, [setRightPanelMode]);

  const handleAssetBound = useCallback(async () => {
    if (!currentProject) {
      return;
    }
    await loadProjectData(currentProject.id);
  }, [currentProject, loadProjectData]);

  if (!currentProject) {
    return (
      <div className="glass-panel flex min-h-[420px] flex-col items-center justify-center rounded-xl p-8 text-center">
        <Clapperboard size={42} className="text-text-muted" />
        <h2 className="mt-4 font-display text-xl font-semibold text-foreground">还没有选择剧本</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">先回到剧本列表选择一个项目，再进入分镜工作台。</p>
        <button
          type="button"
          onClick={() => setActivePage("projects")}
          className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
        >
          <ArrowLeft size={15} />
          回到剧本列表
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <section className="glass-panel shrink-0 rounded-xl px-4 py-2.5">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-muted">
            <span className="inline-flex items-center gap-1.5 font-medium text-primary">
              <Sparkles size={14} />
              分镜工作台
            </span>
            <h2 className="truncate font-display text-lg font-semibold text-foreground">{currentProject.name}</h2>
            <span className="rounded border border-glass-border bg-black/20 px-2 py-1">风格：{currentProject.style || "未设置"}</span>
            <span className="rounded border border-glass-border bg-black/20 px-2 py-1">分镜数：{shots.length}</span>
            <span className="rounded border border-glass-border bg-black/20 px-2 py-1">默认画幅：{currentProject.default_ratio || "9:16"}</span>
            <span className="rounded border border-glass-border bg-surface-inset px-2 py-1">视频模板：{promptPresetName}</span>
          </div>

          <button
            type="button"
            onClick={() => loadProjectData(currentProject.id)}
            disabled={loading}
            className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-glass-border bg-surface-inset px-3 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground disabled:cursor-wait disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            刷新项目数据
          </button>
        </div>
        {storeError ? <p className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{storeError}</p> : null}
      </section>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_410px]">
        <section className="glass-panel min-h-0 min-w-0 overflow-hidden rounded-xl">
          <ShotProductionTable
            project={currentProject}
            shots={shots}
            assets={assets}
            bindingsByShotId={bindingsByShotId}
            highlightsByShotId={highlightsByShotId}
            selectedShotIds={selectedShotIds}
            focusedShotId={focusedShot?.id ?? null}
            submitError={submitError}
            submitting={submitting}
            onPreviewShot={previewShot}
            onOpenAssetPicker={openAssetPicker}
            onOpenBatchSettings={() => setBatchSettingsOpen(true)}
          />
        </section>

        <aside className="glass-panel min-h-0 overflow-hidden rounded-xl">
          {rightPanelMode === "asset_picker" && assetPickerTarget ? (
            <AssetPickerDrawer
              projectId={currentProject.id}
              target={assetPickerTarget}
              assets={assets}
              bindings={bindingsByShotId[assetPickerTarget.shot.id] ?? []}
              onClose={closeAssetPicker}
              onBound={handleAssetBound}
            />
          ) : (
            <ShotDetailPanel
              project={currentProject}
              shot={focusedShot}
              promptPresetName={promptPresetName}
              selectedCount={selectedShotIds.length}
              submitting={submitting}
              generationSettings={generationSettings}
              onGenerationSettingsChange={setGenerationSettings}
              onSubmitCurrent={handleSubmitCurrent}
            />
          )}
        </aside>
      </div>

      <ConfirmMissingPropsModal
        open={confirmMissingPropsOpen}
        projectId={currentProject.id}
        promptPresetId={currentProject.prompt_preset_id}
        promptPresetName={promptPresetName}
        selectedShots={shots.filter((shot) => pendingSubmitShotIds.includes(shot.id))}
        missingPropShotIndexes={missingPropShotIndexes}
        submitting={submitting}
        onCancel={() => setConfirmMissingPropsOpen(false)}
        onConfirm={() => submitNow(pendingSubmitShotIds, pendingGenerationSettings)}
      />
      <BatchSubmitSettingsModal
        open={batchSettingsOpen}
        selectedCount={selectedShots.length}
        submitting={submitting}
        value={generationSettings}
        onClose={() => setBatchSettingsOpen(false)}
        onConfirm={(settings) => {
          setGenerationSettings(settings);
          handleSubmitSelected(settings);
        }}
      />
    </div>
  );
}
