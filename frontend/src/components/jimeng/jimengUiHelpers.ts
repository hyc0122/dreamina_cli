import type { JimengQueueItem, JimengQueueStatus, JimengShot, JimengVideoCandidate } from "@/lib/jimengApi";

export type JimengGenerationLockFilter = "all" | "locked" | "unlocked";
export type JimengQueueFilterStatus = "waiting" | "running" | "completed" | "failed" | "canceled";

export interface JimengGenerationCandidateFilters {
  projectId?: string;
  shotId?: string;
  queueStatus?: JimengQueueStatus | JimengQueueFilterStatus | "all";
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

const RUNNING_QUEUE_STATUSES = new Set<JimengQueueStatus>(["submitting", "running", "polling"]);
const WAITING_QUEUE_STATUSES = new Set<JimengQueueStatus>(["waiting", "retry_wait", "blocked"]);
const FAILED_QUEUE_STATUSES = new Set<JimengQueueStatus>(["failed", "orphaned"]);
const ACTIVE_SHOT_QUEUE_STATUSES = new Set<JimengQueueStatus>(["waiting", "blocked", "retry_wait", "submitting", "running", "polling"]);
const RUNNING_GEN_STATUSES = new Set(["querying", "running", "pending", "processing"]);
const SUCCESS_GEN_STATUSES = new Set(["success", "completed", "complete"]);
const FAILED_GEN_STATUSES = new Set(["failed", "fail", "error", "canceled", "cancelled"]);

const QUEUE_STATUS_LABELS: Record<JimengQueueFilterStatus, string> = {
  waiting: "等待中",
  running: "在途中",
  completed: "已完成",
  failed: "失败",
  canceled: "已取消",
};

const QUEUE_STATUS_CLASSES: Record<
  JimengQueueFilterStatus,
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

const compact = (value: string, max = 120): string => (value.length > max ? `${value.slice(0, max)}...` : value);

function firstJsonMessage(value: string): string | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    for (const key of ["fail_reason", "error_message", "message", "detail", "raw_output"]) {
      const message = parsed[key];
      if (typeof message === "string" && message.trim()) {
        return message.trim();
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function summarizeJimengError(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "暂无错误详情。";
  }
  const message = firstJsonMessage(raw) ?? raw;
  const lower = message.toLowerCase();

  if (lower.includes("exceededconcurrencylimit") || lower.includes("concurrency") || message.includes("并发")) {
    return "即梦并发或队列达到上限，这条任务没有下发成功，稍后重试即可。";
  }
  if (lower.includes("queue full") || message.includes("队列已满")) {
    return "即梦队列已满，这条任务暂时没有下发成功，稍后重试即可。";
  }
  if (lower.includes("session") || lower.includes("credential") || message.includes("登录") || message.includes("凭证")) {
    return "即梦登录凭证不可用，请在即梦设置里重新检测或登录。";
  }
  if (lower.includes("http 599") || lower.includes("10061") || lower.includes("timeout") || message.includes("无法连接")) {
    return "即梦接口连接失败，当前网络或官方接口暂时不可用。";
  }
  if (lower.includes("failed") || lower.includes("error") || message.includes("失败")) {
    if (message.startsWith("即梦返回失败")) {
      return compact(message, 90);
    }
    return `即梦返回失败：${compact(message, 80)}`;
  }
  return compact(message, 90);
}

export function getQueueFilterStatus(item: JimengQueueItem): JimengQueueFilterStatus {
  const genStatus = item.gen_status?.toLowerCase() ?? "";
  const hasError = Boolean(item.error_message?.trim());
  const rawOutput = `${item.cli_raw_output ?? ""} ${item.error_message ?? ""}`.toLowerCase();

  if (item.status === "canceled" || genStatus === "canceled" || genStatus === "cancelled") {
    return "canceled";
  }
  if (item.status === "completed" || SUCCESS_GEN_STATUSES.has(genStatus) || item.local_video_path) {
    return "completed";
  }
  if (WAITING_QUEUE_STATUSES.has(item.status)) {
    return "waiting";
  }
  if (RUNNING_QUEUE_STATUSES.has(item.status) || RUNNING_GEN_STATUSES.has(genStatus) || item.submit_id) {
    return "running";
  }
  if (
    FAILED_QUEUE_STATUSES.has(item.status) ||
    FAILED_GEN_STATUSES.has(genStatus) ||
    hasError ||
    rawOutput.includes("fail_reason") ||
    rawOutput.includes("exceededconcurrencylimit")
  ) {
    return "failed";
  }
  return "failed";
}

export function getQueueStatusMeta(item: JimengQueueItem): JimengQueueStatusMeta {
  const displayStatus = getQueueFilterStatus(item);
  const classes = QUEUE_STATUS_CLASSES[displayStatus];
  const detail =
    displayStatus === "failed"
      ? summarizeJimengError(item.error_message || item.cli_raw_output || item.gen_status)
      : displayStatus === "waiting"
        ? `队列位置 #${item.position ?? "-"}`
        : item.gen_status || item.submit_id || QUEUE_STATUS_LABELS[displayStatus];

  return {
    label: QUEUE_STATUS_LABELS[displayStatus],
    ...classes,
    detail,
  };
}

export function isShotVideoMaking(shot: Pick<JimengShot, "id" | "status" | "last_error"> | null | undefined, queueItems?: JimengQueueItem[]): boolean {
  if (!shot || shot.last_error) {
    return false;
  }
  if (!queueItems) {
    return shot.status === "queued" || shot.status === "running";
  }
  const relatedItems = queueItems.filter((item) => item.shot_id === shot.id);
  if (relatedItems.length === 0) {
    return false;
  }
  return relatedItems.some((item) => ACTIVE_SHOT_QUEUE_STATUSES.has(item.status));
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
      const rawStatus = filters.queueStatusById?.[candidate.queue_item_id];
      if (!rawStatus) {
        return false;
      }
      return getQueueFilterStatus({ status: rawStatus } as JimengQueueItem) === filters.queueStatus;
    }
    return true;
  });
}

export const WEB_SESSION_REQUIRED_COOKIE_NAMES = ["ttwid", "odin_tt", "user_spaces_idc"] as const;

export type WebSessionRequiredCookieName = (typeof WEB_SESSION_REQUIRED_COOKIE_NAMES)[number];

export function getMissingWebSessionCookieNames(value: string): WebSessionRequiredCookieName[] {
  const normalized = String(value ?? "");
  return WEB_SESSION_REQUIRED_COOKIE_NAMES.filter((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !new RegExp(`(?:^|[;\\s])${escaped}\\s*=`, "i").test(normalized);
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
