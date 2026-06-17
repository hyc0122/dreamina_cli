"use client";

import { Settings2, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import GenerationSettingsControl, { normalizeGenerationSettings } from "@/components/jimeng/GenerationSettingsControl";
import { useModalDismiss } from "@/components/jimeng/useModalDismiss";
import {
  DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS,
  type JimengVideoGenerationSettings,
} from "@/lib/jimengApi";

interface BatchSubmitSettingsModalProps {
  open: boolean;
  selectedCount: number;
  submitting: boolean;
  value?: JimengVideoGenerationSettings;
  onClose: () => void;
  onConfirm: (settings: JimengVideoGenerationSettings) => void;
}

export default function BatchSubmitSettingsModal({
  open,
  selectedCount,
  submitting,
  value = DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS,
  onClose,
  onConfirm,
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
      <div className="glass-panel w-full max-w-2xl rounded-xl bg-elevated p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Settings2 size={16} />
              批量提交参数
            </div>
            <h3 className="mt-2 font-display text-xl font-semibold text-foreground">提交选中分镜</h3>
            <p className="mt-1 text-sm text-text-secondary">本次会把 {selectedCount} 个分镜按下面参数写入即梦队列。</p>
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
          <GenerationSettingsControl value={draft} onChange={setDraft} />
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
            onClick={() => onConfirm(draft)}
            disabled={selectedCount === 0 || submitting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={15} />
            {submitting ? "提交中..." : `确认提交 ${selectedCount} 个分镜`}
          </button>
        </div>
      </div>
    </div>
  );
}
