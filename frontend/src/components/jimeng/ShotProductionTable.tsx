"use client";

import clsx from "clsx";
import {
  ArrowDown,
  ArrowUp,
  CheckSquare,
  Download,
  Eye,
  FileInput,
  FileText,
  Layers,
  Loader2,
  Plus,
  Replace,
  Send,
  Settings2,
  Square,
  Timer,
  Trash2,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import AssetSlotCell from "@/components/jimeng/assets/AssetSlotCell";
import BatchReplaceModal from "@/components/jimeng/workbench/BatchReplaceModal";
import ImportShotsModal from "@/components/jimeng/ImportShotsModal";
import OperationOverlay from "@/components/jimeng/OperationOverlay";
import ShotPromptCell from "@/components/jimeng/workbench/ShotPromptCell";
import { summarizeJimengError } from "@/components/jimeng/jimengUiHelpers";
import {
  jimengApi,
  type JimengAsset,
  type JimengAssetBinding,
  type JimengAssetType,
  type JimengHighlightSpan,
  type JimengProject,
  type JimengShot,
} from "@/lib/jimengApi";
import { useJimengStore } from "@/store/jimengStore";

const STATUS_LABELS: Record<JimengShot["status"], string> = {
  draft: "草稿",
  asset_missing: "缺资产",
  queued: "排队中",
  running: "生成中",
  failed: "失败",
  completed: "已完成",
  locked: "已锁定",
};

interface ToolbarButtonProps {
  icon: LucideIcon;
  children: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: "default" | "primary";
}

function ToolbarButton({ icon: Icon, children, onClick, disabled = false, busy = false, tone = "default" }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={clsx(
        "inline-flex min-h-9 max-w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        tone === "primary"
          ? "border-primary/40 bg-primary/15 text-primary hover:bg-primary/20"
          : "border-glass-border bg-black/20 text-text-secondary hover:bg-hover-bg hover:text-foreground",
      )}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />}
      {children}
    </button>
  );
}

const csvEscape = (value: unknown): string => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const downloadTextFile = (filename: string, content: string, type = "text/plain;charset=utf-8") => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

interface ShotProductionTableProps {
  project: JimengProject;
  shots: JimengShot[];
  assets: JimengAsset[];
  bindingsByShotId: Record<string, JimengAssetBinding[]>;
  highlightsByShotId: Record<string, JimengHighlightSpan[]>;
  selectedShotIds: string[];
  focusedShotId: string | null;
  submitError: string | null;
  submitting: boolean;
  onPreviewShot: (shotId: string) => void;
  onOpenAssetPicker: (shot: JimengShot, assetType: JimengAssetType, assetId?: string) => void;
  onOpenBatchSettings: () => void;
}

