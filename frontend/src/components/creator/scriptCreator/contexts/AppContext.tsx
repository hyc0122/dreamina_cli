import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppContextType,
  Episode,
  FinalEpisodeRecord,
  EpisodeJob,
  GenerationConfig,
  ProgressInfo,
  ProductionEvent,
  ProductionEventStatus,
  ProjectRunState,
  ProjectSnapshot,
  ProjectStage,
  ProvenanceRecord,
  Scheme,
  Script,
  ScriptProject,
} from '../types';
import { createRecommendedHybridScheme, generateSchemesAI } from '../engines/schemeEngine';
import { generateEpisodeStream, generateHiddenStoryPlan, optimizeTrialPackageContent } from '../engines/scriptEngine';
import { runEpisodeQualityLoop } from '../services/qualityService';
import { evaluateUserWork as evaluateUserWorkAI } from '../services/scriptEvaluationService';
import {
  canTransitionEpisodeState,
  deriveEpisodeProductionStates,
  stateForProductionEvent,
} from '../utils/episodeStateMachine';
import {
  episodeFromFinalRecord,
  episodesFromFinalRecords,
  interruptedNextEpisodeId,
  isCompletedEpisodeUsable,
  leadingUsableEpisodes,
} from '../utils/episodeRecovery';
import { evaluateEpisodeStartGate } from '../utils/episodeStartGate';
import { canRunProjectInBackground, decideProjectOpenNavigation } from '../utils/projectNavigation';
import { getCreationPresetLabel } from '../utils/workspacePreset';

const DEFAULT_EPISODE_COUNT = 60;
const MAX_EPISODE_COUNT = 1000;
const FIXED_MODEL_API_BASE_URL = 'https://zizidonghua.com/v1';

const envApiKey = (import.meta.env.VITE_API_KEY || '').trim();
const envModelName = (import.meta.env.VITE_MODEL_NAME || '字字语言模型-O').trim();
const envFallbackModel1 = (import.meta.env.VITE_FALLBACK_MODEL_1 || 'qwen3.6-plus').trim();
const envFallbackModel2 = (import.meta.env.VITE_FALLBACK_MODEL_2 || 'qwen3.5-plus').trim();

const defaultConfig: GenerationConfig = {
  apiBaseUrl: FIXED_MODEL_API_BASE_URL,
  apiKey: envApiKey,
  modelName: envModelName || '字字语言模型-O',
  fallbackModelName1: envFallbackModel1 || 'qwen3.6-plus',
  fallbackModelName2: envFallbackModel2 || 'qwen3.5-plus',
  reviewModelName: envModelName || '字字语言模型-O',
  workflowMode: 'create',
  inputType: 'idea',
  outputType: 'novel',
  contentStyle: 'normal',
  hongguoReviewEnabled: false,
  userIdea: '',
  sourceText: '',
  audience: 'male',
  genre: '年代爽剧',
  era: 'modern',
  isReborn: false,
  hasGoldenFinger: false,
  goldenFingerType: 'none',
  coolPointDensity: 'auto',
  reversalIntensity: 'auto',
  episodeCount: DEFAULT_EPISODE_COUNT,
  chapterWordCount: 1800,
  episodeDurationSeconds: 70,
  scenesPerEpisode: 4,
  maxConcurrentProjectRuns: 0,
  enableSelfCheck: false,
};

function normalizeInputType(value: unknown): GenerationConfig['inputType'] {
  return value === 'screenplay' ? 'screenplay' : value === 'novel' ? 'novel' : 'idea';
}

function normalizeOutputType(value: unknown): GenerationConfig['outputType'] {
  return value === 'screenplay' ? 'screenplay' : 'novel';
}

function normalizeGenerationConfig(config?: Partial<GenerationConfig>): GenerationConfig {
  const merged = { ...defaultConfig, ...(config || {}) };
  const maxConcurrentProjectRuns = Number(merged.maxConcurrentProjectRuns);
  return {
    ...merged,
    apiBaseUrl: FIXED_MODEL_API_BASE_URL,
    apiKey: String(merged.apiKey || defaultConfig.apiKey).trim(),
    modelName: String(merged.modelName || defaultConfig.modelName).trim() || defaultConfig.modelName,
    fallbackModelName1: String(merged.fallbackModelName1 || defaultConfig.fallbackModelName1).trim() || defaultConfig.fallbackModelName1,
    fallbackModelName2: String(merged.fallbackModelName2 || defaultConfig.fallbackModelName2).trim() || defaultConfig.fallbackModelName2,
    reviewModelName: String(merged.reviewModelName || merged.modelName || defaultConfig.reviewModelName).trim() || defaultConfig.reviewModelName,
    workflowMode: merged.workflowMode === 'score' ? 'score' : 'create',
    inputType: normalizeInputType(merged.inputType),
    outputType: normalizeOutputType(merged.outputType),
    maxConcurrentProjectRuns: Number.isFinite(maxConcurrentProjectRuns)
      ? Math.max(0, Math.min(1000, Math.floor(maxConcurrentProjectRuns)))
      : defaultConfig.maxConcurrentProjectRuns,
    enableSelfCheck: false,
  };
}

function normalizeProvenanceRecord(record: Partial<ProvenanceRecord>): ProvenanceRecord {
  return {
    id: record.id || createId('provenance'),
    createdAt: record.createdAt || new Date().toISOString(),
    action: record.action || 'legacy_record',
    summary: record.summary || '',
    ...record,
    inputType: normalizeInputType(record.inputType),
    outputType: normalizeOutputType(record.outputType),
    content: record.content || record.contentExcerpt || '',
    contentHash: record.contentHash || contentHash(record.content || record.contentExcerpt || ''),
    contentExcerpt: record.contentExcerpt || excerpt(record.content || ''),
  };
}

function normalizeProductionEvent(record: Partial<ProductionEvent>): ProductionEvent {
  return {
    id: record.id || createId('production_event'),
    createdAt: record.createdAt || new Date().toISOString(),
    type: record.type || 'debug_export_created',
    episodeId: record.episodeId,
    status: record.status || 'info',
    summary: record.summary || '',
    payload: record.payload,
    error: record.error,
    modelName: record.modelName,
    reviewModelName: record.reviewModelName,
  };
}

function normalizeEpisodeJob(record: Partial<EpisodeJob>): EpisodeJob {
  const now = new Date().toISOString();
  return {
    id: record.id || createId('episode_job'),
    episodeId: Number(record.episodeId) || 1,
    status: record.status || 'queued',
    currentStep: record.currentStep || 'plan',
    attempts: Number(record.attempts) || 0,
    repairAttempts: Number(record.repairAttempts) || 0,
    startedAt: record.startedAt || now,
    updatedAt: record.updatedAt || now,
    deadlineAt: record.deadlineAt || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    requiredInputs: record.requiredInputs || {},
    outputs: record.outputs,
    blockers: Array.isArray(record.blockers) ? record.blockers.map(String) : [],
    lastEventId: record.lastEventId,
  };
}

function normalizeFinalEpisodeRecord(record: Partial<FinalEpisodeRecord>): FinalEpisodeRecord {
  return {
    episodeId: Number(record.episodeId) || 1,
    title: record.title || `Episode ${Number(record.episodeId) || 1}`,
    content: record.content || '',
    scenes: Array.isArray(record.scenes) ? record.scenes : [],
    sourceEventId: record.sourceEventId,
    finalizedAt: record.finalizedAt || new Date().toISOString(),
    status: record.status || 'passed',
    score: typeof record.score === 'number' ? record.score : undefined,
    outputType: normalizeOutputType(record.outputType),
    workflowMode: record.workflowMode === 'score' ? 'score' : 'create',
  };
}

function normalizeProjectRunState(record?: Partial<ProjectRunState>): ProjectRunState {
  const now = new Date().toISOString();
  const status = record?.status || 'idle';
  return {
    status,
    queuedAt: record?.queuedAt,
    startedAt: record?.startedAt,
    updatedAt: record?.updatedAt || now,
    progress: Math.max(0, Math.min(100, Number(record?.progress) || 0)),
    message: record?.message || (status === 'idle' ? '等待加入运行队列' : '项目运行状态已恢复'),
    activeEpisodeId: record?.activeEpisodeId,
    error: record?.error,
  };
}

function hasCreateWorkflowSignature(project: Partial<ScriptProject>): boolean {
  const provenanceActions = (project.provenanceRecords || []).map((record) => record.action);
  const createActionPrefixes = [
    'start_new_scheme_generation',
    'user_input_for_schemes',
    'model_generated_schemes',
    'user_edited_scheme',
    'user_confirmed_scheme',
    'model_generated_hidden_story_plan',
    'model_generated_episode_draft',
    'quality_repaired_episode',
  ];
  const runMessage = project.runState?.message || '';
  const nextAction = project.nextAction || '';

  return Boolean(project.selectedScheme)
    || (project.schemes || []).length > 0
    || Boolean(project.hiddenStoryPlan?.trim())
    || provenanceActions.some((action) => createActionPrefixes.some((prefix) => action.startsWith(prefix)))
    || /方案|用户想法|故事结构|试播|前3集|前 3 集/.test(`${runMessage} ${nextAction}`);
}

function normalizeProjectConfigForProject(project: Partial<ScriptProject>): GenerationConfig {
  const config = normalizeGenerationConfig(project.config);
  if (config.workflowMode === 'score') return config;
  if (!hasCreateWorkflowSignature(project)) return config;
  return {
    ...config,
    workflowMode: 'create',
    inputType: 'idea',
  };
}

const CONFIG_STORAGE_KEY = 'script-creator-generation-config';
const PROJECTS_STORAGE_KEY = 'script-creator-projects';

const initialProgress: ProgressInfo = {
  step: 'idle',
  progress: 0,
  message: '等待开始',
  subMessage: '从项目工作台新建或继续项目',
};

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function contentHash(content: string) {
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) {
    hash = Math.imul(31, hash) + content.charCodeAt(index) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function excerpt(content: string) {
  return content.replace(/\s+/g, ' ').trim().slice(0, 300);
}

function loadInitialConfig(): GenerationConfig {
  if (typeof window === 'undefined') return defaultConfig;
  try {
    const saved = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!saved) return defaultConfig;
    return normalizeGenerationConfig(JSON.parse(saved));
  } catch {
    return defaultConfig;
  }
}

function loadProjects(): ScriptProject[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.map((project) => normalizeStoredProject(project)) : [];
  } catch {
    return [];
  }
}

function resolveConcurrentRunLimit(config: GenerationConfig) {
  const value = Number(config.maxConcurrentProjectRuns);
  if (!Number.isFinite(value) || value <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.floor(value));
}

function normalizeStoredProject(project: ScriptProject): ScriptProject {
  const config = normalizeProjectConfigForProject(project);
  const storedFinalEpisodes = (project.finalEpisodes || []).map(normalizeFinalEpisodeRecord);
  const storedEpisodes = (project.episodes || []).filter((episode) => episode.status !== 'generating');
  const episodes = storedEpisodes.length > 0
    ? storedEpisodes
    : episodesFromFinalRecords(storedFinalEpisodes);
  const fallbackFinalEpisodes = episodes
    .filter((episode) => episode.status !== 'generating' && episode.content?.trim())
    .map((episode) => normalizeFinalEpisodeRecord({
      episodeId: episode.id,
      title: episode.title,
      content: episode.content,
      scenes: episode.scenes || [],
      status: episode.status,
      score: episode.selfCheck?.score,
      outputType: config.outputType,
      workflowMode: config.workflowMode,
    }));
  const finalEpisodes = storedFinalEpisodes.length > 0
    ? storedFinalEpisodes
    : fallbackFinalEpisodes;
  const generatedScript = project.generatedScript
    ? {
        ...project.generatedScript,
        episodes,
        scenes: episodes.flatMap((episode) => episode.scenes || []),
      }
    : null;
  const derived = deriveProjectState(config, project.schemes || [], project.selectedScheme || null, episodes, generatedScript);

  return {
    ...project,
    config,
    stage: derived.stage,
    nextAction: derived.nextAction,
    score: derived.score,
    episodes,
    finalEpisodes,
    generatedScript,
    provenanceRecords: (project.provenanceRecords || []).map(normalizeProvenanceRecord),
    productionEvents: (project.productionEvents || []).map(normalizeProductionEvent),
    episodeJobs: (project.episodeJobs || []).map(normalizeEpisodeJob),
    runState: normalizeProjectRunState(project.runState),
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return String(error || '未知错误');
}

function outputTypeName(config: GenerationConfig): string {
  if (config.outputType === 'screenplay') {
    return config.workflowMode === 'create' ? getCreationPresetLabel(config) : '短剧剧本';
  }
  return '小说正文';
}

function projectNameFromConfig(config: GenerationConfig) {
  if (config.workflowMode === 'score') return '未命名评测项目';
  const idea = config.userIdea.trim().replace(/\s+/g, ' ');
  if (!idea) return '未命名短剧项目';
  return idea.length > 18 ? `${idea.slice(0, 18)}...` : idea;
}

function getProjectScore(episodes: Episode[], generatedScript: Script | null) {
  const scored = episodes.map((episode) => episode.selfCheck?.score).filter((score): score is number => typeof score === 'number');
  if (scored.length > 0) return Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length);
  return generatedScript ? 95 : undefined;
}

