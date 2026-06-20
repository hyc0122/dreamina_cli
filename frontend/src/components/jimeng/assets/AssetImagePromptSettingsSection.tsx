import type { AssetImageSettings } from "@/components/jimeng/assets/assetManagerShared";
import type { AssetImageSettingsDraftSetter } from "@/components/jimeng/assets/AssetImageSettingsModal";

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
        <h3 className="font-display text-lg font-semibold text-foreground">全局提示词</h3>
        <p className="mt-1 text-sm text-text-secondary">这段提示词会追加到所有资产图片生成请求中。</p>
      </div>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-text-secondary">全局必填提示词</span>
        <textarea
          value={draft.imagePromptTemplate}
          onChange={(event) => {
            setDraft((state) => ({ ...state, imagePromptTemplate: event.target.value }));
            onDirty();
          }}
          className="glass-input min-h-[280px] w-full resize-y text-sm leading-6 text-foreground"
          placeholder="例如：统一角色脸，白底或干净背景，五官稳定，服装细节清晰，适合作为漫剧资产参考图"
        />
      </label>
    </section>
  );
}