"use client";

import type { ReactNode } from "react";

interface AssetToolbarProps {
  projectName: string;
  children: ReactNode;
}

export default function AssetToolbar({ projectName, children }: AssetToolbarProps) {
  return (
    <div className="sticky top-0 z-20 flex flex-col gap-4 border-b border-glass-border bg-app-bg/95 pb-4 pt-1 backdrop-blur-xl xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Asset Studio</p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-foreground">{projectName}</h2>
        <p className="mt-2 text-sm text-text-secondary">管理角色、场景、道具、资产图片、角色音色和图片生图指令。</p>
      </div>
      {children}
    </div>
  );
}
