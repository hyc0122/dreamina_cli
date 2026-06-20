import clsx from "clsx";
import { Ban, CheckSquare, RefreshCw, Square, Trash2 } from "lucide-react";
import { jimengMediaUrl, JIMENG_ASSET_TYPE_LABELS } from "@/components/jimeng/assets/AssetMiniCard";
import { formatUpdatedAt } from "@/components/jimeng/assets/assetManagerShared";
import type { JimengLlmAssetImageRecord } from "@/lib/jimengApi";

export const LLM_PENDING_STATUSES = new Set(["submitted", "running", "timeout", "poll_error"]);
export const LLM_MANUAL_POLL_STATUSES = new Set(["failed", "canceled"]);
export const LLM_STATUS_LABELS: Record<string, string> = {
  submitted: "已提交",
  running: "获取中",
  timeout: "超时继续获取",
  poll_error: "获取异常",
  succeeded: "已保存",
  failed: "失败",
  canceled: "已取消",
};

export const llmRecordSubmittedAt = (record: JimengLlmAssetImageRecord): string => record.created_at || record.updated_at || "";

export const sortLlmRecordsBySubmittedAt = (records: JimengLlmAssetImageRecord[]): JimengLlmAssetImageRecord[] =>
  [...records].sort((left, right) => llmRecordSubmittedAt(right).localeCompare(llmRecordSubmittedAt(left)));

export const llmRecordStatusClass = (status: string): string => {
  if (status === "succeeded") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-300";
  }
  if (status === "failed" || status === "poll_error") {
    return "border-red-400/30 bg-red-500/10 text-red-200";
  }
  if (status === "canceled") {
    return "border-slate-400/30 bg-slate-500/10 text-slate-300";
  }
  return "border-amber-400/30 bg-amber-500/10 text-amber-200";
};

const compact = (value: string | null | undefined, max = 90): string => {
  if (!value) {
    return "无";
  }
  return value.length > max ? `${value.slice(0, max)}...` : value;
};

export default function LlmImageRecordList({
  records,
  selectedRecordIds,
  projectNameFor,
  onToggleSelection,
  onPoll,
  onCancel,
  onDelete,
}: {
  records: JimengLlmAssetImageRecord[];
  selectedRecordIds: string[];
  projectNameFor: (projectId: string) => string;
  onToggleSelection: (recordId: string) => void;
  onPoll: (record: JimengLlmAssetImageRecord) => void;
  onCancel: (record: JimengLlmAssetImageRecord) => void;
  onDelete: (record: JimengLlmAssetImageRecord) => void;
}) {
  return (
    <div className="space-y-2 p-4">
      {records.map((record) => {
        const imageUrl = jimengMediaUrl(record.asset_image_path, record.updated_at);
        const pending = LLM_PENDING_STATUSES.has(record.status);
        const manualRetryable = LLM_MANUAL_POLL_STATUSES.has(record.status);
        const pollable = pending || manualRetryable;
        const selected = selectedRecordIds.includes(record.id);
        const feedbackItems = (record.feedback ?? []).slice(-3).reverse();
        return (
          <article key={record.id} className="grid gap-3 rounded-lg border border-glass-border bg-surface-inset p-3 xl:grid-cols-[32px_120px_minmax(0,1fr)_auto] xl:items-start">
            <button
              type="button"
              onClick={() => onToggleSelection(record.id)}
              className="grid h-8 w-8 place-items-center rounded-md border border-glass-border bg-panel-bg text-text-secondary hover:bg-hover-bg hover:text-foreground"
              title={selected ? "取消选择" : "选择记录"}
            >
              {selected ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
            </button>
            <button
              type="button"
              onClick={() => imageUrl && window.open(imageUrl, "_blank", "noopener,noreferrer")}
              disabled={!imageUrl}
              className="aspect-video overflow-hidden rounded-md border border-glass-border bg-black/35 text-text-muted disabled:cursor-default"
              title={imageUrl ? "打开图片预览" : "图片尚未保存到本地"}
            >
              {imageUrl ? (
                <img src={imageUrl} alt={record.asset_name} className="h-full w-full object-cover transition-transform hover:scale-[1.03]" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1.5 px-2 text-center">
                  <RefreshCw size={18} />
                  <span className="text-[11px]">等待获取</span>
                </div>
              )}
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={clsx("inline-flex rounded border px-2 py-0.5 text-xs font-semibold", llmRecordStatusClass(record.status))}>
                  {LLM_STATUS_LABELS[record.status] ?? record.status}
                </span>
                <span className="rounded border border-glass-border bg-panel-bg px-2 py-0.5 text-[11px] text-text-muted">
                  {JIMENG_ASSET_TYPE_LABELS[record.asset_type] ?? record.asset_type}
                </span>
                <h3 className="min-w-[160px] flex-1 truncate text-sm font-semibold text-foreground" title={record.asset_name}>
                  {record.asset_name}
                </h3>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                <span title={projectNameFor(record.project_id)}>项目：{projectNameFor(record.project_id)}</span>
                <span>提交：{formatUpdatedAt(llmRecordSubmittedAt(record))}</span>
                <span>更新：{formatUpdatedAt(record.updated_at)}</span>
                <span>获取 {record.poll_count} 次</span>
                <span>进度 {record.progress || "未知"}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-text-muted">
                <span className="max-w-[180px] truncate rounded border border-glass-border px-1.5 py-0.5">{record.provider_name || record.provider_id}</span>
                <span className="max-w-[180px] truncate rounded border border-glass-border px-1.5 py-0.5">{record.model_name || record.model_id}</span>
                <span className="rounded border border-glass-border px-1.5 py-0.5">{record.size || "auto"}</span>
                <span className="max-w-[220px] truncate rounded border border-glass-border px-1.5 py-0.5 font-mono">task_id：{record.task_id || "未返回"}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-secondary" title={record.prompt}>
                {compact(record.prompt, 180)}
              </p>
              {record.error ? (
                <p className="mt-2 line-clamp-2 rounded border border-red-500/20 bg-red-500/10 px-2 py-1.5 text-xs leading-5 text-red-200" title={record.error}>
                  {record.error}
                </p>
              ) : null}
              {feedbackItems.length > 0 ? (
                <div className="mt-2 grid gap-1 rounded border border-glass-border bg-black/10 p-2">
                  {feedbackItems.map((item) => (
                    <p key={`${item.at}-${item.message}`} className="truncate text-[11px] text-text-muted" title={`${item.at} ${item.message}`}>
                      <span className="font-mono text-text-secondary">{formatUpdatedAt(item.at)}</span> {item.message}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 xl:w-28 xl:flex-col">
              <button
                type="button"
                onClick={() => onPoll(record)}
                disabled={!pollable}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <RefreshCw size={13} />
                {manualRetryable ? "手动获取" : "继续获取"}
              </button>
              <button
                type="button"
                onClick={() => onCancel(record)}
                disabled={!pending}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Ban size={13} />
                取消
              </button>
              <button
                type="button"
                onClick={() => onDelete(record)}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-200 hover:bg-red-500/15"
              >
                <Trash2 size={13} />
                删除
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
