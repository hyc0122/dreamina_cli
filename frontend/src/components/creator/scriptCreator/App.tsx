import { useEffect, useRef, useState } from 'react';
import { AppProvider, useApp } from './contexts/AppContext';
import ProgressBar from './components/ProgressBar/ProgressBar';
import ConfigPanel from './components/ConfigPanel/ConfigPanel';
import SchemeCards from './components/SchemeCards/SchemeCards';
import ScriptGenerator from './components/ScriptGenerator/ScriptGenerator';
import ExportButton from './components/ExportButton/ExportButton';
import ProjectWorkbench from './components/ProjectWorkbench/ProjectWorkbench';
import GlobalSettingsPage from './components/GlobalSettings/GlobalSettingsPage';
import { deriveEpisodeProductionStates, describeEpisodeProductionState } from './utils/episodeStateMachine';
import { GenerationConfig, ProjectStage, WorkflowMode } from './types';
import type { WorkbenchRoute } from './components/ProjectWorkbench/ProjectWorkbench';
import {
  WorkspacePreset,
  applyCreationPreset,
  getCreationPresetAction,
  getCreationPresetDescription,
  getCreationPresetLabel,
} from './utils/workspacePreset';

const workflowCopy: Record<WorkflowMode, { title: string; subtitle: string; action: string }> = {
  create: {
    title: '剧本项目',
    subtitle: '先选小说、剧本或15秒分镜创作稿，再进入前三集验证',
    action: '进入剧本项目',
  },
  score: {
    title: '作品评测',
    subtitle: '独立评测外部小说或剧本，只看内容质量、商业潜力和制作可行性',
    action: '评测作品',
  },
};

function getToolCopy(config: GenerationConfig) {
  if (config.workflowMode === 'create') {
    return {
      title: getCreationPresetLabel(config),
      subtitle: getCreationPresetDescription(config),
      action: getCreationPresetAction(config),
    };
  }

  return workflowCopy.score;
}

function useWorkspaceRoute() {
  const [hash, setHash] = useState(() => (typeof window === 'undefined' ? '' : window.location.hash));

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return hash;
}

