"use client";

import clsx from "clsx";
import { ArrowRight, Edit3, FolderOpen, Loader2, Palette, Plus, Save, Trash2, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useModalDismiss } from "@/components/jimeng/useModalDismiss";
import {
  JIMENG_VIDEO_RATIOS,
  jimengApi,
  type JimengProject,
  type JimengProjectStatus,
  type JimengShot,
  type JimengStylePreset,
} from "@/lib/jimengApi";
import { useJimengStore } from "@/store/jimengStore";

const STATUS_LABELS: Record<JimengProjectStatus, string> = {
  draft: "草稿",
  working: "制作中",
  has_failed: "有失败",
  completed: "已完成",
};

const STATUS_CLASS: Record<JimengProjectStatus, string> = {
  draft: "border-glass-border bg-surface-inset text-text-secondary",
  working: "border-primary/30 bg-primary/10 text-primary",
  has_failed: "border-red-400/30 bg-red-500/10 text-red-200",
  completed: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
};

const STYLE_ACCENTS = ["#6478ff", "#22c55e", "#f59e0b", "#a855f7", "#06b6d4", "#ef4444", "#84cc16", "#ec4899"];

type StylePresetDraft = Pick<JimengStylePreset, "name" | "prompt" | "scope" | "accent"> & { id?: string };

const randomStyleAccent = () => STYLE_ACCENTS[Math.floor(Math.random() * STYLE_ACCENTS.length)];

const styleOptionsFor = (stylePresets: JimengStylePreset[], currentStyle?: string): string[] =>
  [...new Set([...(currentStyle ? [currentStyle] : []), ...stylePresets.map((preset) => preset.name)].map((style) => style.trim()).filter(Boolean))];

const styleDraftFromPreset = (style: JimengStylePreset): StylePresetDraft => ({
  id: style.id,
  name: style.name,
  prompt: style.prompt,
  scope: "video",
  accent: style.accent || "#6478ff",
});

const formatUpdatedAt = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "未知";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

