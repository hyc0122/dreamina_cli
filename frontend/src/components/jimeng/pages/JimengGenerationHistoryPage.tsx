"use client";

import clsx from "clsx";
import { CheckSquare, Download, Image as ImageIcon, Lock, LockOpen, PlaySquare, RefreshCw, ShieldCheck, Square, Trash2, Users, Video } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { jimengMediaUrl, JIMENG_ASSET_TYPE_LABELS } from "@/components/jimeng/assets/AssetMiniCard";
import { formatUpdatedAt } from "@/components/jimeng/assets/assetManagerShared";
import LlmImageRecordList, { LLM_MANUAL_POLL_STATUSES, LLM_PENDING_STATUSES, LLM_STATUS_LABELS, llmRecordSubmittedAt, sortLlmRecordsBySubmittedAt } from "@/components/jimeng/history/LlmImageRecordList";
import { filterGenerationCandidates } from "@/components/jimeng/jimengUiHelpers";
import { jimengApi, type JimengAsset, type JimengAssetType, type JimengLlmAssetImageRecord, type JimengQueueStatus, type JimengShot, type JimengVideoCandidate } from "@/lib/jimengApi";
import { useJimengStore } from "@/store/jimengStore";

type LockFilter = "all" | "locked" | "unlocked";
type HistoryMode = "video" | "asset" | "llm_image";
type AssetHistoryType = Extract<JimengAssetType, "character" | "scene">;
type LlmRecordStatusFilter = "all" | "pending" | "succeeded" | "failed" | "canceled";
type LlmAutoCancelMinutes = 0 | 10 | 20 | 30 | 60 | 120;

const STATUS_OPTIONS: Array<{ value: JimengQueueStatus | "all"; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "waiting", label: "等待中" },
  { value: "running", label: "生成中" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
  { value: "canceled", label: "已取消" },
];

const LOCK_OPTIONS: Array<{ value: LockFilter; label: string }> = [
  { value: "all", label: "全部候选" },
  { value: "locked", label: "仅锁定" },
  { value: "unlocked", label: "仅未锁定" },
];

const ASSET_HISTORY_OPTIONS: Array<{ value: AssetHistoryType; label: string }> = [
  { value: "character", label: "人物记录" },
  { value: "scene", label: "场景记录" },
];

const LLM_RECORD_STATUS_OPTIONS: Array<{ value: LlmRecordStatusFilter; label: string }> = [
  { value: "all", label: "全部生图记录" },
  { value: "pending", label: "继续获取中" },
  { value: "succeeded", label: "已保存本地" },
  { value: "failed", label: "失败" },
  { value: "canceled", label: "已取消" },
];

const LLM_AUTO_CANCEL_STORAGE_KEY = "dreamina_cli_llm_image_record_auto_cancel_minutes";
const LLM_AUTO_CANCEL_OPTIONS: Array<{ value: LlmAutoCancelMinutes; label: string }> = [
  { value: 20, label: "超过 20 分钟自动取消" },
  { value: 10, label: "超过 10 分钟自动取消" },
  { value: 30, label: "超过 30 分钟自动取消" },
  { value: 60, label: "超过 1 小时自动取消" },
  { value: 120, label: "超过 2 小时自动取消" },
  { value: 0, label: "不自动取消" },
];

const compact = (value: string | null | undefined, max = 90): string => {
  if (!value) {
    return "无";
  }
  return value.length > max ? `${value.slice(0, max)}...` : value;
};

const shotLabel = (candidate: JimengVideoCandidate, shot?: JimengShot): string =>
  shot ? `分镜${shot.shot_index}` : `分镜 ${candidate.shot_id.slice(0, 8)}`;

const shotVideoDownloadName = (candidate: JimengVideoCandidate, shot?: JimengShot): string => {
  if (!shot) {
    return candidate.video_filename;
  }
  const suffix = candidate.video_filename.match(/\.[^.]+$/)?.[0] ?? ".mp4";
  return `分镜${shot.shot_index}${suffix}`;
};

