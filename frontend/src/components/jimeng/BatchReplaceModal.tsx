"use client";

import { Replace, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useModalDismiss } from "@/components/jimeng/useModalDismiss";
import { jimengApi, type JimengShot } from "@/lib/jimengApi";

interface BatchReplaceModalProps {
  open: boolean;
  projectId: string;
  selectedShots: JimengShot[];
  onClose: () => void;
  onApplied: () => Promise<void>;
}

export default function BatchReplaceModal({ open, projectId, selectedShots, onClose, onApplied }: BatchReplaceModalProps) {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { requestClose, backdropProps } = useModalDismiss({
    open,
    dirty: Boolean(findText || replaceText),
    disabled: submitting,
    onClose,
  });

  const matchedCount = useMemo(
    () => (findText ? selectedShots.filter((shot) => shot.prompt.includes(findText)).length : 0),
    [findText, selectedShots],
  );

  if (!open) {
    return null;
  }

  const applyReplace = async () => {
    if (selectedShots.length === 0) {
      setError("请先选择要替换的分镜");
      return;
    }
    if (!findText) {
      setError("请输入要查找的文本");
      return;
    }
    if (matchedCount === 0) {
      setError("选中的分镜中没有匹配文本");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await Promise.all(
        selectedShots
          .filter((shot) => shot.prompt.includes(findText))
          .map((shot) =>
            jimengApi.updateShot(projectId, shot.id, {
              prompt: shot.prompt.split(findText).join(replaceText),
            }),
          ),
      );
      await onApplied();
      setFindText("");
      setReplaceText("");
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "批量替换失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4 py-6 backdrop-blur-sm" {...backdropProps}>
      <div className="glass-panel max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl bg-elevated shadow-2xl">
        <div className="flex items-center justify-between border-b border-glass-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Replace size={18} className="text-primary" />
            <h2 className="font-display text-lg font-semibold text-foreground">批量文本替换</h2>
          </div>
          <button
            type="button"
            title="关闭"
            onClick={requestClose}
            className="grid h-8 w-8 place-items-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm leading-6 text-text-secondary">
            仅处理当前选中的 {selectedShots.length} 条分镜，不调用全项目批量替换接口。
          </p>
          <div>
            <label className="mb-2 block text-sm font-medium text-text-secondary">查找文本</label>
            <input
              value={findText}
              onChange={(event) => setFindText(event.target.value)}
              className="glass-input w-full text-sm text-foreground"
              placeholder="输入要替换的片段"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-text-secondary">替换为</label>
            <input
              value={replaceText}
              onChange={(event) => setReplaceText(event.target.value)}
              className="glass-input w-full text-sm text-foreground"
              placeholder="留空表示删除匹配文本"
            />
          </div>
          <div className="rounded-md border border-glass-border bg-surface-inset px-3 py-2 text-xs text-text-muted">
            当前匹配分镜：<span className="font-mono text-foreground">{matchedCount}</span>
          </div>
          {error ? <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-glass-border px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
          <button type="button" onClick={requestClose} className="glass-button text-sm text-text-secondary">
            取消
          </button>
          <button
            type="button"
            onClick={applyReplace}
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? "替换中..." : "应用替换"}
          </button>
        </div>
      </div>
    </div>
  );
}
