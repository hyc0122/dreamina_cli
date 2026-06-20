import clsx from "clsx";
import { JIMENG_ASSET_TYPE_LABELS } from "@/components/jimeng/assets/AssetMiniCard";
import type { AssetImageSettings } from "@/components/jimeng/assets/assetManagerShared";
import type { JimengAssetType } from "@/lib/jimengApi";

export default function AssetImageSendPreviewSection({
  previewType,
  onPreviewTypeChange,
  promptPreview,
}: {
  draft: AssetImageSettings;
  previewType: JimengAssetType;
  onPreviewTypeChange: (type: JimengAssetType) => void;
  promptPreview: string;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display text-lg font-semibold text-foreground">发送预览</h3>
        <p className="mt-1 text-sm text-text-secondary">检查资产类型前缀和全局提示词最终会如何组合。</p>
      </div>
      <div className="rounded-lg border border-glass-border bg-panel-bg p-3 text-xs leading-5 text-text-secondary">
        <p className="font-medium text-foreground">发送规则</p>
        <p className="mt-2">资产生图会发送：类型前缀 + 全局必填提示词 + 资产详情描述 / 生图提示词 + 资产参数配置。</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(["character", "scene", "prop"] as JimengAssetType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onPreviewTypeChange(type)}
            className={clsx(
              "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              previewType === type ? "border-primary/50 bg-primary/15 text-primary" : "border-glass-border bg-panel-bg text-text-secondary hover:bg-hover-bg hover:text-foreground",
            )}
          >
            {JIMENG_ASSET_TYPE_LABELS[type]}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <p className="text-xs font-medium text-primary">{JIMENG_ASSET_TYPE_LABELS[previewType]}提示词组合</p>
        <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{promptPreview || "未设置提示词"}</pre>
      </div>
    </section>
  );
}