"use client";

import clsx from "clsx";
import { Download, Loader2, RefreshCw, Send, Upload, Video } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { jimengMediaUrl } from "@/components/jimeng/assets/AssetMiniCard";
import GenerationSettingsControl from "@/components/jimeng/workbench/GenerationSettingsControl";
import type { LlmModelOption } from "@/components/jimeng/llm/modelOptions";
import { jimengApi, type JimengProject, type JimengShot, type JimengVideoCandidate, type JimengVideoGenerationSettings } from "@/lib/jimengApi";
import { useJimengStore } from "@/store/jimengStore";

interface ShotDetailPanelProps {
  project: JimengProject;
  shot: JimengShot | null;
  promptPresetName: string;
  selectedCount: number;
  submitting: boolean;
  generationSettings: JimengVideoGenerationSettings;
  videoModelOptions?: LlmModelOption[];
  onGenerationSettingsChange: (settings: JimengVideoGenerationSettings) => void;
  onSubmitCurrent: () => void;
}

const candidateLabel = (candidate: JimengVideoCandidate, index: number) => {
  if (candidate.is_locked) {
    return `锁定候选 ${index + 1}`;
  }
  if (candidate.is_default) {
    return `默认候选 ${index + 1}`;
  }
  return `候选 ${index + 1}`;
};

