"use client";

import { AlertTriangle, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useModalDismiss } from "@/components/jimeng/useModalDismiss";
import { jimengApi, type JimengShot } from "@/lib/jimengApi";

interface ConfirmMissingPropsModalProps {
  open: boolean;
  projectId: string;
  promptPresetId: string | null;
  promptPresetName: string;
  selectedShots: JimengShot[];
  missingPropShotIndexes: number[];
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<unknown>;
}

export default function ConfirmMissingPropsModal({
  open,
  projectId,
  promptPresetId,
  promptPresetName,
  selectedShots,
  missingPropShotIndexes,
  submitting,
  onCancel,
  onConfirm,
}: ConfirmMissingPropsModalProps) {
  const [preview, setPreview] = useState<string>("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const firstShot = selectedShots[0] ?? null;
  const missingLabel = useMemo(() => missingPropShotIndexes.map((index) => `分镜${index}`).join("、"), [missingPropShotIndexes]);
  const { requestClose, backdropProps } = useModalDismiss({
    open,
    disabled: submitting,
    onClose: onCancel,
  });

  useEffect(() => {
    if (!open || !firstShot) {
      setPreview("");
      setPreviewError(null);
      return;
    }

    let disposed = false;
    setPreview("加载最终提示词...");
    setPreviewError(null);
    jimengApi
      .renderPromptPreview(projectId, firstShot.id, { prompt_preset_id: promptPresetId })
      .then((response) => {
        if (!disposed) {
          setPreview(response.final_prompt_snapshot ?? response.final_prompt);
        }
      })
      .catch((caught) => {
        if (!disposed) {
          setPreview("");
          setPreviewError(caught instanceof Error ? caught.message : "最终提示词预览失败");
        }
      });

    return () => {
      disposed = true;
    };
  }, [firstShot, open, projectId, promptPresetId]);

  if (!open) {
    return null;
  }

  const confirm = () => {
    if (submitting) {
      return;
    }
    void onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4 py-6 backdrop-blur-sm" {...backdropProps}>
      <div className="glass-panel max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-elevated shadow-2xl">
        <div className="flex items-center justify-between border-b border-glass-border px-5 py-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-300" />
            <h2 className="font-display text-lg font-semibold text-foreground">确认提交缺少道具的分镜</h2>
          </div>
          <button
            type="button"
            title="关闭"
            onClick={requestClose}
            disabled={submitting}
            className="grid h-8 w-8 place-items-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground disabled:cursor-wait disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm leading-6 text-text-secondary">
            角色和场景已满足提交条件，但以下分镜缺少道具绑定：
            <span className="font-mono text-amber-200">{missingLabel}</span>。
          </p>
          <div className="rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            如果这些分镜确实不需要道具，可以继续提交；否则请返回表格补齐道具槽位。
          </div>

          <div>
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <p className="text-sm font-medium text-text-secondary">提交预览</p>
              <span className="rounded border border-glass-border bg-surface-inset px-2 py-1 text-xs text-text-muted">
                模板：{promptPresetName}
              </span>
            </div>
            <div className="max-h-52 overflow-auto rounded-md border border-glass-border bg-surface-inset p-3">
              {previewError ? (
                <p className="text-sm text-red-300">{previewError}</p>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-6 text-text-secondary">{preview}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-glass-border px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
          <button type="button" onClick={requestClose} disabled={submitting} className="glass-button text-sm text-text-secondary disabled:cursor-wait disabled:opacity-50">
            返回补齐
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
          >
            <Send size={15} />
            {submitting ? "提交中..." : "仍然提交"}
          </button>
        </div>
      </div>
    </div>
  );
}
