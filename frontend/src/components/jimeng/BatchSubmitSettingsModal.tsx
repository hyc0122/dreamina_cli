"use client";

import { Loader2, Save, Send, X } from "lucide-react";
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
  submitIntervalSeconds?: number;
  videoModelOptions?: LlmModelOption[];
  onClose: () => void;
  onSave: (settings: JimengVideoGenerationSettings, submitIntervalSeconds: number) => void | Promise<void>;
  onSubmit: (settings: JimengVideoGenerationSettings, submitIntervalSeconds: number) => Promise<void>;
}

export default function BatchSubmitSettingsModal({
  open,
  selectedCount,
  submitting,
  value = DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS,
  submitIntervalSeconds = 3,
  videoModelOptions = [],
  onClose,
  onSave,
  onSubmit,
}: BatchSubmitSettingsModalProps) {
  const [draft, setDraft] = useState<JimengVideoGenerationSettings>(() => normalizeGenerationSettings(value));
  const [intervalDraft, setIntervalDraft] = useState(() => Math.min(300, Math.max(1, Math.round(submitIntervalSeconds || 3))));
  const [error, setError] = useState<string | null>(null);
  const normalizedValue = normalizeGenerationSettings(value);
  const normalizedInterval = Math.min(300, Math.max(1, Math.round(submitIntervalSeconds || 3)));
  const durationSource = draft.duration_source === "global" ? "global" : "per_shot";
  const { requestClose, backdropProps } = useModalDismiss({
    open,
    dirty: JSON.stringify(draft) !== JSON.stringify(normalizedValue) || intervalDraft !== normalizedInterval,
    disabled: submitting,
    onClose,
  });

  useEffect(() => {
    if (open) {
      setDraft(normalizeGenerationSettings(value));
      setIntervalDraft(Math.min(300, Math.max(1, Math.round(submitIntervalSeconds || 3))));
      setError(null);
    }
  }, [open, submitIntervalSeconds, value]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4 py-6" {...backdropProps}>
      <div className="modal-panel w-full max-w-2xl rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Send size={16} />
              批量提交
            </div>
            <h3 className="mt-2 font-display text-xl font-semibold text-foreground">批量提交参数</h3>
            <p className="mt-1 text-sm text-text-secondary">
              确认本次批量提交的视频参数和 worker 提交间隔。本次将提交 {selectedCount} 个分镜。
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

        <div className="mt-3 rounded-lg border border-glass-border bg-surface-inset p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-text-secondary">时长来源</p>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                默认按每个分镜自己的时长提交；没有单独配置的分镜会使用上方时长。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-glass-border bg-app-bg/55 p-1">
              <button
                type="button"
                onClick={() => setDraft((state) => normalizeGenerationSettings({ ...state, duration_source: "per_shot" }))}
                className={`h-9 rounded-md px-3 text-sm font-medium transition-colors ${
                  durationSource === "per_shot" ? "bg-primary text-white" : "text-text-secondary hover:bg-hover-bg hover:text-foreground"
                }`}
              >
                按单分镜
              </button>
              <button
                type="button"
                onClick={() => setDraft((state) => normalizeGenerationSettings({ ...state, duration_source: "global" }))}
                className={`h-9 rounded-md px-3 text-sm font-medium transition-colors ${
                  durationSource === "global" ? "bg-primary text-white" : "text-text-secondary hover:bg-hover-bg hover:text-foreground"
                }`}
              >
                统一时长
              </button>
            </div>
          </div>
        </div>

        <label className="mt-3 block rounded-lg border border-glass-border bg-surface-inset p-4">
          <span className="text-sm font-medium text-text-secondary">提交间隔（秒）</span>
          <input
            type="number"
            min={1}
            max={300}
            value={intervalDraft}
            onChange={(event) => setIntervalDraft(Math.min(300, Math.max(1, Number(event.target.value) || 1)))}
            className="glass-input mt-2 w-full"
          />
          <span className="mt-2 block text-xs leading-5 text-text-muted">批量分镜会一次性写入本地队列，独立 worker 会按这个间隔逐条提交到即梦。</span>
        </label>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {error ? <p className="mr-auto rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
          <button
            type="button"
            onClick={requestClose}
            className="inline-flex h-10 items-center justify-center rounded-md border border-glass-border bg-surface-inset px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              void Promise.resolve(onSave(draft, intervalDraft)).catch((caught) =>
                setError(caught instanceof Error ? caught.message : "保存参数失败"),
              );
            }}
            disabled={submitting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={15} />
            {submitting ? "保存中..." : "保存参数"}
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              void onSubmit(draft, intervalDraft).catch((caught) => setError(caught instanceof Error ? caught.message : "批量提交失败"));
            }}
            disabled={submitting || selectedCount === 0}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/15 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {submitting ? "分镜制作中..." : "开始批量提交"}
          </button>
        </div>
      </div>
    </div>
  );
}
