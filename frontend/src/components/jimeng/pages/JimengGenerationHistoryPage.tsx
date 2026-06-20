"use client";

import clsx from "clsx";
import { Download, Image as ImageIcon, Lock, LockOpen, PlaySquare, ShieldCheck, Users, Video } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { jimengMediaUrl, JIMENG_ASSET_TYPE_LABELS } from "@/components/jimeng/assets/AssetMiniCard";
import { formatUpdatedAt } from "@/components/jimeng/assets/assetManagerShared";
import { filterGenerationCandidates } from "@/components/jimeng/jimengUiHelpers";
import { jimengApi, type JimengAsset, type JimengAssetType, type JimengQueueStatus, type JimengShot, type JimengVideoCandidate } from "@/lib/jimengApi";
import { useJimengStore } from "@/store/jimengStore";

type LockFilter = "all" | "locked" | "unlocked";
type HistoryMode = "video" | "asset";
type AssetHistoryType = Extract<JimengAssetType, "character" | "scene">;

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
  const [historyShots, setHistoryShots] = useState<JimengShot[]>([]);
  const [queueStatusById, setQueueStatusById] = useState<Record<string, JimengQueueStatus>>({});
  const [projectId, setProjectId] = useState<string>("all");
  const [shotId, setShotId] = useState<string>("all");
  const [queueStatus, setQueueStatus] = useState<JimengQueueStatus | "all">("all");
  const [lockState, setLockState] = useState<LockFilter>("all");
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
      const [shotGroups, assetGroups] = await Promise.all([
        Promise.all(
          sourceProjects.map(async (project) => {
            if (currentProject?.id === project.id && shots.length > 0) {
              return shots;
            }
            return jimengApi.listShots(project.id);
          }),
        ),
        Promise.all(sourceProjects.map((project) => jimengApi.listAssets(project.id))),
      ]);
      const nextShots = shotGroups.flat();
      const candidateGroups = await Promise.all(nextShots.map((shot) => jimengApi.listCandidates(shot.project_id, shot.id)));
      const queueEnvelope = await jimengApi.listQueue();
      setHistoryShots(nextShots);
      setAllAssets(assetGroups.flat());
      setAllCandidates(candidateGroups.flat());
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
    ]);
    if (currentProject) {
      ids.add(currentProject.id);
    }
    return Array.from(ids);
  }, [allAssets, allCandidates, currentProject, historyShots]);
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

  const activeCount = historyMode === "video" ? filteredCandidates.length : filteredAssetRecords.length;

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
      const shot = shotById.get(candidate.shot_id);
      const blob = await jimengApi.downloadCandidate(candidate.project_id, candidate.shot_id, candidate.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = shotVideoDownloadName(candidate, shot);
      a.click();
      URL.revokeObjectURL(url);
      setNotice(`已开始下载：${shotVideoDownloadName(candidate, shot)}`);
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
                {mode === "video" ? <Video size={15} /> : <ImageIcon size={15} />}
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
            ) : (
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
                            下载
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
          ) : filteredAssetRecords.length > 0 ? (
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
                        <img src={imageUrl} alt={asset.name} className="h-full w-full object-cover transition-transform hover:scale-[1.03]" />
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
          )}
        </section>
      </div>
    </div>
  );
}