function totalEpisodeCount(config: GenerationConfig) {
  return Math.max(1, Math.min(MAX_EPISODE_COUNT, config.episodeCount || 1));
}

function shouldSaveGenerationCheckpoint(episodeIndex: number, totalEpisodes: number) {
  return episodeIndex <= 3 || episodeIndex % 10 === 0 || episodeIndex >= totalEpisodes;
}

function initialTrialEpisodeCount(config: GenerationConfig) {
  return Math.min(3, totalEpisodeCount(config));
}

function deriveProjectState(
  config: GenerationConfig,
  schemes: Scheme[],
  selectedScheme: Scheme | null,
  episodes: Episode[],
  generatedScript: Script | null
): { stage: ProjectStage; nextAction: string; score?: number } {
  const totalEpisodes = totalEpisodeCount(config);
  const score = getProjectScore(episodes, generatedScript);

  if (config.workflowMode === 'score' && episodes.length > 0) {
    return { stage: 'completed', nextAction: '查看用户作品评测和定向修改建议', score };
  }
  if (episodes.length >= totalEpisodes && generatedScript) {
    return { stage: 'completed', nextAction: '导出成品或继续修改项目', score };
  }
  if (episodes.length > Math.min(3, totalEpisodes)) {
    return {
      stage: 'batch_review',
      nextAction: `确认第${episodes.length - 9}-${episodes.length}集，继续生成下一批10集`,
      score,
    };
  }
  if (episodes.length > 0) {
    return { stage: 'initial_batch_review', nextAction: '查看试播判断，决定继续、修正或重选方案', score };
  }
  if (selectedScheme) return { stage: 'scheme_review', nextAction: '确认轻量方案后生成故事结构和前3集', score };
  if (schemes.length > 0) return { stage: 'scheme_selection', nextAction: '选择并自由编辑一套方案', score };
  return { stage: 'configuring', nextAction: '填写用户想法并生成三套轻量方案', score };
}

