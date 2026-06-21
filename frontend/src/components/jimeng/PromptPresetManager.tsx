"use client";

import clsx from "clsx";
import { FilePlus2, Info, ScrollText, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import PromptPresetEditor from "@/components/jimeng/PromptPresetEditor";
import { jimengApi, type JimengPromptPreset } from "@/lib/jimengApi";
import { useJimengStore } from "@/store/jimengStore";

const DEFAULT_TEMPLATE = [
  "全局前置提示词：",
  "风格：{{style}}。",
  "镜头语言：{{camera}}。",
  "时代背景：{{era}}。",
  "角色：{{roles}}。",
  "场景：{{scene}}。",
  "道具：{{props}}。",
  "",
  "{{shot_prompt}}",
].join("\n");

interface PromptPresetManagerProps {
  embedded?: boolean;
}

export default function PromptPresetManager({ embedded = false }: PromptPresetManagerProps) {
  const currentProject = useJimengStore((state) => state.currentProject);
  const storePromptPresets = useJimengStore((state) => state.promptPresets);
  const loadProjectData = useJimengStore((state) => state.loadProjectData);
  const [promptPresets, setPromptPresets] = useState<JimengPromptPreset[]>(storePromptPresets);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(storePromptPresets[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const presets = await jimengApi.listPromptPresets();
    setPromptPresets(presets);
    setSelectedPresetId((current) => current ?? presets[0]?.id ?? null);
  }, []);

  useEffect(() => {
    if (storePromptPresets.length > 0) {
      setPromptPresets(storePromptPresets);
      setSelectedPresetId((current) => current ?? storePromptPresets[0].id);
    }
  }, [storePromptPresets]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedPreset = useMemo(
    () => promptPresets.find((preset) => preset.id === selectedPresetId) ?? null,
    [promptPresets, selectedPresetId],
  );

  const systemPresets = promptPresets.filter((preset) => preset.scope === "system");
  const userPresets = promptPresets.filter((preset) => preset.scope === "user");

  const savePreset = async (data: { name: string; content: string; variables: string[]; scope?: "system" | "user"; is_default?: boolean; enabled?: boolean }) => {
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const preset = selectedPreset && !creating
        ? await jimengApi.updatePromptPreset(selectedPreset.id, data)
        : await jimengApi.createPromptPreset({ ...data, scope: data.scope ?? "user" });
      setSelectedPresetId(preset.id);
      setCreating(false);
      await refresh();
      setNotice("视频生成模板已保存");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存视频生成模板失败");
    } finally {
      setSaving(false);
    }
  };

  const saveAndUse = async (data: { name: string; content: string; variables: string[]; scope?: "system" | "user"; is_default?: boolean; enabled?: boolean }) => {
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const preset = selectedPreset && !creating
        ? await jimengApi.updatePromptPreset(selectedPreset.id, data)
        : await jimengApi.createPromptPreset({ ...data, scope: data.scope ?? "user" });
      setSelectedPresetId(preset.id);
      setCreating(false);
      if (currentProject) {
        await jimengApi.setProjectPromptPreset(currentProject.id, preset.id);
        await loadProjectData(currentProject.id);
      }
      setNotice("视频生成模板已保存并应用到当前项目");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存并应用失败");
    } finally {
      setSaving(false);
    }
  };

  const startCreate = () => {
    setCreating(true);
    setSelectedPresetId(null);
    setNotice(null);
    setError(null);
  };

  const editorPreset: JimengPromptPreset | null = creating
    ? {
        id: "new",
        name: "",
        scope: "user",
        content: DEFAULT_TEMPLATE,
        variables: ["style", "camera", "era", "roles", "scene", "props", "shot_prompt"],
        is_default: false,
        enabled: true,
        created_at: "",
        updated_at: "",
      }
    : selectedPreset;

  const renderPresetButton = (preset: JimengPromptPreset) => (
    <button
      key={preset.id}
      type="button"
      onClick={() => {
        setCreating(false);
        setSelectedPresetId(preset.id);
      }}
      className={clsx(
        "w-full rounded-md border px-3 py-2 text-left transition-colors",
        selectedPresetId === preset.id && !creating
          ? "border-primary/40 bg-primary/10"
          : "border-glass-border bg-surface-inset hover:bg-hover-bg",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-foreground">{preset.name}</span>
        {preset.is_default ? <Star size={13} className="shrink-0 text-primary" /> : null}
      </div>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">{preset.content}</p>
    </button>
  );

  return (
    <section className={clsx(embedded ? "p-0" : "glass-panel rounded-xl p-5")}>
      <div className="flex flex-col gap-4 lg:flex-row">
        <aside className="lg:w-80 lg:shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <ScrollText size={14} />
                全局视频生成模板
              </div>
              <h3 className="mt-2 font-display text-lg font-semibold text-foreground">视频指令模板</h3>
            </div>
            <button
              type="button"
              onClick={startCreate}
              className="grid h-9 w-9 place-items-center rounded-md border border-glass-border text-text-secondary hover:bg-hover-bg hover:text-foreground"
              title="新建视频生成模板"
            >
              <FilePlus2 size={16} />
            </button>
          </div>

          <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-5 text-text-secondary">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-primary">
              <Info size={13} />
              使用位置
            </div>
            <p>
              全局视频生成模板只用于“分镜工作台”提交选中分镜到即梦视频队列：系统先把当前项目绑定的模板渲染成前置指令，再拼接每条分镜提示词发送给即梦 CLI。
            </p>
            <p className="mt-1">资产图片生图使用资产管理页的“图片指令模板”，两者互不冲突。</p>
            <p className="mt-1">保存后点“保存并用于当前项目”才会绑定到当前剧本；绑定结果会显示在分镜工作台顶部的“视频模板”。</p>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium text-text-muted">视频指令模板</p>
              <div className="space-y-2">
                {systemPresets.length > 0 ? systemPresets.map(renderPresetButton) : <p className="text-xs text-text-muted">暂无系统模板</p>}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-text-muted">我的指令</p>
              <div className="space-y-2">
                {userPresets.length > 0 ? userPresets.map(renderPresetButton) : <p className="text-xs text-text-muted">暂无自定义模板</p>}
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {editorPreset ? (
            <PromptPresetEditor preset={editorPreset} onSave={savePreset} onSaveAndUse={currentProject ? saveAndUse : undefined} saving={saving} />
          ) : (
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-glass-border bg-surface-inset p-8 text-center">
              <ScrollText size={36} className="text-text-muted" />
              <h3 className="mt-4 font-display text-lg font-semibold text-foreground">选择或新建视频生成模板</h3>
              <p className="mt-2 text-sm text-text-secondary">提交给即梦视频队列时，这段内容会作为分镜提示词前置指令参与渲染。</p>
            </div>
          )}
          {(notice || error) && (
            <p
              className={clsx(
                "mt-3 rounded-md border px-3 py-2 text-sm",
                error ? "border-red-500/20 bg-red-500/10 text-red-200" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
              )}
            >
              {error ?? notice}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