const hasAssetImage = (asset: JimengAsset): boolean => Boolean(asset.image_path || asset.image_filename);

const readLlmAutoCancelMinutes = (): LlmAutoCancelMinutes => {
  if (typeof window === "undefined") {
    return 20;
  }
  const value = Number(window.localStorage.getItem(LLM_AUTO_CANCEL_STORAGE_KEY));
  return LLM_AUTO_CANCEL_OPTIONS.some((option) => option.value === value) ? (value as LlmAutoCancelMinutes) : 20;
};

export default function JimengGenerationHistoryPage() {
  const projects = useJimengStore((state) => state.projects);
  const currentProject = useJimengStore((state) => state.currentProject);
  const shots = useJimengStore((state) => state.shots);
  const loadProjects = useJimengStore((state) => state.loadProjects);
  const loadProjectData = useJimengStore((state) => state.loadProjectData);
  const [historyMode, setHistoryMode] = useState<HistoryMode>("video");
  const [assetHistoryType, setAssetHistoryType] = useState<AssetHistoryType>("character");
  const [allCandidates, setAllCandidates] = useState<JimengVideoCandidate[]>([]);
  const [allAssets, setAllAssets] = useState<JimengAsset[]>([]);
  const [llmImageRecords, setLlmImageRecords] = useState<JimengLlmAssetImageRecord[]>([]);
  const [historyShots, setHistoryShots] = useState<JimengShot[]>([]);
  const [queueStatusById, setQueueStatusById] = useState<Record<string, JimengQueueStatus>>({});
  const [projectId, setProjectId] = useState<string>("all");
  const [shotId, setShotId] = useState<string>("all");
  const [queueStatus, setQueueStatus] = useState<JimengQueueStatus | "all">("all");
  const [lockState, setLockState] = useState<LockFilter>("all");
  const [llmRecordStatus, setLlmRecordStatus] = useState<LlmRecordStatusFilter>("all");
  const [llmAutoCancelMinutes, setLlmAutoCancelMinutes] = useState<LlmAutoCancelMinutes>(() => readLlmAutoCancelMinutes());
  const [selectedLlmRecordIds, setSelectedLlmRecordIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (projects.length === 0) {
        await loadProjects();
      }
      const latestProjects = useJimengStore.getState().projects;
      const sourceProjects = latestProjects.length > 0 ? latestProjects : currentProject ? [currentProject] : [];
      const [shotGroups, assetGroups, llmRecordsEnvelope] = await Promise.all([
        Promise.all(
          sourceProjects.map(async (project) => {
            if (currentProject?.id === project.id && shots.length > 0) {
              return shots;
            }
            return jimengApi.listShots(project.id);
          }),
        ),
        Promise.all(sourceProjects.map((project) => jimengApi.listAssets(project.id))),
        jimengApi.listLlmAssetImageRecords(),
      ]);
      const nextShots = shotGroups.flat();
      const shotIdsByProject = nextShots.reduce((result, shot) => {
        result.set(shot.project_id, [...(result.get(shot.project_id) ?? []), shot.id]);
        return result;
      }, new Map<string, string[]>());
      const candidateGroups = await Promise.all(
        Array.from(shotIdsByProject, ([targetProjectId, targetShotIds]) =>
          jimengApi.listCandidatesByShotIds(targetProjectId, targetShotIds).then((response) => response.candidates),
        ),
      );
      const queueEnvelope = await jimengApi.listQueue();
      setHistoryShots(nextShots);
      setAllAssets(assetGroups.flat());
      setAllCandidates(candidateGroups.flat());
      setLlmImageRecords(llmRecordsEnvelope.records);
      setQueueStatusById(Object.fromEntries(queueEnvelope.items.map((item) => [item.id, item.status])));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成记录加载失败");
    } finally {
      setLoading(false);
    }
  }, [currentProject, loadProjects, shots, projects.length]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    setSelectedLlmRecordIds((ids) => ids.filter((id) => llmImageRecords.some((record) => record.id === id)));
  }, [llmImageRecords]);

  useEffect(() => {
    window.localStorage.setItem(LLM_AUTO_CANCEL_STORAGE_KEY, String(llmAutoCancelMinutes));
  }, [llmAutoCancelMinutes]);

  const projectById = useMemo(() => {
    const entries = currentProject ? [...projects, currentProject] : projects;
    return new Map(entries.map((project) => [project.id, project]));
  }, [currentProject, projects]);
  const shotById = useMemo(() => new Map(historyShots.map((shot) => [shot.id, shot])), [historyShots]);
  const projectOptions = useMemo(() => {
    const ids = new Set([
      ...historyShots.map((shot) => shot.project_id),
      ...allCandidates.map((candidate) => candidate.project_id),
      ...allAssets.map((asset) => asset.project_id),
      ...llmImageRecords.map((record) => record.project_id),
    ]);
    if (currentProject) {
      ids.add(currentProject.id);
    }
    return Array.from(ids);
  }, [allAssets, allCandidates, currentProject, historyShots, llmImageRecords]);
  const shotOptions = useMemo(
    () => historyShots.filter((shot) => projectId === "all" || shot.project_id === projectId),
    [historyShots, projectId],
  );

  const filteredCandidates = useMemo(
    () =>
      filterGenerationCandidates(allCandidates, {
        projectId: projectId === "all" ? undefined : projectId,
        shotId: shotId === "all" ? undefined : shotId,
        queueStatus,
        lockState,
        queueStatusById,
      }),
    [allCandidates, lockState, projectId, queueStatus, queueStatusById, shotId],
  );

  const assetRecords = useMemo(
    () => allAssets.filter((asset) => (asset.type === "character" || asset.type === "scene") && hasAssetImage(asset)),
    [allAssets],
  );
  const filteredAssetRecords = useMemo(
    () =>
      assetRecords
        .filter((asset) => asset.type === assetHistoryType)
        .filter((asset) => projectId === "all" || asset.project_id === projectId)
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at)),
    [assetHistoryType, assetRecords, projectId],
  );

  const filteredLlmRecords = useMemo(
    () =>
      llmImageRecords
        .filter((record) => projectId === "all" || record.project_id === projectId)
        .filter((record) => {
          if (llmRecordStatus === "all") {
            return true;
          }
          if (llmRecordStatus === "pending") {
            return LLM_PENDING_STATUSES.has(record.status);
          }
          return record.status === llmRecordStatus;
        })
        .sort((left, right) => llmRecordSubmittedAt(right).localeCompare(llmRecordSubmittedAt(left))),
    [llmImageRecords, llmRecordStatus, projectId],
  );
  const allFilteredLlmSelected =
    filteredLlmRecords.length > 0 && filteredLlmRecords.every((record) => selectedLlmRecordIds.includes(record.id));
  const selectedRetryableLlmRecords = useMemo(
    () =>
      llmImageRecords.filter(
        (record) =>
          selectedLlmRecordIds.includes(record.id) &&
          (LLM_PENDING_STATUSES.has(record.status) || LLM_MANUAL_POLL_STATUSES.has(record.status)),
      ),
    [llmImageRecords, selectedLlmRecordIds],
  );

  const activeCount =
    historyMode === "video" ? filteredCandidates.length : historyMode === "asset" ? filteredAssetRecords.length : filteredLlmRecords.length;

  const mergeLlmRecords = useCallback((records: JimengLlmAssetImageRecord[]) => {
    if (records.length === 0) {
      return;
    }
    setLlmImageRecords((items) => {
      const next = new Map(items.map((item) => [item.id, item]));
      for (const record of records) {
        next.set(record.id, record);
      }
      return sortLlmRecordsBySubmittedAt(Array.from(next.values()));
    });
  }, []);

  const refreshCurrentProjectAfterLlmSave = useCallback(
    async (records: JimengLlmAssetImageRecord[]) => {
      if (!currentProject?.id || !records.some((record) => record.project_id === currentProject.id && record.status === "succeeded")) {
        return;
      }
      await loadProjectData(currentProject.id);
    },
    [currentProject?.id, loadProjectData],
  );

  const pollPendingLlmRecords = useCallback(
    async (silent = false) => {
      if (!silent) {
        setNotice(null);
      }
      setError(null);
      try {
        const response = await jimengApi.pollLlmAssetImageRecords({
          project_id: projectId === "all" ? undefined : projectId,
          limit: 20,
          auto_cancel_minutes: llmAutoCancelMinutes,
        });
        mergeLlmRecords(response.records);
        await refreshCurrentProjectAfterLlmSave(response.records);
        if (!silent) {
          const savedCount = response.records.filter((record) => record.status === "succeeded").length;
          const canceledCount = response.records.filter((record) => record.status === "canceled").length;
          setNotice(response.records.length > 0 ? `已继续获取 ${response.records.length} 条记录，保存本地 ${savedCount} 条，自动取消 ${canceledCount} 条` : "暂无需要继续获取的大模型生图记录");
        }
      } catch (caught) {
        if (!silent) {
          setError(caught instanceof Error ? caught.message : "继续获取大模型生图记录失败");
        }
      }
    },
    [llmAutoCancelMinutes, mergeLlmRecords, projectId, refreshCurrentProjectAfterLlmSave],
  );

  const pollOneLlmRecord = async (record: JimengLlmAssetImageRecord) => {
    setNotice(null);
    setError(null);
    try {
      const manual = LLM_MANUAL_POLL_STATUSES.has(record.status);
      const updated = await jimengApi.pollLlmAssetImageRecord(record.id, {
        auto_cancel_minutes: llmAutoCancelMinutes,
        force: manual,
      });
      mergeLlmRecords([updated]);
      await refreshCurrentProjectAfterLlmSave([updated]);
      setNotice(updated.status === "succeeded" ? `已获取并保存：${updated.asset_name}` : `已获取：${updated.asset_name}，当前状态 ${LLM_STATUS_LABELS[updated.status] ?? updated.status}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "获取大模型生图记录失败");
    }
  };

  const cancelLlmRecord = async (record: JimengLlmAssetImageRecord) => {
    setNotice(null);
    setError(null);
    try {
      const updated = await jimengApi.cancelLlmAssetImageRecord(record.id);
      mergeLlmRecords([updated]);
      setNotice(`已取消继续获取：${record.asset_name}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "取消大模型生图记录失败");
    }
  };

  const deleteLlmRecord = async (record: JimengLlmAssetImageRecord) => {
    if (!window.confirm(`删除生图记录「${record.asset_name}」？本地已保存的资产图片不会删除。`)) {
      return;
    }
    setNotice(null);
    setError(null);
    try {
      await jimengApi.deleteLlmAssetImageRecord(record.id);
      setLlmImageRecords((items) => items.filter((item) => item.id !== record.id));
      setNotice(`已删除生图记录：${record.asset_name}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除大模型生图记录失败");
    }
  };

  const toggleLlmRecordSelection = (recordId: string) => {
    setSelectedLlmRecordIds((ids) => (ids.includes(recordId) ? ids.filter((id) => id !== recordId) : [...ids, recordId]));
  };

  const toggleAllFilteredLlmRecords = () => {
    const filteredIds = filteredLlmRecords.map((record) => record.id);
    if (allFilteredLlmSelected) {
      setSelectedLlmRecordIds((ids) => ids.filter((id) => !filteredIds.includes(id)));
      return;
    }
    setSelectedLlmRecordIds((ids) => [...ids, ...filteredIds.filter((id) => !ids.includes(id))]);
  };

  const batchDeleteLlmRecords = async () => {
    if (selectedLlmRecordIds.length === 0) {
      return;
    }
    if (!window.confirm(`批量删除选中的 ${selectedLlmRecordIds.length} 条大模型生图记录？本地已保存的资产图片不会删除。`)) {
      return;
    }
    setNotice(null);
    setError(null);
    try {
      const response = await jimengApi.batchDeleteLlmAssetImageRecords(selectedLlmRecordIds);
      const deletedIds = new Set(response.deleted);
      setLlmImageRecords((items) => items.filter((item) => !deletedIds.has(item.id)));
      setSelectedLlmRecordIds((ids) => ids.filter((id) => !deletedIds.has(id)));
      setNotice(`已删除 ${response.deleted.length} 条大模型生图记录`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "批量删除大模型生图记录失败");
    }
  };

  const pollSelectedLlmRecords = async () => {
    if (selectedRetryableLlmRecords.length === 0) {
      setNotice("请先勾选失败、已取消或待获取记录");
      return;
    }
    setNotice(null);
    setError(null);
    try {
      const response = await jimengApi.pollLlmAssetImageRecords({
        record_ids: selectedRetryableLlmRecords.map((record) => record.id),
        limit: selectedRetryableLlmRecords.length,
        auto_cancel_minutes: llmAutoCancelMinutes,
        force: true,
      });
      mergeLlmRecords(response.records);
      await refreshCurrentProjectAfterLlmSave(response.records);
      const savedCount = response.records.filter((record) => record.status === "succeeded").length;
      const failedCount = response.records.filter((record) => record.status === "failed" || record.status === "poll_error").length;
      setNotice(`已手动获取选中记录 ${response.records.length} 条，保存本地 ${savedCount} 条，失败/异常 ${failedCount} 条`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "手动获取选中大模型生图记录失败");
    }
  };

  useEffect(() => {
    if (historyMode !== "llm_image") {
      return;
    }
    const pending = llmImageRecords.filter(
      (record) => LLM_PENDING_STATUSES.has(record.status) && (projectId === "all" || record.project_id === projectId),
    );
    if (pending.length === 0) {
      return;
    }
    const timer = window.setInterval(() => {
      void pollPendingLlmRecords(true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [historyMode, llmImageRecords, pollPendingLlmRecords, projectId]);

  const setDefault = async (candidate: JimengVideoCandidate) => {
    setNotice(null);
    setError(null);
    try {
      await jimengApi.setDefaultCandidate(candidate.project_id, candidate.shot_id, candidate.id);
      setAllCandidates((items) =>
        items.map((item) => (item.shot_id === candidate.shot_id ? { ...item, is_default: item.id === candidate.id } : item)),
      );
      setNotice(`已设为默认候选：${candidate.video_filename}`);
      await loadProjectData(candidate.project_id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "设置默认候选失败");
    }
  };

  const toggleLock = async (candidate: JimengVideoCandidate) => {
    setNotice(null);
    setError(null);
    try {
      await jimengApi.lockCandidate(candidate.project_id, candidate.shot_id, candidate.id, !candidate.is_locked);
      setAllCandidates((items) => items.map((item) => (item.id === candidate.id ? { ...item, is_locked: !candidate.is_locked } : item)));
      setNotice(candidate.is_locked ? "已取消锁定" : "已锁定候选");
      await loadProjectData(candidate.project_id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "切换锁定失败");
    }
  };

  const downloadCandidate = async (candidate: JimengVideoCandidate) => {
    setNotice(null);
    setError(null);
    try {
      const defaultCandidate = allCandidates.find((item) => item.shot_id === candidate.shot_id && item.is_default) ?? null;
      if (!defaultCandidate) {
        setError("该分镜没有默认视频，请先把候选设为默认。");
        return;
      }
      const shot = shotById.get(defaultCandidate.shot_id);
      const blob = await jimengApi.downloadCandidate(defaultCandidate.project_id, defaultCandidate.shot_id, defaultCandidate.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = shotVideoDownloadName(defaultCandidate, shot);
      a.click();
      URL.revokeObjectURL(url);
      setNotice(`已开始下载默认视频：${shotVideoDownloadName(defaultCandidate, shot)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "下载失败");
    }
  };

  const openAssetImage = (asset: JimengAsset) => {
    const imageUrl = jimengMediaUrl(asset.image_path, asset.updated_at);
    if (imageUrl) {
      window.open(imageUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="flex min-h-0 flex-col gap-4 pb-4">
        <section className="glass-panel sticky top-0 z-20 rounded-xl bg-app-bg/95 px-5 py-4 backdrop-blur-xl">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <PlaySquare size={14} />
                生成记录
              </div>
              <h2 className="mt-2 font-display text-2xl font-semibold text-foreground">生成记录管理</h2>
              <p className="mt-2 text-sm text-text-secondary">集中查看视频候选和资产图片生成结果，方便回溯、对比和定稿。</p>
            </div>
            <div className="rounded-lg border border-glass-border bg-surface-inset px-3 py-2 text-xs text-text-muted">
              当前数量 <span className="font-mono text-primary">{activeCount}</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              ["video", "视频生成记录"],
              ["asset", "资产生成记录"],
              ["llm_image", "大模型生图记录"],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setHistoryMode(mode as HistoryMode)}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  historyMode === mode ? "border-primary/50 bg-primary/15 text-primary" : "border-glass-border bg-surface-inset text-text-secondary hover:bg-hover-bg hover:text-foreground",
                )}
              >
                {mode === "video" ? <Video size={15} /> : mode === "asset" ? <ImageIcon size={15} /> : <RefreshCw size={15} />}
                {label}
              </button>
            ))}
          </div>
          {(notice || error) && (
            <p
              className={clsx(
                "mt-3 rounded-md border px-3 py-2 text-sm",
                error ? "border-red-500/20 bg-red-500/10 text-red-200" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
              )}
            >
              {error ?? notice}
            </p>
          )}
        </section>

        <section className="glass-panel sticky top-[128px] z-10 rounded-xl bg-app-bg/95 px-5 py-4 backdrop-blur-xl">
          <div className="flex flex-wrap gap-3">
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="glass-input w-full sm:w-auto sm:min-w-[180px]">
              <option value="all">全部项目</option>
              {projectOptions.map((id) => (
                <option key={id} value={id}>
                  {projectById.get(id)?.name ?? id}
                </option>
              ))}
            </select>
            {historyMode === "video" ? (
              <>
                <select value={shotId} onChange={(event) => setShotId(event.target.value)} className="glass-input w-full sm:w-auto sm:min-w-[180px]">
                  <option value="all">全部分镜</option>
                  {shotOptions.map((shot) => (
                    <option key={shot.id} value={shot.id}>
                      分镜{shot.shot_index} {compact(shot.prompt, 20)}
                    </option>
                  ))}
                </select>
                <select value={queueStatus} onChange={(event) => setQueueStatus(event.target.value as JimengQueueStatus | "all")} className="glass-input w-full sm:w-auto sm:min-w-[160px]">
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select value={lockState} onChange={(event) => setLockState(event.target.value as LockFilter)} className="glass-input w-full sm:w-auto sm:min-w-[160px]">
                  {LOCK_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </>
            ) : historyMode === "asset" ? (
              <div className="inline-flex rounded-lg border border-glass-border bg-surface-inset p-1">
                {ASSET_HISTORY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setAssetHistoryType(option.value)}
                    className={clsx(
                      "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      assetHistoryType === option.value ? "bg-primary text-white" : "text-text-secondary hover:bg-hover-bg hover:text-foreground",
                    )}
                  >
                    {option.value === "character" ? <Users size={14} /> : <ImageIcon size={14} />}
                    {option.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex flex-wrap rounded-lg border border-glass-border bg-surface-inset p-1">
                  {LLM_RECORD_STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setLlmRecordStatus(option.value)}
                      className={clsx(
                        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                        llmRecordStatus === option.value ? "bg-primary text-white" : "text-text-secondary hover:bg-hover-bg hover:text-foreground",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => pollPendingLlmRecords(false)}
                  className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
                >
                  <RefreshCw size={14} />
                  继续获取全部
                </button>
                <label className="inline-flex items-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-3 py-2 text-xs font-medium text-text-secondary">
                  <span className="shrink-0">超过多久自动取消</span>
                  <select
                    value={llmAutoCancelMinutes}
                    onChange={(event) => setLlmAutoCancelMinutes(Number(event.target.value) as LlmAutoCancelMinutes)}
                    className="bg-transparent text-xs font-semibold text-foreground outline-none"
                  >
                    {LLM_AUTO_CANCEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={toggleAllFilteredLlmRecords}
                  disabled={filteredLlmRecords.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {allFilteredLlmSelected ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
                  {allFilteredLlmSelected ? "取消全选当前" : "全选当前"}
                  <span className="rounded border border-glass-border bg-panel-bg px-1.5 py-0.5 font-mono text-[11px] text-text-muted">{selectedLlmRecordIds.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => pollSelectedLlmRecords()}
                  disabled={selectedRetryableLlmRecords.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <RefreshCw size={14} />
                  手动获取选中
                  <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[11px]">{selectedRetryableLlmRecords.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => batchDeleteLlmRecords()}
                  disabled={selectedLlmRecordIds.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Trash2 size={14} />
                  批量删除记录
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="glass-panel min-h-[620px] overflow-hidden rounded-xl">
          {loading ? (
            <div className="flex min-h-[520px] items-center justify-center text-text-secondary">加载生成记录中...</div>
          ) : historyMode === "video" ? (
            filteredCandidates.length > 0 ? (
              <div className="grid gap-3 p-4 xl:grid-cols-2 2xl:grid-cols-3">
                {filteredCandidates.map((candidate) => {
                  const shot = shotById.get(candidate.shot_id);
                  const videoUrl = jimengMediaUrl(candidate.video_path);
                  const thumbnailUrl = jimengMediaUrl(candidate.thumbnail_path);
                  const label = shotLabel(candidate, shot);
                  return (
                    <article key={candidate.id} className="grid gap-3 rounded-lg border border-glass-border bg-surface-inset p-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                      <div className="aspect-video overflow-hidden rounded-md border border-glass-border bg-black/40">
                        {videoUrl ? (
                          <video src={videoUrl} controls className="h-full w-full object-contain" />
                        ) : thumbnailUrl ? (
                          <div
                            role="img"
                            aria-label={candidate.video_filename}
                            className="h-full w-full bg-cover bg-center"
                            style={{ backgroundImage: `url("${thumbnailUrl.replace(/"/g, '\\"')}")` }}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-text-muted">
                            <Video size={24} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="inline-flex rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                              {label}
                            </div>
                            <h3 title={candidate.video_filename} className="mt-2 truncate text-sm font-semibold text-foreground">
                              {candidate.video_filename}
                            </h3>
                          </div>
                          {candidate.is_locked ? <Lock size={14} className="shrink-0 text-emerald-300" /> : <LockOpen size={14} className="shrink-0 text-text-muted" />}
                        </div>
                        <p className="mt-1 truncate text-xs text-text-muted" title={projectById.get(candidate.project_id)?.name ?? candidate.project_id}>
                          项目：{projectById.get(candidate.project_id)?.name ?? candidate.project_id}
                        </p>
                        <p className="mt-1 truncate text-xs text-text-secondary" title={candidate.source_url ?? candidate.video_path}>
                          {compact(candidate.source_url ?? candidate.video_path, 80)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-text-muted">
                          {candidate.duration ? <span className="rounded border border-glass-border px-1.5 py-0.5">{candidate.duration}s</span> : null}
                          {candidate.resolution ? <span className="rounded border border-glass-border px-1.5 py-0.5">{candidate.resolution}</span> : null}
                          {candidate.ratio ? <span className="rounded border border-glass-border px-1.5 py-0.5">{candidate.ratio}</span> : null}
                          {candidate.is_default ? <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-primary">默认</span> : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setDefault(candidate)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/15"
                          >
                            <ShieldCheck size={13} />
                            设为默认
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleLock(candidate)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-glass-border bg-black/20 px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-hover-bg hover:text-foreground"
                          >
                            {candidate.is_locked ? <LockOpen size={13} /> : <Lock size={13} />}
                            {candidate.is_locked ? "取消锁定" : "锁定"}
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadCandidate(candidate)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-glass-border bg-black/20 px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-hover-bg hover:text-foreground"
                          >
                            <Download size={13} />
                            下载默认
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-[520px] flex-col items-center justify-center p-8 text-center">
                <Video size={42} className="text-text-muted" />
                <h3 className="mt-4 font-display text-xl font-semibold text-foreground">暂无候选视频</h3>
                <p className="mt-2 text-sm text-text-secondary">队列跑完后，多个视频会在这里用于对比和定稿。</p>
              </div>
            )
          ) : historyMode === "asset" ? (
            filteredAssetRecords.length > 0 ? (
            <div className="grid gap-3 p-4 xl:grid-cols-2 2xl:grid-cols-3">
              {filteredAssetRecords.map((asset) => {
                const imageUrl = jimengMediaUrl(asset.image_path, asset.updated_at);
                return (
                  <article key={asset.id} className="grid gap-3 rounded-lg border border-glass-border bg-surface-inset p-3 sm:grid-cols-[150px_minmax(0,1fr)]">
                    <button
                      type="button"
                      onClick={() => openAssetImage(asset)}
                      disabled={!imageUrl}
                      className="aspect-video overflow-hidden rounded-md border border-glass-border bg-black/35 text-text-muted disabled:cursor-default"
                      title={imageUrl ? "打开图片预览" : "暂无图片"}
                    >
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={asset.name}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition-transform hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ImageIcon size={24} />
                        </div>
                      )}
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="inline-flex rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                            {assetHistoryType === "character" ? "人物记录" : "场景记录"}
                          </div>
                          <h3 className="mt-2 truncate text-sm font-semibold text-foreground" title={asset.name}>
                            {asset.name}
                          </h3>
                        </div>
                        <span className="shrink-0 rounded border border-glass-border bg-panel-bg px-2 py-0.5 text-[11px] text-text-muted">
                          {JIMENG_ASSET_TYPE_LABELS[asset.type]}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-text-muted" title={projectById.get(asset.project_id)?.name ?? asset.project_id}>
                        项目：{projectById.get(asset.project_id)?.name ?? asset.project_id}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">更新时间：{formatUpdatedAt(asset.updated_at)}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-text-muted">
                        <span className="rounded border border-glass-border px-1.5 py-0.5">{asset.image_model || "未设置模型"}</span>
                        <span className="rounded border border-glass-border px-1.5 py-0.5">{asset.image_ratio}</span>
                        {asset.image_filename ? <span className="max-w-[160px] truncate rounded border border-glass-border px-1.5 py-0.5">{asset.image_filename}</span> : null}
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-secondary" title={asset.description || asset.image_params}>
                        {asset.description || asset.image_params || "暂无资产描述"}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
            ) : (
              <div className="flex min-h-[520px] flex-col items-center justify-center p-8 text-center">
                <ImageIcon size={42} className="text-text-muted" />
                <h3 className="mt-4 font-display text-xl font-semibold text-foreground">暂无{assetHistoryType === "character" ? "人物" : "场景"}资产生成记录</h3>
                <p className="mt-2 text-sm text-text-secondary">资产生成或上传图片后，会按人物记录、场景记录在这里显示。</p>
              </div>
            )
          ) : filteredLlmRecords.length > 0 ? (
            <LlmImageRecordList
              records={filteredLlmRecords}
              selectedRecordIds={selectedLlmRecordIds}
              projectNameFor={(id) => projectById.get(id)?.name ?? id}
              onToggleSelection={toggleLlmRecordSelection}
              onPoll={(record) => void pollOneLlmRecord(record)}
              onCancel={(record) => void cancelLlmRecord(record)}
              onDelete={(record) => void deleteLlmRecord(record)}
            />
          ) : (
            <div className="flex min-h-[520px] flex-col items-center justify-center p-8 text-center">
              <RefreshCw size={42} className="text-text-muted" />
              <h3 className="mt-4 font-display text-xl font-semibold text-foreground">暂无大模型生图记录</h3>
              <p className="mt-2 text-sm text-text-secondary">资产大模型生图提交后，会在这里保存 task_id、远端状态和本地获取反馈。</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
