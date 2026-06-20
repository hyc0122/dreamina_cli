import clsx from "clsx";
import { JIMENG_ASSET_TYPE_LABELS } from "@/components/jimeng/assets/AssetMiniCard";
import type { AssetImageSettings } from "@/components/jimeng/assets/assetManagerShared";
import type { AssetImageSettingsDraftSetter } from "@/components/jimeng/assets/AssetImageSettingsModal";
import type { JimengAssetType } from "@/lib/jimengApi";

type PrefixKey = "characterPromptPrefix" | "scenePromptPrefix" | "propPromptPrefix";

const PREFIX_CONFIG: Record<JimengAssetType, { label: string; key: PrefixKey }> = {
  character: { label: "人物前缀提示词", key: "characterPromptPrefix" },
  scene: { label: "场景前缀提示词", key: "scenePromptPrefix" },
  prop: { label: "道具前缀提示词", key: "propPromptPrefix" },
};

export default function AssetImageTypePrefixSettingsSection({
  draft,
  setDraft,
  activeType,
  onActiveTypeChange,
}: {
  draft: AssetImageSettings;
  setDraft: AssetImageSettingsDraftSetter;
  activeType: JimengAssetType;
  onActiveTypeChange: (type: JimengAssetType) => void;
}) {
  const active = PREFIX_CONFIG[activeType];

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display text-lg font-semibold text-foreground">类型前缀</h3>
        <p className="mt-1 text-sm text-text-secondary">按资产类型自动追加约束，避免人物、场景、道具混用同一套要求。</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(["character", "scene", "prop"] as JimengAssetType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onActiveTypeChange(type)}
            className={clsx(
              "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              activeType === type ? "border-primary/50 bg-primary/15 text-primary" : "border-glass-border bg-panel-bg text-text-secondary hover:bg-hover-bg hover:text-foreground",
            )}
          >
            {JIMENG_ASSET_TYPE_LABELS[type]}
          </button>
        ))}
      </div>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-text-secondary">{active.label}</span>
        <textarea
          value={draft[active.key]}
          onChange={(event) => setDraft((state) => ({ ...state, [active.key]: event.target.value }))}
          className="glass-input min-h-[300px] w-full resize-y text-sm leading-6 text-foreground"
        />
      </label>
    </section>
  );
}