export default function ShotDetailPanel({
  project,
  shot,
  promptPresetName,
  selectedCount,
  submitting,
  generationSettings,
  videoModelOptions = [],
  onGenerationSettingsChange,
  onSubmitCurrent,
}: ShotDetailPanelProps) {
  const loadProjectData = useJimengStore((state) => state.loadProjectData);
  const [candidates, setCandidates] = useState<JimengVideoCandidate[]>([]);
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const loadCandidates = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const shotId = shot?.id ?? null;

    setCandidates([]);
    setActiveCandidateId(null);

    if (!shotId) {
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextCandidates = await jimengApi.listCandidates(project.id, shotId);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setCandidates(nextCandidates);
      const preferred =
        nextCandidates.find((candidate) => candidate.is_locked) ??
        nextCandidates.find((candidate) => candidate.is_default) ??
        nextCandidates[0] ??
        null;
      setActiveCandidateId(preferred?.id ?? null);
    } catch (caught) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setError(caught instanceof Error ? caught.message : "候选视频加载失败");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [project.id, shot?.id]);

  useEffect(() => {
    void loadCandidates();
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadCandidates]);

  const uploadLocalVideo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file || !shot || uploading) {
      return;
    }

    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const uploaded = await jimengApi.uploadVideoCandidate(project.id, shot.id, file);
      setCandidates((items) => {
        const normalizedItems = uploaded.is_default
          ? items.map((item) => (item.shot_id === uploaded.shot_id ? { ...item, is_default: false } : item))
          : items;
        return [...normalizedItems.filter((item) => item.id !== uploaded.id), uploaded];
      });
      setActiveCandidateId(uploaded.id);
      setNotice(`已上传本地视频：${uploaded.video_filename}`);
      await loadProjectData(project.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "本地视频上传失败");
    } finally {
      setUploading(false);
    }
  };

  const activeCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === activeCandidateId) ?? candidates[0] ?? null,
    [activeCandidateId, candidates],
  );
  const videoUrl = jimengMediaUrl(activeCandidate?.video_path);

  const exportActiveCandidate = async () => {
    if (!shot || !activeCandidate || exporting) {
      return;
    }
    setExporting(true);
    setError(null);
    setNotice(null);
    try {
      const { path: targetDir } = await jimengApi.selectDirectory();
      if (!targetDir) {
        return;
      }
      const result = await jimengApi.exportCandidate(project.id, shot.id, activeCandidate.id, { target_dir: targetDir });
      setNotice(`视频已保存：${result.path}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "视频导出失败");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-glass-border px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-base font-semibold text-foreground">视频预览</p>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              {shot ? `分镜${shot.shot_index}` : "请选择一个分镜"} · 模板：{promptPresetName}
            </p>
          </div>
          <button
            type="button"
            title="刷新候选视频"
            onClick={loadCandidates}
            disabled={!shot || loading}
            className="grid h-8 w-8 place-items-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mx-auto aspect-video max-h-[230px] w-full overflow-hidden rounded-lg border border-glass-border bg-black/40">
          {videoUrl ? (
            <video key={videoUrl} src={videoUrl} controls className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-text-muted">
              <Video size={34} />
              <p className="text-sm">{shot ? "暂无候选视频" : "未选择分镜"}</p>
            </div>
          )}
        </div>

        <input
          ref={uploadInputRef}
          type="file"
          accept=".mp4,.mov,.m4v,.webm,.avi,.mkv,video/mp4,video/quicktime,video/webm"
          className="sr-only"
          onChange={uploadLocalVideo}
          disabled={!shot || uploading}
        />
        <div className="mt-3 grid gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            disabled={!shot || uploading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-glass-border bg-black/20 px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
          >
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {uploading ? "本地视频上传中..." : "上传本地视频"}
          </button>
          <button
            type="button"
            onClick={exportActiveCandidate}
            disabled={!shot || !activeCandidate || exporting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-glass-border bg-black/20 px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
          >
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {exporting ? "保存中..." : "下载当前视频"}
          </button>
          </div>
          <div className="rounded-lg border border-glass-border bg-surface-inset p-2.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">本次提交参数</p>
                <p className="mt-1 text-xs leading-5 text-text-muted">只影响当前点击提交的分镜，不会写回即梦设置页。</p>
              </div>
              <span className="rounded border border-primary/25 bg-primary/10 px-2 py-1 font-mono text-[10px] text-primary">
                {generationSettings.video_resolution}
              </span>
            </div>
            <GenerationSettingsControl
              compact
              value={generationSettings}
              videoModelOptions={videoModelOptions}
              onChange={onGenerationSettingsChange}
            />
          </div>
          <button
            type="button"
            onClick={onSubmitCurrent}
            disabled={!shot || submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:border-glass-border disabled:bg-black/20 disabled:text-text-muted"
          >
            <Send size={15} />
            {submitting ? "提交中..." : shot ? `提交当前分镜${shot.shot_index}` : "请选择分镜"}
          </button>
          {selectedCount > 0 ? (
            <p className="text-center text-xs text-text-muted">已勾选 {selectedCount} 个分镜；批量提交请用左侧工具栏。</p>
          ) : null}
        </div>

        {error ? <p className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
        {notice && !error ? (
          <p className="mt-3 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{notice}</p>
        ) : null}

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-text-secondary">候选视频</p>
            <span className="font-mono text-xs text-text-muted">{candidates.length}</span>
          </div>

          {candidates.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 2xl:grid-cols-2">
              {candidates.map((candidate, index) => {
                const thumbnailUrl = jimengMediaUrl(candidate.thumbnail_path);
                const isActive = candidate.id === activeCandidate?.id;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setActiveCandidateId(candidate.id)}
                    className={clsx(
                      "min-w-0 rounded-md border p-1.5 text-left transition-colors",
                      isActive
                        ? "border-primary/50 bg-primary/10"
                        : "border-glass-border bg-black/20 hover:border-white/20 hover:bg-hover-bg",
                    )}
                  >
                    <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded bg-black/30">
                      {thumbnailUrl ? (
                        <img src={thumbnailUrl} alt={candidate.video_filename} className="h-full w-full object-cover" />
                      ) : (
                        <Video size={18} className="text-text-muted" />
                      )}
                    </div>
                    <div className="mt-1.5 min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{candidateLabel(candidate, index)}</p>
                      <p className="mt-1 truncate font-mono text-[10px] text-text-muted">{candidate.video_filename}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-text-muted">
                        {candidate.duration ? <span>{candidate.duration}s</span> : null}
                        {candidate.ratio ? <span>{candidate.ratio}</span> : null}
                        {candidate.resolution ? <span>{candidate.resolution}</span> : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-glass-border bg-black/20 px-4 py-8 text-center">
              <p className="text-sm text-text-secondary">{loading ? "加载候选中..." : "暂无候选视频"}</p>
              <p className="mt-2 text-xs leading-5 text-text-muted">生成队列完成后会在这里显示多个候选。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
