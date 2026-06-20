import AssetStyleLibraryModal from "@/components/jimeng/assets/AssetStyleLibraryModal";
import type { JimengStylePreset } from "@/lib/jimengApi";

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
  onApply: (prompt: string) => void;
  onStylePresetsChanged: () => Promise<void>;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display text-lg font-semibold text-foreground">风格库</h3>
        <p className="mt-1 text-sm text-text-secondary">风格只读取并附加到全局提示词，不会自动覆盖已有提示词。</p>
      </div>
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
        <select
          value={selectedStyleId}
          onChange={(event) => {
            onSelectedStyleIdChange(event.target.value);
            onApply(event.target.value);
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
        <span className="inline-flex h-10 items-center rounded-lg border border-glass-border bg-panel-bg px-3 text-xs text-text-muted">只读取，不修改风格库</span>
      </div>
      <AssetStyleLibraryModal styles={stylePresets} onApply={onApply} onChanged={onStylePresetsChanged} />
    </section>
  );
}