function ProjectCard({
  project,
  entering,
  stylePresets,
  onEnter,
  onUpdated,
}: {
  project: JimengProject;
  entering: boolean;
  stylePresets: JimengStylePreset[];
  onEnter: (projectId: string) => void;
  onUpdated: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [editStyle, setEditStyle] = useState(project.style);
  const [editDefaultRatio, setEditDefaultRatio] = useState(project.default_ratio || "9:16");
  const [editDescription, setEditDescription] = useState(project.description);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    setEditName(project.name);
    setEditStyle(project.style);
    setEditDefaultRatio(project.default_ratio || "9:16");
    setEditDescription(project.description);
    setEditError(null);
  }, [project.default_ratio, project.description, project.name, project.style]);

  const cancelEditing = () => {
    setEditName(project.name);
    setEditStyle(project.style);
    setEditDefaultRatio(project.default_ratio || "9:16");
    setEditDescription(project.description);
    setEditError(null);
    setEditing(false);
  };

  const saveProject = async () => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setEditError("剧本名称不能为空");
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      await jimengApi.updateProject(project.id, {
        name: trimmedName,
        style: editStyle.trim(),
        default_ratio: editDefaultRatio,
        description: editDescription.trim(),
      });
      await onUpdated();
      setEditing(false);
    } catch (caught) {
      setEditError(caught instanceof Error ? caught.message : "保存剧本信息失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="glass-panel flex min-h-[210px] flex-col rounded-lg p-4 transition-colors hover:border-primary/35">
      <div className="flex items-start justify-between gap-3">
        {editing ? (
          <div className="min-w-0 flex-1 space-y-2">
            <input value={editName} onChange={(event) => setEditName(event.target.value)} className="glass-input w-full text-sm font-semibold text-foreground" placeholder="剧本名称" />
            <select value={editStyle} onChange={(event) => setEditStyle(event.target.value)} className="glass-input w-full text-sm text-foreground">
              <option value="">未设置风格</option>
              {styleOptionsFor(stylePresets, project.style).map((styleName) => (
                <option key={styleName} value={styleName}>
                  {styleName}
                </option>
              ))}
            </select>
            <select value={editDefaultRatio} onChange={(event) => setEditDefaultRatio(event.target.value)} className="glass-input w-full text-sm text-foreground">
              {JIMENG_VIDEO_RATIOS.map((ratio) => (
                <option key={ratio} value={ratio}>
                  默认画幅 {ratio}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className={clsx("min-w-0", editing && "hidden")}>
          <h3 className="truncate font-display text-lg font-semibold text-foreground">{project.name}</h3>
          <p className="mt-1 truncate text-sm text-text-secondary">
            {project.style || "未设置风格"} · 默认画幅 {project.default_ratio || "9:16"}
          </p>
        </div>
        <span className={clsx("shrink-0 rounded border px-2 py-1 text-xs", STATUS_CLASS[project.status])}>{STATUS_LABELS[project.status]}</span>
      </div>

      {editing ? <textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} className="glass-input mt-3 min-h-[76px] w-full resize-y text-sm leading-5 text-foreground" placeholder="描述" /> : null}
      <p className={clsx("mt-3 line-clamp-2 min-h-[40px] text-sm leading-5 text-text-muted", editing && "hidden")}>{project.description || "暂无描述"}</p>
      {editError ? <p className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">{editError}</p> : null}

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-glass-border bg-surface-inset px-3 py-2">
          <p className="text-text-muted">分镜</p>
          <p className="mt-1 font-mono text-sm text-foreground">{project.shot_count}</p>
        </div>
        <div className="rounded-md border border-glass-border bg-surface-inset px-3 py-2">
          <p className="text-text-muted">风格</p>
          <p className="mt-1 truncate text-sm text-text-secondary">{project.style || "未设置"}</p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        <span className="text-xs text-text-muted">更新 {formatUpdatedAt(project.updated_at)}</span>
        {editing ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <button type="button" onClick={cancelEditing} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md border border-glass-border bg-surface-inset px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground disabled:cursor-wait disabled:opacity-60">
              <X size={14} />
              取消
            </button>
            <button type="button" onClick={saveProject} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md border border-primary/35 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15 disabled:cursor-wait disabled:opacity-60">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              保存
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-md border border-glass-border bg-surface-inset px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground">
            <Edit3 size={14} />
            编辑
          </button>
        )}
        <button
          type="button"
          onClick={() => onEnter(project.id)}
          disabled={entering}
          className={clsx("inline-flex items-center gap-2 rounded-md border border-primary/35 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15 disabled:cursor-wait disabled:opacity-60", editing && "hidden")}
        >
          {entering ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
          进入工作台
        </button>
      </div>
    </article>
  );
}

function StyleLibraryModal({
  open,
  styles,
  onClose,
  onSave,
}: {
  open: boolean;
  styles: JimengStylePreset[];
  onClose: () => void;
  onSave: (styles: StylePresetDraft[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState<StylePresetDraft[]>(styles.map(styleDraftFromPreset));
  const [activeIndex, setActiveIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleanStyles = useMemo(() => styles.map(styleDraftFromPreset), [styles]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(cleanStyles);
  const { requestClose, backdropProps } = useModalDismiss({ open, dirty, onClose });
  const active = draft[activeIndex] ?? draft[0];

  useEffect(() => {
    if (open) {
      const nextDraft = styles.map(styleDraftFromPreset);
      setDraft(nextDraft);
      setActiveIndex(0);
      setError(null);
    }
  }, [open, styles]);

  if (!open) {
    return null;
  }

  const updateActive = (updates: Partial<StylePresetDraft>) => {
    setDraft((items) => items.map((item, index) => (index === activeIndex ? { ...item, ...updates } : item)));
  };

  const addStyle = () => {
    const next: StylePresetDraft = {
      name: `新风格 ${draft.length + 1}`,
      prompt: "",
      scope: "video",
      accent: randomStyleAccent(),
    };
    setDraft((items) => [...items, next]);
    setActiveIndex(draft.length);
  };

  const removeActive = () => {
    setDraft((items) => {
      const next = items.filter((_, index) => index !== activeIndex);
      setActiveIndex(Math.max(0, Math.min(activeIndex, next.length - 1)));
      return next;
    });
  };

  const save = async () => {
    const normalized = draft.map((item) => ({ ...item, name: item.name.trim(), prompt: item.prompt.trim(), scope: "video" as const, accent: item.accent || "#6478ff" })).filter((item) => item.name);
    const names = normalized.map((item) => item.name);
    if (new Set(names).size !== names.length) {
      setError("风格名字不能重复");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(normalized);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存风格库失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4 py-6 backdrop-blur-sm" {...backdropProps}>
      <div className="w-full max-w-3xl rounded-xl border border-glass-border bg-elevated p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-primary">
              <Palette size={14} />
              风格管理
            </div>
            <h3 className="mt-2 font-display text-xl font-semibold text-foreground">剧本分镜风格库</h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              风格名字用于剧本选择；风格提示词会在视频模板渲染 <code className="font-mono text-primary">{"{{style}}"}</code> 时发给即梦。
            </p>
          </div>
          <button type="button" onClick={requestClose} className="grid h-9 w-9 place-items-center rounded-lg border border-glass-border text-text-secondary hover:bg-hover-bg hover:text-foreground">
            <X size={17} />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {draft.map((styleItem, index) => {
            const activeChip = index === activeIndex;
            return (
              <button
                key={`${styleItem.id ?? "new"}-${index}`}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={clsx("inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors", activeChip ? "bg-primary/12 text-foreground" : "bg-surface-inset text-text-secondary hover:bg-hover-bg hover:text-foreground")}
                style={{ borderColor: activeChip ? styleItem.accent : undefined }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: styleItem.accent }} />
                <span>{styleItem.name || "未命名风格"}</span>
              </button>
            );
          })}
          <button type="button" onClick={addStyle} className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/15">
            <Plus size={15} />
            新增风格
          </button>
        </div>

        {active ? (
          <div className="mt-4 rounded-xl border border-glass-border bg-surface-inset p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_auto]">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-text-secondary">风格名称</span>
                <input value={active.name} onChange={(event) => updateActive({ name: event.target.value })} className="glass-input w-full text-sm text-foreground" placeholder="例如：国风3Q" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-text-secondary">演示色</span>
                <input value={active.accent} onChange={(event) => updateActive({ accent: event.target.value })} className="glass-input h-10 w-full text-sm text-foreground" type="color" />
              </label>
              <button type="button" onClick={removeActive} className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-500/25 px-3 text-sm font-medium text-red-300 hover:bg-red-500/10">
                <Trash2 size={15} />
                删除
              </button>
            </div>
            <label className="mt-3 block space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">发送给即梦的视频风格提示词</span>
              <textarea value={active.prompt} onChange={(event) => updateActive({ prompt: event.target.value })} className="glass-input min-h-[150px] w-full resize-y text-sm leading-6 text-foreground" placeholder="例如：写实短剧电影感，真实布光，浅景深，人物表演自然。" />
            </label>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-glass-border bg-surface-inset p-6 text-center text-sm text-text-muted">还没有风格，点击“新增风格”创建。</div>
        )}

        {error ? <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={requestClose} disabled={saving} className="rounded-lg border border-glass-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-hover-bg hover:text-foreground disabled:cursor-wait disabled:opacity-60">
            关闭
          </button>
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            保存风格库
          </button>
        </div>
      </div>
    </div>
  );
}

export default function JimengProjectListPage() {
  const projects = useJimengStore((state) => state.projects);
  const loading = useJimengStore((state) => state.loading);
  const error = useJimengStore((state) => state.error);
  const loadProjects = useJimengStore((state) => state.loadProjects);
  const selectProject = useJimengStore((state) => state.selectProject);

  const [name, setName] = useState("");
  const [style, setStyle] = useState("");
  const [defaultRatio, setDefaultRatio] = useState("9:16");
  const [description, setDescription] = useState("");
  const [stylePresets, setStylePresets] = useState<JimengStylePreset[]>([]);
  const [styleManagerOpen, setStyleManagerOpen] = useState(false);
  const [inheritProjectId, setInheritProjectId] = useState("");
  const [inheritShotId, setInheritShotId] = useState("");
  const [inheritShots, setInheritShots] = useState<JimengShot[]>([]);
  const [loadingInheritShots, setLoadingInheritShots] = useState(false);
  const [inheritError, setInheritError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const loadStylePresets = async () => {
    const presets = await jimengApi.listStylePresets("video");
    setStylePresets(presets);
  };

  useEffect(() => {
    void loadStylePresets();
  }, []);

  const sortedProjects = useMemo(() => [...projects].sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()), [projects]);
  const createStyleOptions = useMemo(() => styleOptionsFor(stylePresets, style), [style, stylePresets]);

  useEffect(() => {
    if (!inheritProjectId) {
      setInheritShots([]);
      setInheritShotId("");
      setInheritError(null);
      return;
    }

    let active = true;
    setLoadingInheritShots(true);
    setInheritError(null);
    void jimengApi
      .listShots(inheritProjectId)
      .then((nextShots) => {
        if (!active) {
          return;
        }
        setInheritShots(nextShots);
        setInheritShotId((current) => (nextShots.some((shot) => shot.id === current) ? current : nextShots[0]?.id ?? ""));
      })
      .catch((caught) => {
        if (!active) {
          return;
        }
        setInheritShots([]);
        setInheritShotId("");
        setInheritError(caught instanceof Error ? caught.message : "读取来源分镜失败");
      })
      .finally(() => {
        if (active) {
          setLoadingInheritShots(false);
        }
      });

    return () => {
      active = false;
    };
  }, [inheritProjectId]);

  const saveStyleLibrary = async (styles: StylePresetDraft[]) => {
    const originalIds = new Set(stylePresets.map((item) => item.id));
    const incomingIds = new Set(styles.map((item) => item.id).filter(Boolean) as string[]);
    for (const preset of stylePresets) {
      if (!incomingIds.has(preset.id)) {
        await jimengApi.deleteStylePreset(preset.id);
      }
    }
    for (const item of styles) {
      const payload = { name: item.name, prompt: item.prompt, scope: "video" as const, accent: item.accent };
      if (item.id && originalIds.has(item.id)) {
        await jimengApi.updateStylePreset(item.id, payload);
      } else {
        await jimengApi.createStylePreset(payload);
      }
    }
    await loadStylePresets();
    await loadProjects();
    const styleNames = styles.map((item) => item.name);
    if (style && !styleNames.includes(style)) {
      setStyle(styleNames[0] ?? "");
    }
  };

  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError("请输入剧本名称");
      return;
    }

    setCreating(true);
    setFormError(null);
    try {
      await jimengApi.createProject({
        name: trimmedName,
        style: style.trim(),
        default_ratio: defaultRatio,
        description: description.trim(),
        ...(inheritProjectId
          ? {
              inherit_source_project_id: inheritProjectId,
              ...(inheritShotId ? { inherit_source_shot_id: inheritShotId } : {}),
            }
          : {}),
      });
      setName("");
      setStyle("");
      setDefaultRatio("9:16");
      setDescription("");
      setInheritProjectId("");
      setInheritShotId("");
      setInheritShots([]);
      await loadProjects();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "创建项目失败");
    } finally {
      setCreating(false);
    }
  };

  const enterProject = async (projectId: string) => {
    setEnteringId(projectId);
    try {
      await selectProject(projectId);
    } finally {
      setEnteringId(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="space-y-5 pb-4">
        <section className="glass-panel sticky top-0 z-20 rounded-xl bg-app-bg/95 p-5 backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <FolderOpen size={14} />
                剧本列表
              </div>
              <h2 className="mt-2 font-display text-2xl font-semibold text-foreground">即梦批量项目</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">选择一个剧本进入分镜工作台，或先创建一个空项目再导入分镜。</p>
            </div>
            <span className="w-fit rounded border border-glass-border bg-surface-inset px-3 py-2 font-mono text-xs text-text-muted">{loading ? "加载中" : `${projects.length} projects`}</span>
          </div>

          <form onSubmit={createProject} className="mt-5 grid gap-3 lg:grid-cols-[1fr_190px_150px_1.4fr_auto_auto]">
            <input value={name} onChange={(event) => setName(event.target.value)} className="glass-input text-sm text-foreground" placeholder="项目名称" />
            <select value={style} onChange={(event) => setStyle(event.target.value)} className="glass-input text-sm text-foreground">
              <option value="">选择风格</option>
              {createStyleOptions.map((styleName) => (
                <option key={styleName} value={styleName}>
                  {styleName}
                </option>
              ))}
            </select>
            <select value={defaultRatio} onChange={(event) => setDefaultRatio(event.target.value)} className="glass-input text-sm text-foreground">
              {JIMENG_VIDEO_RATIOS.map((ratio) => (
                <option key={ratio} value={ratio}>
                  {ratio}
                </option>
              ))}
            </select>
            <input value={description} onChange={(event) => setDescription(event.target.value)} className="glass-input text-sm text-foreground" placeholder="描述" />
            <button type="submit" disabled={creating} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60">
              {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              新建项目
            </button>
            <button type="button" onClick={() => setStyleManagerOpen(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-glass-border bg-surface-inset px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground">
              <Palette size={15} />
              风格库
            </button>
          </form>
          <div className="mt-3 grid gap-3 rounded-lg border border-glass-border bg-surface-inset p-3 lg:grid-cols-[220px_240px_minmax(0,1fr)]">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">继承全文资产</span>
              <select value={inheritProjectId} onChange={(event) => setInheritProjectId(event.target.value)} className="glass-input w-full text-sm text-foreground" disabled={creating}>
                <option value="">不继承</option>
                {sortedProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">来源分镜（可选）</span>
              <select
                value={inheritShotId}
                onChange={(event) => setInheritShotId(event.target.value)}
                className="glass-input w-full text-sm text-foreground"
                disabled={creating || !inheritProjectId || loadingInheritShots || inheritShots.length === 0}
              >
                <option value="">{loadingInheritShots ? "读取中..." : "不指定来源分镜"}</option>
                {inheritShots.map((shot) => (
                  <option key={shot.id} value={shot.id}>
                    分镜{shot.shot_index}
                  </option>
                ))}
              </select>
            </label>
            <p className="self-end rounded-md border border-glass-border bg-black/20 px-3 py-2 text-xs leading-5 text-text-muted">
              新建剧本时复制来源剧本的全部角色、场景、道具、图片和音色资产；不复制旧分镜、绑定关系和候选视频。来源分镜只用于定位来源剧本。
            </p>
          </div>
          {inheritError ? <p className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{inheritError}</p> : null}
          {formError ? <p className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{formError}</p> : null}
          {error ? <p className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
        </section>

        {sortedProjects.length > 0 ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedProjects.map((project) => (
              <ProjectCard key={project.id} project={project} stylePresets={stylePresets} entering={enteringId === project.id} onEnter={enterProject} onUpdated={loadProjects} />
            ))}
          </section>
        ) : (
          <section className="glass-panel flex min-h-[280px] flex-col items-center justify-center rounded-xl p-8 text-center">
            <FolderOpen size={38} className="text-text-muted" />
            <h3 className="mt-4 font-display text-lg font-semibold text-foreground">暂无剧本项目</h3>
            <p className="mt-2 text-sm text-text-secondary">创建项目后即可导入分镜并进入工作台。</p>
          </section>
        )}
        <StyleLibraryModal open={styleManagerOpen} styles={stylePresets} onClose={() => setStyleManagerOpen(false)} onSave={saveStyleLibrary} />
      </div>
    </div>
  );
}
