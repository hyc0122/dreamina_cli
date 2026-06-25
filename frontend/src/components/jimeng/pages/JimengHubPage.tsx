"use client";

import clsx from "clsx";
import { BookOpen, CheckCircle2, ClipboardPaste, Copy, ExternalLink, Play, Plus, RefreshCcw, Trash2, X, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getMissingWebSessionCookieNames } from "@/components/jimeng/jimengUiHelpers";
import { JIMENG_HUB_VIDEO_MODELS, jimengApi } from "@/lib/jimengApi";
import type { JimengWebSessionAccount, JimengWebSessionTask } from "@/lib/jimengApi";

const RATIO_OPTIONS = ["9:16", "16:9", "1:1"];
const DURATION_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 4);
const JIMENG_COOKIE_CAPTURE_URL = "https://jimeng.jianying.com/ai-tool/generate";

const statusLabel = (status: string) => {
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  if (status === "polling") return "轮询中";
  return status || "未知";
};

const formatTime = (value?: string | null): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("zh-CN", { hour12: false });
};

const readError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { detail?: string } } }).response;
    return response?.data?.detail ?? "请求失败";
  }
  return String(error || "请求失败");
};

export default function JimengHubPage() {
  const [accounts, setAccounts] = useState<JimengWebSessionAccount[]>([]);
  const [tasks, setTasks] = useState<JimengWebSessionTask[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [label, setLabel] = useState("");
  const [cookie, setCookie] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<string>(JIMENG_HUB_VIDEO_MODELS[0].value);
  const [ratio, setRatio] = useState("9:16");
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState("720p");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCookieGuide, setShowCookieGuide] = useState(false);
  const autoPollingRef = useRef(false);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? accounts[0] ?? null,
    [accounts, selectedAccountId],
  );
  const missingCookieNames = useMemo(() => (cookie.trim() ? getMissingWebSessionCookieNames(cookie) : []), [cookie]);

  const refresh = async () => {
    const [accountEnvelope, taskEnvelope] = await Promise.all([
      jimengApi.listJimengHubAccounts(),
      jimengApi.listJimengHubTasks({ limit: 100 }),
    ]);
    setAccounts(accountEnvelope.accounts);
    setTasks(taskEnvelope.tasks);
    if (!selectedAccountId && accountEnvelope.accounts[0]) {
      setSelectedAccountId(accountEnvelope.accounts[0].id);
    }
  };

  useEffect(() => {
    void refresh().catch((err: unknown) => setError(readError(err)));
  }, []);

  useEffect(() => {
    const pollingTasks = tasks.filter((task) => task.status === "polling" && (task.history_id || task.submit_id));
    if (pollingTasks.length === 0) return;
    const timer = window.setInterval(() => {
      if (autoPollingRef.current) return;
      autoPollingRef.current = true;
      void Promise.allSettled(pollingTasks.slice(0, 3).map((task) => jimengApi.pollJimengHubTask(task.id)))
        .then(() => refresh())
        .catch((err: unknown) => setError(readError(err)))
        .finally(() => {
          autoPollingRef.current = false;
        });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [tasks]);

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
      const account = await jimengApi.createJimengHubAccount({ label, sessionid: cookie, enabled: true });
      setLabel("");
      setCookie("");
      setSelectedAccountId(account.id);
      setMessage(account.cookie_ready ? "JiMengHub 账号已保存，后续任务会绑定该 Cookie。" : `账号已保存，但缺少 Cookie：${account.missing_cookie_names.join("、")}`);
      await refresh();
    });

  const submitTask = () =>
    runAction(async () => {
      if (!selectedAccount) {
        throw new Error("请先添加并选择一个 JiMengHub 账号");
      }
      await jimengApi.createJimengHubTask({ account_id: selectedAccount.id, prompt, model, ratio, duration, resolution });
      setMessage("已按选中账号提交，后续轮询会继续使用这个账号绑定的 Cookie。");
      await refresh();
    });

  const pollTask = (taskId: string) =>
    runAction(async () => {
      await jimengApi.pollJimengHubTask(taskId);
      setMessage("已轮询一次任务结果。");
      await refresh();
    });

  const deleteAccount = (accountId: string) =>
    runAction(async () => {
      await jimengApi.deleteJimengHubAccount(accountId);
      setSelectedAccountId((current) => (current === accountId ? "" : current));
      setMessage("JiMengHub 账号已删除。");
      await refresh();
    });

  const pasteCookieFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setError("剪贴板为空，请先复制即梦 Network 请求里的完整 Cookie。");
        return;
      }
      setCookie(text.trim());
      setMessage("已从剪贴板粘贴 Cookie / sessionid。");
    } catch {
      setError("无法读取剪贴板，请确认浏览器权限，或手动粘贴 Cookie。");
    }
  };

  const copyResult = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setMessage("结果地址已复制。");
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <section className="glass-panel shrink-0 rounded-xl p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">JIMENG HUB</p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-foreground">JiMengHub 多账号通道</h2>
            <p className="mt-1 text-sm text-text-secondary">正式多账号网页通道：用完整 Cookie 提交、轮询和下载，同一个任务始终绑定同一个账号。</p>
            <p className="mt-2 rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300">
              该功能内测中，建议先小批量测试，再进入正式批量队列。
            </p>
          </div>
          <button type="button" onClick={() => void runAction(refresh)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-4 text-sm font-semibold text-foreground hover:bg-hover-bg">
            <RefreshCcw size={16} />
            刷新
          </button>
        </div>
        {message && <div className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
        {error && <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
      </section>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="glass-panel min-h-0 overflow-y-auto rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-semibold text-foreground">账号池</h3>
              <p className="mt-1 text-sm text-text-secondary">每个任务会绑定提交时选中的账号，轮询不会切换到其他账号。</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button type="button" onClick={() => window.open(JIMENG_COOKIE_CAPTURE_URL, "_blank", "noopener,noreferrer")} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-glass-border bg-surface-inset px-2.5 text-xs font-semibold text-foreground hover:bg-hover-bg">
                <ExternalLink size={14} />
                打开即梦
              </button>
              <button type="button" onClick={() => setShowCookieGuide(true)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 text-xs font-semibold text-primary hover:bg-primary/15">
                <BookOpen size={14} />
                Cookie 教程
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            <input value={label} onChange={(event) => setLabel(event.target.value)} className="glass-input h-10" placeholder="账号名称，例如账号A" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-text-muted">Cookie / sessionid</span>
              <button type="button" onClick={() => void pasteCookieFromClipboard()} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-glass-border bg-surface-inset px-2.5 text-xs font-semibold text-foreground hover:bg-hover-bg">
                <ClipboardPaste size={14} />
                粘贴 Cookie
              </button>
            </div>
            <textarea value={cookie} onChange={(event) => setCookie(event.target.value)} className="glass-input min-h-[92px] resize-y p-3" placeholder="粘贴 sessionid 或完整 Cookie" />
            {cookie.trim() && missingCookieNames.length > 0 ? (
              <div className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2.5 py-2 text-xs leading-5 text-amber-200">
                当前缺少：{missingCookieNames.join("、")}。建议复制即梦网页 Network 请求头里的完整 Cookie。
              </div>
            ) : null}
            <button type="button" disabled={busy || !label.trim() || !cookie.trim()} onClick={createAccount} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
              <Plus size={16} />
              添加账号
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {accounts.length === 0 ? <div className="rounded-lg border border-dashed border-glass-border p-4 text-center text-sm text-text-muted">暂无账号</div> : null}
            {accounts.map((account) => (
              <div key={account.id} className={clsx("rounded-lg border p-3", selectedAccount?.id === account.id ? "border-primary/50 bg-primary/10" : "border-glass-border bg-surface-inset")}>
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => setSelectedAccountId(account.id)} className="min-w-0 text-left">
                    <div className="truncate text-sm font-semibold text-foreground">{account.label}</div>
                    <div className="mt-1 font-mono text-xs text-text-muted">{account.sessionid_masked}</div>
                    <div className="mt-1 text-xs text-text-muted">Cookie: {account.cookie_count || 1} 个 · {account.cookie_ready ? "已补指纹" : "缺少指纹"}</div>
                  </button>
                  <button type="button" onClick={() => deleteAccount(account.id)} className="rounded-md border border-red-400/30 bg-red-500/10 p-2 text-red-300 hover:bg-red-500/15" title="删除账号">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-glass-border pt-4">
            <h3 className="font-display text-lg font-semibold text-foreground">提交测试</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <select value={selectedAccount?.id ?? ""} onChange={(event) => setSelectedAccountId(event.target.value)} className="glass-input col-span-2 h-10">
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.label}</option>
                ))}
              </select>
              <select value={model} onChange={(event) => setModel(event.target.value)} className="glass-input col-span-2 h-10">
                {JIMENG_HUB_VIDEO_MODELS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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
              提交 JiMengHub 测试
            </button>
          </div>
        </section>

        <section className="glass-panel min-h-0 overflow-hidden rounded-xl p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-lg font-semibold text-foreground">测试任务记录</h3>
              <p className="mt-1 text-sm text-text-secondary">只显示 JiMengHub 测试通道任务；正式队列会从分镜工作台提交。</p>
            </div>
            <span className="rounded-md border border-glass-border bg-surface-inset px-2 py-1 text-xs text-text-muted">{tasks.length} 条</span>
          </div>
          <div className="mt-3 min-h-0 overflow-auto rounded-lg border border-glass-border">
            <table className="w-full min-w-[980px] text-left text-sm">
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
                      <span className={clsx("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold", task.status === "completed" ? "bg-emerald-500/10 text-emerald-300" : task.status === "failed" ? "bg-red-500/10 text-red-300" : "bg-primary/10 text-primary")}>
                        {task.status === "completed" ? <CheckCircle2 size={13} /> : task.status === "failed" ? <XCircle size={13} /> : <RefreshCcw size={13} />}
                        {statusLabel(task.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top text-text-secondary">{task.account_label || task.account_id}</td>
                    <td className="px-3 py-3 align-top">
                      <div className="font-mono text-xs text-text-muted">submit: {task.submit_id || "未返回"}</div>
                      <div className="mt-1 font-mono text-xs text-text-muted">history: {task.history_id || "未返回"}</div>
                      <div className="mt-1 text-xs text-text-muted">{task.model} · {task.ratio} · {task.duration}s · {task.resolution}</div>
                      <div className="mt-1 text-xs text-text-muted">轮询: {formatTime(task.last_polled_at) || "尚未轮询"}</div>
                      <div className="mt-2 max-w-[360px] truncate text-foreground" title={task.prompt}>{task.prompt}</div>
                      {task.error_message ? <div className="mt-2 max-w-[420px] whitespace-pre-wrap text-xs text-red-300" title={task.error_message}>{task.error_message}</div> : null}
                    </td>
                    <td className="px-3 py-3 align-top">
                      {task.result_url ? <a href={task.result_url} target="_blank" rel="noreferrer" className="block max-w-[260px] truncate text-primary underline">{task.result_url}</a> : <span className="text-text-muted">暂无</span>}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={busy || (!task.history_id && !task.submit_id)} onClick={() => pollTask(task.id)} className="inline-flex h-8 items-center gap-1 rounded-md border border-glass-border bg-surface-inset px-2 text-xs font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50">
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

      {showCookieGuide ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-xl border border-glass-border bg-panel-bg p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Cookie Guide</p>
                <h3 className="mt-1 font-display text-xl font-semibold text-foreground">复制即梦完整 Cookie</h3>
                <p className="mt-1 text-sm text-text-secondary">浏览器安全策略不允许本工具直接读取即梦登录 Cookie，需要你从即梦网页请求里手动复制完整 Cookie 请求头。</p>
              </div>
              <button type="button" onClick={() => setShowCookieGuide(false)} className="grid h-9 w-9 place-items-center rounded-lg border border-glass-border bg-surface-inset text-text-secondary hover:bg-hover-bg hover:text-foreground" aria-label="关闭 Cookie 教程">
                <X size={17} />
              </button>
            </div>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-text-secondary">
              <li><span className="font-semibold text-foreground">1.</span> 打开即梦页面并确认已登录。</li>
              <li><span className="font-semibold text-foreground">2.</span> 按 <span className="font-mono text-foreground">F12</span> 打开开发者工具，切到 <span className="font-mono text-foreground">Network / 网络</span>。</li>
              <li><span className="font-semibold text-foreground">3.</span> 刷新页面或点一次生成相关功能，让 Network 出现请求。</li>
              <li><span className="font-semibold text-foreground">4.</span> 点开域名包含 <span className="font-mono text-foreground">jimeng.jianying.com</span> 的请求，在 Request Headers 里复制完整 <span className="font-mono text-foreground">Cookie</span>。</li>
              <li><span className="font-semibold text-foreground">5.</span> 回到本页点击“粘贴 Cookie”，再保存账号。</li>
            </ol>
            <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm leading-6 text-amber-200">
              如果只复制 sessionid，页面会提示缺少 ttwid / odin_tt / user_spaces_idc，网页请求可能出现 4013 风控。
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => window.open(JIMENG_COOKIE_CAPTURE_URL, "_blank", "noopener,noreferrer")} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-4 text-sm font-semibold text-foreground hover:bg-hover-bg">
                <ExternalLink size={16} />
                打开即梦网页
              </button>
              <button type="button" onClick={() => setShowCookieGuide(false)} className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                我知道了
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