function createSnapshot(
  label: string,
  stage: ProjectStage,
  schemes: Scheme[],
  selectedScheme: Scheme | null,
  episodes: Episode[],
  hiddenStoryPlan: string,
  generatedScript: Script | null,
  score?: number
): ProjectSnapshot {
  return {
    id: createId('snapshot'),
    label,
    createdAt: new Date().toISOString(),
    stage,
    schemes,
    selectedScheme,
    episodes,
    hiddenStoryPlan,
    generatedScript,
    score,
  };
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<ScriptProject[]>(loadProjects);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [config, setConfig] = useState<GenerationConfig>(loadInitialConfig);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [selectedScheme, setSelectedScheme] = useState<Scheme | null>(null);
  const [generatedScript, setGeneratedScript] = useState<Script | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [finalEpisodes, setFinalEpisodes] = useState<FinalEpisodeRecord[]>([]);
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgressState] = useState<ProgressInfo>(initialProgress);
  const [error, setError] = useState<string | null>(null);
  const [hiddenStoryPlan, setHiddenStoryPlan] = useState('');
  const [provenanceRecords, setProvenanceRecords] = useState<ProvenanceRecord[]>([]);
  const [productionEvents, setProductionEvents] = useState<ProductionEvent[]>([]);
  const [episodeJobs, setEpisodeJobs] = useState<EpisodeJob[]>([]);
  const [trialRevisionPending, setTrialRevisionPending] = useState(false);
  const productionEventsRef = useRef<ProductionEvent[]>([]);
  const episodeJobsRef = useRef<EpisodeJob[]>([]);
  const finalEpisodesRef = useRef<FinalEpisodeRecord[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const backgroundHandoffAbortRef = useRef<AbortController | null>(null);
  const projectRunControllersRef = useRef<Record<string, AbortController>>({});
  const projectRunStartingRef = useRef<Set<string>>(new Set());
  const previousWorkflowModeRef = useRef(config.workflowMode);
  const detachedActiveProjectIdRef = useRef<string | null>(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || null,
    [activeProjectId, projects]
  );

  const setProgress = useCallback((next: ProgressInfo | ((current: ProgressInfo) => ProgressInfo)) => {
    setProgressState((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      if (resolved.step === 'idle') return { ...resolved, startedAt: undefined };
      if (resolved.startedAt) return resolved;
      if (current.startedAt && current.step !== 'idle') return { ...resolved, startedAt: current.startedAt };
      return { ...resolved, startedAt: new Date().toISOString() };
    });
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    setProjects((current) => {
      let changed = false;
      const next = current.map((project) => {
        const projectConfig = normalizeProjectConfigForProject(project);
        if (
          projectConfig.workflowMode === project.config.workflowMode
          && projectConfig.inputType === project.config.inputType
        ) {
          return project;
        }
        changed = true;
        return { ...project, config: projectConfig };
      });
      return changed ? next : current;
    });
  }, [projects]);

  useEffect(() => {
    const autosaveProjectId = activeProjectId || detachedActiveProjectIdRef.current;
    if (!autosaveProjectId) return;
    const now = new Date().toISOString();
    setProjects((current) =>
      current.map((project) => {
        if (project.id !== autosaveProjectId) return project;
        const isDetachedAutosave = detachedActiveProjectIdRef.current === project.id;
        const projectConfig = isDetachedAutosave ? normalizeProjectConfigForProject(project) : config;
        const derived = deriveProjectState(projectConfig, schemes, selectedScheme, episodes, generatedScript);

        return {
          ...project,
              name: project.name === '未命名短剧项目' ? projectNameFromConfig(projectConfig) : project.name,
              updatedAt: now,
              stage: derived.stage,
              nextAction: derived.nextAction,
              score: derived.score,
              config: projectConfig,
              schemes,
              selectedScheme,
              hiddenStoryPlan,
              episodes,
              finalEpisodes,
              generatedScript,
              provenanceRecords,
              productionEvents,
              episodeJobs,
              runState: isDetachedAutosave
                ? normalizeProjectRunState({
                    ...(project.runState || normalizeProjectRunState()),
                    status: isGenerating ? 'running' : (error ? 'failed' : progress.progress >= 100 ? 'pilot_ready' : project.runState?.status || 'idle'),
                    progress: isGenerating || progress.progress > 0 ? progress.progress : project.runState?.progress || 0,
                    message: progress.message || derived.nextAction,
                    activeEpisodeId: isGenerating ? currentEpisodeIndex || project.runState?.activeEpisodeId : undefined,
                    error: error || undefined,
                    updatedAt: now,
                  })
                : project.runState,
            };
      })
    );
    if (!isGenerating) detachedActiveProjectIdRef.current = null;
  }, [activeProjectId, config, schemes, selectedScheme, hiddenStoryPlan, episodes, finalEpisodes, generatedScript, provenanceRecords, productionEvents, episodeJobs, isGenerating, progress.progress, progress.message, currentEpisodeIndex, error]);

  useEffect(() => {
    if (previousWorkflowModeRef.current === config.workflowMode) return;
    if (isGenerating) {
      const lockedWorkflowMode = previousWorkflowModeRef.current;
      setConfig((current) => ({ ...current, workflowMode: lockedWorkflowMode }));
      setProgress((current) => ({
        ...current,
        message: current.message || '正在生成',
        subMessage: '当前项目正在生成，已保持在当前项目；请停止或完成后再切换工具。',
      }));
      return;
    }

    previousWorkflowModeRef.current = config.workflowMode;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setSchemes([]);
    setSelectedScheme(null);
    setTrialRevisionPending(false);
    setGeneratedScript(null);
    setEpisodes([]);
    finalEpisodesRef.current = [];
    setFinalEpisodes([]);
    setHiddenStoryPlan('');
    addProvenanceRecord('workflow_mode_changed', '用户切换工作模式，系统清空当前草稿但保留项目创作留痕', config.workflowMode);
    setCurrentEpisodeIndex(0);
    setError(null);
    setIsGenerating(false);
    setProgress({
      step: 'idle',
      progress: 0,
      message: '等待开始',
      subMessage: config.workflowMode === 'score'
        ? '粘贴用户小说或剧本后开始评测'
        : '填写用户想法后生成三套轻量方案',
    });
  }, [config.workflowMode, isGenerating]);

  const addProvenanceRecord = useCallback((action: string, summary: string, content: string, overrides?: Partial<ProvenanceRecord>) => {
    const record: ProvenanceRecord = {
      id: createId('provenance'),
      createdAt: new Date().toISOString(),
      action,
      inputType: config.inputType,
      outputType: config.outputType,
      summary,
      content,
      contentHash: contentHash(content),
      contentExcerpt: excerpt(content),
      modelName: config.modelName,
      reviewModelName: config.reviewModelName || config.modelName,
      ...overrides,
    };
    setProvenanceRecords((current) => [record, ...current].slice(0, 200));
    return record;
  }, [config.inputType, config.outputType, config.modelName, config.reviewModelName]);

  const replaceProductionEvents = useCallback((events: ProductionEvent[]) => {
    productionEventsRef.current = events;
    setProductionEvents(events);
  }, []);

  const replaceEpisodeJobs = useCallback((jobs: EpisodeJob[]) => {
    episodeJobsRef.current = jobs;
    setEpisodeJobs(jobs);
  }, []);

  const replaceFinalEpisodes = useCallback((records: FinalEpisodeRecord[]) => {
    const normalized = records.map(normalizeFinalEpisodeRecord).sort((a, b) => a.episodeId - b.episodeId);
    finalEpisodesRef.current = normalized;
    setFinalEpisodes(normalized);
  }, []);

  const upsertFinalEpisode = useCallback((episode: Episode, sourceEventId?: string) => {
    const record: FinalEpisodeRecord = {
      episodeId: episode.id,
      title: episode.title,
      content: episode.content,
      scenes: episode.scenes || [],
      sourceEventId,
      finalizedAt: new Date().toISOString(),
      status: episode.status,
      score: episode.selfCheck?.score,
      outputType: config.outputType,
      workflowMode: config.workflowMode,
    };
    const current = finalEpisodesRef.current;
    replaceFinalEpisodes([record, ...current.filter((item) => item.episodeId !== episode.id)]);
    return record;
  }, [config.outputType, config.workflowMode, replaceFinalEpisodes]);

  const updateEpisodeJob = useCallback((episodeId: number, patch: Partial<EpisodeJob>) => {
    const now = new Date().toISOString();
    const current = episodeJobsRef.current;
    const existing = current.find((job) => job.episodeId === episodeId);
    const nextJob: EpisodeJob = existing
      ? {
          ...existing,
          ...patch,
          episodeId,
          updatedAt: now,
          requiredInputs: { ...existing.requiredInputs, ...(patch.requiredInputs || {}) },
          outputs: { ...(existing.outputs || {}), ...(patch.outputs || {}) },
          blockers: patch.blockers ?? existing.blockers,
        }
      : {
          id: createId('episode_job'),
          episodeId,
          status: patch.status || 'queued',
          currentStep: patch.currentStep || 'plan',
          attempts: patch.attempts || 0,
          repairAttempts: patch.repairAttempts || 0,
          startedAt: now,
          updatedAt: now,
          deadlineAt: patch.deadlineAt || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          requiredInputs: patch.requiredInputs || {},
          outputs: patch.outputs,
          blockers: patch.blockers || [],
          lastEventId: patch.lastEventId,
        };
    replaceEpisodeJobs([nextJob, ...current.filter((job) => job.episodeId !== episodeId)].sort((a, b) => a.episodeId - b.episodeId));
    return nextJob;
  }, [replaceEpisodeJobs]);

  const addProductionEvent = useCallback((
    type: ProductionEvent['type'],
    status: ProductionEventStatus,
    summary: string,
    details?: { episodeId?: number; payload?: Record<string, unknown>; error?: string }
  ) => {
    const event: ProductionEvent = {
      id: createId('production_event'),
      createdAt: new Date().toISOString(),
      type,
      episodeId: details?.episodeId,
      status,
      summary,
      payload: details?.payload,
      error: details?.error,
      modelName: config.modelName,
      reviewModelName: config.reviewModelName || config.modelName,
    };
    const nextState = stateForProductionEvent(event);
    let recordedEvent = event;

    if (event.episodeId && nextState) {
      const currentStates = deriveEpisodeProductionStates(productionEventsRef.current);
      const previousState = currentStates[event.episodeId]?.state || 'idle';
      const allowed = canTransitionEpisodeState(previousState, nextState);
      recordedEvent = {
        ...event,
        payload: {
          ...(event.payload || {}),
          stateMachine: {
            from: previousState,
            to: nextState,
            allowed,
          },
        },
      };
    }

    const nextEvents = [recordedEvent, ...productionEventsRef.current].slice(0, 1000);
    replaceProductionEvents(nextEvents);
    return recordedEvent;
  }, [config.modelName, config.reviewModelName, replaceProductionEvents]);

  const addActiveSnapshot = useCallback((label: string, data?: {
    schemes?: Scheme[];
    selectedScheme?: Scheme | null;
    episodes?: Episode[];
    hiddenStoryPlan?: string;
    generatedScript?: Script | null;
  }) => {
    if (!activeProjectId) return;
    const snapshotSchemes = data?.schemes ?? schemes;
    const snapshotSelectedScheme = data?.selectedScheme ?? selectedScheme;
    const snapshotEpisodes = data?.episodes ?? episodes;
    const snapshotHiddenStoryPlan = data?.hiddenStoryPlan ?? hiddenStoryPlan;
    const snapshotGeneratedScript = data?.generatedScript ?? generatedScript;
    const derived = deriveProjectState(config, snapshotSchemes, snapshotSelectedScheme, snapshotEpisodes, snapshotGeneratedScript);
    const snapshot = createSnapshot(
      label,
      derived.stage,
      snapshotSchemes,
      snapshotSelectedScheme,
      snapshotEpisodes,
      snapshotHiddenStoryPlan,
      snapshotGeneratedScript,
      derived.score
    );
    setProjects((current) =>
      current.map((project) =>
        project.id === activeProjectId
          ? { ...project, snapshots: [snapshot, ...(project.snapshots || [])].slice(0, 30) }
          : project
      )
    );
  }, [activeProjectId, config, schemes, selectedScheme, episodes, hiddenStoryPlan, generatedScript]);

  const persistCurrentProject = useCallback((projectId: string | null = activeProjectId) => {
    if (!projectId) return;
    const projectFinalEpisodes = finalEpisodesRef.current;
    const projectProductionEvents = productionEventsRef.current;
    const projectEpisodeJobs = episodeJobsRef.current;
    const derived = deriveProjectState(config, schemes, selectedScheme, episodes, generatedScript);

    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              name: project.name,
              updatedAt: new Date().toISOString(),
              stage: derived.stage,
              nextAction: derived.nextAction,
              score: derived.score,
              config,
              schemes,
              selectedScheme,
              hiddenStoryPlan,
              episodes,
              finalEpisodes: projectFinalEpisodes,
              generatedScript,
              provenanceRecords,
              productionEvents: projectProductionEvents,
              episodeJobs: projectEpisodeJobs,
            }
          : project
      )
    );
  }, [activeProjectId, config, schemes, selectedScheme, episodes, generatedScript, hiddenStoryPlan, provenanceRecords]);

  const blockNavigationDuringGeneration = useCallback((targetAction: string) => {
    if (!isGenerating) return false;
    persistCurrentProject();
    setError(null);
    setProgress((current) => ({
      ...current,
      message: current.message || '正在生成',
      subMessage: `当前项目正在生成，已保持在当前项目；请停止或完成后再${targetAction}。`,
    }));
    return true;
  }, [isGenerating, persistCurrentProject]);

  const handoffActiveGenerationToBackground = useCallback((projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return false;
    const isActiveHandoff = activeProjectId === projectId;
    const handoffConfig = isActiveHandoff ? config : normalizeProjectConfigForProject(project);
    const handoffSchemes = isActiveHandoff ? schemes : project.schemes || [];
    const handoffSelectedScheme = isActiveHandoff ? selectedScheme : project.selectedScheme;
    const handoffEpisodes = isActiveHandoff ? episodes : project.episodes || [];
    const handoffFinalEpisodes = isActiveHandoff ? finalEpisodesRef.current : (project.finalEpisodes || []);
    const handoffGeneratedScript = isActiveHandoff ? generatedScript : project.generatedScript || null;
    const handoffHiddenStoryPlan = isActiveHandoff ? hiddenStoryPlan : project.hiddenStoryPlan || '';
    const handoffProvenanceRecords = isActiveHandoff ? provenanceRecords : project.provenanceRecords || [];
    const handoffProductionEvents = isActiveHandoff ? productionEventsRef.current : project.productionEvents || [];
    const handoffEpisodeJobs = isActiveHandoff ? episodeJobsRef.current : project.episodeJobs || [];

    if (!handoffSelectedScheme) return false;
    const now = new Date().toISOString();
    const derived = deriveProjectState(
      handoffConfig,
      handoffSchemes,
      handoffSelectedScheme,
      handoffEpisodes,
      handoffGeneratedScript
    );
    const backgroundProject = {
      ...project,
      updatedAt: now,
      stage: derived.stage,
      nextAction: derived.nextAction,
      score: derived.score,
      config: handoffConfig,
      schemes: handoffSchemes,
      selectedScheme: handoffSelectedScheme,
      hiddenStoryPlan: handoffHiddenStoryPlan,
      episodes: handoffEpisodes,
      finalEpisodes: handoffFinalEpisodes,
      generatedScript: handoffGeneratedScript,
      provenanceRecords: handoffProvenanceRecords,
      productionEvents: handoffProductionEvents,
      episodeJobs: handoffEpisodeJobs,
      runState: normalizeProjectRunState({
        ...(project.runState || normalizeProjectRunState()),
        status: 'running',
        queuedAt: project.runState?.queuedAt || now,
        progress: Math.max(1, project.runState?.progress || progress.progress || 1),
        message: '已切到后台继续运行',
        activeEpisodeId: currentEpisodeIndex || project.runState?.activeEpisodeId,
        error: undefined,
        updatedAt: now,
      }),
    } as ScriptProject;

    setProjects((current) =>
      current.map((item) =>
        item.id === projectId ? backgroundProject : item
      )
    );

    const controller = abortControllerRef.current;
    if (controller) {
      backgroundHandoffAbortRef.current = controller;
      controller.abort();
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
    detachedActiveProjectIdRef.current = null;
    setIsGenerating(false);
    setError(null);
    setProgress({
      step: 'idle',
      progress: 0,
      message: '已切到后台运行',
      subMessage: '当前项目继续后台生成，可打开或新建其他项目。',
    });
    return true;
  }, [
    activeProjectId,
    config,
    currentEpisodeIndex,
    episodes,
    generatedScript,
    hiddenStoryPlan,
    progress.progress,
    projects,
    provenanceRecords,
    schemes,
    selectedScheme,
  ]);

  const applyProjectPatch = useCallback((projectId: string, patch: Partial<ScriptProject>) => {
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? { ...project, ...patch, updatedAt: patch.updatedAt || new Date().toISOString() }
          : project
      )
    );

    if (activeProjectId === projectId) {
      if (patch.config) setConfig(normalizeGenerationConfig(patch.config));
      if (patch.schemes) setSchemes(patch.schemes);
      if ('selectedScheme' in patch) setSelectedScheme(patch.selectedScheme || null);
      if (patch.generatedScript !== undefined) setGeneratedScript(patch.generatedScript);
      if (patch.episodes) setEpisodes(patch.episodes);
      if (patch.finalEpisodes) replaceFinalEpisodes(patch.finalEpisodes);
      if (patch.hiddenStoryPlan !== undefined) setHiddenStoryPlan(patch.hiddenStoryPlan);
      if (patch.provenanceRecords) setProvenanceRecords(patch.provenanceRecords);
      if (patch.productionEvents) replaceProductionEvents(patch.productionEvents);
      if (patch.episodeJobs) replaceEpisodeJobs(patch.episodeJobs);
    }
  }, [activeProjectId, replaceEpisodeJobs, replaceFinalEpisodes, replaceProductionEvents]);

  const loadProjectIntoEditor = useCallback((project: ScriptProject) => {
    const cleanProject = normalizeStoredProject(project);
    if (!projectRunControllersRef.current[cleanProject.id]) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    }
    previousWorkflowModeRef.current = cleanProject.config.workflowMode;
    setConfig(normalizeGenerationConfig(cleanProject.config));
    setSchemes(cleanProject.schemes || []);
    setSelectedScheme(cleanProject.selectedScheme || null);
    setGeneratedScript(cleanProject.generatedScript || null);
    setEpisodes(cleanProject.episodes || []);
    replaceFinalEpisodes(cleanProject.finalEpisodes || []);
    setHiddenStoryPlan(cleanProject.hiddenStoryPlan || '');
    setTrialRevisionPending(false);
    setProvenanceRecords((cleanProject.provenanceRecords || []).map(normalizeProvenanceRecord));
    replaceProductionEvents((cleanProject.productionEvents || []).map(normalizeProductionEvent));
    replaceEpisodeJobs((cleanProject.episodeJobs || []).map(normalizeEpisodeJob));
    setCurrentEpisodeIndex((cleanProject.episodes || []).length);
    setError(null);
    if (!projectRunControllersRef.current[cleanProject.id]) setIsGenerating(false);
    setProgress({
      step: 'idle',
      progress: 0,
      message: cleanProject.nextAction,
      subMessage: '已回到上次中断位置',
    });
  }, [replaceEpisodeJobs, replaceFinalEpisodes, replaceProductionEvents]);

  const createProject = useCallback((name?: string, projectConfigOverride?: GenerationConfig) => {
    const hasDetachedRunningProject = isGenerating && !activeProjectId && Boolean(detachedActiveProjectIdRef.current);
    if (isGenerating && activeProjectId) {
      if (!handoffActiveGenerationToBackground(activeProjectId)) return;
    }
    persistCurrentProject(hasDetachedRunningProject ? detachedActiveProjectIdRef.current : activeProjectId);
    const now = new Date().toISOString();
    const projectConfig = normalizeGenerationConfig(projectConfigOverride || config);
    const projectName = name?.trim() || (projectConfig.workflowMode === 'score' ? '未命名评测项目' : '未命名短剧项目');
    const isScoreProject = projectConfig.workflowMode === 'score';
    const projectCreatedEvent: ProductionEvent = {
      id: createId('production_event'),
      createdAt: now,
      type: 'project_created',
      status: 'saved',
      summary: isScoreProject ? '评测项目已创建' : '项目已创建',
      payload: { projectName },
      modelName: projectConfig.modelName,
      reviewModelName: projectConfig.reviewModelName || projectConfig.modelName,
    };
    const project: ScriptProject = {
      id: createId('project'),
      name: projectName,
      createdAt: now,
      updatedAt: now,
      stage: 'configuring',
      nextAction: isScoreProject
        ? '粘贴用户小说或剧本后开始评测'
        : '填写用户想法并生成三套轻量方案',
      config: projectConfig,
      schemes: [],
      selectedScheme: null,
      hiddenStoryPlan: '',
      episodes: [],
      finalEpisodes: [],
      generatedScript: null,
      snapshots: [],
      provenanceRecords: [],
      productionEvents: [projectCreatedEvent],
      episodeJobs: [],
      runState: normalizeProjectRunState(),
    };
    setProjects((current) => [project, ...current]);
    if (hasDetachedRunningProject) {
      setProgress((current) => ({
        ...current,
        subMessage: '已新建项目卡；当前项目继续后台生成，可继续打开其他项目。',
      }));
      return;
    }
    setActiveProjectId(project.id);
    loadProjectIntoEditor(project);
    replaceProductionEvents([projectCreatedEvent]);
    replaceEpisodeJobs([]);
  }, [activeProjectId, config, handoffActiveGenerationToBackground, isGenerating, loadProjectIntoEditor, persistCurrentProject, replaceEpisodeJobs, replaceProductionEvents]);

  const openProject = useCallback((projectId: string) => {
    const runningProjectId = activeProjectId || detachedActiveProjectIdRef.current;
    const activeRunningProject = activeProjectId
      ? projects.find((item) => item.id === activeProjectId) || null
      : null;
    const detachedRunningProject = !activeProjectId && detachedActiveProjectIdRef.current
      ? projects.find((item) => item.id === detachedActiveProjectIdRef.current) || null
      : null;
    const openDecision = decideProjectOpenNavigation({
      activeProjectId,
      detachedProjectId: detachedActiveProjectIdRef.current,
      isGenerating,
      targetProjectId: projectId,
      canHandoffActiveProject: Boolean(
        activeProjectId && (selectedScheme || (activeRunningProject && canRunProjectInBackground(activeRunningProject)))
      ),
      canHandoffDetachedProject: Boolean(detachedRunningProject && canRunProjectInBackground(detachedRunningProject)),
    });

    if (openDecision === 'block') {
      blockNavigationDuringGeneration('打开其他项目');
      return;
    }

    if (openDecision === 'handoff-and-open' && runningProjectId) {
      if (!handoffActiveGenerationToBackground(runningProjectId)) return;
    }

    if (openDecision === 'reattach') {
      const project = projects.find((item) => item.id === projectId);
      if (project) {
        const cleanProject = normalizeStoredProject(project);
        previousWorkflowModeRef.current = cleanProject.config.workflowMode;
        setConfig(normalizeGenerationConfig(cleanProject.config));
      }
      detachedActiveProjectIdRef.current = null;
      setActiveProjectId(projectId);
      setError(null);
      return;
    }

    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    setActiveProjectId(project.id);
    loadProjectIntoEditor(project);
  }, [activeProjectId, blockNavigationDuringGeneration, handoffActiveGenerationToBackground, isGenerating, loadProjectIntoEditor, projects, selectedScheme, setConfig]);

  const closeProject = useCallback(() => {
    persistCurrentProject();
    if (isGenerating && activeProjectId) {
      const projectId = activeProjectId;
      detachedActiveProjectIdRef.current = projectId;
      const now = new Date().toISOString();
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId
            ? {
                ...project,
                updatedAt: now,
                runState: normalizeProjectRunState({
                  ...(project.runState || normalizeProjectRunState()),
                  status: 'running',
                  progress: progress.progress,
                  message: progress.message || '正在生成',
                  activeEpisodeId: currentEpisodeIndex || project.runState?.activeEpisodeId,
                  error: undefined,
                  updatedAt: now,
                }),
              }
            : project
        )
      );
      setActiveProjectId(null);
      setError(null);
      setProgress((current) => ({
        ...current,
        subMessage: '当前项目继续生成，已回到工作台；可从项目卡片打开查看。',
      }));
      return;
    }
    setActiveProjectId(null);
    setError(null);
    setProgress(initialProgress);
    setIsGenerating(false);
  }, [activeProjectId, currentEpisodeIndex, isGenerating, persistCurrentProject, progress.message, progress.progress]);

  const deleteProject = useCallback((projectId: string) => {
    if (detachedActiveProjectIdRef.current === projectId && isGenerating) {
      if (blockNavigationDuringGeneration('删除当前项目')) return;
    }
    if (activeProjectId === projectId && blockNavigationDuringGeneration('删除当前项目')) return;
    if (activeProjectId === projectId) {
      closeProject();
    }
    setProjects((current) => current.filter((project) => project.id !== projectId));
  }, [activeProjectId, blockNavigationDuringGeneration, closeProject, isGenerating]);

  const exportProject = useCallback((projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    const exportRecord: ProvenanceRecord = {
      id: createId('provenance'),
      createdAt: new Date().toISOString(),
      action: 'export_project_package',
      inputType: project.config.inputType || 'idea',
      outputType: project.config.outputType,
      summary: '导出包含创作留痕的项目备份包',
      content: JSON.stringify({
        config: project.config,
        schemes: project.schemes,
        selectedScheme: project.selectedScheme,
        hiddenStoryPlan: project.hiddenStoryPlan,
        episodes: project.episodes,
        finalEpisodes: project.finalEpisodes,
        generatedScript: project.generatedScript,
      }),
      contentHash: contentHash(JSON.stringify({
        config: project.config,
        schemes: project.schemes,
        selectedScheme: project.selectedScheme,
        episodes: project.episodes,
      })),
      contentExcerpt: '项目包导出记录，用于保留用户输入、方案、生成内容、质检和导出链路。',
      modelName: project.config.modelName,
      reviewModelName: project.config.reviewModelName || project.config.modelName,
    };
    const {
      productionEvents: _internalEvents,
      episodeJobs: _internalJobs,
      ...projectWithoutInternalEvents
    } = project;
    const exportProjectData = {
      ...projectWithoutInternalEvents,
      provenanceRecords: [exportRecord, ...(project.provenanceRecords || [])].slice(0, 200),
      copyrightNotice: '本项目包用于记录用户辅助创作过程，包含用户输入、AI生成、人工选择/编辑、质检修复与导出留痕。它能帮助证明创作过程和版本来源，但不构成法律意见，也不能替代对外部素材授权的确认。',
    };
    const blob = new Blob([JSON.stringify(exportProjectData, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.name.replace(/[^\w\u4e00-\u9fa5]/g, '_')}_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setProjects((current) =>
      current.map((item) =>
        item.id === projectId
          ? { ...item, provenanceRecords: exportProjectData.provenanceRecords }
          : item
      )
    );
  }, [projects]);

  const exportDebugPackage = useCallback(() => {
    if (!activeProject) return;
    const debugEvent = addProductionEvent('debug_export_created', 'saved', '开发调试包已导出', {
      payload: { projectId: activeProject.id },
    });
    const episodeProductionStates = deriveEpisodeProductionStates(productionEvents);
    const debugPackage = {
      exportedAt: new Date().toISOString(),
      app: 'script-creator',
      purpose: 'developer_debug_only',
      project: {
        id: activeProject.id,
        name: activeProject.name,
        stage: activeProject.stage,
        nextAction: activeProject.nextAction,
        score: activeProject.score,
      },
      config: {
        ...config,
        apiKey: config.apiKey ? '[redacted]' : '',
      },
      runtime: {
        progress,
        isGenerating,
        currentEpisodeIndex,
        selectedSchemeId: selectedScheme?.id || null,
        episodeCount: episodes.length,
        finalEpisodeCount: finalEpisodes.length,
        episodeJobCount: episodeJobs.length,
        hiddenStoryPlanLength: hiddenStoryPlan.length,
      },
      finalEpisodes,
      latestEpisodes: episodes.slice(-5).map((episode) => ({
        id: episode.id,
        title: episode.title,
        status: episode.status,
        productionState: episodeProductionStates[episode.id]?.state || 'idle',
        stateViolation: episodeProductionStates[episode.id]?.violation,
        contentLength: episode.content.length,
        selfCheck: episode.selfCheck,
        error: episode.error,
      })),
      episodeProductionStates,
      episodeJobs,
      productionEvents: [debugEvent, ...productionEvents].slice(0, 300),
      provenanceRecords: provenanceRecords.slice(0, 50).map((record) => ({
        ...record,
        content: record.content.slice(0, 1000),
      })),
      promptVersion: 'local-production-protocol-v1',
    };
    const blob = new Blob([JSON.stringify(debugPackage, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeProject.name.replace(/[^\w\u4e00-\u9fa5]/g, '_')}_debug_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [
    activeProject,
    addProductionEvent,
    config,
    currentEpisodeIndex,
    episodeJobs,
    episodes,
    finalEpisodes,
    hiddenStoryPlan.length,
    isGenerating,
    productionEvents,
    progress,
    provenanceRecords,
    selectedScheme?.id,
  ]);

  const importProject = useCallback(async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text) as ScriptProject;
    const now = new Date().toISOString();
    const importedFinalEpisodes = (parsed.finalEpisodes || []).map(normalizeFinalEpisodeRecord);
    const importedEpisodes = Array.isArray(parsed.episodes) && parsed.episodes.length > 0
      ? parsed.episodes.filter((episode) => episode.status !== 'generating')
      : episodesFromFinalRecords(importedFinalEpisodes);
    const project: ScriptProject = {
      ...parsed,
      id: parsed.id || createId('project'),
      createdAt: parsed.createdAt || now,
      updatedAt: now,
      snapshots: parsed.snapshots || [],
      config: normalizeGenerationConfig(parsed.config),
      schemes: parsed.schemes || [],
      selectedScheme: parsed.selectedScheme || null,
      finalEpisodes: importedFinalEpisodes,
      episodes: importedEpisodes,
      generatedScript: parsed.generatedScript || null,
      hiddenStoryPlan: parsed.hiddenStoryPlan || '',
      provenanceRecords: (parsed.provenanceRecords || []).map(normalizeProvenanceRecord),
      productionEvents: (parsed.productionEvents || []).map(normalizeProductionEvent),
      episodeJobs: (parsed.episodeJobs || []).map(normalizeEpisodeJob),
      runState: normalizeProjectRunState(parsed.runState),
    };
    setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
  }, []);

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsGenerating(false);
    addProductionEvent('generation_stopped', 'info', '用户停止当前生成任务', {
      episodeId: currentEpisodeIndex || undefined,
      payload: { completedEpisodes: episodes.filter((episode) => episode.status !== 'generating').length },
    });
    setProgress({
      step: 'idle',
      progress: 0,
      message: '已停止生成',
      subMessage: '当前已输出内容保留，可调整后继续',
    });
  }, [addProductionEvent, currentEpisodeIndex, episodes]);

  const setProjectRunState = useCallback((projectId: string, patch: Partial<ProjectRunState>) => {
    const now = new Date().toISOString();
    setProjects((current) =>
      current.map((project) => {
        if (project.id !== projectId) return project;
        return {
          ...project,
          updatedAt: now,
          runState: normalizeProjectRunState({
            ...(project.runState || normalizeProjectRunState()),
            ...patch,
            updatedAt: now,
          }),
        };
      })
    );
  }, []);

  const runProjectInBackground = useCallback(async (project: ScriptProject) => {
    if (projectRunControllersRef.current[project.id]) return;
    if (!project.selectedScheme) {
      setProjectRunState(project.id, {
        status: 'failed',
        progress: 0,
        message: '请先打开项目并确认一套方案',
        error: 'missing_selected_scheme',
      });
      return;
    }

    const controller = new AbortController();
    projectRunControllersRef.current[project.id] = controller;
    const runConfig = normalizeGenerationConfig(project.config);
    const targetScheme = project.selectedScheme;
    const totalEpisodes = totalEpisodeCount(runConfig);
    const initialFinalEpisodes = (project.finalEpisodes || []).map(normalizeFinalEpisodeRecord);
    const initialEpisodes = initialFinalEpisodes.length > 0
      ? initialFinalEpisodes.map(episodeFromFinalRecord)
      : (project.episodes || []).filter((episode) => episode.status !== 'generating');
    const completedEpisodes = leadingUsableEpisodes(initialEpisodes);
    const trialEpisodeCount = initialTrialEpisodeCount(runConfig);
    const targetEpisodeCount = completedEpisodes.length < trialEpisodeCount
      ? trialEpisodeCount
      : totalEpisodes;
    let activePlan = project.hiddenStoryPlan || '';
    let productionLog = (project.productionEvents || []).map(normalizeProductionEvent);
    let jobs = (project.episodeJobs || []).map(normalizeEpisodeJob);
    let finalRecords = initialFinalEpisodes;
    let activeEpisodeIndex = 0;
    let activeStreamingContent = '';

    const addProjectEvent = (
      type: ProductionEvent['type'],
      status: ProductionEventStatus,
      summary: string,
      details?: { episodeId?: number; payload?: Record<string, unknown>; error?: string }
    ) => {
      const event: ProductionEvent = {
        id: createId('production_event'),
        createdAt: new Date().toISOString(),
        type,
        episodeId: details?.episodeId,
        status,
        summary,
        payload: details?.payload,
        error: details?.error,
        modelName: runConfig.modelName,
        reviewModelName: runConfig.reviewModelName || runConfig.modelName,
      };
      const nextState = stateForProductionEvent(event);
      let recordedEvent = event;
      if (event.episodeId && nextState) {
        const currentStates = deriveEpisodeProductionStates(productionLog);
        const previousState = currentStates[event.episodeId]?.state || 'idle';
        recordedEvent = {
          ...event,
          payload: {
            ...(event.payload || {}),
            stateMachine: {
              from: previousState,
              to: nextState,
              allowed: canTransitionEpisodeState(previousState, nextState),
            },
          },
        };
      }
      productionLog = [recordedEvent, ...productionLog].slice(0, 1000);
      return recordedEvent;
    };

    const updateProjectJob = (episodeId: number, patch: Partial<EpisodeJob>) => {
      const now = new Date().toISOString();
      const existing = jobs.find((job) => job.episodeId === episodeId);
      const nextJob: EpisodeJob = existing
        ? {
            ...existing,
            ...patch,
            episodeId,
            updatedAt: now,
            requiredInputs: { ...existing.requiredInputs, ...(patch.requiredInputs || {}) },
            outputs: { ...(existing.outputs || {}), ...(patch.outputs || {}) },
            blockers: patch.blockers ?? existing.blockers,
          }
        : {
            id: createId('episode_job'),
            episodeId,
            status: patch.status || 'queued',
            currentStep: patch.currentStep || 'plan',
            attempts: patch.attempts || 0,
            repairAttempts: patch.repairAttempts || 0,
            startedAt: now,
            updatedAt: now,
            deadlineAt: patch.deadlineAt || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            requiredInputs: patch.requiredInputs || {},
            outputs: patch.outputs,
            blockers: patch.blockers || [],
            lastEventId: patch.lastEventId,
          };
      jobs = [nextJob, ...jobs.filter((job) => job.episodeId !== episodeId)].sort((a, b) => a.episodeId - b.episodeId);
      return nextJob;
    };

    const publishProject = (patch: Partial<ScriptProject>, runPatch?: Partial<ProjectRunState>) => {
      const patchEpisodes = patch.episodes || completedEpisodes;
      const script = patch.generatedScript !== undefined
        ? patch.generatedScript
        : project.generatedScript;
      const derived = deriveProjectState(runConfig, project.schemes || [], targetScheme, patchEpisodes, script || null);
      applyProjectPatch(project.id, {
        stage: derived.stage,
        nextAction: derived.nextAction,
        score: derived.score,
        config: runConfig,
        selectedScheme: targetScheme,
        hiddenStoryPlan: activePlan,
        productionEvents: productionLog,
        episodeJobs: jobs,
        finalEpisodes: finalRecords,
        runState: normalizeProjectRunState({
          ...(project.runState || normalizeProjectRunState()),
          status: 'running',
          progress: 0,
          message: '后台生成中',
          ...runPatch,
          updatedAt: new Date().toISOString(),
        }),
        ...patch,
      });
    };

    try {
      setProjectRunState(project.id, {
        status: 'running',
        startedAt: new Date().toISOString(),
        progress: Math.max(1, Math.round((completedEpisodes.length / Math.max(1, targetEpisodeCount)) * 100)),
        message: completedEpisodes.length > 0 ? '后台继续生成中' : '后台准备生成试播包',
      });

      if (!activePlan) {
        addProjectEvent('hidden_plan_started', 'started', '后台开始生成隐藏故事结构', {
          payload: { schemeId: targetScheme.id, totalEpisodes },
        });
        publishProject({}, { progress: 5, message: '后台生成隐藏故事结构' });
        activePlan = await generateHiddenStoryPlan(targetScheme, runConfig, controller.signal);
        addProjectEvent('hidden_plan_completed', 'passed', '后台隐藏故事结构生成完成', {
          payload: { planLength: activePlan.length },
        });
        publishProject({ hiddenStoryPlan: activePlan }, { progress: 8, message: '隐藏故事结构已完成' });
      }

      for (let episodeIndex = completedEpisodes.length + 1; episodeIndex <= targetEpisodeCount; episodeIndex += 1) {
        activeEpisodeIndex = episodeIndex;
        activeStreamingContent = '';
        if (controller.signal.aborted) throw new DOMException('Generation stopped', 'AbortError');

        updateProjectJob(episodeIndex, {
          status: 'running',
          currentStep: 'plan',
          requiredInputs: {
            previousEpisodeId: episodeIndex > 1 ? episodeIndex - 1 : undefined,
            schemeId: targetScheme.id,
            hiddenStoryPlanReady: Boolean(activePlan),
          },
          blockers: [],
        });

        if (episodeIndex > 1) {
          const gate = evaluateEpisodeStartGate(episodeIndex, completedEpisodes, productionLog);
          if (!gate.previousContentReady || (gate.previousState && gate.previousState !== 'finalized' && gate.blocker === 'previous_not_finalized')) {
            const reason = `第${episodeIndex - 1}集未形成可续写的最终稿，已阻止后台进入第${episodeIndex}集`;
            addProjectEvent('episode_state_blocked', 'failed', reason, {
              episodeId: episodeIndex,
              payload: { blocker: gate.blocker },
            });
            updateProjectJob(episodeIndex, { status: 'blocked', currentStep: 'plan', blockers: [reason] });
            throw new Error(reason);
          }
        }

        addProjectEvent('episode_planning_started', 'started', `后台第${episodeIndex}集进入生产流水线`, {
          episodeId: episodeIndex,
          payload: { previousEpisodes: completedEpisodes.length, targetEpisodeCount, totalEpisodes },
        });
        const baseProgress = Math.round(((episodeIndex - 1) / targetEpisodeCount) * 100);
        const draftEpisode: Episode = {
          id: episodeIndex,
          title: `第${episodeIndex}集生成中`,
          content: '',
          scenes: [],
          status: 'generating',
        };
        publishProject(
          { episodes: [...completedEpisodes, draftEpisode] },
          { progress: Math.min(95, baseProgress + 5), message: `后台生成第${episodeIndex}/${targetEpisodeCount}集`, activeEpisodeId: episodeIndex }
        );

        const currentJob = jobs.find((job) => job.episodeId === episodeIndex);
        updateProjectJob(episodeIndex, {
          status: 'running',
          currentStep: 'draft',
          attempts: (currentJob?.attempts || 0) + 1,
        });
        addProjectEvent('episode_drafting_started', 'started', `后台第${episodeIndex}集开始生成正文`, {
          episodeId: episodeIndex,
        });

        let streamingContent = '';
        const generatedEpisode = await generateEpisodeStream(
          targetScheme,
          runConfig,
          episodeIndex,
          completedEpisodes,
          activePlan,
          (token) => {
            streamingContent += token;
            activeStreamingContent = streamingContent;
            publishProject(
              { episodes: [...completedEpisodes, { ...draftEpisode, content: streamingContent }] },
              { progress: Math.min(95, baseProgress + 10), message: `后台接收第${episodeIndex}集内容`, activeEpisodeId: episodeIndex }
            );
          },
          controller.signal
        );

        addProjectEvent('episode_draft_completed', 'saved', `后台第${episodeIndex}集草稿已生成`, {
          episodeId: episodeIndex,
          payload: { contentLength: generatedEpisode.content.length, sceneCount: generatedEpisode.scenes.length },
        });
        addProjectEvent('episode_check_started', 'started', `后台第${episodeIndex}集开始质检`, { episodeId: episodeIndex });
        updateProjectJob(episodeIndex, {
          status: 'running',
          currentStep: 'validateDraft',
          outputs: { draftContentLength: generatedEpisode.content.length },
        });
        publishProject(
          { episodes: [...completedEpisodes, generatedEpisode] },
          { progress: Math.min(98, baseProgress + 70 / targetEpisodeCount), message: `后台优化第${episodeIndex}集`, activeEpisodeId: episodeIndex }
        );

        const finalEpisode = await runEpisodeQualityLoop({
          scheme: targetScheme,
          config: runConfig,
          episode: generatedEpisode,
          previousEpisodes: completedEpisodes,
          hiddenStoryPlan: activePlan,
          signal: controller.signal,
          onRepairRound: (score, nextRound) => {
            updateProjectJob(episodeIndex, {
              status: 'running',
              currentStep: 'repair',
              repairAttempts: nextRound - 1,
              outputs: { score },
            });
            addProjectEvent('episode_repair_started', 'started', `后台第${episodeIndex}集进入第${nextRound}轮定向修复`, {
              episodeId: episodeIndex,
              payload: { previousScore: score, repairRound: nextRound },
            });
            publishProject({}, { progress: Math.min(99, baseProgress + 80 / targetEpisodeCount), message: `后台修复第${episodeIndex}集`, activeEpisodeId: episodeIndex });
          },
        });

        if (!isCompletedEpisodeUsable(finalEpisode)) {
          const reason = `第${episodeIndex}集没有生成可用最终稿，后台任务已停止`;
          addProjectEvent('episode_state_blocked', 'failed', reason, {
            episodeId: episodeIndex,
            payload: { status: finalEpisode.status, contentLength: finalEpisode.content.length },
          });
          updateProjectJob(episodeIndex, {
            status: 'blocked',
            currentStep: 'finalize',
            blockers: [reason],
            outputs: {
              finalContentLength: finalEpisode.content.length,
              score: finalEpisode.selfCheck?.score,
              gatePassed: finalEpisode.selfCheck?.gatePassed,
            },
          });
          throw new Error(reason);
        }

        completedEpisodes.push(finalEpisode);
        const finalizedEvent = addProjectEvent('episode_finalized', finalEpisode.status === 'passed' ? 'passed' : 'saved', `后台第${episodeIndex}集最终稿已保存`, {
          episodeId: episodeIndex,
          payload: {
            status: finalEpisode.status,
            score: finalEpisode.selfCheck?.score,
            gatePassed: finalEpisode.selfCheck?.gatePassed,
            contentLength: finalEpisode.content.length,
            repairRounds: finalEpisode.selfCheckRounds?.length || 0,
          },
        });
        const record: FinalEpisodeRecord = {
          episodeId: finalEpisode.id,
          title: finalEpisode.title,
          content: finalEpisode.content,
          scenes: finalEpisode.scenes || [],
          sourceEventId: finalizedEvent.id,
          finalizedAt: new Date().toISOString(),
          status: finalEpisode.status,
          score: finalEpisode.selfCheck?.score,
          outputType: runConfig.outputType,
          workflowMode: runConfig.workflowMode,
        };
        finalRecords = [record, ...finalRecords.filter((item) => item.episodeId !== finalEpisode.id)]
          .sort((a, b) => a.episodeId - b.episodeId);
        updateProjectJob(episodeIndex, {
          status: 'completed',
          currentStep: 'finalize',
          blockers: [],
          outputs: {
            finalContentLength: finalEpisode.content.length,
            score: finalEpisode.selfCheck?.score,
            gatePassed: finalEpisode.selfCheck?.gatePassed,
          },
        });
        publishProject(
          { episodes: [...completedEpisodes], finalEpisodes: finalRecords },
          { progress: Math.round((episodeIndex / targetEpisodeCount) * 100), message: `后台已完成第${episodeIndex}/${targetEpisodeCount}集`, activeEpisodeId: episodeIndex }
        );
      }

      const scenes = completedEpisodes.flatMap((episode) => episode.scenes);
      const script: Script = {
        title: targetScheme.name,
        episodes: completedEpisodes,
        scenes,
        totalLength: `${completedEpisodes.length}/${totalEpisodes}集 / ${scenes.length}段 / 约${completedEpisodes.reduce((sum, episode) => sum + episode.content.length, 0)}字`,
      };
      const status = completedEpisodes.length >= totalEpisodes ? 'completed' : 'pilot_ready';
      publishProject(
        { episodes: completedEpisodes, finalEpisodes: finalRecords, generatedScript: script },
        {
          status,
          progress: 100,
          message: status === 'completed' ? '后台已完成全项目' : '前三集验证已完成，可打开查看',
          activeEpisodeId: undefined,
        }
      );
    } catch (err) {
      const activeJob = activeEpisodeIndex > 0 ? jobs.find((job) => job.episodeId === activeEpisodeIndex) : undefined;
      if (isAbortError(err)) {
        if (activeEpisodeIndex > 0) {
          addProjectEvent('generation_stopped', 'info', `后台第${activeEpisodeIndex}集生成已停止`, {
            episodeId: activeEpisodeIndex,
            payload: { step: activeJob?.currentStep || 'draft', partialContentLength: activeStreamingContent.length },
          });
          updateProjectJob(activeEpisodeIndex, {
            status: 'stopped',
            currentStep: activeJob?.currentStep || 'draft',
            outputs: { draftContentLength: activeStreamingContent.length },
          });
        }
        publishProject({}, { status: 'stopped', progress: 0, message: '后台生成已停止', activeEpisodeId: activeEpisodeIndex || undefined });
      } else {
        const message = errorMessage(err);
        if (activeEpisodeIndex > 0) {
          addProjectEvent('generation_failed', 'failed', `后台第${activeEpisodeIndex}集生成失败`, {
            episodeId: activeEpisodeIndex,
            error: message,
            payload: { step: activeJob?.currentStep || 'draft', partialContentLength: activeStreamingContent.length },
          });
          updateProjectJob(activeEpisodeIndex, {
            status: 'failed',
            currentStep: activeJob?.currentStep || 'draft',
            blockers: [message],
            outputs: { draftContentLength: activeStreamingContent.length },
          });
        }
        publishProject({}, { status: 'failed', progress: 0, message: '后台生成失败', error: message, activeEpisodeId: activeEpisodeIndex || undefined });
      }
    } finally {
      delete projectRunControllersRef.current[project.id];
      projectRunStartingRef.current.delete(project.id);
    }
  }, [applyProjectPatch, setProjectRunState]);

  const enqueueProjectRun = useCallback((projectId: string) => {
    const now = new Date().toISOString();
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    if (!project.selectedScheme) {
      setProjectRunState(projectId, {
        status: 'failed',
        progress: 0,
        message: '请先打开项目并确认一套方案',
        error: 'missing_selected_scheme',
      });
      return;
    }

    const runningCount = projects.filter((item) => item.runState?.status === 'running').length;
    const concurrentLimit = resolveConcurrentRunLimit(project.config);
    const canStartNow = runningCount < concurrentLimit;
    setProjects((current) =>
      current.map((item) =>
        item.id === projectId
          ? {
              ...item,
              updatedAt: now,
              runState: normalizeProjectRunState({
                ...(item.runState || normalizeProjectRunState()),
                status: canStartNow ? 'running' : 'queued',
                queuedAt: now,
                progress: item.runState?.progress || 0,
                message: canStartNow ? '等待后台启动' : '已加入后台队列',
                error: undefined,
                updatedAt: now,
              }),
            }
          : item
      )
    );
  }, [projects, setProjectRunState]);

  const stopProjectRun = useCallback((projectId: string) => {
    if (detachedActiveProjectIdRef.current === projectId && isGenerating) {
      stopGeneration();
      setProjectRunState(projectId, {
        status: 'stopped',
        progress: 0,
        message: '已停止后台运行',
        activeEpisodeId: undefined,
        error: undefined,
      });
      return;
    }

    const controller = projectRunControllersRef.current[projectId];
    if (controller) controller.abort();
    setProjectRunState(projectId, {
      status: 'stopped',
      progress: 0,
      message: '已停止后台运行',
      activeEpisodeId: undefined,
      error: undefined,
    });
  }, [isGenerating, setProjectRunState, stopGeneration]);

  useEffect(() => {
    const runningIds = Object.keys(projectRunControllersRef.current);
    const concurrentLimit = resolveConcurrentRunLimit(config);
    const availableSlots = Number.isFinite(concurrentLimit)
      ? Math.max(0, concurrentLimit - runningIds.length)
      : Number.POSITIVE_INFINITY;
    if (availableSlots === 0) return;

    const candidates = projects
      .filter((project) =>
        (project.runState?.status === 'running' || project.runState?.status === 'queued') &&
        !projectRunControllersRef.current[project.id] &&
        !projectRunStartingRef.current.has(project.id)
      )
      .sort((a, b) => String(a.runState?.queuedAt || a.updatedAt).localeCompare(String(b.runState?.queuedAt || b.updatedAt)))
      .slice(0, Number.isFinite(availableSlots) ? availableSlots : undefined);

    for (const project of candidates) {
      projectRunStartingRef.current.add(project.id);
      void runProjectInBackground(project);
    }
  }, [config, projects, runProjectInBackground]);

  const updateScheme = useCallback((schemeId: string, patch: Partial<Scheme>) => {
    setSchemes((current) =>
      current.map((scheme) => {
        if (scheme.id !== schemeId) return scheme;
        const updated = { ...scheme, ...patch };
        setSelectedScheme((selected) => (selected?.id === schemeId ? updated : selected));
        return updated;
      })
    );
    addProvenanceRecord('user_edited_scheme', '用户编辑轻量方案内容', JSON.stringify({ schemeId, patch }));
  }, [addProvenanceRecord]);

  const generateSchemes = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsGenerating(true);
    setError(null);
    setSelectedScheme(null);
    setGeneratedScript(null);
    setEpisodes([]);
    setHiddenStoryPlan('');
    setCurrentEpisodeIndex(0);
    addProvenanceRecord('start_new_scheme_generation', '用户重新请求生成三套轻量方案，旧版本留痕保留在项目备份中', config.userIdea);
    setProgress({
      step: 'generating_schemes',
      progress: 15,
      message: '正在生成三套轻量故事方案',
      subMessage: '已发出请求，先快速确定故事方向，用户确认后再生成大纲和目录',
      liveOutput: '[已发出请求，等待模型开始处理...]',
    });

    try {
      addProvenanceRecord('user_input_for_schemes', '用户输入想法并请求生成三套轻量方案', config.userIdea, {
        inputType: 'idea',
      });
      let liveOutput = '';
      const result = await generateSchemesAI(
        config,
        controller.signal,
        (token) => {
          liveOutput = `${liveOutput}${token}`.slice(-3000);
          const hasFormalOutput = !token.includes('模型处理中') && !token.includes('自动重试');
          setProgress((current) => ({
            ...current,
            progress: Math.min(85, Math.max(current.progress, 20 + Math.floor(liveOutput.length / 120))),
            subMessage: hasFormalOutput ? '正在整理方案结果，下面可查看最新片段' : '模型处理中，收到正式内容后会持续显示在下面',
            liveOutput,
          }));
        },
        (partialSchemes) => {
          setSchemes(partialSchemes);
          addActiveSnapshot(`已保存${partialSchemes.length}套方案`, {
            schemes: partialSchemes,
            selectedScheme: null,
            episodes: [],
            hiddenStoryPlan: '',
            generatedScript: null,
          });
        }
      );
      if (controller.signal.aborted) throw new DOMException('Generation stopped', 'AbortError');
      const hybridScheme = createRecommendedHybridScheme(result, config);
      const finalSchemes = hybridScheme ? [...result, hybridScheme] : result;
      setSchemes(finalSchemes);
      if (hybridScheme) setSelectedScheme(hybridScheme);
      addProvenanceRecord('model_generated_schemes', '模型生成三套轻量故事方案并合成系统推荐融合版', JSON.stringify(finalSchemes), {
        outputType: config.outputType,
      });
      setProgress({
        step: 'waiting_selection',
        progress: 100,
        message: '轻量方案生成完成',
        subMessage: '已自动生成第4套融合推荐版，并默认选中；可直接确认或自由编辑',
      });
      addActiveSnapshot('四套轻量方案和融合推荐版', {
        schemes: finalSchemes,
        selectedScheme: hybridScheme || null,
        episodes: [],
        hiddenStoryPlan: '',
        generatedScript: null,
      });
    } catch (err) {
      if (!isAbortError(err)) {
        const message = errorMessage(err);
        setError(`生成方案失败：${message}`);
        setProgress({
          step: 'idle',
          progress: 0,
          message: '生成轻量方案失败',
          subMessage: message,
        });
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsGenerating(false);
      }
    }
  }, [addActiveSnapshot, addProductionEvent, addProvenanceRecord, config, replaceFinalEpisodes]);

  const runScriptGeneration = useCallback(async (
    targetScheme: Scheme,
    initialCompletedEpisodes: Episode[],
    existingPlan: string,
    batchSize: number
  ) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const totalEpisodes = totalEpisodeCount(config);
    const completedEpisodes = leadingUsableEpisodes(initialCompletedEpisodes);
    const targetEpisodeCount = Math.min(totalEpisodes, completedEpisodes.length + batchSize);
    let activeEpisodeIndex = 0;
    let activeStreamingContent = '';

    setSelectedScheme(targetScheme);
    setIsGenerating(true);
    setError(null);

    try {
      let activePlan = existingPlan;
      if (!activePlan) {
        addProductionEvent('hidden_plan_started', 'started', '开始生成隐藏故事结构', {
          payload: { schemeId: targetScheme.id, totalEpisodes },
        });
        setProgress({
          step: 'generating_script',
          progress: 8,
          message: '正在生成隐藏故事结构',
          subMessage: '根据已选轻量方案生成故事圣经、长线大纲、分集目录和15秒留存链',
        });
        activePlan = await generateHiddenStoryPlan(targetScheme, config, controller.signal);
        setHiddenStoryPlan(activePlan);
        addProductionEvent('hidden_plan_completed', 'passed', '隐藏故事结构生成完成', {
          payload: { planLength: activePlan.length },
        });
        addProvenanceRecord('model_generated_hidden_story_plan', '模型生成隐藏故事结构、大纲和目录', activePlan);
      }

      for (let episodeIndex = completedEpisodes.length + 1; episodeIndex <= targetEpisodeCount; episodeIndex += 1) {
        activeEpisodeIndex = episodeIndex;
        activeStreamingContent = '';
        if (controller.signal.aborted) throw new DOMException('Generation stopped', 'AbortError');
        updateEpisodeJob(episodeIndex, {
          status: 'running',
          currentStep: 'plan',
          requiredInputs: {
            previousEpisodeId: episodeIndex > 1 ? episodeIndex - 1 : undefined,
            schemeId: targetScheme.id,
            hiddenStoryPlanReady: Boolean(activePlan),
          },
          blockers: [],
        });
        if (episodeIndex > 1) {
          const gate = evaluateEpisodeStartGate(episodeIndex, completedEpisodes, productionEventsRef.current);
          const previousState = gate.previousState && gate.previousState !== 'missing' ? { state: gate.previousState } : undefined;
          const previousContentReady = Boolean(gate.previousContentReady);
          const previousStateReady = gate.allowed || gate.blocker !== 'previous_not_finalized';

          if (!previousContentReady || !previousStateReady) {
            const reason = !previousContentReady
              ? `第${episodeIndex - 1}集没有可用最终稿，阻止进入第${episodeIndex}集`
              : `第${episodeIndex - 1}集状态为${previousState?.state}，尚未 finalized，阻止进入第${episodeIndex}集`;
            addProductionEvent('episode_state_blocked', 'failed', reason, {
              episodeId: episodeIndex,
              payload: {
                previousEpisodeId: episodeIndex - 1,
                previousState: previousState?.state || 'missing',
                previousContentReady,
                blocker: gate.blocker,
              },
            });
            updateEpisodeJob(episodeIndex, {
              status: 'blocked',
              currentStep: 'plan',
              blockers: [reason],
            });
            throw new Error(reason);
          }
        }
        setCurrentEpisodeIndex(episodeIndex);
        addProductionEvent('episode_planning_started', 'started', `第${episodeIndex}集进入生产流水线`, {
          episodeId: episodeIndex,
          payload: {
            previousEpisodes: completedEpisodes.length,
            targetEpisodeCount,
            totalEpisodes,
          },
        });
        const baseProgress = Math.round(((episodeIndex - 1) / targetEpisodeCount) * 100);
        let streamingContent = '';

        if (completedEpisodes.length > 0) {
          setProgress({
            step: 'generating_episode',
            progress: Math.min(95, baseProgress + 2),
            message: `正在压缩第${episodeIndex}集上下文`,
            subMessage: '保留故事圣经、已发生事实、最近两集原文和未回收伏笔',
          });
        }

        const draftEpisode: Episode = {
          id: episodeIndex,
          title: `第${episodeIndex}集生成中`,
          content: '',
          scenes: [],
          status: 'generating',
        };
        setEpisodes([...completedEpisodes, draftEpisode]);
        const currentJob = episodeJobsRef.current.find((job) => job.episodeId === episodeIndex);
        updateEpisodeJob(episodeIndex, {
          status: 'running',
          currentStep: 'draft',
          attempts: (currentJob?.attempts || 0) + 1,
        });
        addProductionEvent('episode_drafting_started', 'started', `第${episodeIndex}集开始生成正文`, {
          episodeId: episodeIndex,
        });
        setProgress({
          step: 'generating_episode',
          progress: Math.min(95, baseProgress + 5),
          message: `正在生成第${episodeIndex}/${targetEpisodeCount}集`,
          subMessage: `每集约${config.episodeDurationSeconds}秒，按15秒窗口持续制造观看理由`,
        });

        const generatedEpisode = await generateEpisodeStream(
          targetScheme,
          config,
          episodeIndex,
          completedEpisodes,
          activePlan,
          (token) => {
            streamingContent += token;
            activeStreamingContent = streamingContent;
            setEpisodes([...completedEpisodes, { ...draftEpisode, content: streamingContent }]);
          },
          controller.signal
        );
        addProvenanceRecord('model_generated_episode_draft', `模型生成第${episodeIndex}集初稿`, generatedEpisode.content);

        setProgress({
          step: 'self_checking',
          progress: Math.min(98, baseProgress + Math.round(70 / targetEpisodeCount)),
          message: `正在优化第${episodeIndex}/${targetEpisodeCount}集`,
          subMessage: '检查视觉钩子、上下文、红果、去AI味和格式质量',
        });

        addProductionEvent('episode_draft_completed', 'saved', `第${episodeIndex}集草稿已生成`, {
          episodeId: episodeIndex,
          payload: {
            contentLength: generatedEpisode.content.length,
            sceneCount: generatedEpisode.scenes.length,
          },
        });
        addProductionEvent('episode_check_started', 'started', `第${episodeIndex}集开始质检`, {
          episodeId: episodeIndex,
        });
        updateEpisodeJob(episodeIndex, {
          status: 'running',
          currentStep: 'validateDraft',
          outputs: {
            draftContentLength: generatedEpisode.content.length,
          },
        });
        const finalEpisode = await runEpisodeQualityLoop({
          scheme: targetScheme,
          config,
          episode: generatedEpisode,
          previousEpisodes: completedEpisodes,
          hiddenStoryPlan: activePlan,
          signal: controller.signal,
          onRepairRound: (score, nextRound) => {
            updateEpisodeJob(episodeIndex, {
              status: 'running',
              currentStep: 'repair',
              repairAttempts: nextRound - 1,
              outputs: { score },
            });
            addProductionEvent('episode_repair_started', 'started', `第${episodeIndex}集进入第${nextRound}轮定向修复`, {
              episodeId: episodeIndex,
              payload: { previousScore: score, repairRound: nextRound },
            });
            setProgress({
              step: 'self_checking',
              progress: Math.min(99, baseProgress + Math.round((70 + (nextRound - 1) * 8) / targetEpisodeCount)),
              message: `第${episodeIndex}集自检${score}分，正在第${nextRound}轮修复`,
              subMessage: '目标95分以上，最终只保留当前最高分版本',
            });
          },
        });

        if (!isCompletedEpisodeUsable(finalEpisode)) {
          const reason = `第${episodeIndex}集没有生成可用最终稿，阻止保存并继续下一集`;
          addProductionEvent('episode_state_blocked', 'failed', reason, {
            episodeId: episodeIndex,
            payload: {
              status: finalEpisode.status,
              contentLength: finalEpisode.content.length,
            },
          });
          updateEpisodeJob(episodeIndex, {
            status: 'blocked',
            currentStep: 'finalize',
            blockers: [reason],
            outputs: {
              finalContentLength: finalEpisode.content.length,
              score: finalEpisode.selfCheck?.score,
              gatePassed: finalEpisode.selfCheck?.gatePassed,
            },
          });
          throw new Error(reason);
        }

        completedEpisodes.push(finalEpisode);
        addProvenanceRecord('quality_repaired_episode', `第${episodeIndex}集完成质检和定向修复`, finalEpisode.content, {
          reviewModelName: config.reviewModelName || config.modelName,
        });
        const finalizedEvent = addProductionEvent('episode_finalized', finalEpisode.status === 'passed' ? 'passed' : 'saved', `第${episodeIndex}集最终稿已保存`, {
          episodeId: episodeIndex,
          payload: {
            status: finalEpisode.status,
            score: finalEpisode.selfCheck?.score,
            gatePassed: finalEpisode.selfCheck?.gatePassed,
            contentLength: finalEpisode.content.length,
            repairRounds: finalEpisode.selfCheckRounds?.length || 0,
          },
        });
        upsertFinalEpisode(finalEpisode, finalizedEvent.id);
        updateEpisodeJob(episodeIndex, {
          status: 'completed',
          currentStep: 'finalize',
          outputs: {
            finalContentLength: finalEpisode.content.length,
            score: finalEpisode.selfCheck?.score,
            gatePassed: finalEpisode.selfCheck?.gatePassed,
          },
          blockers: [],
        });
        setEpisodes([...completedEpisodes]);
        if (shouldSaveGenerationCheckpoint(episodeIndex, totalEpisodes)) {
        addActiveSnapshot(`第${episodeIndex}集完成并保存`, {
          schemes,
          selectedScheme: targetScheme,
          episodes: completedEpisodes,
          hiddenStoryPlan: activePlan,
          generatedScript: null,
        });
        }
        setProgress({
          step: 'episode_completed',
          progress: Math.round((episodeIndex / targetEpisodeCount) * 100),
          message: `第${episodeIndex}/${targetEpisodeCount}集已完成`,
          subMessage: '已完成本集内部优化',
        });
      }

      const scenes = completedEpisodes.flatMap((episode) => episode.scenes);
      const script: Script = {
        title: targetScheme.name,
        episodes: completedEpisodes,
        scenes,
        totalLength: `${completedEpisodes.length}/${totalEpisodes}集 / ${scenes.length}段 / 约${completedEpisodes.reduce((sum, episode) => sum + episode.content.length, 0)}字`,
      };
      setGeneratedScript(script);
      setProgress({
        step: completedEpisodes.length >= totalEpisodes ? 'completed' : 'episode_completed',
        progress: 100,
        message: completedEpisodes.length >= totalEpisodes ? `${outputTypeName(config)}生成完成` : `已生成${completedEpisodes.length}集`,
        subMessage: completedEpisodes.length >= totalEpisodes ? '已按短剧留存逻辑完成' : '确认无问题后可继续生成下一批10集',
      });
      addActiveSnapshot(completedEpisodes.length <= 3 ? '前3集生成版' : `生成至第${completedEpisodes.length}集`, {
        schemes,
        selectedScheme: targetScheme,
        episodes: completedEpisodes,
        hiddenStoryPlan: activePlan,
        generatedScript: script,
      });
    } catch (err) {
      if (backgroundHandoffAbortRef.current === controller) {
        backgroundHandoffAbortRef.current = null;
        return;
      }
      const activeJob = activeEpisodeIndex > 0
        ? episodeJobsRef.current.find((job) => job.episodeId === activeEpisodeIndex)
        : undefined;

      if (!isAbortError(err)) {
        const message = errorMessage(err);
        if (activeEpisodeIndex > 0) {
          addProductionEvent('generation_failed', 'failed', `第${activeEpisodeIndex}集生成失败`, {
            episodeId: activeEpisodeIndex,
            error: message,
            payload: {
              completedEpisodes: completedEpisodes.length,
              step: activeJob?.currentStep || 'draft',
              partialContentLength: activeStreamingContent.length,
            },
          });
          updateEpisodeJob(activeEpisodeIndex, {
            status: 'failed',
            currentStep: activeJob?.currentStep || 'draft',
            blockers: [message],
            outputs: {
              draftContentLength: activeStreamingContent.length,
            },
          });
          setEpisodes([
            ...completedEpisodes,
            {
              id: activeEpisodeIndex,
              title: `第${activeEpisodeIndex}集生成失败`,
              content: activeStreamingContent,
              scenes: [],
              status: 'failed',
            },
          ]);
        }
        setError(`生成正文失败：${message}`);
        setProgress({
          step: 'idle',
          progress: 0,
          message: '生成正文失败',
          subMessage: message,
        });
      } else {
        if (activeEpisodeIndex > 0) {
          addProductionEvent('generation_stopped', 'info', `第${activeEpisodeIndex}集生成已停止`, {
            episodeId: activeEpisodeIndex,
            payload: {
              completedEpisodes: completedEpisodes.length,
              step: activeJob?.currentStep || 'draft',
              partialContentLength: activeStreamingContent.length,
            },
          });
          updateEpisodeJob(activeEpisodeIndex, {
            status: 'stopped',
            currentStep: activeJob?.currentStep || 'draft',
            outputs: {
              draftContentLength: activeStreamingContent.length,
            },
          });
        }
        setProgress({
          step: 'idle',
          progress: 0,
          message: '已停止生成',
          subMessage: '已保留当前已输出内容',
        });
      }
    } finally {
      if (backgroundHandoffAbortRef.current === controller) {
        backgroundHandoffAbortRef.current = null;
      }
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsGenerating(false);
      }
    }
  }, [addActiveSnapshot, addProductionEvent, addProvenanceRecord, config, upsertFinalEpisode]);

  const generateScript = useCallback(async (schemeArg?: Scheme) => {
    const targetScheme = schemeArg || selectedScheme;
    if (!targetScheme) return;
    addActiveSnapshot('确认方案并开始生成前3集', {
      schemes,
      selectedScheme: targetScheme,
      episodes,
      hiddenStoryPlan,
      generatedScript,
    });
    addProvenanceRecord('user_confirmed_scheme', '用户确认方案并开始生成前3集', JSON.stringify(targetScheme));
    setGeneratedScript(null);
    setEpisodes([]);
    replaceFinalEpisodes([]);
    setCurrentEpisodeIndex(0);
    setHiddenStoryPlan('');
    await runScriptGeneration(targetScheme, [], '', initialTrialEpisodeCount(config));
  }, [addActiveSnapshot, addProvenanceRecord, config.episodeCount, replaceFinalEpisodes, selectedScheme, runScriptGeneration]);

  const evaluateUserWork = useCallback(async () => {
    if (!config.sourceText.trim()) {
      setError('请先粘贴需要评测的用户小说或剧本');
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsGenerating(true);
    setError(null);
    setSchemes([]);
    setSelectedScheme(null);
    setGeneratedScript(null);
    setEpisodes([]);
    replaceFinalEpisodes([]);
    setProgress({
      step: 'self_checking',
      progress: 20,
      message: '正在评测用户作品',
      subMessage: '独立作品评测，按市场转化100分判断钩子、留存、追更和变现，不参与生成链路',
    });

    try {
      addProvenanceRecord('user_work_evaluation_input', '用户提交自写作品并请求独立评测', config.sourceText, {
        inputType: config.inputType === 'screenplay' ? 'screenplay' : 'novel',
      });
      const report = await evaluateUserWorkAI(config.sourceText, config);
      if (controller.signal.aborted) throw new DOMException('Generation stopped', 'AbortError');
      const episode: Episode = {
        id: 1,
        title: config.inputType === 'screenplay' ? '用户剧本评测' : '用户小说评测',
        content: config.sourceText,
        scenes: [{ id: 1, title: '外部原文', content: config.sourceText }],
        status: report.score <= 0 ? 'failed' : report.passed ? 'passed' : 'warning',
        selfCheck: report,
        selfCheckRounds: [{ round: 1, action: report.passed ? 'passed' : 'checked', report, selected: true }],
      };
      const script: Script = {
        title: episode.title,
        episodes: [episode],
        scenes: episode.scenes,
        totalLength: `1个评分结果 / 原文约${config.sourceText.length}字`,
      };
      setEpisodes([episode]);
      upsertFinalEpisode(episode);
      setGeneratedScript(script);
      addProvenanceRecord('model_evaluated_user_work', `用户作品评测完成：${report.score}分`, JSON.stringify(report), {
        reviewModelName: config.reviewModelName || config.modelName,
      });
      setProgress({
        step: 'completed',
        progress: 100,
        message: report.score <= 0 ? '用户作品评测失败：没有得到有效评分' : `用户作品评测完成：${report.score}分`,
        subMessage: report.score <= 0 ? report.summary : '展开评测可看权重分、病灶和定向修改建议',
      });
      addActiveSnapshot('用户作品评测结果', {
        schemes: [],
        selectedScheme: null,
        episodes: [episode],
        generatedScript: script,
      });
    } catch (err) {
      if (!isAbortError(err)) {
        const message = errorMessage(err);
        setError(`用户作品评测失败：${message}`);
        setProgress({
          step: 'idle',
          progress: 0,
          message: '用户作品评测失败',
          subMessage: message,
        });
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsGenerating(false);
      }
    }
  }, [addActiveSnapshot, addProvenanceRecord, config, replaceFinalEpisodes, upsertFinalEpisode]);

  const continueGeneration = useCallback(async () => {
    if (!selectedScheme || isGenerating) return;
    const completed = leadingUsableEpisodes(
      finalEpisodes.length > 0
        ? finalEpisodes.map(episodeFromFinalRecord)
        : episodes.filter((episode) => episode.status !== 'generating')
    );
    const totalEpisodes = totalEpisodeCount(config);
    if (completed.length >= totalEpisodes) return;
    const retryEpisodeId = interruptedNextEpisodeId(completed, episodeJobsRef.current);
    if (retryEpisodeId) {
      const staleJob = episodeJobsRef.current.find((job) => job.episodeId === retryEpisodeId);
      addProductionEvent('generation_failed', 'failed', `第${retryEpisodeId}集准备手动重试`, {
        episodeId: retryEpisodeId,
        payload: {
          manualRetry: true,
          previousJobStatus: staleJob?.status,
          previousJobStep: staleJob?.currentStep,
        },
      });
      updateEpisodeJob(retryEpisodeId, {
        status: 'failed',
        currentStep: staleJob?.currentStep || 'draft',
        blockers: ['用户手动重试前收口上一次未完成任务'],
      });
    }
    setEpisodes(completed);
    setTrialRevisionPending(false);
    await runScriptGeneration(selectedScheme, completed, hiddenStoryPlan, totalEpisodes);
  }, [selectedScheme, isGenerating, finalEpisodes, episodes, config.episodeCount, hiddenStoryPlan, runScriptGeneration, addProductionEvent, updateEpisodeJob]);

  const applyTrialSuggestions = useCallback(async (suggestions: string[]) => {
    if (!selectedScheme || isGenerating) return;
    const cleanedSuggestions = suggestions.map((suggestion) => suggestion.trim()).filter(Boolean);
    if (cleanedSuggestions.length === 0) return;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsGenerating(true);
    const completedSource = finalEpisodes.length > 0
      ? finalEpisodes.map(episodeFromFinalRecord)
      : episodes.filter((episode) => episode.status !== 'generating');
    const trialEpisodes = completedSource
      .slice(0, initialTrialEpisodeCount(config));
    if (trialEpisodes.length === 0) {
      setIsGenerating(false);
      abortControllerRef.current = null;
      return;
    }

    const revisedPlan = [
      hiddenStoryPlan,
      '',
      '【试播修正建议，已确认应用到后续项目】',
      ...cleanedSuggestions.map((suggestion, index) => `${index + 1}. ${suggestion}`),
      '执行要求：整体优化并替换最终结果中的前3集，并把以上修正作为后续所有集数的固定项目规则。',
    ].filter(Boolean).join('\n');

    addActiveSnapshot('应用试播建议前', {
      schemes,
      selectedScheme,
      episodes,
      hiddenStoryPlan,
      generatedScript,
    });
    addProvenanceRecord('trial_suggestions_applied', '用户应用试播建议并替换最终结果前三集', cleanedSuggestions.join('\n'));
    setProgress({
      step: 'generating_episode',
      progress: 8,
      message: '正在按试播卡优化最终结果前三集',
      subMessage: '正在整理诊断建议和最终结果中的第1-3集，下一步会整体改写后替换原文。',
    });
    setHiddenStoryPlan(revisedPlan);
    setEpisodes(trialEpisodes.map((episode) => ({ ...episode, status: 'warning' as const })));
    setCurrentEpisodeIndex(0);

    let trialProgressTimer: number | undefined;
    try {
      trialProgressTimer = window.setInterval(() => {
        if (controller.signal.aborted) return;
        setProgress((current) => {
          if (current.step !== 'generating_episode') return current;
          const increment = current.progress < 20 ? 4 : current.progress < 40 ? 2 : 1;
          const nextProgress = Math.min(54, Math.max(current.progress, current.progress + increment));
          const phase = nextProgress < 20
            ? '正在拆解试播卡建议，锁定前三集要改的位置'
            : nextProgress < 40
              ? '模型正在把前三集作为一个试播包整体改写'
              : '正在等待模型返回优化后的前三集，长文本请求可能需要几十秒';
          return {
            ...current,
            progress: nextProgress,
            subMessage: `${phase}；返回后会进入逐集质检，并替换最终结果。`,
          };
        });
      }, 2500);

      const optimizedTrialEpisodes = await optimizeTrialPackageContent(
        selectedScheme,
        config,
        trialEpisodes,
        revisedPlan,
        cleanedSuggestions,
        controller.signal
      );
      if (trialProgressTimer !== undefined) {
        window.clearInterval(trialProgressTimer);
        trialProgressTimer = undefined;
      }
      if (controller.signal.aborted) throw new DOMException('Generation stopped', 'AbortError');

      const finalTrialEpisodes: Episode[] = [];
      for (const episode of optimizedTrialEpisodes) {
        setProgress({
          step: 'self_checking',
          progress: Math.round(55 + (finalTrialEpisodes.length / Math.max(1, optimizedTrialEpisodes.length)) * 35),
          message: '正在质检优化后的前三集',
          subMessage: `第${finalTrialEpisodes.length + 1}集正在做通顺、钩子、留存和上下集承接检查。`,
        });
        const checkedEpisode = await runEpisodeQualityLoop({
          scheme: selectedScheme,
          config,
          episode,
          previousEpisodes: finalTrialEpisodes,
          hiddenStoryPlan: revisedPlan,
          signal: controller.signal,
        });
        finalTrialEpisodes.push({
          ...checkedEpisode,
          id: finalTrialEpisodes.length + 1,
        });
      }
      if (controller.signal.aborted) throw new DOMException('Generation stopped', 'AbortError');

      const mergedEpisodes = [
        ...finalTrialEpisodes,
        ...completedSource
          .filter((episode) => episode.id > finalTrialEpisodes.length)
          .map((episode) => ({ ...episode, status: episode.status === 'generating' ? 'passed' as const : episode.status })),
      ].sort((a, b) => a.id - b.id);
      setEpisodes(mergedEpisodes);
      setGeneratedScript({
        title: selectedScheme.name,
        episodes: mergedEpisodes,
        scenes: mergedEpisodes.flatMap((episode) => episode.scenes),
        totalLength: `${mergedEpisodes.length}/${totalEpisodeCount(config)}集 / ${mergedEpisodes.reduce((sum, episode) => sum + episode.content.length, 0)}字`,
      });
      finalTrialEpisodes.forEach((episode) => upsertFinalEpisode(episode));
      setTrialRevisionPending(true);
      setProgress({
        step: 'episode_completed',
        progress: 100,
        message: '前三集修订版已替换到最终结果',
        subMessage: '试播卡会基于替换后的最终前三集重新判断；确认采用后从第4集继续生成。',
      });
    } catch (error) {
      if (!isAbortError(error)) {
        const message = error instanceof Error ? error.message : String(error || '未知错误');
        setError(`试播卡优化失败：${message}`);
        setProgress({
          step: 'idle',
          progress: 0,
          message: '试播卡优化失败',
          subMessage: message,
        });
      }
    } finally {
      if (trialProgressTimer !== undefined) {
        window.clearInterval(trialProgressTimer);
      }
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsGenerating(false);
    }
  }, [addActiveSnapshot, addProvenanceRecord, config, episodes, finalEpisodes, generatedScript, hiddenStoryPlan, isGenerating, schemes, selectedScheme, upsertFinalEpisode]);

  const resetToSchemeSelection = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    addActiveSnapshot('回退到方案选择前', {
      schemes,
      selectedScheme,
      episodes,
      hiddenStoryPlan,
      generatedScript,
    });
    setSelectedScheme(null);
    setGeneratedScript(null);
    setEpisodes([]);
    replaceFinalEpisodes([]);
    setCurrentEpisodeIndex(0);
    setHiddenStoryPlan('');
    setIsGenerating(false);
    setProgress({
      step: schemes.length > 0 ? 'waiting_selection' : 'idle',
      progress: schemes.length > 0 ? 100 : 0,
      message: schemes.length > 0 ? '已回退到方案选择' : '等待生成轻量方案',
      subMessage: schemes.length > 0 ? '重新选择或编辑一套方案，再生成前3集' : '填写用户想法后生成三套轻量方案',
    });
  }, [addActiveSnapshot, episodes, generatedScript, hiddenStoryPlan, replaceFinalEpisodes, schemes, selectedScheme]);

  const value: AppContextType = {
    projects,
    activeProjectId,
    activeProject,
    provenanceRecords,
    productionEvents,
    episodeJobs,
    exportDebugPackage,
    createProject,
    openProject,
    closeProject,
    deleteProject,
    exportProject,
    enqueueProjectRun,
    stopProjectRun,
    importProject,
    config,
    setConfig,
    schemes,
    selectedScheme,
    setSelectedScheme,
    updateScheme,
    generatedScript,
    episodes,
    finalEpisodes,
    currentEpisodeIndex,
    generateSchemes,
    generateScript,
    evaluateUserWork,
    continueGeneration,
    applyTrialSuggestions,
    trialRevisionPending,
    resetToSchemeSelection,
    stopGeneration,
    isGenerating,
    progress,
    setProgress,
  };

  return (
    <AppContext.Provider value={value}>
      {error && (
        <div className="fixed right-4 top-4 z-50 rounded-lg bg-red-500 px-4 py-2 text-white shadow-lg">
          {error}
        </div>
      )}
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
