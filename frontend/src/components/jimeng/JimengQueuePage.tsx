"use client";

import clsx from "clsx";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ClipboardList,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  SquareX,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getQueueStatusMeta } from "@/components/jimeng/jimengUiHelpers";
import { jimengApi, type JimengCliAccount, type JimengQueueItem, type JimengShot } from "@/lib/jimengApi";
import { useJimengStore } from "@/store/jimengStore";

interface QueueActionButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger";
}

function QueueActionButton({ icon: Icon, label, onClick, disabled = false, tone = "default" }: QueueActionButtonProps) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex min-h-9 max-w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        tone === "primary" && "border-primary/40 bg-primary/15 text-primary hover:bg-primary/20",
        tone === "danger" && "border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/15",
        tone === "default" && "border-glass-border bg-black/20 text-text-secondary hover:bg-hover-bg hover:text-foreground",
      )}
    >
      <Icon size={15} />
      <span>{label}</span>
    </button>
  );
}

const compactText = (value: string | null | undefined, max = 140): string => {
  if (!value) {
    return "无";
  }
  return value.length > max ? `${value.slice(0, max)}...` : value;
};

const shotLabel = (item: JimengQueueItem, shot?: JimengShot): string => (shot ? `分镜${shot.shot_index}` : item.shot_id.slice(0, 8));

const queueAccountId = (item: JimengQueueItem): string => {
  const settings = (item.asset_snapshot?.generation_settings ?? {}) as Record<string, unknown>;
  return typeof settings.account_id === "string" ? settings.account_id : "";
};