export default function ShotProductionTable({
  project,
  shots,
  assets,
  bindingsByShotId,
  highlightsByShotId,
  selectedShotIds,
  focusedShotId,
  submitError,
  submitting,
  onPreviewShot,
  onOpenAssetPicker,
  onOpenBatchSettings,
}: ShotProductionTableProps) {
  const loading = useJimengStore((state) => state.loading);
  const toggleShotSelection = useJimengStore((state) => state.toggleShotSelection);
  const setShotSelection = useJimengStore((state) => state.setShotSelection);
  const matchAssets = useJimengStore((state) => state.matchAssets);
  const loadProjectData = useJimengStore((state) => state.loadProjectData);
  const [importOpen, setImportOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [operationLabel, setOperationLabel] = useState<string | null>(null);

  const selectedShotSet = useMemo(() => new Set(selectedShotIds), [selectedShotIds]);
  const selectedShots = useMemo(() => shots.filter((shot) => selectedShotSet.has(shot.id)), [selectedShotSet, shots]);
  const allSelected = shots.length > 0 && shots.every((shot) => selectedShotSet.has(shot.id));
  const operationBusy = operationLabel !== null;

  const refreshProject = useCallback(() => loadProjectData(project.id), [loadProjectData, project.id]);

  const requestErrorMessage = (error: unknown): string => {
    const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
    return error instanceof Error ? error.message : "操作失败";
  };

  const runOperation = async (label: string, operation: () => Promise<void>) => {
    setOperationError(null);
    setNotice(null);
    setOperationLabel(label);
    try {
      await operation();
    } catch (caught) {
      setOperationError(requestErrorMessage(caught));
    } finally {
      setOperationLabel(null);
    }
  };

  const addShot = () =>
    runOperation("添加分镜中", async () => {
      await jimengApi.createShot(project.id, { prompt: "" });
      await refreshProject();
      setNotice("已添加空分镜");
    });

  const deleteShot = (shot: JimengShot) =>
    runOperation(`删除分镜${shot.shot_index}中`, async () => {
      if (!window.confirm(`删除分镜${shot.shot_index}？`)) {
        return;
      }
      await jimengApi.deleteShot(project.id, shot.id);
      await refreshProject();
      setNotice(`已删除分镜${shot.shot_index}`);
    });

  const batchDeleteSelectedShots = () =>
    runOperation("批量删除分镜中", async () => {
      if (selectedShotIds.length === 0) {
        return;
      }
      if (!window.confirm(`批量删除选中的 ${selectedShotIds.length} 个分镜？删除后分镜序号会自动重排。`)) {
        return;
      }
      const response = await jimengApi.batchDeleteShots(project.id, selectedShotIds);
      setShotSelection([]);
      await refreshProject();
      setNotice(`已删除 ${response.deleted.length} 个分镜`);
    });

  const moveShot = (shot: JimengShot, direction: "up" | "down") =>
    runOperation("调整分镜顺序中", async () => {
      await jimengApi.moveShot(project.id, shot.id, direction);
      await refreshProject();
    });

  const detectDuration = (shot: JimengShot) =>
    runOperation(`检测分镜${shot.shot_index}时长中`, async () => {
      const response = await jimengApi.detectShotDuration(project.id, shot.id);
      await refreshProject();
      setNotice(`分镜${shot.shot_index} 默认时长已设置为 ${response.duration}s`);
    });

  const batchDetectDurations = () =>
    runOperation("批量检测分镜时长中", async () => {
      const response = await jimengApi.batchDetectShotDurations(project.id);
      await refreshProject();
      setNotice(`批量检测完成：已设置 ${response.updated_count} 条；未识别时长的分镜已默认按 15 秒处理`);
    });

  const updateDuration = (shot: JimengShot, value: string) =>
    runOperation("保存分镜时长中", async () => {
      const parsed = Number(value);
      await jimengApi.updateShot(project.id, shot.id, {
        default_duration: value ? Math.max(1, parsed || 1) : null,
      });
      await refreshProject();
    });

  const runMatchAssets = () =>
    runOperation("匹配资产中", async () => {
      await matchAssets();
      setNotice("资产匹配已完成");
    });

  const batchDownload = () =>
    runOperation("批量下载视频素材中", async () => {
      if (selectedShotIds.length === 0) {
        setOperationError("请先选择要下载默认视频的分镜");
        return;
      }
      const { path: targetDir } = await jimengApi.selectDirectory();
      if (!targetDir) {
        return;
      }
      const response = await jimengApi.batchDownloadCandidates(project.id, {
        target_dir: targetDir,
        shot_ids: selectedShotIds,
      });
      if ("export_dir" in response) {
        setNotice(`已导出 ${response.files.length} 个视频到：${response.export_dir}${response.skipped.length ? `；跳过 ${response.skipped.length} 个` : ""}`);
        return;
      }
      setNotice(`已找到 ${response.candidates.length} 个候选视频素材`);
    });

  const exportShots = (format: "txt" | "csv") => {
    const targetShots = selectedShots.length > 0 ? selectedShots : shots;
    if (targetShots.length === 0) {
      setOperationError("没有可导出的分镜");
      return;
    }
    const baseName = `${project.name || "分镜"}-${selectedShots.length > 0 ? "选中" : "全部"}分镜`;
    if (format === "txt") {
      const content = targetShots.map((shot) => `# ${shot.shot_index}\n${shot.prompt.trim()}`).join("\n\n");
      downloadTextFile(`${baseName}.txt`, content);
      setNotice(`已导出 ${targetShots.length} 条分镜 TXT`);
      return;
    }
    const rows = targetShots.map((shot) => [shot.shot_index, shot.prompt].map(csvEscape).join(","));
    downloadTextFile(`${baseName}.csv`, ["序号,分镜提示词", ...rows].join("\n"), "text/csv;charset=utf-8");
    setNotice(`已导出 ${targetShots.length} 条分镜 CSV`);
  };

  const operationOverlayTitle = operationLabel ? `${operationLabel}，请等待...` : "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <OperationOverlay open={Boolean(operationLabel)} title={operationOverlayTitle} subtitle="正在处理分镜数据，完成后会自动关闭。" />
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-glass-border px-3 py-2.5">
        <ToolbarButton
          icon={allSelected ? CheckSquare : Square}
          onClick={() => setShotSelection(allSelected ? [] : shots.map((shot) => shot.id))}
          disabled={shots.length === 0}
        >
          {allSelected ? "取消全选" : "全选分镜"}
        </ToolbarButton>
        <ToolbarButton icon={FileInput} onClick={() => setImportOpen(true)}>
          导入分镜
        </ToolbarButton>
        <ToolbarButton icon={FileText} onClick={() => setImportOpen(true)}>
          格式示例
        </ToolbarButton>
        <ToolbarButton icon={Plus} onClick={addShot}>
          添加分镜
        </ToolbarButton>
        <ToolbarButton icon={Layers} onClick={runMatchAssets} disabled={loading || shots.length === 0}>
          匹配资产
        </ToolbarButton>
        <ToolbarButton icon={Timer} onClick={batchDetectDurations} disabled={loading || shots.length === 0}>
          批量检测时长
        </ToolbarButton>
        <ToolbarButton icon={Replace} onClick={() => setReplaceOpen(true)} disabled={selectedShotIds.length === 0}>
          批量文本替换
        </ToolbarButton>
        <ToolbarButton icon={Trash2} onClick={batchDeleteSelectedShots} disabled={selectedShotIds.length === 0}>
          批量删除分镜
        </ToolbarButton>
        <ToolbarButton icon={Download} onClick={batchDownload} disabled={shots.length === 0}>
          批量下载视频素材
        </ToolbarButton>
        <ToolbarButton icon={Download} onClick={() => exportShots("txt")} disabled={shots.length === 0}>
          导出分镜TXT
        </ToolbarButton>
        <ToolbarButton icon={Download} onClick={() => exportShots("csv")} disabled={shots.length === 0}>
          导出分镜CSV
        </ToolbarButton>
        <ToolbarButton icon={Settings2} onClick={onOpenBatchSettings} disabled={selectedShotIds.length === 0 || submitting} tone="primary">
          批量参数
        </ToolbarButton>
        <ToolbarButton icon={Send} onClick={onOpenBatchSettings} disabled={selectedShotIds.length === 0 || submitting} tone="primary">
          {submitting ? "提交中..." : "批量提交"}
        </ToolbarButton>
        <span className="w-full rounded border border-glass-border bg-black/20 px-2 py-1 text-right font-mono text-xs text-text-muted sm:ml-auto sm:w-auto">
          已选 {selectedShotIds.length}
        </span>
      </div>

      {(operationLabel || operationError || submitError || notice) && (
        <div className="border-b border-glass-border px-4 py-3">
          {operationLabel ? (
            <p className="inline-flex items-center gap-2 rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-primary">
              <Loader2 size={16} className="animate-spin" />
              {operationLabel}...
            </p>
          ) : operationError || submitError ? (
            <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {operationError ?? submitError}
            </p>
          ) : (
            <p className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{notice}</p>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">
        <div className="space-y-3">
          {shots.map((shot, index) => {
            const shotBindings = bindingsByShotId[shot.id] ?? [];
            const hasFailure = shot.status === "failed" || Boolean(shot.last_error);
            const isFocused = focusedShotId === shot.id;
            const isSelected = selectedShotSet.has(shot.id);
            const hasVideo = Boolean(shot.locked_video_candidate_id || shot.default_video_candidate_id);
            const videoStateLabel = hasVideo
              ? shot.locked_video_candidate_id
                ? "已有锁定视频"
                : "已有默认视频"
              : "暂无视频";

            return (
              <article
                key={shot.id}
                onClick={() => onPreviewShot(shot.id)}
                className={clsx(
                  "group cursor-pointer rounded-lg border p-3 transition-all",
                  "bg-surface-inset hover:border-primary/35 hover:bg-hover-bg",
                  isSelected && "border-primary/45 bg-primary/[0.07]",
                  isFocused && "border-primary/70 bg-primary/[0.12] shadow-[0_0_0_1px_rgba(100,108,255,0.28)]",
                  hasFailure && "border-red-400/45 bg-red-500/[0.08]",
                )}
              >
                <div className="flex flex-col gap-3 2xl:flex-row">
                  <div className="flex shrink-0 items-start gap-2 2xl:w-24">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => toggleShotSelection(shot.id, event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-glass-border bg-black/30 accent-primary"
                      aria-label={`选择分镜 ${shot.shot_index}`}
                    />
                    <div>
                      <span className="text-sm font-semibold text-foreground">分镜{shot.shot_index}</span>
                      <span
                        className={clsx(
                          "mt-2 block rounded border px-2 py-1 text-xs",
                          hasFailure
                            ? "border-red-400/30 bg-red-500/10 text-red-200"
                            : "border-glass-border bg-black/20 text-text-secondary",
                        )}
                      >
                        {STATUS_LABELS[shot.status]}
                      </span>
                    </div>
                  </div>

                  <div className="grid min-w-0 flex-1 gap-3 xl:grid-cols-[minmax(360px,1.35fr)_minmax(170px,0.72fr)_minmax(155px,0.62fr)_minmax(155px,0.62fr)_116px]">
                    <div className="min-w-0">
                      <p className="mb-1.5 text-xs font-medium text-text-muted">分镜提示词</p>
                      <ShotPromptCell
                        projectId={project.id}
                        shot={shot}
                        highlights={highlightsByShotId[shot.id] ?? []}
                        onSaved={refreshProject}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1.5 text-xs font-medium text-sky-300">出场角色</p>
                      <AssetSlotCell
                        projectId={project.id}
                        shot={shot}
                        assetType="character"
                        bindings={shotBindings}
                        assets={assets}
                        onOpenPicker={onOpenAssetPicker}
                        onChanged={refreshProject}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1.5 text-xs font-medium text-emerald-300">场景</p>
                      <AssetSlotCell
                        projectId={project.id}
                        shot={shot}
                        assetType="scene"
                        bindings={shotBindings}
                        assets={assets}
                        onOpenPicker={onOpenAssetPicker}
                        onChanged={refreshProject}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1.5 text-xs font-medium text-amber-300">道具</p>
                      <AssetSlotCell
                        projectId={project.id}
                        shot={shot}
                        assetType="prop"
                        bindings={shotBindings}
                        assets={assets}
                        onOpenPicker={onOpenAssetPicker}
                        onChanged={refreshProject}
                      />
                    </div>
                    <div className="flex min-w-0 flex-row items-start gap-1 xl:flex-col">
                      <button
                        type="button"
                        title={`${videoStateLabel}，点击查看视频预览`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onPreviewShot(shot.id);
                        }}
                        className={clsx(
                          "grid h-10 w-full place-items-center rounded-md border transition-colors xl:h-12",
                          hasVideo
                            ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
                            : "border-glass-border bg-surface-inset text-text-muted hover:bg-hover-bg hover:text-foreground",
                        )}
                      >
                        <Video size={16} />
                      </button>
                      <button
                        type="button"
                        title="查看预览"
                        onClick={(event) => {
                          event.stopPropagation();
                          onPreviewShot(shot.id);
                        }}
                        className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md border border-glass-border bg-surface-inset px-2 text-xs font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground"
                      >
                        <Eye size={15} />
                        预览
                      </button>
                      <button
                        type="button"
                        title="上移"
                        onClick={(event) => {
                          event.stopPropagation();
                          moveShot(shot, "up");
                        }}
                        disabled={index === 0}
                        className="grid h-8 w-8 place-items-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        title="下移"
                        onClick={(event) => {
                          event.stopPropagation();
                          moveShot(shot, "down");
                        }}
                        disabled={index === shots.length - 1}
                        className="grid h-8 w-8 place-items-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        type="button"
                        title="删除"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteShot(shot);
                        }}
                        className="grid h-8 w-8 place-items-center rounded-md text-text-secondary transition-colors hover:bg-red-500/10 hover:text-red-300"
                      >
                        <Trash2 size={15} />
                      </button>
                      <div className="flex w-full items-center gap-1 rounded-md border border-glass-border bg-surface-inset px-2 py-1" onClick={(event) => event.stopPropagation()}>
                        <Timer size={13} className="shrink-0 text-primary" />
                        <input
                          type="number"
                          min={1}
                          value={shot.default_duration ?? ""}
                          onChange={(event) => updateDuration(shot, event.target.value)}
                          className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none"
                          placeholder="秒"
                          title="默认分镜时长"
                        />
                        <button
                          type="button"
                          onClick={() => detectDuration(shot)}
                          className="shrink-0 rounded border border-primary/30 px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/10"
                          title="从提示词检测时长"
                        >
                          检测
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {(shot.default_video_candidate_id || shot.locked_video_candidate_id || shot.last_error) && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-glass-border pt-3 text-xs">
                    {shot.default_video_candidate_id ? (
                      <span className="rounded border border-glass-border bg-black/20 px-2 py-1 text-text-muted">
                        默认 {shot.default_video_candidate_id.slice(0, 8)}
                      </span>
                    ) : null}
                    {shot.locked_video_candidate_id ? (
                      <span className="rounded border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-emerald-300">
                        锁定 {shot.locked_video_candidate_id.slice(0, 8)}
                      </span>
                    ) : null}
                    {shot.last_error ? (
                      <span title={shot.last_error} className="min-w-0 flex-1 text-red-300">
                        {summarizeJimengError(shot.last_error)}
                      </span>
                    ) : null}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {shots.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
            <p className="font-display text-lg font-semibold text-foreground">还没有分镜</p>
            <p className="max-w-md text-sm leading-6 text-text-secondary">导入剧本分镜，或先添加一个空分镜再逐条编辑。</p>
            <button
              type="button"
              onClick={addShot}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
            >
              <Plus size={15} />
              添加分镜
            </button>
          </div>
        ) : null}
      </div>

      <ImportShotsModal open={importOpen} projectId={project.id} onClose={() => setImportOpen(false)} onImported={refreshProject} />
      <BatchReplaceModal
        open={replaceOpen}
        projectId={project.id}
        selectedShots={selectedShots}
        onClose={() => setReplaceOpen(false)}
        onApplied={refreshProject}
      />
    </div>
  );
}
