"use client";

import clsx from "clsx";
import {
  BookOpen,
  ExternalLink,
  FolderOpen,
  LogIn,
  MessageSquare,
  MonitorUp,
  Power,
  RefreshCw,
  Server,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { jimengApi } from "@/lib/jimengApi";
import type { JimengRuntimeInfo } from "@/lib/jimengApi";

const HELP_URL = "https://my.feishu.cn/docx/AfO9d2Gd0ovLpLxpeN2cjm1xnF2?from=from_copylink";
const FEEDBACK_URL = "https://my.feishu.cn/share/base/form/shrcneH6UB1riprQBXtvMLycffc";

interface JimengLauncherPageProps {
  onOpenApp: () => void;
}

const formatStartedAt = (value?: string) => {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
};

function RuntimePath({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-lg border border-glass-border bg-black/20 px-3 py-2">
      <div className="mb-1 text-xs text-text-muted">{label}</div>
      <div className="truncate font-mono text-xs text-foreground" title={value || "--"}>
        {value || "--"}
      </div>
    </div>
  );
}

function ExternalHelpLinks({ compact = false }: { compact?: boolean }) {
  const baseClass = clsx(
    "inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
    compact ? "border-primary/35 bg-primary/10 text-primary hover:bg-primary/15" : "border-cyan-300/35 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/20",
  );
  return (
    <div className="flex flex-wrap gap-2">
      <a href={HELP_URL} target="_blank" rel="noreferrer" className={baseClass}>
        <BookOpen size={16} />
        使用说明
        <ExternalLink size={13} />
      </a>
      <a href={FEEDBACK_URL} target="_blank" rel="noreferrer" className={clsx(baseClass, !compact && "border-amber-300/35 bg-amber-400/15 text-amber-100 hover:bg-amber-400/20")}>
        <MessageSquare size={16} />
        问题反馈
        <ExternalLink size={13} />
      </a>
    </div>
  );
}

export default function JimengLauncherPage({ onOpenApp }: JimengLauncherPageProps) {
  const [runtimeInfo, setRuntimeInfo] = useState<JimengRuntimeInfo | null>(null);
  const [instances, setInstances] = useState<JimengRuntimeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentUrl = useMemo(() => {
    if (!runtimeInfo) {
      return "";
    }
    return `http://${runtimeInfo.host}:${runtimeInfo.port}`;
  }, [runtimeInfo]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [runtime, envelope] = await Promise.all([jimengApi.getRuntimeInfo(), jimengApi.listRuntimeInstances()]);
      setRuntimeInfo(runtime);
      setInstances(envelope.instances);
      setNotice(`已发现 ${envelope.instances.length} 个即梦 CLI 服务端口`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "运行时检测失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const shutdown = async () => {
    setLoading(true);
    setError(null);
    try {
      await jimengApi.shutdownRuntime();
      setNotice("关闭指令已发送，当前服务即将退出");
    } catch (err) {
      setError(err instanceof Error ? err.message : "关闭服务失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#050508] text-foreground">
      <div className="absolute inset-0 bg-[linear-gradient(125deg,rgba(8,15,32,0.92),rgba(18,10,32,0.78),rgba(4,22,28,0.9))]" />
      <div className="absolute inset-x-0 top-0 h-56 bg-[linear-gradient(90deg,rgba(100,108,255,0.24),rgba(0,220,255,0.12),rgba(255,0,128,0.18))] blur-3xl" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-[linear-gradient(90deg,rgba(20,184,166,0.18),rgba(99,102,241,0.16),rgba(251,191,36,0.10))] blur-3xl" />

      <main className="relative z-10 flex h-full flex-col p-4 sm:p-6">
        <header className="flex shrink-0 flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <MonitorUp size={14} />
              Dreamina CLI Launcher
            </div>
            <h1 className="mt-3 font-display text-2xl font-bold text-white">小狼专用-即梦CLI 启动管理器</h1>
            <p className="mt-1 text-sm text-slate-300">当前端口、服务状态、帮助入口和反馈入口都在这里。</p>
          </div>
          <ExternalHelpLinks />
        </header>

        <section className="grid min-h-0 flex-1 gap-4 pt-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
          <div className="glass-panel flex min-h-0 flex-col rounded-xl bg-black/30 p-4 shadow-2xl shadow-primary/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-cyan-100">
                  <ShieldCheck size={18} />
                  服务控制台
                </div>
                <p className="mt-1 text-xs text-slate-400">同一目录只复用一个服务，避免同一数据库被多个后端同时写入。</p>
              </div>
              <button type="button" onClick={refresh} disabled={loading} className="glass-button inline-flex items-center gap-2 text-sm text-foreground">
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                刷新状态
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-emerald-300/30 bg-emerald-400/10 p-4">
                <div className="text-xs text-emerald-200">当前状态</div>
                <div className="mt-2 text-2xl font-semibold text-emerald-300">{runtimeInfo?.ok ? "运行中" : "检测中"}</div>
              </div>
              <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
                <div className="text-xs text-primary">当前端口</div>
                <div className="mt-2 font-mono text-2xl font-semibold text-white">{runtimeInfo?.port ?? "--"}</div>
              </div>
              <div className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-4">
                <div className="text-xs text-amber-100">进程 PID</div>
                <div className="mt-2 font-mono text-2xl font-semibold text-amber-200">{runtimeInfo?.pid ?? "--"}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <RuntimePath label="当前访问地址" value={currentUrl} />
              <RuntimePath label="程序根目录" value={runtimeInfo?.project_dir} />
              <RuntimePath label="数据目录" value={runtimeInfo?.data_dir} />
              <RuntimePath label="输出目录" value={runtimeInfo?.output_dir} />
              <RuntimePath label="启动时间" value={formatStartedAt(runtimeInfo?.started_at)} />
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <button type="button" onClick={onOpenApp} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition hover:bg-primary/90">
                <LogIn size={18} />
                登录
              </button>
              <button type="button" onClick={onOpenApp} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-cyan-300/35 bg-cyan-400/15 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20">
                <MonitorUp size={18} />
                打开软件
              </button>
              <button type="button" onClick={shutdown} disabled={loading} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-red-300/35 bg-red-500/15 px-4 text-sm font-semibold text-red-100 transition hover:bg-red-500/20 disabled:opacity-60">
                <Power size={18} />
                关闭服务
              </button>
            </div>

            {(notice || error) && (
              <div className={clsx("mt-4 rounded-lg border px-3 py-2 text-sm", error ? "border-red-300/30 bg-red-500/10 text-red-100" : "border-emerald-300/30 bg-emerald-500/10 text-emerald-100")}>
                {error || notice}
              </div>
            )}
          </div>

          <aside className="glass-panel min-h-0 overflow-hidden rounded-xl bg-black/30 p-4 shadow-2xl shadow-cyan-950/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Server size={18} />
                  已打开端口
                </div>
                <p className="mt-1 text-xs text-slate-400">扫描 62100-62199，识别正在运行的即梦 CLI 服务。</p>
              </div>
              <ExternalHelpLinks compact />
            </div>

            <div className="mt-4 max-h-[calc(100vh-220px)] space-y-3 overflow-y-auto pr-1">
              {instances.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-6 text-center text-sm text-slate-400">暂无端口结果</div>
              ) : (
                instances.map((item) => (
                  <div key={`${item.host}:${item.port}:${item.project_dir}`} className={clsx("rounded-xl border p-3", item.is_current ? "border-primary/40 bg-primary/10" : "border-white/10 bg-white/5")}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <FolderOpen size={16} className={item.is_current ? "text-primary" : "text-slate-400"} />
                        {item.is_current ? "当前服务" : "其他服务"}
                      </div>
                      <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 font-mono text-xs text-slate-200">{item.host}:{item.port}</span>
                    </div>
                    <div className="mt-3 space-y-2 text-xs text-slate-400">
                      <div className="truncate" title={item.project_dir}>根目录：{item.project_dir}</div>
                      <div className="truncate" title={item.data_dir}>数据目录：{item.data_dir}</div>
                      <div>启动：{formatStartedAt(item.started_at)}</div>
                    </div>
                    <a href={`http://${item.host}:${item.port}/#/app`} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10">
                      打开这个端口
                      <ExternalLink size={13} />
                    </a>
                  </div>
                ))
              )}
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
