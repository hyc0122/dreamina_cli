"use client";

import { AlertTriangle, ArrowLeft, Clapperboard, RefreshCw, ScrollText, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AssetPickerDrawer, { type AssetPickerTarget } from "@/components/jimeng/assets/AssetPickerDrawer";
import BatchSubmitSettingsModal from "@/components/jimeng/workbench/BatchSubmitSettingsModal";
import PromptPresetManagerModal from "@/components/jimeng/workbench/PromptPresetManagerModal";
import ShotDetailPanel from "@/components/jimeng/workbench/ShotDetailPanel";
import ShotProductionTable from "@/components/jimeng/workbench/ShotProductionTable";
import { buildLlmModelOptions, type LlmModelOption } from "@/components/jimeng/llm/modelOptions";
import {
  DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS,
  clampJimengVideoDuration,
  jimengApi,
  type JimengAsset,
  type JimengAssetBinding,
  type JimengAssetType,
  type JimengSettings,
  type JimengShot,
  type JimengVideoGenerationSettings,
} from "@/lib/jimengApi";
import { useJimengStore } from "@/store/jimengStore";

const errorMessageFrom = (error: unknown): string => (error instanceof Error ? error.message : "提交分镜失败");
const MULTIMODAL_AUDIO_LIMIT = 3;

const settingsToGenerationSettings = (
  settings: JimengSettings,
  current: JimengVideoGenerationSettings,
  projectRatio?: string,
): JimengVideoGenerationSettings => ({
  ...current,
  provider: "dreamina_cli",
  account_id: "",
  model_version: settings.model_version || current.model_version,
  duration: settings.duration === undefined ? current.duration : clampJimengVideoDuration(settings.duration),
  ratio: projectRatio || settings.ratio || current.ratio,
  video_resolution: settings.video_resolution || current.video_resolution,
  poll_seconds: Number(settings.poll_seconds) > 0 ? Number(settings.poll_seconds) : current.poll_seconds,
});

export const submitReferenceIssueForShot = (
  shot: JimengShot,
  bindings: JimengAssetBinding[],
  assetById: Map<string, JimengAsset>,
  settings: JimengVideoGenerationSettings,
): string | null => {
  if (settings.generation_mode === "text2video") {
    return null;
  }

  const enabledAudioPaths = new Set(
    bindings
      .filter((binding) => binding.asset_type === "character" && binding.voice_enabled !== false)
      .map((binding) => assetById.get(binding.asset_id)?.audio_path?.trim())
      .filter((path): path is string => Boolean(path)),
  );

  if (enabledAudioPaths.size > MULTIMODAL_AUDIO_LIMIT) {
    return `分镜${shot.shot_index} 全能参考音频最多 3 段，当前为 ${enabledAudioPaths.size} 段；请关闭多余角色音色`;
  }

  return null;
};

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
  const refreshShotAssetsAndBindings = useJimengStore((state) => state.refreshShotAssetsAndBindings);
  const saveShotPrompt = useJimengStore((state) => state.saveShotPrompt);
  const setActivePage = useJimengStore((state) => state.setActivePage);
  const setRightPanelMode = useJimengStore((state) => state.setRightPanelMode);
  const submitShots = useJimengStore((state) => state.submitShots);

  const [focusedShotId, setFocusedShotId] = useState<string | null>(null);
  const [assetPickerTarget, setAssetPickerTarget] = useState<AssetPickerTarget | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [workerOfflineNotice, setWorkerOfflineNotice] = useState<{ title: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generationSettings, setGenerationSettings] = useState<JimengVideoGenerationSettings>(DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS);
  const [batchSubmitIntervalSeconds, setBatchSubmitIntervalSeconds] = useState(3);
  const [batchSettingsOpen, setBatchSettingsOpen] = useState(false);
  const [promptPresetManagerOpen, setPromptPresetManagerOpen] = useState(false);
  const [videoModelOptions, setVideoModelOptions] = useState<LlmModelOption[]>([]);
  const submittingRef = useRef(false);
  const workbenchLoadHandledProjectId = useRef<string | null>(null);
  const syncedDurationKeyRef = useRef<string | null>(null);
  const settingsLoadHandledProjectId = useRef<string | null>(null);

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
  }, [currentProject?.default_ratio, currentProject?.id]);

  useEffect(() => {
    const projectId = currentProject?.id;
    if (!projectId || settingsLoadHandledProjectId.current === projectId) {
      return;
    }
    settingsLoadHandledProjectId.current = projectId;
    void jimengApi
      .getSettings()
      .then((settings) => {
        setGenerationSettings((current) => settingsToGenerationSettings(settings, current, currentProject?.default_ratio));
        setBatchSubmitIntervalSeconds(Math.min(300, Math.max(1, Math.round(Number(settings.submit_interval_seconds) || 3))));
      })
      .catch(() => {
        settingsLoadHandledProjectId.current = null;
      });
  }, [currentProject?.default_ratio, currentProject?.id]);

  useEffect(() => {
    jimengApi
      .getLlmSettings()
      .then((settings) => setVideoModelOptions(buildLlmModelOptions(settings, "video")))
      .catch(() => setVideoModelOptions([]));
  }, []);

  const currentPreset = useMemo(
    () => promptPresets.find((preset) => preset.id === currentProject?.prompt_preset_id) ?? null,
    [currentProject?.prompt_preset_id, promptPresets],
  );
  const promptPresetName = currentPreset?.name ?? (currentProject?.prompt_preset_id ? "模板未加载" : "未设置模板");
  const selectedShotSet = useMemo(() => new Set(selectedShotIds), [selectedShotIds]);
  const selectedShots = useMemo(() => shots.filter((shot) => selectedShotSet.has(shot.id)), [selectedShotSet, shots]);
  const batchSubmitTargetShots = useMemo(() => (selectedShots.length > 0 ? selectedShots : shots), [selectedShots, shots]);
  const focusedShot = useMemo(() => {
    const preferredId = focusedShotId ?? selectedShotId ?? selectedShotIds[0] ?? null;
    return shots.find((shot) => shot.id === preferredId) ?? shots[0] ?? null;
  }, [focusedShotId, selectedShotId, selectedShotIds, shots]);
  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  useEffect(() => {
    if (focusedShot?.default_duration == null) {
      return;
    }
    const syncKey = `${focusedShot.id}:${focusedShot.default_duration}`;
    if (syncedDurationKeyRef.current === syncKey) {
      return;
    }
    syncedDurationKeyRef.current = syncKey;
    setGenerationSettings((settings) => ({
      ...settings,
      duration: focusedShot.default_duration === null ? settings.duration : clampJimengVideoDuration(focusedShot.default_duration),
    }));
  }, [focusedShot?.default_duration, focusedShot?.id]);

  const shotHasBoundImage = useCallback(
    (shot: JimengShot) =>
      (bindingsByShotId[shot.id] ?? []).some((binding) => {
        const asset = assetById.get(binding.asset_id);
        return Boolean(asset?.image_path);
      }),
    [assetById, bindingsByShotId],
  );

  const submitNow = useCallback(async (shotIds: string[], settings: JimengVideoGenerationSettings) => {
    if (!currentProject || submittingRef.current) {
      return false;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setWorkerOfflineNotice(null);

    try {
      await submitShots(shotIds, settings);
      try {
        const queueStatus = await jimengApi.startQueue();
        if (!queueStatus.worker_online) {
          setWorkerOfflineNotice({
            title: "队列已开启，但 worker 离线",
            message: "分镜已提交到本地队列，队列开关已自动开启；目前没有检测到独立 worker 在线心跳。请进入“即梦排队”页面，点击“启动 worker”。",
          });
        }
      } catch (error) {
        setWorkerOfflineNotice({
          title: "队列自动启动失败",
          message: `分镜已提交到本地队列，但自动开启队列失败：${errorMessageFrom(error)}。请进入“即梦排队”页面，点击“开始队列”和“启动 worker”。`,
        });
      }
      setBatchSettingsOpen(false);
      setSubmitError(null);
      return true;
    } catch (error) {
      setSubmitError(errorMessageFrom(error));
      void loadProjectData(currentProject.id);
      return false;
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [currentProject, loadProjectData, submitShots]);

  const requestSubmitShots = useCallback((targetShots: JimengShot[], settings: JimengVideoGenerationSettings) => {
    if (submittingRef.current) {
      return false;
    }
    if (!currentProject) {
      return false;
    }
    if (targetShots.length === 0) {
      setSubmitError("请先选择要提交的分镜");
      return false;
    }

    const missingImages = targetShots.filter((shot) => !shotHasBoundImage(shot));
    if (missingImages.length > 0) {
      setSubmitError(
        missingImages
          .map((shot) => `分镜${shot.shot_index} 没有可提交的资产图片`)
          .join("；"),
      );
      return false;
    }

    const referenceIssues = targetShots
      .map((shot) => submitReferenceIssueForShot(shot, bindingsByShotId[shot.id] ?? [], assetById, settings))
      .filter((message): message is string => Boolean(message));
    if (referenceIssues.length > 0) {
      setSubmitError(referenceIssues.join("；"));
      return false;
    }

    void submitNow(targetShots.map((shot) => shot.id), settings);
    return true;
  }, [assetById, bindingsByShotId, currentProject, shotHasBoundImage, submitNow]);

  const handleSubmitSelected = useCallback(
    (settings: JimengVideoGenerationSettings = generationSettings) => {
      return requestSubmitShots(batchSubmitTargetShots, settings);
    },
    [batchSubmitTargetShots, generationSettings, requestSubmitShots],
  );

  const handleSubmitCurrent = useCallback(() => {
    if (!focusedShot) {
      setSubmitError("请先选择一个分镜");
      return;
    }
    requestSubmitShots([focusedShot], generationSettings);
  }, [focusedShot, generationSettings, requestSubmitShots]);

  const saveBatchSubmitSettings = useCallback(async (settings: JimengVideoGenerationSettings, submitIntervalSeconds: number) => {
    const interval = Math.min(300, Math.max(1, Math.round(submitIntervalSeconds || 3)));
    setGenerationSettings(settings);
    setBatchSubmitIntervalSeconds(interval);
    await jimengApi.updateSettings({ submit_interval_seconds: interval });
    setBatchSettingsOpen(false);
  }, []);

  const submitSelectedFromBatchSettings = useCallback(async (settings: JimengVideoGenerationSettings, submitIntervalSeconds: number) => {
    const interval = Math.min(300, Math.max(1, Math.round(submitIntervalSeconds || 3)));
    setGenerationSettings(settings);
    setBatchSubmitIntervalSeconds(interval);
    await jimengApi.updateSettings({ submit_interval_seconds: interval });
    const accepted = handleSubmitSelected(settings);
    if (accepted) {
      setBatchSettingsOpen(false);
    }
  }, [handleSubmitSelected]);

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
    const shotId = assetPickerTarget?.shot.id;
    if (!shotId) {
      await loadProjectData(currentProject.id);
      return;
    }
    await refreshShotAssetsAndBindings(currentProject.id, shotId);
  }, [assetPickerTarget?.shot.id, currentProject, loadProjectData, refreshShotAssetsAndBindings]);

  const handleSaveShotPrompt = useCallback(
    async (shotId: string, prompt: string) => {
      if (!currentProject) {
        return;
      }
      await saveShotPrompt(currentProject.id, shotId, prompt);
    },
    [currentProject, saveShotPrompt],
  );

  const openQueuePageForWorker = useCallback(() => {
    setWorkerOfflineNotice(null);
    setActivePage("queue");
  }, [setActivePage]);

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

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPromptPresetManagerOpen(true)}
              className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-primary/35 bg-primary/10 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
            >
              <ScrollText size={15} />
              视频指令模板
            </button>
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
            onSaveShotPrompt={handleSaveShotPrompt}
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
              submitError={submitError}
              generationSettings={generationSettings}
              videoModelOptions={videoModelOptions}
              onGenerationSettingsChange={setGenerationSettings}
              onSubmitCurrent={handleSubmitCurrent}
            />
          )}
        </aside>
      </div>

      <BatchSubmitSettingsModal
        open={batchSettingsOpen}
        selectedCount={batchSubmitTargetShots.length}
        submitting={submitting}
        value={generationSettings}
        submitIntervalSeconds={batchSubmitIntervalSeconds}
        videoModelOptions={videoModelOptions}
        onClose={() => setBatchSettingsOpen(false)}
        onSave={saveBatchSubmitSettings}
        onSubmit={submitSelectedFromBatchSettings}
      />
      {workerOfflineNotice ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4 py-6">
          <div role="dialog" aria-modal="true" className="modal-panel w-full max-w-lg rounded-xl p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-amber-400/30 bg-amber-500/10 text-amber-200">
                <AlertTriangle size={20} />
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold text-foreground">{workerOfflineNotice.title}</h3>
                <p className="mt-2 text-sm leading-6 text-text-secondary">{workerOfflineNotice.message}</p>
                <p className="mt-3 rounded-md border border-glass-border bg-surface-inset px-3 py-2 text-xs leading-5 text-text-muted">
                  开启位置：顶部导航「即梦排队」→ 状态区「启动 worker」。
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setWorkerOfflineNotice(null)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-glass-border bg-surface-inset px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground"
              >
                我知道了
              </button>
              <button
                type="button"
                onClick={openQueuePageForWorker}
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary/90"
              >
                去即梦排队开启
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <PromptPresetManagerModal open={promptPresetManagerOpen} onClose={() => setPromptPresetManagerOpen(false)} />
    </div>
  );
}
