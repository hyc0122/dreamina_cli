"use client";

import { Sparkles } from "lucide-react";

export default function JimengHomePage() {
  return (
    <section className="glass-panel flex min-h-[420px] flex-col items-center justify-center rounded-xl p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-glass-border bg-surface-inset text-primary">
        <Sparkles size={22} />
      </div>
      <h2 className="mt-4 font-display text-xl font-semibold text-foreground">即梦cli自动排队助手</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">从剧本列表进入项目，继续管理分镜、资产、队列和生成记录。</p>
    </section>
  );
}
