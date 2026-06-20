import clsx from "clsx";
import type { LlmModelOption } from "@/components/jimeng/llm/modelOptions";
import { ASSET_IMAGE_QUALITY_OPTIONS, type AssetImageQuality, type AssetImageSettings, type AssetImageRatio } from "@/components/jimeng/assets/assetManagerShared";
import type { AssetImageSettingsDraftSetter } from "@/components/jimeng/assets/AssetImageSettingsModal";

export default function AssetImageModelSettingsSection({
  draft,
  setDraft,
  imageModelOptions,
  resolvedImageModelValue,
  onDirty,
}: {
  draft: AssetImageSettings;
  setDraft: AssetImageSettingsDraftSetter;
  imageModelOptions: LlmModelOption[];
  resolvedImageModelValue: string;
  onDirty: () => void;
}) {
  const updateDraft = (updates: Partial<AssetImageSettings>) => {
    setDraft((state) => ({ ...state, ...updates }));
    onDirty();
  };

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display text-lg font-semibold text-foreground">模型与尺寸</h3>
        <p className="mt-1 text-sm text-text-secondary">这里控制资产管理里单张 AI 生图和批量生图使用的全局模型。</p>
      </div>

      <label className="block space-y-2 rounded-lg border border-glass-border bg-panel-bg p-3">
        <span className="text-sm font-medium text-text-secondary">全局生图模型</span>
        <select
          value={draft.imageModelValue || resolvedImageModelValue}
          onChange={(event) => updateDraft({ imageModelValue: event.target.value })}
          disabled={imageModelOptions.length === 0}
          className="glass-input h-10 w-full text-sm text-foreground"
        >
          {imageModelOptions.length === 0 ? <option value="">未选择可用模型</option> : null}
          {imageModelOptions.map((model) => (
            <option key={model.value} value={model.value}>
              {model.label}
            </option>
          ))}
        </select>
        <span className="block text-xs leading-5 text-text-muted">模型来自“大模型设置”里已启用的图片模型。</span>
      </label>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-glass-border bg-panel-bg p-3">
          <span className="block text-sm font-medium text-text-secondary">默认资产画幅</span>
          <div className="mt-2 inline-flex h-10 w-full rounded-md border border-glass-border bg-surface-inset p-1">
            {(["16:9", "9:16"] as AssetImageRatio[]).map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => updateDraft({ defaultImageRatio: ratio })}
                className={clsx(
                  "flex-1 rounded px-3 text-xs font-medium transition-colors",
                  draft.defaultImageRatio === ratio ? "bg-primary text-white" : "text-text-secondary hover:bg-hover-bg hover:text-foreground",
                )}
              >
                {ratio}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-5 text-text-muted">用于新建资产和批量上传默认画幅。</p>
        </div>

        <label className="block space-y-2 rounded-lg border border-glass-border bg-panel-bg p-3">
          <span className="text-sm font-medium text-text-secondary">分辨率</span>
          <select value={draft.resolutionType} onChange={(event) => updateDraft({ resolutionType: event.target.value as "2k" | "4k" })} className="glass-input h-10 w-full text-sm text-foreground">
            <option value="2k">2k</option>
            <option value="4k">4k</option>
          </select>
          <span className="block text-xs leading-5 text-text-muted">用于资产生图设置里的默认分辨率。</span>
        </label>

        <label className="block space-y-2 rounded-lg border border-glass-border bg-panel-bg p-3">
          <span className="text-sm font-medium text-text-secondary">图片质量</span>
          <select value={draft.imageQuality} onChange={(event) => updateDraft({ imageQuality: event.target.value as AssetImageQuality })} className="glass-input h-10 w-full text-sm text-foreground">
            {ASSET_IMAGE_QUALITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="block text-xs leading-5 text-text-muted">默认高质量 high，发送给大模型 params.quality。</span>
        </label>
      </div>
    </section>
  );
}
