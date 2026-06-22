"use client";

import clsx from "clsx";
import { CheckCircle2, Copy, Play, Plus, RefreshCcw, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { jimengApi } from "@/lib/jimengApi";
import type { JimengWebSessionAccount, JimengWebSessionTask } from "@/lib/jimengApi";

const MODEL_OPTIONS = [
  { value: "seedance2.0fast", label: "Seedance 2.0 Fast" },
  { value: "seedance2.0mini", label: "Seedance 2.0 Mini" },
  { value: "seedance2.0", label: "Seedance 2.0" },
  { value: "seedance-2.0-lite-i2v", label: "Seedance 2.0 Lite I2V" },
];
const RATIO_OPTIONS = ["9:16", "16:9", "1:1"];
const DURATION_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 4);

const statusLabel = (status: string) => {
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  if (status === "polling") return "轮询中";
  return status || "未知";
};

export default function JimengWebSessionTestPage() {
  const [accounts, setAccounts] = useState<JimengWebSessionAccount[]>([]);
  const [tasks, setTasks] = useState<JimengWebSessionTask[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [label, setLabel] = useState("");
  const [sessionid, setSessionid] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(MODEL_OPTIONS[0].value);
  const [ratio, setRatio] = useState("9:16");
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState("720p");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedAccount = useMemo(() => accounts.find((account) => account.id === selectedAccountId) ?? accounts[0] ?? null, [accounts, selectedAccountId]);

  const refresh = async () => {
    const [accountEnvelope, taskEnvelope] = await Promise.all([jimengApi.listWebSessionAccounts(), jimengApi.listWebSessionTasks({ limit: 100 })]);
    setAccounts(accountEnvelope.accounts);
    setTasks(taskEnvelope.tasks);
    if (!selectedAccountId && accountEnvelope.accounts[0]) {
      setSelectedAccountId(accountEnvelope.accounts[0].id);
    }
  };

  useEffect(() => {
    void refresh().catch((err: unknown) => setError(readError(err)));
  }, []);

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  };

  const createAccount = () =>
    runAction(async () => {
      const account = await jimengApi.createWebSessionAccount({ label, sessionid, enabled: true });
      setLabel("");
      setSessionid("");
      setSelectedAccountId(account.id);
      setMessage("账号已保存，完整 sessionid 只保存在本地 SQLite，页面只显示脱敏值。");
      await refresh();
    });

  const submitTask = () =>
    runAction(async () => {
      if (!selectedAccount) {
        throw new Error("请先添加并选择一个 SessionID 账号");
      }
      await jimengApi.createWebSessionTask({ account_id: selectedAccount.id, prompt, model, ratio, duration, resolution });
      setMessage("已按选中账号提交，后续轮询会继续使用这个账号的 sessionid。");
      await refresh();
    });

  const pollTask = (taskId: string) =>
    runAction(async () => {
      await jimengApi.pollWebSessionTask(taskId);
      setMessage("已轮询一次任务结果。");
      await refresh();
    });

  const deleteAccount = (accountId: string) =>
    runAction(async () => {
      await jimengApi.deleteWebSessionAccount(accountId);
      setSelectedAccountId((current) => (current === accountId ? "" : current));
      setMessage("账号已删除，对应测试任务也会随账号清理。");
      await refresh();
    });

  const copyResult = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setMessage("结果地址已复制。");
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <section className="glass-panel shrink-0 rounded-xl p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Web Session Test</p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-foreground">SessionID 网页生视频测试</h2>
            <p className="mt-1 text-sm text-text-secondary">独立测试 sessionid 拼 Cookie 调用即梦网页接口，不进入官方 CLI 队列。</p>
          </div>
          <button type="button" onClick={() => void runAction(refresh)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-4 text-sm font-semibold text-foreground hover:bg-hover-bg">
            <RefreshCcw size={16} />
            刷新
          </button>
        </div>
        {message && <div className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
        {error && <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
      </section>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden xl:grid-cols-[430px_minmax(0,1fr)]">
        <section className="glass-panel min-h-0 overflow-y-auto rounded-xl p-4">
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-lg font-semibold text-foreground">账号池</h3>
              <p className="mt-1 text-sm text-text-secondary">每个任务会绑定提交时选中的账号；轮询不会切换到其他账号。</p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <input value={label} onChange={(event) => setLabel(event.target.value)} className="glass-input h-10" placeholder="账号名称，例如 账号A" />
              <input value={sessionid} onChange={(event) => setSessionid(event.target.value)} className="glass-input h-10" placeholder="粘贴 sessionid" />
              <button type="button" disabled={busy || !label.trim() || !sessionid.trim()} onClick={createAccount} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
                <Plus size={16} />
                添加账号
              </button>
            </div>
            <div className="space-y-2">
              {accounts.length === 0 ? <div className="rounded-lg border border-dashed border-glass-border p-4 text-center text-sm text-text-muted">暂无账号</div> : null}
              {accounts.map((account) => (
                <div key={account.id} className={clsx("rounded-lg border p-3", selectedAccount?.id === account.id ? "border-primary/50 bg-primary/10" : "border-glass-border bg-surface-inset")}> 
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => setSelectedAccountId(account.id)} className="min-w-0 text-left">
                      <div className="truncate text-sm font-semibold text-foreground">{account.label}</div>
                      <div className="mt-1 font-mono text-xs text-text-muted">{account.sessionid_masked}</div>
                    </button>
                    <button type="button" onClick={() => deleteAccount(account.id)} className="rounded-md border border-red-400/30 bg-red-500/10 p-2 text-red-300 hover:bg-red-500/15" title="删除账号">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-glass-border pt-4">
              <h3 className="font-display text-lg font-semibold text-foreground">提交测试</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <select value={selectedAccount?.id ?? ""} onChange={(event) => setSelectedAccountId(event.target.value)} className="glass-input col-span-2 h-10">
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.label}</option>
                  ))}
                </select>
                <select value={model} onChange={(event) => setModel(event.target.value)} className="glass-input col-span-2 h-10">
                  {MODEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <select value={ratio} onChange={(event) => setRatio(event.target.value)} className="glass-input h-10">
                  {RATIO_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="glass-input h-10">
                  {DURATION_OPTIONS.map((item) => <option key={item} value={item}>{item} 秒</option>)}
                </select>
                <select value={resolution} onChange={(event) => setResolution(event.target.value)} className="glass-input col-span-2 h-10">
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                </select>
              </div>
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="glass-input mt-2 min-h-[130px] w-full resize-y p-3" placeholder="输入测试提示词" />
              <button type="button" disabled={busy || !selectedAccount || !prompt.trim()} onClick={submitTask} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
                <Play size={16} />
                提交网页测试
              </button>
            </div>
          </div>
        </section>

        <section className="glass-panel min-h-0 overflow-hidden rounded-xl p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-lg font-semibold text-foreground">测试任务记录</h3>
              <p className="mt-1 text-sm text-text-secondary">只显示网页测试通道任务，不混入即梦排队。</p>
            </div>
            <span className="rounded-md border border-glass-border bg-surface-inset px-2 py-1 text-xs text-text-muted">{tasks.length} 条</span>
          </div>
          <div className="mt-3 min-h-0 overflow-auto rounded-lg border border-glass-border">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface/95 text-xs text-text-muted backdrop-blur">
                <tr>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">账号</th>
                  <th className="px-3 py-2">提交信息</th>
                  <th className="px-3 py-2">结果</th>
                  <th className="px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-glass-border">
                {tasks.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-text-muted">暂无测试任务</td></tr>
                ) : tasks.map((task) => (
                  <tr key={task.id} className={task.status === "failed" ? "bg-red-500/5" : ""}>
                    <td className="px-3 py-3 align-top">
                      <span className={clsx("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold", task.status === "completed" ? "bg-emerald-500/10 text-emerald-300" : task.status === "failed" ? "bg-red-500/10 text-red-300" : "bg-primary/10 text-primary")}>{task.status === "completed" ? <CheckCircle2 size={13} /> : task.status === "failed" ? <XCircle size={13} /> : <RefreshCcw size={13} />}{statusLabel(task.status)}</span>
                    </td>
                    <td className="px-3 py-3 align-top text-text-secondary">{task.account_label || task.account_id}</td>
                    <td className="px-3 py-3 align-top">
                      <div className="font-mono text-xs text-text-muted">submit: {task.submit_id || "未返回"}</div>
                      <div className="mt-1 text-xs text-text-muted">{task.model} · {task.ratio} · {task.duration}s · {task.resolution}</div>
                      <div className="mt-2 max-w-[360px] truncate text-foreground" title={task.prompt}>{task.prompt}</div>
                      {task.error_message ? <div className="mt-2 text-xs text-red-300">{task.error_message}</div> : null}
                    </td>
                    <td className="px-3 py-3 align-top">
                      {task.result_url ? <a href={task.result_url} target="_blank" rel="noreferrer" className="max-w-[260px] truncate text-primary underline">{task.result_url}</a> : <span className="text-text-muted">暂无</span>}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={busy || !task.submit_id} onClick={() => pollTask(task.id)} className="inline-flex h-8 items-center gap-1 rounded-md border border-glass-border bg-surface-inset px-2 text-xs font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50">
                          <RefreshCcw size={13} />轮询
                        </button>
                        {task.result_url ? <button type="button" onClick={() => void copyResult(task.result_url!)} className="inline-flex h-8 items-center gap-1 rounded-md border border-glass-border bg-surface-inset px-2 text-xs font-semibold text-foreground"><Copy size={13} />复制</button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

const readError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { detail?: string } } }).response;
    return response?.data?.detail ?? "请求失败";
  }
  return String(error || "请求失败");
};