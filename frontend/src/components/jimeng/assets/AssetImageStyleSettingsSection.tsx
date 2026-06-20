import { useState } from "react";
import AssetStyleLibraryModal from "@/components/jimeng/assets/AssetStyleLibraryModal";
import type { AssetStylePromptField } from "@/components/jimeng/assets/assetManagerShared";
import type { JimengStylePreset } from "@/lib/jimengApi";

const STYLE_TARGETS: Array<{ value: AssetStylePromptField; label: string }> = [
  { value: "globalStylePrompt", label: "全局画风" },
  { value: "singleCharacterStylePrompt", label: "单人人物画风" },
  { value: "groupCharacterStylePrompt", label: "群演人物画风" },
  { value: "sceneStylePrompt", label: "场景画风" },
];

export default function AssetImageStyleSettingsSection({
  stylePresets,
  selectedStyleId,
  onSelectedStyleIdChange,
  onApply,
  onStylePresetsChanged,
}: {
  stylePresets: JimengStylePreset[];
  selectedStyleId: string;
  onSelectedStyleIdChange: (id: string) => void;
  onApply: (prompt: string, target: AssetStylePromptField) => void;
  onStylePresetsChanged: () => Promise<void>;
}) {
  const [styleApplyTarget, setStyleApplyTarget] = useState<AssetStylePromptField>("globalStylePrompt");

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display text-lg font-semibold text-foreground">风格库</h3>
        <p className="mt-1 text-sm text-text-secondary">风格只读取并附加到指定画风，不会自动覆盖已有内容。</p>
      </div>
      <div className="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)_auto]">
        <label className="space-y-1">
          <span className="text-xs font-medium text-text-secondary">附加到画风</span>
          <select
            value={styleApplyTarget}
            onChange={(event) => setStyleApplyTarget(event.target.value as AssetStylePromptField)}
            className="glass-input h-10 w-full text-sm text-foreground"
          >
            {STYLE_TARGETS.map((target) => (
              <option key={target.value} value={target.value}>
                {target.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-text-secondary">选择风格</span>
          <select
            value={selectedStyleId}
            onChange={(event) => {
              onSelectedStyleIdChange(event.target.value);
              onApply(event.target.value, styleApplyTarget);
            }}
            className="glass-input h-10 w-full text-sm text-foreground"
          >
            <option value="">选择风格并附加提示词</option>
            {stylePresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>
        <span className="inline-flex h-10 self-end items-center rounded-lg border border-glass-border bg-panel-bg px-3 text-xs text-text-muted">只读取，不修改风格库</span>
      </div>
      <AssetStyleLibraryModal styles={stylePresets} onApply={(prompt) => onApply(prompt, styleApplyTarget)} onChanged={onStylePresetsChanged} />
    </section>
  );
}