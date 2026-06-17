import type { JimengQueueItem, JimengQueueStatus, JimengVideoCandidate } from "@/lib/jimengApi";

export type JimengGenerationLockFilter = "all" | "locked" | "unlocked";

export interface JimengGenerationCandidateFilters {
  projectId?: string;
  shotId?: string;
  queueStatus?: JimengQueueStatus | "all";
  lockState?: JimengGenerationLockFilter;
  queueStatusById?: Record<string, JimengQueueStatus | undefined>;
}

export interface JimengQueueStatusMeta {
  label: string;
  dotClassName: string;
  badgeClassName: string;
  rowClassName: string;
  detail: string;
}

const QUEUE_STATUS_LABELS: Record<JimengQueueStatus, string> = {
  waiting: "等待中",
  running: "生成中",
  completed: "已完成",
  failed: "失败",
  canceled: "已取消",
};

const QUEUE_STATUS_CLASSES: Record<
  JimengQueueStatus,
  Pick<JimengQueueStatusMeta, "dotClassName" | "badgeClassName" | "rowClassName">
> = {
  waiting: {
    dotClassName: "bg-sky-300",
    badgeClassName: "border-sky-400/30 bg-sky-500/10 text-sky-200",
    rowClassName: "border-glass-border bg-black/20",
  },
  running: {
    dotClassName: "bg-primary",
    badgeClassName: "border-primary/40 bg-primary/10 text-primary",
    rowClassName: "border-primary/30 bg-primary/[0.06]",
  },
  completed: {
    dotClassName: "bg-emerald-300",
    badgeClassName: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    rowClassName: "border-emerald-400/20 bg-emerald-500/[0.04]",
  },
  failed: {
    dotClassName: "bg-red-300",
    badgeClassName: "border-red-400/40 bg-red-500/10 text-red-200",
    rowClassName: "border-red-500/30 bg-red-500/[0.08]",
  },
  canceled: {
    dotClassName: "bg-zinc-400",
    badgeClassName: "border-zinc-400/30 bg-zinc-500/10 text-zinc-200",
    rowClassName: "border-zinc-400/20 bg-zinc-500/[0.04]",
  },
};

export function getQueueStatusMeta(item: JimengQueueItem): JimengQueueStatusMeta {
  const classes = QUEUE_STATUS_CLASSES[item.status];
  const detail =
    item.error_message ||
    item.gen_status ||
    item.submit_id ||
    (item.status === "waiting" ? `队列位置 #${item.position}` : "");

  return {
    label: QUEUE_STATUS_LABELS[item.status],
    ...classes,
    detail,
  };
}

export function filterGenerationCandidates(
  candidates: JimengVideoCandidate[],
  filters: JimengGenerationCandidateFilters,
): JimengVideoCandidate[] {
  return candidates.filter((candidate) => {
    if (filters.projectId && candidate.project_id !== filters.projectId) {
      return false;
    }
    if (filters.shotId && candidate.shot_id !== filters.shotId) {
      return false;
    }
    if (filters.lockState === "locked" && !candidate.is_locked) {
      return false;
    }
    if (filters.lockState === "unlocked" && candidate.is_locked) {
      return false;
    }
    if (filters.queueStatus && filters.queueStatus !== "all") {
      return filters.queueStatusById?.[candidate.queue_item_id] === filters.queueStatus;
    }
    return true;
  });
}

export function insertPromptVariable(
  value: string,
  variable: string,
  selectionStart: number,
  selectionEnd: number,
): { value: string; cursor: number } {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const nextValue = `${value.slice(0, start)}${variable}${value.slice(end)}`;
  return {
    value: nextValue,
    cursor: start + variable.length,
  };
}
