"use client";

import clsx from "clsx";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  ClipboardList,
  Pause,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  SquareX,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getQueueFilterStatus,
  getQueueStatusMeta,
  summarizeJimengError,
  type JimengQueueFilterStatus,
} from "@/components/jimeng/jimengUiHelpers";
import { formatUpdatedAt } from "@/components/jimeng/assets/assetManagerShared";
import { jimengApi, type JimengQueueItem, type JimengQueueSortOrder, type JimengShot } from "@/lib/jimengApi";
import { useJimengStore } from "@/store/jimengStore";

interface QueueActionButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger";
}

type QueueStatusFilter = JimengQueueFilterStatus | "all";
type QueueTimeRange = "today" | "week" | "month" | "custom";

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
const WORKER_START_BUSY_ID = "__worker_start__";
const TIME_RANGE_OPTIONS: Array<{ value: QueueTimeRange; label: string }> = [
  { value: "today", label: "今天" },
  { value: "week", label: "一周" },
  { value: "month", label: "一月" },
  { value: "custom", label: "自定义" },
];

const STATUS_FILTERS: Array<{ value: QueueStatusFilter; label: string; tone?: "danger" | "success" | "primary" }> = [
  { value: "all", label: "全部" },
  { value: "waiting", label: "等待" },
  { value: "running", label: "在途", tone: "primary" },
  { value: "completed", label: "成功", tone: "success" },
  { value: "failed", label: "失败", tone: "danger" },
  { value: "canceled", label: "取消" },
];

const STATUS_HELP: Record<QueueStatusFilter, string> = {
  all: "全部：显示当前队列里所有任务。",
  waiting: "等待：分镜已进入自动排队，还没有下发给即梦，正在等待 worker 自动提交。",
  running: "在途：已经下发给即梦或正在轮询结果，还没有拿到最终视频。",
  completed: "成功：即梦已返回视频并保存到本地候选视频。",
  failed: "失败：即梦或本地提交返回错误，需要查看原因后重试。",
  canceled: "取消：用户手动取消的任务，会保留在列表方便追溯。",
};

function QueueActionButton({ icon: Icon, label, onClick, disabled = false, tone = "default" }: QueueActionButtonProps) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex h-8 max-w-full items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        tone === "primary" && "border-primary/40 bg-primary/15 text-primary hover:bg-primary/20",
        tone === "danger" && "border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/15",
        tone === "default" && "border-glass-border bg-surface-inset text-text-secondary hover:bg-hover-bg hover:text-foreground",
      )}
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );
}

const compactText = (value: string | null | undefined, max = 90): string => {
  if (!value) {
    return "无";
  }
  return value.length > max ? `${value.slice(0, max)}...` : value;
};

const shotLabel = (item: JimengQueueItem, shot?: JimengShot): string => (shot ? `分镜${shot.shot_index}` : item.shot_id.slice(0, 8));
const isQueueItemBusy = (item: JimengQueueItem): boolean => getQueueFilterStatus(item) === "running";
const formatQueueTime = (value: string | null | undefined): string => (value ? formatUpdatedAt(value) : "无");

const dateInputValue = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const startOfLocalDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const dateInputToLocalStart = (value: string): Date | null => {
  if (!value) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
};

const queueDateRange = (range: QueueTimeRange, customFrom: string, customTo: string) => {
  const todayStart = startOfLocalDay(new Date());
  if (range === "today") {
    return { created_from: todayStart.toISOString(), created_to: addDays(todayStart, 1).toISOString() };
  }
  if (range === "week") {
    return { created_from: addDays(todayStart, -6).toISOString(), created_to: addDays(todayStart, 1).toISOString() };
  }
  if (range === "month") {
    return { created_from: addDays(todayStart, -29).toISOString(), created_to: addDays(todayStart, 1).toISOString() };
  }
  const from = dateInputToLocalStart(customFrom);
  const to = dateInputToLocalStart(customTo);
  return {
    created_from: from?.toISOString(),
    created_to: to ? addDays(to, 1).toISOString() : undefined,
  };
};

