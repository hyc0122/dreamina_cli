"use client";

import clsx from "clsx";
import { Copy, FileText, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  jimengApi,
  type PromptManagerTemplate,
  type PromptManagerTemplatePayload,
  type PromptManagerTemplateType,
} from "@/lib/jimengApi";
import {
  getPromptManagerTemplateTypeItem,
  PROMPT_MANAGER_GROUPS,
  PROMPT_MANAGER_SOURCE_META,
  PROMPT_SEPARATOR_OPTIONS,
} from "@/components/prompts/promptManagerConfig";

interface PromptManagerPageProps {
  activeType: PromptManagerTemplateType;
}

type SeparatorField = "content_separator" | "record_separator" | "output_start" | "output_end";

interface PromptDraft {
  id?: string;
  source: PromptManagerTemplate["source"];
  name: string;
  content_separator: string;
  record_separator: string;
  output_start: string;
  output_end: string;
  sop_prompt: string;
  content: string;
  variables: string[];
  enabled: boolean;
}

const DEFAULT_DRAFT: PromptDraft = {
  source: "user",
  name: "",
  content_separator: "===",
  record_separator: "_::~RECORD::~_",
  output_start: "_::~OUTPUT_START::~_",
  output_end: "_::~OUTPUT_END::~_",
  sop_prompt: "",
  content: "",
  variables: [],
  enabled: true,
};

const SEPARATOR_LABELS: Record<SeparatorField, string> = {
  content_separator: "内容分隔符",
  record_separator: "记录分隔符",
  output_start: "输出开始符",
  output_end: "输出结束符",
};

const templateToDraft = (template: PromptManagerTemplate): PromptDraft => ({
  id: template.id,
  source: template.source,
  name: template.name,
  content_separator: template.content_separator,
  record_separator: template.record_separator,
  output_start: template.output_start,
  output_end: template.output_end,
  sop_prompt: template.sop_prompt,
  content: template.content,
  variables: template.variables,
  enabled: template.enabled,
});

const buildFullPrompt = (draft: PromptDraft) =>
  [
    `## ${SEPARATOR_LABELS.content_separator}`,
    draft.content_separator,
    `## ${SEPARATOR_LABELS.record_separator}`,
    draft.record_separator,
    `## ${SEPARATOR_LABELS.output_start}`,
    draft.output_start,
    `## ${SEPARATOR_LABELS.output_end}`,
    draft.output_end,
    "## 大模型 SOP 提示词",
    draft.sop_prompt || "未填写",
    "## 模板内容",
    draft.content || "未填写",
  ].join("\n\n");

