"use client";

import clsx from "clsx";
import { Check, Plus, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { insertPromptVariable } from "@/components/jimeng/jimengUiHelpers";
import type { JimengPromptPreset } from "@/lib/jimengApi";

const PROMPT_VARIABLES = [
  "{{style}}",
  "{{camera}}",
  "{{era}}",
  "{{roles}}",
  "{{scene}}",
  "{{props}}",
  "{{shot_prompt}}",
];

const VARIABLE_HELP: Record<string, string> = {
  "{{style}}": "当前剧本选择的风格对应的提示词，风格名字只用于管理和下拉选择。",
  "{{camera}}": "提交预览时填写的镜头语言；不填写则为空。",
  "{{era}}": "提交预览时填写的时代背景；不填写则为空。",
  "{{roles}}": "当前分镜已绑定的角色资产名称和描述。",
  "{{scene}}": "当前分镜已绑定的场景资产名称和描述。",
  "{{props}}": "当前分镜已绑定的道具资产名称和描述。",
  "{{shot_prompt}}": "当前分镜自己的分镜提示词。",
};

interface PromptPresetEditorProps {
  preset: JimengPromptPreset | null;
  onSave: (data: { name: string; content: string; variables: string[]; scope?: "system" | "user"; is_default?: boolean; enabled?: boolean }) => Promise<void>;
  onSaveAndUse?: (data: { name: string; content: string; variables: string[]; scope?: "system" | "user"; is_default?: boolean; enabled?: boolean }) => Promise<void>;
  saving?: boolean;
}

export default function PromptPresetEditor({ preset, onSave, onSaveAndUse, saving = false }: PromptPresetEditorProps) {
  const [name, setName] = useState(preset?.name ?? "");
  const [content, setContent] = useState(preset?.content ?? "");
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const variables = useMemo(() => PROMPT_VARIABLES, []);

  useEffect(() => {
    setName(preset?.name ?? "");
    setContent(preset?.content ?? "");
    setSavedNotice(null);
  }, [preset?.content, preset?.id, preset?.name]);

  const runSave = async (usePreset: boolean) => {
    setSavedNotice(null);
    const payload = {
      name,
      content,
      variables,
      scope: preset?.scope ?? "user",
      is_default: preset?.is_default ?? false,
      enabled: preset?.enabled ?? true,
    } as const;
    if (usePreset && onSaveAndUse) {
      await onSaveAndUse(payload);
      setSavedNotice("已保存并应用");
      return;
    }
    await onSave(payload);
    setSavedNotice("已保存");
  };

  const insertVariable = (variable: string) => {
    const textarea = document.getElementById("jimeng-preset-content") as HTMLTextAreaElement | null;
    const selectionStart = textarea?.selectionStart ?? content.length;
    const selectionEnd = textarea?.selectionEnd ?? content.length;
    const next = insertPromptVariable(content, variable, selectionStart, selectionEnd);
    setContent(next.value);
    requestAnimationFrame(() => {
      textarea?.setSelectionRange(next.cursor, next.cursor);
      textarea?.focus();
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="提示词模板名称"
          className="glass-input"
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void runSave(false)}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-glass-border bg-black/20 px-3 py-2 text-sm font-medium text-text-secondary hover:bg-hover-bg hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Save size={14} />
            仅保存
          </button>
          {onSaveAndUse ? (
            <button
              type="button"
              onClick={() => void runSave(true)}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Check size={14} />
              保存并使用
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {variables.map((variable) => (
          <button
            key={variable}
            type="button"
            onClick={() => insertVariable(variable)}
            className="inline-flex items-center gap-2 rounded-md border border-glass-border bg-black/20 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-hover-bg hover:text-foreground"
          >
            <Plus size={12} />
            {variable}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-glass-border bg-surface-inset p-3 text-xs leading-5 text-text-secondary">
        <p className="mb-2 font-medium text-foreground">变量来源说明</p>
        <div className="grid gap-1.5 md:grid-cols-2">
          {variables.map((variable) => (
            <p key={variable}>
              <span className="font-mono text-primary">{variable}</span>：{VARIABLE_HELP[variable]}
            </p>
          ))}
        </div>
      </div>

      <textarea
        id="jimeng-preset-content"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={10}
        className={clsx("glass-input min-h-[240px] w-full resize-y font-mono text-sm leading-6")}
        placeholder="输入提示词模板，支持 {{style}}、{{roles}} 等变量"
      />

      {savedNotice ? <p className="text-xs text-emerald-200">{savedNotice}</p> : null}
    </div>
  );
}
