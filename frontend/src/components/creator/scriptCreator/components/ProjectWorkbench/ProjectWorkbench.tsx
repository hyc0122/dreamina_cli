import { ChangeEvent, useRef, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { ProjectRunStatus, ProjectStage, ScriptProject } from '../../types';
import { episodesFromFinalRecords, leadingUsableEpisodes } from '../../utils/episodeRecovery';
import {
  getCreationPresetAction,
  getCreationPresetLabel,
} from '../../utils/workspacePreset';

type ProjectCategory = 'novel' | 'screenplay' | 'storyboard' | 'score';
export type WorkbenchRoute = '' | '#novel' | '#screenplay' | '#storyboard' | '#score' | '#settings';

const categoryCopy: Record<ProjectCategory, { title: string; hint: string }> = {
  novel: { title: '小说创作', hint: '小说正文专区' },
  screenplay: { title: '剧本创作', hint: '短剧剧本专区' },
  storyboard: { title: '15秒分镜创作', hint: '15秒分镜稿专区' },
  score: { title: '作品评测', hint: '外部作品打分结果' },
};

const stageLabel: Record<ProjectStage, string> = {
  configuring: '配置中',
  scheme_selection: '待选方案',
  scheme_review: '方案确认',
  initial_batch_review: '试播完成',
  batch_review: '批量生成',
  completed: '可导出',
};

const runStatusLabel: Record<ProjectRunStatus, { text: string; className: string }> = {
  idle: { text: '未运行', className: 'border-[#26354d] bg-[#081321] text-slate-400' },
  queued: { text: '排队中', className: 'border-amber-400/40 bg-amber-400/10 text-amber-300' },
  running: { text: '运行中', className: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' },
  stopped: { text: '已停止', className: 'border-slate-400/40 bg-slate-400/10 text-slate-300' },
  failed: { text: '运行失败', className: 'border-red-400/50 bg-red-500/10 text-red-300' },
  pilot_ready: { text: '试播包完成', className: 'border-blue-400/50 bg-blue-500/10 text-blue-300' },
  completed: { text: '已完成', className: 'border-emerald-400/50 bg-emerald-500/10 text-emerald-300' },
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知时间';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getProjectCategory(project: ScriptProject): ProjectCategory {
  if (project.config.workflowMode === 'score') return 'score';
  if (project.config.outputType === 'novel') return 'novel';
  if (project.config.outputType === 'screenplay' && (project.config.episodeDurationSeconds || 70) <= 18) return 'storyboard';
  return 'screenplay';
}

export function hasVisibleProjectContent(project: ScriptProject) {
  return Boolean(
    project.selectedScheme
    || (project.schemes || []).length > 0
    || (project.finalEpisodes || []).length > 0
    || (project.episodes || []).length > 0
    || project.generatedScript
    || (project.provenanceRecords || []).some((record) => record.action !== 'project_created')
  );
}

function ProjectCard({ project }: { project: ScriptProject }) {
  const { openProject, deleteProject, exportProject, enqueueProjectRun, stopProjectRun } = useApp();
  const generatedCount = project.finalEpisodes?.length > 0
    ? leadingUsableEpisodes(episodesFromFinalRecords(project.finalEpisodes)).length
    : leadingUsableEpisodes(project.episodes || []).length;
  const totalCount = project.config?.episodeCount || 60;
  const modeLabel = project.config.workflowMode === 'score'
    ? '作品评测'
    : getCreationPresetLabel(project.config);
  const runState = project.runState || { status: 'idle' as const, progress: 0, message: '等待加入运行队列', updatedAt: project.updatedAt };
  const runCopy = runStatusLabel[runState.status];
  const canRun = Boolean(project.selectedScheme) && !['queued', 'running'].includes(runState.status);
  const canStop = ['queued', 'running'].includes(runState.status);

  return (
    <article className="rounded-2xl border border-[#1d2a3e] bg-[#0b1725]/90 p-5 transition hover:border-blue-400/70">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="rounded-full border border-blue-400/30 bg-blue-500/10 px-2 py-1 text-[11px] font-black text-blue-300">
              {modeLabel}
            </span>
            <span className="rounded-full border border-[#26354d] px-2 py-1 text-[11px] font-bold text-slate-400">
              {project.config.workflowMode === 'score' ? '评测工具' : '一集一集输出'}
            </span>
            <span className={`rounded-full border px-2 py-1 text-[11px] font-black ${runCopy.className}`}>
              {runCopy.text}
            </span>
          </div>
          <h3 className="truncate text-xl font-black text-white">{project.name}</h3>
          <p className="mt-1 text-xs text-slate-500">上次编辑：{formatTime(project.updatedAt)}</p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-300">
          {stageLabel[project.stage]}
        </span>
      </div>

      <div className="rounded-xl border border-[#1d2a3e] bg-[#081321] p-4">
        <p className="text-sm font-black text-slate-100">下一步：{project.nextAction}</p>
        <p className="mt-2 text-xs text-slate-500">
          已输出 {generatedCount}/{totalCount} 集
          {typeof project.score === 'number' ? ` · 当前评分 ${project.score}` : ''}
        </p>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between gap-3 text-[11px] font-bold text-slate-500">
            <span className="truncate">{runState.message}</span>
            <span>{Math.round(runState.progress || 0)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-400 to-emerald-400"
              style={{ width: `${Math.max(0, Math.min(100, runState.progress || 0))}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        <button
          onClick={() => openProject(project.id)}
          className="h-11 rounded-xl bg-gradient-to-r from-blue-500 to-fuchsia-500 text-sm font-black text-white"
        >
          打开
        </button>
        <button
          onClick={() => (canStop ? stopProjectRun(project.id) : enqueueProjectRun(project.id))}
          disabled={!canRun && !canStop}
          className={`h-11 rounded-xl border text-sm font-black ${
            canStop
              ? 'border-amber-400/70 text-amber-300 hover:bg-amber-500/10'
              : canRun
                ? 'border-emerald-400/70 text-emerald-300 hover:bg-emerald-500/10'
                : 'cursor-not-allowed border-slate-700 text-slate-600'
          }`}
        >
          {canStop ? '停止' : '运行'}
        </button>
        <button
          onClick={() => exportProject(project.id)}
          className="h-11 rounded-xl border border-blue-400/60 text-sm font-black text-blue-300 hover:bg-blue-500/10"
        >
          备份
        </button>
        <button
          onClick={() => deleteProject(project.id)}
          className="h-11 rounded-xl border border-red-400/60 text-sm font-black text-red-300 hover:bg-red-500/10"
        >
          删除
        </button>
      </div>
    </article>
  );
}

export default function ProjectWorkbench({ routeHash }: { routeHash: WorkbenchRoute }) {
  const { config, projects, createProject, importProject } = useApp();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [projectName, setProjectName] = useState('');
  const activeCategory: ProjectCategory | null =
    routeHash === '#novel' ? 'novel'
      : routeHash === '#screenplay' ? 'screenplay'
      : routeHash === '#storyboard' ? 'storyboard'
      : routeHash === '#score' ? 'score'
      : null;
  const isHome = activeCategory === null;
  const currentCategory: ProjectCategory = activeCategory
    || (config.workflowMode === 'score'
      ? 'score'
      : config.outputType === 'novel'
        ? 'novel'
        : (config.outputType === 'screenplay' && (config.episodeDurationSeconds || 70) <= 18)
          ? 'storyboard'
          : 'screenplay');
  const groupedProjects = projects.reduce<Record<ProjectCategory, ScriptProject[]>>((groups, project) => {
    groups[getProjectCategory(project)].push(project);
    return groups;
  }, {
    novel: [],
    screenplay: [],
    storyboard: [],
    score: [],
  });
  const visibleProjects = (isHome ? projects : groupedProjects[currentCategory]).filter(hasVisibleProjectContent);
  const hiddenDraftCount = (isHome ? projects : groupedProjects[currentCategory]).length - visibleProjects.length;
  const createActionLabel = currentCategory === 'score' ? '新建评测项目' : getCreationPresetAction(config);
  const featureCards = currentCategory === 'score'
    ? ['粘贴外部小说或剧本', '模型独立评分', '查看问题和修改建议']
    : ['先出 3 套方案和 1 套推荐版', '一集一集输出并评分', '先判断值不值得压资源'];

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importProject(file);
    event.target.value = '';
  };

  const handleCreateProject = () => {
    createProject(projectName, currentCategory === 'score'
      ? {
          ...config,
          workflowMode: 'score',
          inputType: config.inputType === 'idea' ? 'novel' : config.inputType,
        }
      : config);
    setProjectName('');
  };

  return (
    <main className="mx-auto min-h-full max-w-[1500px] px-6 py-8">
      {isHome ? (
        <section className="mb-7 rounded-3xl border border-[#1d2a3e] bg-[#0b1725]/90 p-7">
          <p className="text-sm font-black text-blue-300">项目首页</p>
          <h1 className="mt-3 text-4xl font-black leading-tight text-white">本地项目</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
            查看本地项目和运行状态。小说、剧本、15秒分镜稿会按专区分类展示。
          </p>
        </section>
      ) : (
        <section className="mb-7 rounded-3xl border border-[#1d2a3e] bg-[#0b1725]/90 p-7">
          <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-end">
            <div>
              <p className="text-sm font-black text-blue-300">当前专区</p>
              <h1 className="mt-3 max-w-4xl text-4xl font-black leading-tight text-white">
                {categoryCopy[currentCategory].title}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
                {currentCategory === 'score'
                  ? '独立评测外部小说或剧本，只看内容质量、商业潜力和制作可行性。'
                  : `${categoryCopy[currentCategory].hint}。先做前三集验证，再判断这版值不值得继续压资源。`}
              </p>
              <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
                {featureCards.map((text) => (
                  <div key={text} className="rounded-xl border border-[#1d2a3e] bg-[#081321] px-4 py-3">{text}</div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[#26354d] bg-[#081321] p-4">
              <label className="block">
                <span className="mb-2 block text-sm font-black text-slate-300">
                  {currentCategory === 'score' ? '评测项目名称' : '新项目名称'}
                </span>
                <input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="不填则自动按用户想法命名"
                  className="h-12 w-full rounded-xl border border-[#26354d] bg-[#07111d] px-4 text-slate-100 outline-none focus:border-blue-400"
                />
              </label>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  onClick={handleCreateProject}
                  className="h-12 rounded-xl bg-gradient-to-r from-blue-500 to-fuchsia-500 font-black text-white"
                >
                  {createActionLabel}
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="h-12 rounded-xl border border-blue-400/70 font-black text-blue-300 hover:bg-blue-500/10"
                >
                  导入备份
                </button>
                <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleImport} className="hidden" />
              </div>
            </div>
          </div>
        </section>
      )}

      {visibleProjects.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-[#26354d] bg-[#0b1725]/60 p-12 text-center">
          <h2 className="text-2xl font-black text-white">还没有项目</h2>
          <p className="mt-3 text-sm text-slate-500">
            {isHome ? '从左侧进入对应专区后新建项目。' : `点击“${createActionLabel}”，开始${currentCategory === 'score' ? '作品评测' : '验证这版值不值得继续压资源'}。`}
          </p>
          {hiddenDraftCount > 0 && (
            <p className="mt-2 text-xs text-slate-600">有 {hiddenDraftCount} 个空白草稿未显示，等产生实际内容后会自动出现在列表里。</p>
          )}
        </section>
      ) : (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-black text-white">{isHome ? '本地项目' : categoryCopy[currentCategory].title}</h2>
            <span className="text-sm text-slate-500">{visibleProjects.length} 个项目</span>
          </div>
          {isHome ? (
            <div className="space-y-7">
              {(['novel', 'screenplay', 'storyboard', 'score'] as ProjectCategory[]).map((category) => {
                const items = groupedProjects[category].filter(hasVisibleProjectContent);
                if (items.length === 0) return null;
                return (
                  <section key={category}>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-lg font-black text-white">{categoryCopy[category].title}</h3>
                      <span className="text-xs font-bold text-slate-500">{items.length} 个项目</span>
                    </div>
                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 2xl:grid-cols-3">
                      {items.map((project) => (
                        <ProjectCard key={project.id} project={project} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 2xl:grid-cols-3">
              {visibleProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