export default function PromptManagerPage({ activeType }: PromptManagerPageProps) {
  const typeMeta = getPromptManagerTemplateTypeItem(activeType);
  const [templates, setTemplates] = useState<PromptManagerTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<PromptDraft>({ ...DEFAULT_DRAFT, variables: typeMeta.variables });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedTemplate = useMemo(() => templates.find((template) => template.id === selectedId) ?? null, [selectedId, templates]);
  const canEdit = draft.source === "user";
  const fullPrompt = useMemo(() => buildFullPrompt(draft), [draft]);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await jimengApi.listPromptManagerTemplates({ type: activeType });
      setTemplates(data);
      const first = data[0];
      if (first) {
        setSelectedId(first.id);
        setDraft(templateToDraft(first));
      } else {
        setSelectedId("");
        setDraft({
          ...DEFAULT_DRAFT,
          name: `${typeMeta.label}`,
          variables: typeMeta.variables,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "模板加载失败");
    } finally {
      setLoading(false);
    }
  }, [activeType, typeMeta.label, typeMeta.variables]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const updateDraft = <K extends keyof PromptDraft>(key: K, value: PromptDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const selectTemplate = (template: PromptManagerTemplate) => {
    setSelectedId(template.id);
    setDraft(templateToDraft(template));
    setMessage("");
    setError("");
  };

  const createNewTemplate = () => {
    setSelectedId("");
    setDraft({
      ...DEFAULT_DRAFT,
      name: `${typeMeta.label}`,
      variables: typeMeta.variables,
      content: `请在这里编写${typeMeta.label}。`,
    });
    setMessage("已新建用户模板草稿，保存后会写入本地提示词库。");
    setError("");
  };

  const saveTemplate = async () => {
    if (!draft.name.trim()) {
      setError("模板名称不能为空");
      return;
    }
    if (!canEdit && draft.id) {
      setError("官方模板不可修改，VIP模板暂不开放修改，请先复制为用户模板。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload: PromptManagerTemplatePayload = {
        name: draft.name.trim(),
        content_separator: draft.content_separator,
        record_separator: draft.record_separator,
        output_start: draft.output_start,
        output_end: draft.output_end,
        sop_prompt: draft.sop_prompt,
        content: draft.content,
        variables: draft.variables,
        enabled: draft.enabled,
      };
      const saved = draft.id
        ? await jimengApi.updatePromptManagerTemplate(draft.id, payload)
        : await jimengApi.createPromptManagerTemplate({
            ...payload,
            category: typeMeta.category,
            type: activeType,
            name: draft.name.trim(),
          });
      setSelectedId(saved.id);
      setDraft(templateToDraft(saved));
      setTemplates((current) => {
        const exists = current.some((item) => item.id === saved.id);
        return exists ? current.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...current];
      });
      setMessage("模板已保存。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "模板保存失败");
    } finally {
      setSaving(false);
    }
  };

  const duplicateTemplate = async () => {
    if (!draft.id) {
      setMessage("当前已经是用户模板草稿。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const copied = await jimengApi.duplicatePromptManagerTemplate(draft.id);
      setTemplates((current) => [copied, ...current]);
      setSelectedId(copied.id);
      setDraft(templateToDraft(copied));
      setMessage("已复制为用户模板。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "复制模板失败");
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async () => {
    if (!draft.id || !canEdit) {
      setError("只能删除用户模板。");
      return;
    }
    if (!window.confirm(`确定删除用户模板“${draft.name}”吗？`)) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await jimengApi.deletePromptManagerTemplate(draft.id);
      setMessage("模板已删除。");
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除模板失败");
    } finally {
      setSaving(false);
    }
  };

  const copyFullPrompt = async () => {
    try {
      await navigator.clipboard.writeText(fullPrompt);
      setMessage("完整提示词已复制。");
    } catch {
      setError("复制失败，请手动选中文本复制。");
    }
  };

  const renderSeparatorField = (field: SeparatorField) => {
    const options = PROMPT_SEPARATOR_OPTIONS[field];
    const value = draft[field];
    const selectValue = options.includes(value) ? value : "自定义";
    return (
      <label className="space-y-2 text-sm font-semibold text-text-secondary">
        <span>{SEPARATOR_LABELS[field]}</span>
        <div className="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)]">
          <select
            value={selectValue}
            disabled={!canEdit}
            onChange={(event) => {
              if (event.target.value !== "自定义") {
                updateDraft(field, event.target.value);
              }
            }}
            className="h-10 rounded-lg border border-glass-border bg-surface-inset px-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <input
            value={value}
            disabled={!canEdit}
            onChange={(event) => updateDraft(field, event.target.value)}
            className="h-10 rounded-lg border border-glass-border bg-surface-inset px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary"
          />
        </div>
      </label>
    );
  };

  return (
    <section className="h-full overflow-auto p-3 sm:p-4">
      <div className="mb-4 rounded-2xl border border-glass-border bg-panel-bg/80 p-5 shadow-xl">
        <div className="text-xs font-bold uppercase tracking-[0.24em] text-primary">Prompt Manager</div>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">提示词管理</h1>
            <p className="mt-2 text-sm text-text-secondary">
              当前类型：{typeMeta.label}。这是独立提示词管理工具，只维护模板、变量和完整提示词组合。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadTemplates()}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <RefreshCw size={16} />
              刷新
            </button>
            <button
              type="button"
              onClick={createNewTemplate}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-primary/40 bg-primary/15 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
            >
              <Plus size={16} />
              新建用户模板
            </button>
          </div>
        </div>
      </div>

      <div className="grid min-h-[620px] gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-glass-border bg-panel-bg/80 p-4 shadow-xl">
          <div className="mb-4 space-y-3">
            {PROMPT_MANAGER_GROUPS.map((group) => (
              <div key={group.category}>
                <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">{group.title}</div>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <div
                      key={item.type}
                      className={clsx(
                        "rounded-lg border px-3 py-2 text-sm",
                        item.type === activeType
                          ? "border-primary/35 bg-primary/10 text-foreground"
                          : "border-glass-border bg-surface-inset text-text-secondary",
                      )}
                    >
                      <div className="font-semibold">{item.label}</div>
                      <div className="mt-1 text-xs leading-5 text-text-muted">{item.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mb-3 flex items-center justify-between">
            <div className="font-display text-lg font-bold text-foreground">模板列表</div>
            <span className="rounded-md border border-glass-border bg-surface-inset px-2 py-1 text-xs text-text-muted">{templates.length} 个</span>
          </div>
          <div className="space-y-2">
            {loading ? (
              <div className="rounded-xl border border-glass-border bg-surface-inset p-4 text-sm text-text-muted">正在加载模板...</div>
            ) : templates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-glass-border bg-surface-inset p-4 text-sm text-text-muted">
                暂无模板，可以新建一个用户模板。
              </div>
            ) : (
              templates.map((template) => {
                const sourceMeta = PROMPT_MANAGER_SOURCE_META[template.source];
                const active = template.id === selectedId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => selectTemplate(template)}
                    className={clsx(
                      "w-full rounded-xl border p-3 text-left transition-colors",
                      active ? "border-primary/50 bg-primary/10" : "border-glass-border bg-surface-inset hover:border-primary/35",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={clsx("rounded-md border px-2 py-0.5 text-xs font-bold", sourceMeta.badgeClassName)}>{sourceMeta.label}</span>
                      <span className="min-w-0 truncate text-sm font-semibold text-foreground">{template.name}</span>
                    </div>
                    <div className="mt-2 line-clamp-2 text-xs leading-5 text-text-muted">{template.content || "未填写模板内容"}</div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <div className="min-w-0 rounded-2xl border border-glass-border bg-panel-bg/80 p-4 shadow-xl">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{typeMeta.label}</div>
              <h2 className="mt-1 font-display text-xl font-bold text-foreground">{draft.name || "未命名模板"}</h2>
              <p className="mt-1 text-sm text-text-secondary">
                {selectedTemplate ? PROMPT_MANAGER_SOURCE_META[selectedTemplate.source].label : "用户模板"}。官方模板不可修改，可复制为用户模板后编辑。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={duplicateTemplate}
                disabled={saving || !draft.id}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-glass-border bg-surface-inset px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy size={16} />
                复制为用户模板
              </button>
              <button
                type="button"
                onClick={() => void saveTemplate()}
                disabled={saving || !canEdit}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-primary/40 bg-primary/15 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save size={16} />
                保存模板
              </button>
              <button
                type="button"
                onClick={() => void deleteTemplate()}
                disabled={saving || !draft.id || !canEdit}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={16} />
                删除
              </button>
            </div>
          </div>

          {message && <div className="mb-3 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{message}</div>}
          {error && <div className="mb-3 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</div>}

          <div className="grid gap-4">
            <label className="space-y-2 text-sm font-semibold text-text-secondary">
              <span>模板名称</span>
              <input
                value={draft.name}
                disabled={!canEdit}
                onChange={(event) => updateDraft("name", event.target.value)}
                className="h-11 w-full rounded-lg border border-glass-border bg-surface-inset px-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
              />
            </label>

            <div className="grid gap-4 lg:grid-cols-2">
              {renderSeparatorField("content_separator")}
              {renderSeparatorField("record_separator")}
              {renderSeparatorField("output_start")}
              {renderSeparatorField("output_end")}
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold text-text-secondary">变量状态</div>
              <div className="flex flex-wrap gap-2">
                {(draft.variables.length ? draft.variables : typeMeta.variables).map((variable) => (
                  <span key={variable} className="rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2 py-1 font-mono text-xs font-semibold text-emerald-300">
                    {variable}
                  </span>
                ))}
              </div>
            </div>

            <label className="space-y-2 text-sm font-semibold text-text-secondary">
              <span>大模型 SOP 提示词</span>
              <textarea
                value={draft.sop_prompt}
                disabled={!canEdit}
                onChange={(event) => updateDraft("sop_prompt", event.target.value)}
                className="min-h-[110px] w-full resize-y rounded-lg border border-glass-border bg-surface-inset p-3 text-sm leading-6 text-foreground outline-none transition-colors focus:border-primary"
                placeholder="填写模板的执行步骤、输出约束和注意事项。"
              />
            </label>

            <label className="space-y-2 text-sm font-semibold text-text-secondary">
              <span>模板内容</span>
              <textarea
                value={draft.content}
                disabled={!canEdit}
                onChange={(event) => updateDraft("content", event.target.value)}
                className="min-h-[260px] w-full resize-y rounded-lg border border-glass-border bg-surface-inset p-3 font-mono text-sm leading-6 text-foreground outline-none transition-colors focus:border-primary"
              />
            </label>

            <div className="rounded-xl border border-glass-border bg-surface-inset p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-display text-lg font-bold text-foreground">
                  <FileText size={18} className="text-primary" />
                  完整提示词
                </div>
                <button
                  type="button"
                  onClick={() => void copyFullPrompt()}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
                >
                  <Copy size={15} />
                  一键复制
                </button>
              </div>
              <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-lg border border-glass-border bg-panel-bg/70 p-4 font-mono text-sm leading-6 text-foreground">
                {fullPrompt}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