export default function JimengQueuePage() {
  const projects = useJimengStore((state) => state.projects);
  const queue = useJimengStore((state) => state.queue);
  const queueStatus = useJimengStore((state) => state.queueStatus);
  const loading = useJimengStore((state) => state.loading);
  const loadProjects = useJimengStore((state) => state.loadProjects);
  const loadQueue = useJimengStore((state) => state.loadQueue);
  const startQueue = useJimengStore((state) => state.startQueue);
  const startQueueWorker = useJimengStore((state) => state.startQueueWorker);
  const pauseQueue = useJimengStore((state) => state.pauseQueue);
  const cancelQueueItem = useJimengStore((state) => state.cancelQueueItem);
  const deleteQueueItem = useJimengStore((state) => state.deleteQueueItem);
  const retryQueueItem = useJimengStore((state) => state.retryQueueItem);
  const reorderQueue = useJimengStore((state) => state.reorderQueue);
  const selectProject = useJimengStore((state) => state.selectProject);
  const setActivePage = useJimengStore((state) => state.setActivePage);

  const [shotMap, setShotMap] = useState<Record<string, JimengShot>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("all");
  const [timeRange, setTimeRange] = useState<QueueTimeRange>("today");
  const [sortOrder, setSortOrder] = useState<JimengQueueSortOrder>("desc");
  const [customFrom, setCustomFrom] = useState(() => dateInputValue(new Date()));
  const [customTo, setCustomTo] = useState(() => dateInputValue(new Date()));
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(50);
  const [currentPage, setCurrentPage] = useState(1);

  const queueQuery = useMemo(
    () => ({
      ...queueDateRange(timeRange, customFrom, customTo),
      sort_order: sortOrder,
    }),
    [customFrom, customTo, sortOrder, timeRange],
  );
  const reloadQueue = useCallback(() => loadQueue("global", queueQuery), [loadQueue, queueQuery]);
  const sortedQueue = useMemo(
    () =>
      [...queue].sort((left, right) => {
        const leftTime = new Date(left.created_at).getTime();
        const rightTime = new Date(right.created_at).getTime();
        const timeDelta = Number.isNaN(leftTime) || Number.isNaN(rightTime) ? left.created_at.localeCompare(right.created_at) : leftTime - rightTime;
        if (timeDelta !== 0) {
          return sortOrder === "desc" ? -timeDelta : timeDelta;
        }
        return sortOrder === "desc" ? right.position - left.position : left.position - right.position;
      }),
    [queue, sortOrder],
  );
  const positionOrderedQueue = useMemo(() => [...queue].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)), [queue]);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const statusCounts = useMemo(() => {
    const counts: Record<QueueStatusFilter, number> = {
      all: queue.length,
      waiting: 0,
      running: 0,
      completed: 0,
      failed: 0,
      canceled: 0,
    };
    queue.forEach((item) => {
      counts[getQueueFilterStatus(item)] += 1;
    });
    return counts;
  }, [queue]);
  const filteredQueue = useMemo(
    () => (statusFilter === "all" ? sortedQueue : sortedQueue.filter((item) => getQueueFilterStatus(item) === statusFilter)),
    [sortedQueue, statusFilter],
  );
  const totalPages = Math.max(1, Math.ceil(filteredQueue.length / pageSize));
  const pageQueue = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * pageSize;
    return filteredQueue.slice(start, start + pageSize);
  }, [currentPage, filteredQueue, pageSize, totalPages]);

  useEffect(() => {
    void reloadQueue();
    if (projects.length === 0) {
      void loadProjects();
    }
  }, [loadProjects, projects.length, reloadQueue]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    const projectIds = Array.from(new Set(pageQueue.map((item) => item.project_id)));
    if (projectIds.length === 0) {
      setShotMap({});
      return;
    }

    let canceled = false;
    void Promise.all(projectIds.map((projectId) => jimengApi.listShots(projectId)))
      .then((shotGroups) => {
        if (canceled) {
          return;
        }
        const nextMap: Record<string, JimengShot> = {};
        shotGroups.flat().forEach((shot) => {
          nextMap[shot.id] = shot;
        });
        setShotMap(nextMap);
      })
      .catch(() => {
        if (!canceled) {
          setShotMap({});
        }
      });

    return () => {
      canceled = true;
    };
  }, [pageQueue]);

  const runAction = useCallback(
    async (label: string, action: () => Promise<void>, itemId: string | null = null) => {
      setBusyId(itemId);
      setNotice(null);
      setError(null);
      try {
        await action();
        await reloadQueue();
        setNotice(label);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "队列操作失败");
      } finally {
        setBusyId(null);
      }
    },
    [reloadQueue],
  );

  const retryQueueItemWithConfirm = (item: JimengQueueItem) => {
    const confirmed = window.confirm(
      `确定重试 ${shotLabel(item, shotMap[item.shot_id])} 吗？\n\n重试会清空这条任务原来的 submit_id、错误输出和完成时间，并重新放回等待队列。`,
    );
    if (!confirmed) {
      return;
    }
    void runAction("已加入重试队列", () => retryQueueItem(item.id), item.id);
  };

  const deleteCanceledQueueItemWithConfirm = (item: JimengQueueItem) => {
    const confirmed = window.confirm(`删除 ${shotLabel(item, shotMap[item.shot_id])} 的已取消队列记录？\n\n只删除这条排队记录，不会删除分镜、资产或已生成的视频文件。`);
    if (!confirmed) {
      return;
    }
    void runAction("已删除已取消队列记录", () => deleteQueueItem(item.id), item.id);
  };

  const reorderQueueItem = (item: JimengQueueItem, direction: "up" | "down") =>
    runAction(
      "队列顺序已更新",
      async () => {
        const currentIndex = positionOrderedQueue.findIndex((queueItem) => queueItem.id === item.id);
        const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= positionOrderedQueue.length) {
          return;
        }
        const nextQueue = [...positionOrderedQueue];
        [nextQueue[currentIndex], nextQueue[targetIndex]] = [nextQueue[targetIndex], nextQueue[currentIndex]];
        await reorderQueue(nextQueue.map((queueItem) => queueItem.id));
      },
      item.id,
    );

  const openSourceShot = (item: JimengQueueItem) =>
    runAction(
      "已打开源分镜",
      async () => {
        await selectProject(item.project_id);
        setActivePage("workbench");
      },
      item.id,
    );

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="flex min-h-0 flex-col gap-4 pb-4">
        <section className="glass-panel sticky top-0 z-20 rounded-xl bg-app-bg/95 px-5 py-4 backdrop-blur-xl">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <ClipboardList size={14} />
                即梦排队
              </div>
              <h2 className="mt-2 font-display text-2xl font-semibold text-foreground">自动提交排队</h2>
              <p className="mt-1 text-sm text-text-secondary">分镜工作台提交后会自动进入这里，由在线 worker 按间隔自动下发给即梦。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <QueueActionButton icon={RefreshCw} label="刷新" onClick={() => runAction("队列已刷新", async () => undefined)} disabled={loading} />
              <QueueActionButton icon={Play} label="恢复自动提交" onClick={() => runAction("自动提交已恢复", startQueue)} tone="primary" disabled={loading} />
              <QueueActionButton icon={Pause} label="暂停自动提交" onClick={() => runAction("自动提交已暂停", pauseQueue)} disabled={loading} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                title={STATUS_HELP[option.value]}
                onClick={() => setStatusFilter(option.value)}
                className={clsx(
                  "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  statusFilter === option.value
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-glass-border bg-surface-inset text-text-secondary hover:bg-hover-bg hover:text-foreground",
                  option.tone === "danger" && statusFilter !== option.value && "text-red-300",
                  option.tone === "success" && statusFilter !== option.value && "text-emerald-300",
                  option.tone === "primary" && statusFilter !== option.value && "text-blue-300",
                )}
              >
                {option.label}：<span className="font-mono">{statusCounts[option.value]}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 rounded-md border border-glass-border bg-surface-inset px-3 py-2 text-xs leading-5 text-text-secondary">
            {STATUS_HELP[statusFilter]}
          </p>

          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-glass-border bg-surface-inset p-3 text-xs">
            <div className="flex min-h-9 items-center gap-2 text-text-secondary">
              <CalendarDays size={14} />
              <span>查看时间</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {TIME_RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTimeRange(option.value)}
                  className={clsx(
                    "h-9 rounded-md border px-3 font-medium transition-colors",
                    timeRange === option.value
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-glass-border bg-surface-base text-text-secondary hover:bg-hover-bg hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-text-secondary">
              <span>开始</span>
              <input
                type="date"
                value={customFrom}
                onChange={(event) => {
                  setCustomFrom(event.target.value);
                  setTimeRange("custom");
                }}
                className="glass-input h-9 w-[140px] py-0 text-xs text-foreground"
              />
            </label>
            <label className="flex items-center gap-2 text-text-secondary">
              <span>结束</span>
              <input
                type="date"
                value={customTo}
                onChange={(event) => {
                  setCustomTo(event.target.value);
                  setTimeRange("custom");
                }}
                className="glass-input h-9 w-[140px] py-0 text-xs text-foreground"
              />
            </label>
            <button
              type="button"
              onClick={() => setSortOrder((value) => (value === "desc" ? "asc" : "desc"))}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-glass-border bg-surface-base px-3 font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground"
              title="切换队列列表显示顺序，不改变实际执行顺序"
            >
              <ArrowUpDown size={14} />
              {sortOrder === "desc" ? "最新在上" : "最早在上"}
            </button>
          </div>

          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex min-h-10 items-center justify-between gap-2 rounded-md border border-glass-border bg-surface-inset px-3 py-2 text-text-secondary">
              <span className="min-w-0">
                独立 worker：
                <span className={clsx("ml-1 font-medium", queueStatus?.worker_online ? "text-emerald-300" : "text-red-300")}>
                  {queueStatus?.worker_online ? "在线" : "离线"}
                </span>
              </span>
              {queueStatus?.worker_online ? null : (
                <QueueActionButton
                  icon={Power}
                  label={busyId === WORKER_START_BUSY_ID ? "启动中" : "启动 worker"}
                  onClick={() => runAction("worker 启动指令已发送", startQueueWorker, WORKER_START_BUSY_ID)}
                  disabled={loading || busyId === WORKER_START_BUSY_ID}
                  tone="primary"
                />
              )}
            </div>
            <div className="rounded-md border border-glass-border bg-surface-inset px-3 py-2 text-text-secondary">
              自动提交：<span className="ml-1 font-medium text-foreground">{queueStatus?.started ? "运行" : "暂停"}</span>
            </div>
            <div className="rounded-md border border-glass-border bg-surface-inset px-3 py-2 text-text-secondary">
              在途任务：<span className="ml-1 font-mono font-medium text-primary">{queueStatus?.in_flight_count ?? 0}</span>
            </div>
            <div
              title={queueStatus?.worker_heartbeat_at ?? "尚未收到 worker 心跳"}
              className="truncate rounded-md border border-glass-border bg-surface-inset px-3 py-2 text-text-secondary"
            >
              最近心跳：{queueStatus?.worker_heartbeat_at ? new Date(queueStatus.worker_heartbeat_at).toLocaleTimeString() : "无"}
            </div>
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

        <section className="glass-panel min-h-[520px] overflow-hidden rounded-xl xl:min-h-[620px]">
          {filteredQueue.length > 0 ? (
            <>
              <div className="min-h-0 overflow-auto">
                <table className="min-w-[1320px] table-fixed border-separate border-spacing-0 text-left">
                  <thead className="sticky top-0 z-10 bg-[#09090d]/95 backdrop-blur-xl">
                    <tr className="text-xs font-medium text-text-muted">
                      <th className="w-20 border-b border-glass-border px-3 py-3">顺序</th>
                      <th className="w-28 border-b border-glass-border px-3 py-3">状态</th>
                      <th className="w-56 border-b border-glass-border px-3 py-3">来源</th>
                      <th className="w-40 border-b border-glass-border px-3 py-3">时间</th>
                      <th className="w-36 border-b border-glass-border px-3 py-3">提交信息</th>
                      <th className="w-20 border-b border-glass-border px-3 py-3">轮询</th>
                      <th className="border-b border-glass-border px-3 py-3">输出</th>
                      <th className="w-72 border-b border-glass-border px-3 py-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageQueue.map((item) => {
                      const meta = getQueueStatusMeta(item);
                      const project = projectById.get(item.project_id);
                      const shot = shotMap[item.shot_id];
                      const isBusy = busyId === item.id;
                      const fullOutput = item.cli_raw_output || item.error_message || item.cli_command || item.final_prompt_snapshot || "";
                      const displayOutput = getQueueFilterStatus(item) === "failed" ? summarizeJimengError(item.error_message || item.cli_raw_output || item.gen_status) : compactText(fullOutput, 120);
                      const itemIndex = positionOrderedQueue.findIndex((queueItem) => queueItem.id === item.id);
                      return (
                        <tr key={item.id} className={clsx("h-14 align-middle transition-colors hover:bg-hover-bg/50", meta.rowClassName)}>
                          <td className="border-b border-glass-border px-3 py-2">
                            <span className="font-mono text-sm text-foreground">#{item.position}</span>
                          </td>
                          <td className="border-b border-glass-border px-3 py-2">
                            <div
                              title={meta.detail || meta.label}
                              className={clsx("inline-flex max-w-full items-center gap-2 rounded-md border px-2 py-1 text-xs", meta.badgeClassName)}
                            >
                              <span className={clsx("h-2 w-2 shrink-0 rounded-full", meta.dotClassName)} />
                              <span className="truncate">{meta.label}</span>
                            </div>
                          </td>
                          <td className="border-b border-glass-border px-3 py-2">
                            <p title={project?.name ?? item.project_id} className="truncate text-sm font-medium text-foreground">
                              {project?.name ?? item.project_id}
                            </p>
                            <p title={shot?.prompt ?? item.shot_id} className="mt-0.5 truncate font-mono text-xs text-text-muted">
                              {shotLabel(item, shot)}
                            </p>
                          </td>
                          <td className="border-b border-glass-border px-3 py-2">
                            <p title={item.created_at} className="truncate text-xs text-text-secondary">
                              入队：{formatQueueTime(item.created_at)}
                            </p>
                            <p title={item.submitted_at ?? "未下发"} className="mt-0.5 truncate text-xs text-text-muted">
                              下发：{formatQueueTime(item.submitted_at)}
                            </p>
                          </td>
                          <td className="border-b border-glass-border px-3 py-2">
                            <p title={item.submit_id ?? "未提交"} className="truncate font-mono text-xs text-text-secondary">
                              submit：{item.submit_id ?? "未提交"}
                            </p>
                            <p title={item.gen_status ?? "无"} className="mt-0.5 truncate font-mono text-xs text-text-secondary">
                              状态：{item.gen_status ?? "无"}
                            </p>
                          </td>
                          <td className="border-b border-glass-border px-3 py-2">
                            <span className="font-mono text-sm text-foreground">{item.poll_seconds}s</span>
                          </td>
                          <td className="border-b border-glass-border px-3 py-2">
                            <p title={fullOutput} className="truncate text-xs text-text-secondary">
                              {displayOutput}
                            </p>
                          </td>
                          <td className="border-b border-glass-border px-3 py-2">
                            <div className="flex flex-nowrap items-center gap-1.5">
                              <button
                                type="button"
                                title="上移"
                                onClick={() => reorderQueueItem(item, "up")}
                                disabled={itemIndex === 0 || isBusy}
                                className="grid h-8 w-8 place-items-center rounded-md border border-glass-border text-text-secondary hover:bg-hover-bg hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                type="button"
                                title="下移"
                                onClick={() => reorderQueueItem(item, "down")}
                                disabled={itemIndex === positionOrderedQueue.length - 1 || isBusy}
                                className="grid h-8 w-8 place-items-center rounded-md border border-glass-border text-text-secondary hover:bg-hover-bg hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <ArrowDown size={14} />
                              </button>
                              <QueueActionButton icon={ArrowLeft} label="源分镜" onClick={() => openSourceShot(item)} disabled={isBusy} />
                              <QueueActionButton
                                icon={RotateCcw}
                                label="重试"
                                onClick={() => retryQueueItemWithConfirm(item)}
                                disabled={isBusy || isQueueItemBusy(item)}
                              />
                              <QueueActionButton
                                icon={SquareX}
                                label="取消"
                                onClick={() => runAction("队列项已取消", () => cancelQueueItem(item.id), item.id)}
                                disabled={isBusy || getQueueFilterStatus(item) === "completed" || getQueueFilterStatus(item) === "canceled"}
                                tone="danger"
                              />
                              {getQueueFilterStatus(item) === "canceled" ? (
                                <QueueActionButton
                                  icon={Trash2}
                                  label="删除"
                                  onClick={() => deleteCanceledQueueItemWithConfirm(item)}
                                  disabled={isBusy}
                                  tone="danger"
                                />
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 border-t border-glass-border px-4 py-3 text-xs text-text-muted sm:flex-row sm:items-center sm:justify-between">
                <div>
                  当前显示 {pageQueue.length} / {filteredQueue.length} 条，成功 {statusCounts.completed} 条
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span>每页</span>
                  <select
                    value={pageSize}
                    onChange={(event) => setPageSize(Number(event.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])}
                    className="glass-input h-8 w-24 py-0 text-xs"
                  >
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option} 条
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage <= 1}
                    className="rounded-md border border-glass-border bg-surface-inset px-3 py-1.5 hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    上一页
                  </button>
                  <span className="font-mono text-foreground">
                    {currentPage}/{totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage >= totalPages}
                    className="rounded-md border border-glass-border bg-surface-inset px-3 py-1.5 hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    下一页
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-[520px] flex-col items-center justify-center p-8 text-center">
              <ClipboardList size={42} className="text-text-muted" />
              <h3 className="mt-4 font-display text-xl font-semibold text-foreground">
                {sortedQueue.length > 0 ? "当前状态没有任务" : "暂无队列任务"}
              </h3>
              <p className="mt-2 text-sm text-text-secondary">
                {sortedQueue.length > 0 ? "可以切换上方状态标签查看其他任务。" : "在分镜工作台提交分镜后，任务会自动进入排队列表。"}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