export default function JimengQueuePage() {
  const projects = useJimengStore((state) => state.projects);
  const queue = useJimengStore((state) => state.queue);
  const loading = useJimengStore((state) => state.loading);
  const loadProjects = useJimengStore((state) => state.loadProjects);
  const loadQueue = useJimengStore((state) => state.loadQueue);
  const startQueue = useJimengStore((state) => state.startQueue);
  const pauseQueue = useJimengStore((state) => state.pauseQueue);
  const cancelQueueItem = useJimengStore((state) => state.cancelQueueItem);
  const retryQueueItem = useJimengStore((state) => state.retryQueueItem);
  const reorderQueue = useJimengStore((state) => state.reorderQueue);
  const selectProject = useJimengStore((state) => state.selectProject);
  const setActivePage = useJimengStore((state) => state.setActivePage);

  const [shotMap, setShotMap] = useState<Record<string, JimengShot>>({});
  const [accounts, setAccounts] = useState<JimengCliAccount[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedQueue = useMemo(() => [...queue].sort((a, b) => a.position - b.position), [queue]);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);

  useEffect(() => {
    void loadQueue("global");
    if (projects.length === 0) {
      void loadProjects();
    }
    void jimengApi
      .listCliAccounts()
      .then((response) => setAccounts(response.accounts))
      .catch(() => setAccounts([]));
  }, [loadProjects, loadQueue, projects.length]);

  useEffect(() => {
    const projectIds = Array.from(new Set(queue.map((item) => item.project_id)));
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
  }, [queue]);

  const runAction = useCallback(
    async (label: string, action: () => Promise<void>, itemId: string | null = null) => {
      setBusyId(itemId);
      setNotice(null);
      setError(null);
      try {
        await action();
        await loadQueue("global");
        setNotice(label);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "队列操作失败");
      } finally {
        setBusyId(null);
      }
    },
    [loadQueue],
  );

  const reorderQueueItem = (item: JimengQueueItem, direction: "up" | "down") =>
    runAction(
      "队列顺序已更新",
      async () => {
        const currentIndex = sortedQueue.findIndex((queueItem) => queueItem.id === item.id);
        const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sortedQueue.length) {
          return;
        }
        const nextQueue = [...sortedQueue];
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
            <h2 className="mt-2 font-display text-2xl font-semibold text-foreground">手动提交队列</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-muted">
              <span className="rounded border border-glass-border bg-black/20 px-2 py-1">全部任务：{queue.length}</span>
              <span className="rounded border border-glass-border bg-black/20 px-2 py-1">
                等待：{queue.filter((item) => item.status === "waiting").length}
              </span>
              <span className="rounded border border-red-500/20 bg-red-500/10 px-2 py-1 text-red-200">
                失败：{queue.filter((item) => item.status === "failed").length}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <QueueActionButton icon={RefreshCw} label="刷新" onClick={() => runAction("队列已刷新", loadQueue)} disabled={loading} />
            <QueueActionButton icon={Play} label="开始队列" onClick={() => runAction("队列已启动", startQueue)} tone="primary" disabled={loading} />
            <QueueActionButton icon={Pause} label="暂停队列" onClick={() => runAction("队列已暂停", pauseQueue)} disabled={loading} />
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
        {sortedQueue.length > 0 ? (
          <div className="min-h-0 overflow-auto">
            <table className="min-w-[1320px] border-separate border-spacing-0 text-left">
              <thead className="sticky top-0 z-10 bg-[#09090d]/95 backdrop-blur-xl">
                <tr className="text-xs font-medium text-text-muted">
                  <th className="w-20 border-b border-glass-border px-4 py-3">顺序</th>
                  <th className="w-28 border-b border-glass-border px-3 py-3">状态</th>
                  <th className="w-52 border-b border-glass-border px-3 py-3">来源</th>
                  <th className="w-40 border-b border-glass-border px-3 py-3">账号</th>
                  <th className="w-44 border-b border-glass-border px-3 py-3">提交信息</th>
                  <th className="w-24 border-b border-glass-border px-3 py-3">轮询</th>
                  <th className="border-b border-glass-border px-3 py-3">CLI 输出</th>
                  <th className="w-72 border-b border-glass-border px-3 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {sortedQueue.map((item, index) => {
                  const meta = getQueueStatusMeta(item);
                  const project = projectById.get(item.project_id);
                  const shot = shotMap[item.shot_id];
                  const account = accountById.get(queueAccountId(item));
                  const isBusy = busyId === item.id;
                  return (
                    <tr key={item.id} className={clsx("align-top transition-colors hover:bg-hover-bg/50", meta.rowClassName)}>
                      <td className="border-b border-glass-border px-4 py-4">
                        <span className="font-mono text-sm text-foreground">#{item.position}</span>
                      </td>
                      <td className="border-b border-glass-border px-3 py-4">
                        <div className={clsx("inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs", meta.badgeClassName)}>
                          <span className={clsx("h-2 w-2 rounded-full", meta.dotClassName)} />
                          {meta.label}
                        </div>
                        {meta.detail ? <p className="mt-2 text-xs leading-5 text-text-muted">{compactText(meta.detail, 80)}</p> : null}
                      </td>
                      <td className="border-b border-glass-border px-3 py-4">
                        <p className="truncate text-sm font-medium text-foreground">{project?.name ?? item.project_id}</p>
                        <p className="mt-1 font-mono text-xs text-text-muted">{shotLabel(item, shot)}</p>
                      </td>
                      <td className="border-b border-glass-border px-3 py-4">
                        <p className="truncate text-sm font-medium text-foreground">{account?.label ?? "默认账号"}</p>
                        <p className="mt-1 text-xs text-text-muted">{account?.total_credit ? `${account.total_credit} 积分` : queueAccountId(item) ? "未查询积分" : "自动"}</p>
                      </td>
                      <td className="border-b border-glass-border px-3 py-4">
                        <p className="font-mono text-xs text-text-secondary">submit_id：{item.submit_id ?? "未提交"}</p>
                        <p className="mt-1 font-mono text-xs text-text-secondary">gen_status：{item.gen_status ?? "无"}</p>
                      </td>
                      <td className="border-b border-glass-border px-3 py-4">
                        <span className="font-mono text-sm text-foreground">{item.poll_seconds}s</span>
                      </td>
                      <td className="border-b border-glass-border px-3 py-4">
                        <p className="max-w-xl whitespace-pre-wrap text-xs leading-5 text-text-secondary">
                          {compactText(item.cli_raw_output || item.cli_command || item.final_prompt_snapshot, 180)}
                        </p>
                      </td>
                      <td className="border-b border-glass-border px-3 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            title="上移"
                            onClick={() => reorderQueueItem(item, "up")}
                            disabled={index === 0 || isBusy}
                            className="grid h-8 w-8 place-items-center rounded-md border border-glass-border text-text-secondary hover:bg-hover-bg hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            title="下移"
                            onClick={() => reorderQueueItem(item, "down")}
                            disabled={index === sortedQueue.length - 1 || isBusy}
                            className="grid h-8 w-8 place-items-center rounded-md border border-glass-border text-text-secondary hover:bg-hover-bg hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <QueueActionButton
                            icon={ArrowLeft}
                            label="源分镜"
                            onClick={() => openSourceShot(item)}
                            disabled={isBusy}
                          />
                          <QueueActionButton
                            icon={RotateCcw}
                            label="重试"
                            onClick={() => runAction("已加入重试", () => retryQueueItem(item.id), item.id)}
                            disabled={isBusy || item.status === "running"}
                          />
                          <QueueActionButton
                            icon={SquareX}
                            label="取消"
                            onClick={() => runAction("队列项已取消", () => cancelQueueItem(item.id), item.id)}
                            disabled={isBusy || item.status === "completed" || item.status === "canceled"}
                            tone="danger"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex min-h-[520px] flex-col items-center justify-center p-8 text-center">
            <ClipboardList size={42} className="text-text-muted" />
            <h3 className="mt-4 font-display text-xl font-semibold text-foreground">暂无队列任务</h3>
            <p className="mt-2 text-sm text-text-secondary">在分镜工作台选择分镜后，点击批量提交选中分镜。</p>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
