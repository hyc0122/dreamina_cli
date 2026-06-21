"use client";

import clsx from "clsx";
import { CheckSquare, Image as ImageIcon, Square } from "lucide-react";
import { memo } from "react";
import { JIMENG_ASSET_TYPE_LABELS, jimengMediaUrl } from "@/components/jimeng/assets/AssetMiniCard";
import type { JimengAsset } from "@/lib/jimengApi";
import { type AssetViewMode, CHARACTER_KIND_LABELS } from "@/components/jimeng/assets/assetManagerShared";

function AssetBrowser({
  asset,
  selected,
  checked,
  groupCount,
  viewMode,
  onClick,
  onToggleChecked,
}: {
  asset: JimengAsset;
  selected: boolean;
  checked: boolean;
  groupCount: number;
  viewMode: AssetViewMode;
  onClick: () => void;
  onToggleChecked: () => void;
}) {
  const imageUrl = jimengMediaUrl(asset.image_path, asset.updated_at);
  const compact = viewMode === "compact";
  const list = viewMode === "list";
  if (list) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={clsx(
          "flex min-h-10 items-center gap-2 rounded-lg border bg-panel-bg px-3 py-2 text-left transition-colors hover:border-primary/45",
          selected ? "border-primary/60 bg-primary/10" : "border-glass-border",
        )}
      >
        <span
          role="checkbox"
          aria-checked={checked}
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            onToggleChecked();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              onToggleChecked();
            }
          }}
          className={clsx(
            "grid h-7 w-7 shrink-0 place-items-center rounded-md border",
            checked ? "border-primary/60 bg-primary/20 text-primary" : "border-glass-border bg-surface-inset text-text-muted",
          )}
        >
          {checked ? <CheckSquare size={15} /> : <Square size={15} />}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{asset.name}</span>
        {asset.type === "character" ? <span className="shrink-0 rounded border border-glass-border bg-surface-inset px-2 py-1 text-[11px] text-text-secondary">{CHARACTER_KIND_LABELS[asset.character_kind]}</span> : null}
        {groupCount > 1 ? <span className="shrink-0 rounded border border-primary/25 bg-primary/10 px-2 py-1 text-[11px] text-primary">{groupCount} 阶段</span> : null}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "group overflow-hidden rounded-lg border bg-panel-bg text-left transition-colors hover:border-primary/45",
        selected ? "border-primary/60 ring-2 ring-primary/20" : "border-glass-border",
      )}
    >
      <div className={clsx("relative bg-surface-inset", compact ? "h-[200px] w-[200px]" : "aspect-[16/9]")}>
        <span
          role="checkbox"
          aria-checked={checked}
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            onToggleChecked();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              onToggleChecked();
            }
          }}
          className={clsx(
            "absolute left-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-md border backdrop-blur",
            checked ? "border-primary/60 bg-primary/20 text-primary" : "border-glass-border bg-panel-bg/80 text-text-muted",
          )}
        >
          {checked ? <CheckSquare size={15} /> : <Square size={15} />}
        </span>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={asset.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted">
            <ImageIcon size={24} />
            {!compact ? <span className="text-xs">未上传图片</span> : null}
          </div>
        )}
        <span className="absolute bottom-2 left-2 rounded border border-glass-border bg-panel-bg/85 px-2 py-1 text-[11px] text-text-secondary backdrop-blur">
          {asset.type === "character" ? CHARACTER_KIND_LABELS[asset.character_kind] : JIMENG_ASSET_TYPE_LABELS[asset.type]}
        </span>
        {groupCount > 1 ? (
          <span className="absolute right-2 top-2 rounded border border-primary/30 bg-primary/15 px-2 py-1 text-[11px] text-primary">
            {groupCount} 阶段
          </span>
        ) : null}
      </div>
      <div className={clsx("space-y-1 px-3", compact ? "w-[200px] py-2" : "py-3")}>
        <h3 className="truncate text-sm font-semibold text-foreground">{asset.name}</h3>
        {!compact ? <p className="line-clamp-2 min-h-[36px] text-xs leading-5 text-text-muted">{asset.description || "暂无详情描述"}</p> : null}
      </div>
    </button>
  );
}

export default memo(AssetBrowser);