function setWorkspaceHash(hash: string) {
  if (typeof window === 'undefined') return;
  if (window.location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  window.location.hash = hash;
}

function Sidebar() {
  const { config, setConfig, isGenerating, progress, setProgress, activeProject, closeProject } = useApp();
  const routeHash = useWorkspaceRoute();
  const isSettingsRoute = routeHash === '#settings';

  const setMode = (preset: WorkspacePreset) => {
    if (preset === 'home') {
      if (activeProject) closeProject();
      setWorkspaceHash('');
      return;
    }

    if (preset === 'settings') {
      if (activeProject) closeProject();
      setWorkspaceHash('#settings');
      return;
    }

    if (preset === 'score') {
      if (isGenerating && activeProject) {
        setProgress({
          ...progress,
          message: progress.message || '正在生成',
          subMessage: '当前项目正在生成，已保持在当前项目；请停止或完成后再切换工具。',
        });
        return;
      }

      setConfig({
        ...config,
        workflowMode: 'score',
        inputType: config.inputType === 'idea' ? 'novel' : config.inputType,
      });
      if (activeProject) closeProject();
      setWorkspaceHash('#score');
      return;
    }

    const presetConfig = applyCreationPreset(config, preset);
    setConfig(presetConfig);
    if (activeProject) closeProject();
    setWorkspaceHash(`#${preset}`);
  };

  const isActive = (preset: WorkspacePreset) => {
    if (preset === 'home') return !activeProject && routeHash === '';
    if (preset === 'settings') return !activeProject && isSettingsRoute;
    if (preset === 'score') return !activeProject && routeHash === '#score';
    return !activeProject && routeHash === `#${preset}`;
  };

  const items: Array<{ preset: WorkspacePreset; label: string; desc: string; mark: string }> = [
    { preset: 'home', label: '剧本项目', desc: '查看本地剧本项目和运行状态', mark: '01' },
    { preset: 'settings', label: '创作模型设置', desc: '首选、备用模型和并发配置', mark: '02' },
    { preset: 'novel', label: '小说创作', desc: '一集一集输出小说正文', mark: '03' },
    { preset: 'screenplay', label: '剧本创作', desc: '一集一集输出短剧剧本', mark: '04' },
    { preset: 'storyboard', label: '15秒分镜稿创作', desc: '按15秒分镜段输出', mark: '05' },
    { preset: 'score', label: '作品评测', desc: '外部作品打分', mark: '06' },
  ];

  return (
    <aside className="hidden min-h-full border-r border-[#1d2a3e] bg-[#07111d]/80 px-5 py-6 lg:block">
      <nav className="space-y-2 pt-1">
        {items.map((item) => {
          const active = isActive(item.preset);
          const locked = isGenerating && activeProject && item.preset === 'score' && !active;
          return (
            <button
              key={item.preset}
              type="button"
              onClick={() => setMode(item.preset)}
              title={locked ? '当前项目正在生成，停止或完成后再切换评测工具' : undefined}
              className={`group w-full rounded-xl border px-4 py-4 text-left transition-all duration-200 ${
                active
                  ? 'border-blue-400/70 bg-[#13233a] text-white shadow-[inset_3px_0_0_#60a5fa]'
                  : 'border-transparent bg-transparent text-slate-400 hover:border-blue-400/60 hover:bg-blue-500/10 hover:text-blue-300'
              } ${locked ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-base font-black">{item.label}</span>
                <span className={active ? 'text-xs font-black text-blue-300' : 'text-xs font-bold text-slate-600'}>
                  {item.mark}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{item.desc}</p>
            </button>
          );
        })}
      </nav>

    </aside>
  );
}

function StageStrip({ isProductionPage }: { isProductionPage: boolean }) {
  const { config, schemes, episodes, generatedScript } = useApp();
  const current = generatedScript || episodes.length > 0 ? 3 : isProductionPage || schemes.length > 0 ? 2 : 1;
  const stages = config.workflowMode === 'create'
    ? ['填写需求', '选择方案', '生成成品']
    : ['粘贴作品', '模型评测', '查看报告'];

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {stages.map((stage, index) => {
        const active = current >= index + 1;
        return (
          <div
            key={stage}
            className={`rounded-xl border px-4 py-3 ${
              active ? 'border-blue-400/50 bg-blue-500/10' : 'border-[#1d2a3e] bg-[#0b1725]/70'
            }`}
          >
            <p className={active ? 'text-xs font-black text-blue-300' : 'text-xs font-bold text-slate-600'}>
              STEP {index + 1}
            </p>
            <p className="mt-1 text-sm font-black text-white">{stage}</p>
          </div>
        );
      })}
    </div>
  );
}

function projectStageIndex(stage: ProjectStage, workflowMode: WorkflowMode) {
  if (workflowMode === 'score') {
    if (stage === 'completed' || stage === 'batch_review') return 2;
    if (stage === 'initial_batch_review' || stage === 'scheme_review' || stage === 'scheme_selection') return 1;
    return 0;
  }

  if (stage === 'completed' || stage === 'batch_review') return 5;
  if (stage === 'initial_batch_review') return 3;
  if (stage === 'scheme_review') return 2;
  if (stage === 'scheme_selection') return 1;
  return 0;
}

function ProjectFlowSidebar() {
  const { activeProject, activeProjectId, closeProject, exportProject, config, isGenerating } = useApp();

  if (!activeProject) return null;

  const flowSteps = config.workflowMode === 'score'
    ? ['粘贴作品', '模型评测', '评测报告']
    : ['需求设置', '方案确认', '故事结构', '前三集试播', '试播卡', '最终结果'];
  const activeIndex = projectStageIndex(activeProject.stage, config.workflowMode);
  const tool = getToolCopy(config);
  const navigationLockTitle = isGenerating ? '当前项目正在生成，返回后任务仍按当前项目保存' : undefined;

  return (
    <aside className="hidden min-h-full border-r border-[#1d2a3e] bg-[#07111d]/80 px-5 py-6 lg:flex lg:flex-col">
      <div className="border-b border-[#1d2a3e] pb-5">
        <button
          type="button"
          onClick={closeProject}
          title={navigationLockTitle}
          className="mb-4 text-sm font-bold text-slate-400 hover:text-blue-300"
        >
          ‹ 返回剧本项目
        </button>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">{tool.title}</p>
        <h1 className="mt-2 line-clamp-3 text-2xl font-black leading-8 text-white">{activeProject.name}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-300">
            本项目
          </span>
          {config.hongguoReviewEnabled && (
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-300">
              红果优先
            </span>
          )}
        </div>
      </div>

      <nav className="mt-6 space-y-2">
        {flowSteps.map((step, index) => {
          const reached = index <= activeIndex;
          const current = index === activeIndex;
          return (
            <div
              key={step}
              className={`rounded-xl border px-4 py-3 ${
                current
                  ? 'border-blue-400/70 bg-[#13233a] text-white shadow-[inset_3px_0_0_#60a5fa]'
                  : reached
                    ? 'border-[#26354d] bg-[#0d1928] text-slate-200'
                    : 'border-transparent bg-transparent text-slate-500'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-black">{step}</span>
                <span className={current ? 'text-xs font-black text-blue-300' : 'text-xs font-bold text-slate-600'}>
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 pt-6">
        <button
          type="button"
          onClick={() => activeProjectId && exportProject(activeProjectId)}
          className="h-11 w-full rounded-xl bg-gradient-to-r from-blue-500 to-fuchsia-500 px-4 text-sm font-black text-white shadow-[0_16px_40px_rgba(99,102,241,0.25)]"
        >
          保存项目
        </button>
        <div className="rounded-xl border border-[#1d2a3e] bg-[#0b1725] px-4 py-3">
          <p className="text-xs font-bold text-slate-300">当前侧栏只服务本项目</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">小说、剧本、分镜和评测入口已回到剧本项目。</p>
        </div>
      </div>
    </aside>
  );
}

function SetupGuidePanel() {
  const { config } = useApp();
  const mode = getToolCopy(config);
  const retentionWindows = Math.max(1, Math.ceil((config.episodeDurationSeconds || 70) / 15));

  const facts = config.workflowMode === 'create'
    ? [
        ['当前输出', getCreationPresetLabel(config)],
        ['试播流程', '先出3套方案+1套推荐，再做前三集验证'],
        ['核心判断', '先看值不值得压资源，再决定是否继续放量'],
        ['后台规则', config.outputType === 'novel' ? '首集钩子、前三集链路、试播判断卡' : `${retentionWindows} 个15秒留存窗口、试播判断卡、自检修复`],
      ]
    : [
          ['评测对象', config.inputType === 'screenplay' ? '剧本' : '小说'],
          ['处理方式', '只评分，不改写'],
          ['评分核心', config.inputType === 'screenplay' ? '九维剧本终审模型' : '市场转化100分模型'],
          ['输出内容', '总分、病灶、证据、定向修改建议'],
        ];

  return (
    <section className="min-h-[36rem] rounded-2xl border border-[#1d2a3e] bg-[#0a1421]/90">
      <div className="border-b border-[#1d2a3e] px-6 py-5">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-300">当前工具</p>
        <h2 className="mt-2 text-2xl font-black text-white">{mode.title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">{mode.subtitle}</p>
      </div>

      <div className="space-y-4 p-6">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[#1d2a3e] bg-[#081321] px-4 py-3">
            <p className="text-xs font-bold text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-black text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      <div className="mx-6 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-4">
        <p className="text-sm font-black text-emerald-300">设计原则</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          前台只显示用户必须操作的内容。先做前三集验证，再判断值不值得压资源；主线状态表、隐藏结构和自检过程都放在后台。
        </p>
      </div>
    </section>
  );
}

function ActiveProjectShell() {
  const {
    activeProject,
    schemes,
    episodes,
    generatedScript,
    isGenerating,
    progress,
  } = useApp();

  if (!activeProject) return null;

  const hasProductionContent = schemes.length > 0 || episodes.length > 0 || Boolean(generatedScript);
  const isProductionPage = hasProductionContent || (isGenerating && progress.step !== 'idle');

  return (
    <div className="h-full min-h-0 overflow-hidden bg-[radial-gradient(circle_at_72%_18%,rgba(36,69,111,0.18),transparent_34%)] text-slate-100 lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <ProjectFlowSidebar />
      <main className="min-h-0 min-w-0 overflow-auto">
        <div className="min-h-0 space-y-6 px-5 py-5 lg:px-8">
          <ProgressBar />

          {isProductionPage ? (
            <div className="min-w-0 space-y-6">
              <SchemeCards />
              <ScriptGenerator />
              <ExportButton />
            </div>
          ) : (
            <div className="grid min-w-0 items-start gap-6 2xl:grid-cols-[620px_minmax(0,1fr)]">
              <ConfigPanel />
              <SetupGuidePanel />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function RouteProjectExitSync({ routeHash, routeNonce }: Required<ScriptCreatorAppProps>) {
  const { activeProject, closeProject } = useApp();
  const previousRouteKey = useRef(`${routeHash}:${routeNonce}`);

  useEffect(() => {
    const nextRouteKey = `${routeHash}:${routeNonce}`;
    const routeChanged = previousRouteKey.current !== nextRouteKey;
    previousRouteKey.current = nextRouteKey;
    if (!routeChanged || !activeProject) return;
    closeProject();
  }, [activeProject, closeProject, routeHash, routeNonce]);

  return null;
}
function AppContent({ routeHash }: { routeHash: WorkbenchRoute }) {
  const { activeProject } = useApp();

  if (!activeProject) {
    return (
      <div className="h-full min-h-0 overflow-hidden bg-[radial-gradient(circle_at_72%_18%,rgba(36,69,111,0.18),transparent_34%)]">
        <div className="h-full min-w-0 overflow-auto">
          {routeHash === '#settings' ? <GlobalSettingsPage /> : <ProjectWorkbench routeHash={routeHash} />}
        </div>
      </div>
    );
  }

  return <ActiveProjectShell />;
}

function DebugPanel() {
  const { activeProject, productionEvents, episodeJobs, exportDebugPackage } = useApp();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!open || !activeProject) return null;

  const latestEvents = productionEvents.slice(0, 12);
  const episodeStates = deriveEpisodeProductionStates(productionEvents);
  const latestEpisodeStates = Object.values(episodeStates)
    .sort((a, b) => b.episodeId - a.episodeId)
    .slice(0, 5);
  const latestJobs = [...episodeJobs].sort((a, b) => b.episodeId - a.episodeId).slice(0, 5);

  return (
    <div className="fixed bottom-4 right-4 z-[80] w-[28rem] max-w-[calc(100vw-2rem)] rounded-xl border border-amber-400/40 bg-slate-950/95 p-4 text-slate-100 shadow-2xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-amber-300">调试面板</h2>
          <p className="text-xs text-slate-400">仅用于开发排查，不进入普通导出。</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-700 px-3 py-1 text-xs font-bold text-slate-300 hover:border-slate-500"
        >
          关闭
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2">
          <p className="text-slate-500">项目</p>
          <p className="truncate font-bold text-slate-100">{activeProject.name}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2">
          <p className="text-slate-500">事件数</p>
          <p className="font-bold text-slate-100">{productionEvents.length}</p>
        </div>
      </div>

      {latestEpisodeStates.length > 0 && (
        <div className="mb-3 rounded-lg border border-slate-800 bg-slate-900/50 p-2">
          <p className="mb-2 text-xs font-bold text-slate-300">最近集状态</p>
          <div className="space-y-1">
            {latestEpisodeStates.map((item) => (
              <div key={item.episodeId} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-400">第 {item.episodeId} 集</span>
                <span className={item.violation ? 'font-bold text-red-300' : 'font-bold text-emerald-300'}>
                  {describeEpisodeProductionState(item.state)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {latestJobs.length > 0 && (
        <div className="mb-3 rounded-lg border border-slate-800 bg-slate-900/50 p-2">
          <p className="mb-2 text-xs font-bold text-slate-300">最近任务单</p>
          <div className="space-y-1">
            {latestJobs.map((job) => (
              <div key={job.id} className="grid grid-cols-[4.5rem_1fr_4rem] gap-2 text-xs">
                <span className="text-slate-400">第 {job.episodeId} 集</span>
                <span className="truncate text-slate-300">{job.currentStep}</span>
                <span className={job.status === 'completed' ? 'font-bold text-emerald-300' : job.status === 'blocked' || job.status === 'failed' ? 'font-bold text-red-300' : 'font-bold text-amber-300'}>
                  {job.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="max-h-64 overflow-auto rounded-lg border border-slate-800 bg-slate-900/50">
        {latestEvents.length === 0 ? (
          <p className="p-3 text-xs text-slate-500">暂无生产流水账。</p>
        ) : (
          latestEvents.map((event) => (
            <div key={event.id} className="border-b border-slate-800 px-3 py-2 last:border-b-0">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-slate-200">{event.type}</span>
                <span className="text-slate-500">{event.status}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-slate-400">{event.summary}</p>
            </div>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={exportDebugPackage}
        className="mt-3 h-10 w-full rounded-lg bg-amber-400 text-sm font-bold text-slate-950 hover:bg-amber-300"
      >
        导出调试包
      </button>
    </div>
  );
}

type ScriptCreatorAppProps = {
  routeHash?: WorkbenchRoute;
  routeNonce?: number;
};

export default function App({ routeHash = '', routeNonce = 0 }: ScriptCreatorAppProps) {
  return (
    <AppProvider>
      <RouteProjectExitSync routeHash={routeHash} routeNonce={routeNonce} />
      <AppContent routeHash={routeHash} />
      <DebugPanel />
    </AppProvider>
  );
}
