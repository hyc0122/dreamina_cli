import clsx from "clsx";
import { JIMENG_ASSET_TYPE_LABELS } from "@/components/jimeng/assets/AssetMiniCard";
import { CHARACTER_KIND_LABELS } from "@/components/jimeng/assets/assetManagerShared";
import type { AssetImageSettings } from "@/components/jimeng/assets/assetManagerShared";
import type { AssetImageSettingsDraftSetter } from "@/components/jimeng/assets/AssetImageSettingsModal";
import type { JimengAssetType } from "@/lib/jimengApi";

type PrefixKey = "singleCharacterPromptPrefix" | "groupCharacterPromptPrefix" | "scenePromptPrefix" | "propPromptPrefix";

const PREFIX_CONFIG: Record<Exclude<JimengAssetType, "character">, { label: string; key: PrefixKey }> = {
  scene: { label: "场景前缀提示词", key: "scenePromptPrefix" },
  prop: { label: "道具前缀提示词", key: "propPromptPrefix" },
};

const CHARACTER_PREFIX_FIELDS: Array<{ label: string; key: PrefixKey; description: string }> = [
  {
    label: `${CHARACTER_KIND_LABELS.single}角色前缀提示词`,
    key: "singleCharacterPromptPrefix",
    description: "只用于角色分类为单人的资产。",
  },
  {
    label: `${CHARACTER_KIND_LABELS.group}角色前缀提示词`,
    key: "groupCharacterPromptPrefix",
    description: "只用于角色分类为群演的资产。",
  },
];

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
  const active = activeType === "character" ? null : PREFIX_CONFIG[activeType];

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display text-lg font-semibold text-foreground">类型前缀</h3>
        <p className="mt-1 text-sm text-text-secondary">按资产类型和角色分类自动追加约束，避免单人、群演、场景、道具混用同一套要求。</p>
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
      {activeType === "character" ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {CHARACTER_PREFIX_FIELDS.map((field) => (
            <label key={field.key} className="block rounded-lg border border-glass-border bg-panel-bg p-3">
              <span className="block text-sm font-semibold text-foreground">{field.label}</span>
              <span className="mt-1 block text-xs leading-5 text-text-muted">{field.description}</span>
              <textarea
                value={draft[field.key]}
                onChange={(event) => setDraft((state) => ({ ...state, [field.key]: event.target.value }))}
                className="glass-input mt-3 min-h-[220px] w-full resize-y text-sm leading-6 text-foreground"
              />
            </label>
          ))}
        </div>
      ) : active ? (
        <label className="block space-y-2">
          <span className="text-sm font-medium text-text-secondary">{active.label}</span>
          <textarea
            value={draft[active.key]}
            onChange={(event) => setDraft((state) => ({ ...state, [active.key]: event.target.value }))}
            className="glass-input min-h-[300px] w-full resize-y text-sm leading-6 text-foreground"
          />
        </label>
      ) : null}
    </section>
  );
}
