"use client";

import clsx from "clsx";
import { Check, Edit3, X } from "lucide-react";
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { type JimengHighlightSpan, type JimengShot } from "@/lib/jimengApi";
import { buildPromptSegments } from "./promptHighlight";

const HIGHLIGHT_CLASS = {
  character: "border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-200",
  scene: "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200",
  prop: "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200",
} as const;

interface ShotPromptCellProps {
  shot: JimengShot;
  highlights: JimengHighlightSpan[];
  onSavePrompt: (shotId: string, prompt: string) => Promise<void>;
}

export default function ShotPromptCell({ shot, highlights, onSavePrompt }: ShotPromptCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(shot.prompt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(shot.prompt);
    setError(null);
    setEditing(false);
  }, [shot.id, shot.prompt]);

  const segments = useMemo(() => buildPromptSegments(shot.prompt, highlights), [highlights, shot.prompt]);

  const stopRowPreview = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const savePrompt = async () => {
    if (saving) {
      return;
    }
    if (draft === shot.prompt) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSavePrompt(shot.id, draft);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存提示词失败");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="min-w-0 space-y-2" onClick={stopRowPreview} onDoubleClick={stopRowPreview}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="glass-input h-52 w-full resize-none overflow-y-auto text-sm leading-6 text-foreground"
          placeholder="输入分镜提示词"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {error ? <p className="min-w-0 text-xs text-red-300">{error}</p> : <span className="min-w-0 text-xs text-text-muted">编辑后保存会刷新当前分镜数据</span>}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              title="取消编辑"
              onClick={(event) => {
                event.stopPropagation();
                setDraft(shot.prompt);
                setEditing(false);
                setError(null);
              }}
              className="grid h-8 w-8 place-items-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground"
            >
              <X size={15} />
            </button>
            <button
              type="button"
              title="保存提示词"
              onClick={(event) => {
                event.stopPropagation();
                void savePrompt();
              }}
              disabled={saving}
              className="grid h-8 w-8 place-items-center rounded-md bg-primary text-white transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
            >
              <Check size={15} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group min-w-0 space-y-2" onClick={stopRowPreview}>
      <div
        onDoubleClick={(event) => {
          event.stopPropagation();
          setEditing(true);
        }}
        title="双击编辑提示词"
        className="h-52 overflow-y-auto rounded-md border border-glass-border bg-black/20 px-3 py-2 text-sm leading-6 text-text-secondary"
      >
        {segments.length > 0 ? (
          <p className="whitespace-pre-wrap break-words">
            {segments.map((segment, index) =>
              segment.kind === "text" ? (
                <span key={`text-${index}`}>{segment.text}</span>
              ) : (
                <mark
                  key={`${segment.kind}-${segment.start}-${segment.end}-${index}`}
                  className={clsx("rounded border px-1 py-0.5", HIGHLIGHT_CLASS[segment.kind])}
                >
                  {segment.text}
                </mark>
              ),
            )}
          </p>
        ) : (
          <span className="text-text-muted">空提示词</span>
        )}
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setEditing(true);
        }}
        className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs text-text-muted transition-colors hover:bg-hover-bg hover:text-foreground"
      >
        <Edit3 size={13} />
        编辑提示词
      </button>
    </div>
  );
}
