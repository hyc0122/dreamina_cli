"use client";

import { ScrollText, X } from "lucide-react";
import PromptPresetManager from "@/components/jimeng/PromptPresetManager";
import { useModalDismiss } from "@/components/jimeng/useModalDismiss";

interface PromptPresetManagerModalProps {
  open: boolean;
  onClose: () => void;
}

export default function PromptPresetManagerModal({ open, onClose }: PromptPresetManagerModalProps) {
  const { requestClose, backdropProps } = useModalDismiss({ open, onClose });

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4 py-6" {...backdropProps}>
      <div className="modal-panel flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl">
        <div className="flex items-start justify-between gap-4 border-b border-glass-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <ScrollText size={16} />
              视频指令模板
            </div>
            <h3 className="mt-2 font-display text-xl font-semibold text-foreground">设置分镜视频指令模板</h3>
            <p className="mt-1 text-sm text-text-secondary">这里管理分镜工作台提交视频时使用的前置指令模板。</p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-hover-bg hover:text-foreground"
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <PromptPresetManager embedded />
        </div>
      </div>
    </div>
  );
}
