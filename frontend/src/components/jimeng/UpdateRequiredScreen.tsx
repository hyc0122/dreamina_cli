"use client";

import { ExternalLink, RefreshCw } from "lucide-react";
import type { JimengVersionStatus } from "@/lib/jimengApi";

interface UpdateRequiredScreenProps {
  status: JimengVersionStatus;
  onRetry?: () => void;
}

export default function UpdateRequiredScreen({ status, onRetry }: UpdateRequiredScreenProps) {
  const openUpdateUrl = () => {
    window.open(status.update_url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-app-bg px-4 py-6">
      <section className="w-full max-w-2xl rounded-xl border border-red-400/30 bg-panel-bg p-6 text-center shadow-2xl shadow-red-950/20">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-300">Update Required</p>
        <h1 className="mt-3 font-display text-2xl font-bold text-foreground">{status.app_name}</h1>
        <p className="mt-3 text-lg font-semibold text-red-300">检测到新版本，当前版本无法继续打开前端。</p>
        <div className="mt-5 grid gap-3 rounded-lg border border-glass-border bg-surface-inset p-4 text-left text-sm sm:grid-cols-2">
          <div>
            <div className="text-text-muted">当前版本</div>
            <div className="mt-1 font-mono text-xl font-semibold text-foreground">{status.current_version}</div>
          </div>
          <div>
            <div className="text-text-muted">云端版本</div>
            <div className="mt-1 font-mono text-xl font-semibold text-red-300">{status.latest_version}</div>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-text-secondary">
          系统会自动跳转到使用说明页面。若浏览器拦截了自动跳转，请点击下面的按钮查看更新说明并下载新版本。
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={openUpdateUrl}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-red-500 px-5 text-sm font-semibold text-white transition hover:bg-red-500/90"
          >
            打开使用说明
            <ExternalLink size={16} />
          </button>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-5 text-sm font-semibold text-foreground transition hover:bg-hover-bg"
            >
              <RefreshCw size={16} />
              重新检查
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
