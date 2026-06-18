"use client";

import { Save, Settings2, X } from "lucide-react";
import { useEffect, useState } from "react";
import GenerationSettingsControl, { normalizeGenerationSettings } from "@/components/jimeng/GenerationSettingsControl";
import { useModalDismiss } from "@/components/jimeng/useModalDismiss";
import {
  DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS,
  type JimengVideoGenerationSettings,
} from "@/lib/jimengApi";
import type { LlmModelOption } from "@/components/jimeng/llm/modelOptions";

interface BatchSubmitSettingsModalProps {
  open: boolean;
  selectedCount: number;
  submitting: boolean;
  value?: JimengVideoGenerationSettings;
  videoModelOptions?: LlmModelOption[];
  onClose: () => void;
  onSave: (settings: JimengVideoGenerationSettings) => void;
}

export default function BatchSubmitSettingsModal({
  open,
  selectedCount,
  submitting,
  value = DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS,
  videoModelOptions = [],
  onClose,
  onSave,
}: BatchSubmitSettingsModalProps) {
  const [draft, setDraft] = useState<JimengVideoGenerationSettings>(() => normalizeGenerationSettings(value));
  const normalizedValue = normalizeGenerationSettings(value);
  const { requestClose, backdropProps } = useModalDismiss({
    open,
    dirty: JSON.stringify(draft) !== JSON.stringify(normalizedValue),
    disabled: submitting,
    onClose,
  });

  useEffect(() => {
    if (open) {
      setDraft(normalizeGenerationSettings(value));
    }
  }, [open, value]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4 py-6" {...backdropProps}>
      <div className="modal-panel w-full max-w-2xl rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Settings2 size={16} />
              参数设置
            </div>
            <h3 className="mt-2 font-display text-xl font-semibold text-foreground">保存批量默认参数</h3>
            <p className="mt-1 text-sm text-text-secondary">
              这里只保存左侧批量提交会使用的默认参数，不会提交分镜。当前已选 {selectedCount} 个分镜。
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="grid h-8 w-8 place-items-center rounded-md text-text-muted transition-colors hover:bg-hover-bg hover:text-foreground"
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 rounded-lg border border-glass-border bg-surface-inset p-4">
          <GenerationSettingsControl value={draft} onChange={setDraft} videoModelOptions={videoModelOptions} />
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={requestClose}
            className="inline-flex h-10 items-center justify-center rounded-md border border-glass-border bg-surface-inset px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={submitting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={15} />
            {submitting ? "保存中..." : "保存参数"}
          </button>
        </div>
      </div>
    </div>
  );
}
