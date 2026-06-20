"use client";

import clsx from "clsx";
import { Image as ImageIcon, Lock, MapPin, Package, Settings2, User, Volume2, VolumeX, X, type LucideIcon } from "lucide-react";
import { API_URL } from "@/lib/api";
import { CHARACTER_KIND_LABELS, normalizeCharacterKind } from "@/components/jimeng/assets/assetManagerShared";
import type { JimengAsset, JimengAssetBinding, JimengAssetType } from "@/lib/jimengApi";

export const JIMENG_ASSET_TYPE_LABELS: Record<JimengAssetType, string> = {
  character: "角色",
  scene: "场景",
  prop: "道具",
};

const JIMENG_ASSET_TYPE_ICONS: Record<JimengAssetType, LucideIcon> = {
  character: User,
  scene: MapPin,
  prop: Package,
};

const appendMediaVersion = (url: string, version?: string | null): string => {
  if (!version) {
    return url;
  }
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
};

export function jimengMediaUrl(path: string | null | undefined, version?: string | null): string {
  if (!path) {
    return "";
  }
  if (/^(blob:|data:)/.test(path)) {
    return path;
  }
  if (/^https?:/.test(path)) {
    return appendMediaVersion(path, version);
  }

  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("/files/")) {
    return appendMediaVersion(`${API_URL}${normalized}`, version);
  }
  if (normalized.startsWith("files/")) {
    return appendMediaVersion(`${API_URL}/${normalized}`, version);
  }

  const outputMarker = "/output/";
  const outputIndex = normalized.lastIndexOf(outputMarker);
  const relativePath =
    outputIndex >= 0
      ? normalized.slice(outputIndex + outputMarker.length)
      : normalized.startsWith("output/")
        ? normalized.slice("output/".length)
        : normalized.replace(/^\/+/, "");

  return appendMediaVersion(`${API_URL}/files/${relativePath}`, version);
}

interface AssetMiniCardProps {
  asset?: JimengAsset;
  binding?: JimengAssetBinding;
  assetType?: JimengAssetType;
  compact?: boolean;
  onRemove?: () => void;
  onOpen?: () => void;
  onToggleVoice?: (enabled: boolean) => void;
  removing?: boolean;
}

export default function AssetMiniCard({
  asset,
  binding,
  assetType,
  compact = false,
  onRemove,
  onOpen,
  onToggleVoice,
  removing = false,
}: AssetMiniCardProps) {
  const resolvedType = asset?.type ?? binding?.asset_type ?? assetType ?? "prop";
  const Icon = JIMENG_ASSET_TYPE_ICONS[resolvedType];
  const imageUrl = jimengMediaUrl(asset?.image_path, asset?.updated_at);
  const hasVoice = resolvedType === "character" && Boolean(asset?.audio_path);
  const voiceEnabled = binding?.voice_enabled ?? true;
  const characterKindLabel = resolvedType === "character" ? CHARACTER_KIND_LABELS[normalizeCharacterKind(asset?.character_kind)] : null;

  return (
    <div
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={(event) => {
        if (!onOpen) {
          return;
        }
        event.stopPropagation();
        onOpen();
      }}
      onKeyDown={(event) => {
        if (onOpen && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          event.stopPropagation();
          onOpen();
        }
      }}
      className={clsx(
        "group relative flex min-w-0 items-center gap-2 rounded-md border border-glass-border bg-black/20 text-left",
        onOpen && "cursor-pointer transition-colors hover:border-primary/35 hover:bg-primary/5",
        compact ? "px-2 py-1.5" : "px-3 py-2",
      )}
    >
      <div
        className={clsx(
          "flex shrink-0 items-center justify-center overflow-hidden rounded border border-white/[0.06] bg-white/[0.04]",
          compact ? "h-8 w-8" : "h-11 w-11",
        )}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={asset?.name ?? JIMENG_ASSET_TYPE_LABELS[resolvedType]} className="h-full w-full object-cover" />
        ) : (
          <Icon size={compact ? 15 : 18} className="text-text-muted" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-xs font-medium text-foreground">{asset?.name ?? "资产已缺失"}</p>
          {binding?.locked ? <Lock size={11} className="shrink-0 text-emerald-300" /> : null}
          {hasVoice ? (
            <button
              type="button"
              title={voiceEnabled ? "音色已启用，点击临时关闭" : "音色已关闭，点击启用"}
              onClick={(event) => {
                event.stopPropagation();
                onToggleVoice?.(!voiceEnabled);
              }}
              className={clsx(
                "grid h-5 w-5 shrink-0 place-items-center rounded border transition-colors",
                voiceEnabled
                  ? "border-cyan-300/35 bg-cyan-400/15 text-cyan-300"
                  : "border-glass-border bg-surface-inset text-text-muted",
              )}
            >
              {voiceEnabled ? <Volume2 size={11} /> : <VolumeX size={11} />}
            </button>
          ) : null}
        </div>
        <p className="mt-0.5 truncate font-mono text-[10px] uppercase text-text-muted">
          {characterKindLabel ? `${JIMENG_ASSET_TYPE_LABELS[resolvedType]} · ${characterKindLabel}` : JIMENG_ASSET_TYPE_LABELS[resolvedType]}
        </p>
      </div>
      {onRemove ? (
        <>
          {hasVoice && onOpen ? (
            <button
              type="button"
              title="管理角色音色和资产信息"
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
              className="grid h-6 w-6 shrink-0 place-items-center rounded text-text-muted opacity-0 transition-colors hover:bg-primary/10 hover:text-primary group-hover:opacity-100"
            >
              <Settings2 size={13} />
            </button>
          ) : null}
        <button
          type="button"
          title="移除绑定"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          disabled={removing}
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-text-muted opacity-0 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:cursor-wait disabled:opacity-50 group-hover:opacity-100"
        >
          <X size={13} />
        </button>
        </>
      ) : null}
      {!imageUrl && !asset ? <ImageIcon size={12} className="absolute right-2 top-2 text-text-muted/40" /> : null}
    </div>
  );
}
