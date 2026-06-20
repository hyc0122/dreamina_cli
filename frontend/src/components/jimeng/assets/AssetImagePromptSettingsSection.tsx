import type { AssetImageSettings, AssetStylePromptField } from "@/components/jimeng/assets/assetManagerShared";
import type { AssetImageSettingsDraftSetter } from "@/components/jimeng/assets/AssetImageSettingsModal";

const STYLE_FIELDS: Array<{ key: AssetStylePromptField; label: string; description: string; placeholder: string }> = [
  {
    key: "globalStylePrompt",
    label: "全局画风",
    description: "所有资产都会追加，可放统一画风、背景、清晰度要求。",
    placeholder: "例如：统一写实漫剧画风，干净背景，主体清晰，光影稳定。",
  },
  {
    key: "singleCharacterStylePrompt",
    label: "单人人物画风",
    description: "只用于角色分类为单人的资产。",
    placeholder: "例如：单人角色设定图，突出五官、发型、服饰和比例稳定。",
  },
  {
    key: "groupCharacterStylePrompt",
    label: "群演人物画风",
    description: "只用于角色分类为群演的资产。",
    placeholder: "例如：群演人物参考图，弱化主角感，服装统一但面部差异清楚。",
  },
  {
    key: "sceneStylePrompt",
    label: "场景画风",
    description: "只用于场景资产。",
    placeholder: "例如：场景设定图，强调空间结构、光线、可复用背景，不出现主体人物。",
  },
];

export default function AssetImagePromptSettingsSection({
  draft,
  setDraft,
  onDirty,
}: {
  draft: AssetImageSettings;
  setDraft: AssetImageSettingsDraftSetter;
  onDirty: () => void;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display text-lg font-semibold text-foreground">画风风格</h3>
        <p className="mt-1 text-sm text-text-secondary">按全局、单人人物、群演人物和场景分别维护画风正文。</p>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {STYLE_FIELDS.map((field) => (
          <label key={field.key} className="block rounded-lg border border-glass-border bg-panel-bg p-3">
            <span className="block text-sm font-semibold text-foreground">{field.label}</span>
            <span className="mt-1 block text-xs leading-5 text-text-muted">{field.description}</span>
            <textarea
              value={draft[field.key]}
              onChange={(event) => {
                setDraft((state) => ({ ...state, [field.key]: event.target.value }));
                onDirty();
              }}
              className="glass-input mt-3 min-h-[150px] w-full resize-y text-sm leading-6 text-foreground"
              placeholder={field.placeholder}
            />
          </label>
        ))}
      </div>
    </section>
  );
}