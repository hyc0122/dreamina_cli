"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import AssetMiniCard, { JIMENG_ASSET_TYPE_LABELS } from "@/components/jimeng/AssetMiniCard";
import { jimengApi, type JimengAsset, type JimengAssetBinding, type JimengAssetType, type JimengShot } from "@/lib/jimengApi";

interface AssetSlotCellProps {
  projectId: string;
  shot: JimengShot;
  assetType: JimengAssetType;
  bindings: JimengAssetBinding[];
  assets: JimengAsset[];
  onOpenPicker: (shot: JimengShot, assetType: JimengAssetType, assetId?: string) => void;
  onChanged: () => Promise<void>;
}

export default function AssetSlotCell({
  projectId,
  shot,
  assetType,
  bindings,
  assets,
  onOpenPicker,
  onChanged,
}: AssetSlotCellProps) {
  const [removingBindingId, setRemovingBindingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const typedBindings = useMemo(
    () =>
      bindings
        .filter((binding) => binding.asset_type === assetType)
        .sort((left, right) => left.slot_order - right.slot_order || left.created_at.localeCompare(right.created_at)),
    [assetType, bindings],
  );

  const removeBinding = async (binding: JimengAssetBinding) => {
    setRemovingBindingId(binding.id);
    setError(null);
    try {
      await jimengApi.deleteBinding(projectId, shot.id, binding.id);
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "移除资产绑定失败");
    } finally {
      setRemovingBindingId(null);
    }
  };

  const toggleBindingVoice = async (binding: JimengAssetBinding, enabled: boolean) => {
    setError(null);
    try {
      await jimengApi.updateBinding(projectId, shot.id, binding.id, { voice_enabled: enabled });
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "更新音色开关失败");
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {typedBindings.length > 0 ? (
        typedBindings.map((binding) => (
          <AssetMiniCard
            key={binding.id}
            compact
            binding={binding}
            asset={assetById.get(binding.asset_id)}
            assetType={assetType}
            removing={removingBindingId === binding.id}
            onOpen={() => onOpenPicker(shot, assetType, binding.asset_id)}
            onRemove={() => removeBinding(binding)}
            onToggleVoice={(enabled) => toggleBindingVoice(binding, enabled)}
          />
        ))
      ) : (
        <div className="rounded-md border border-dashed border-glass-border bg-black/10 px-2 py-2 text-xs text-text-muted">
          未绑定{JIMENG_ASSET_TYPE_LABELS[assetType]}
        </div>
      )}

      <button
        type="button"
        title={`添加${JIMENG_ASSET_TYPE_LABELS[assetType]}`}
        onClick={(event) => {
          event.stopPropagation();
          onOpenPicker(shot, assetType);
        }}
        className="flex min-h-8 items-center justify-center gap-1 rounded-md border border-dashed border-primary/30 bg-primary/5 px-2 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/10"
      >
        <Plus size={14} />
        <span>添加</span>
      </button>
      {error ? <p className="rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1.5 text-xs leading-5 text-red-200">{error}</p> : null}
    </div>
  );
}
