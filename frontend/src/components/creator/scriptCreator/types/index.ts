export type GenerationStep = 'idle' | 'generating_schemes' | 'waiting_selection' | 'generating_script' | 'generating_episode' | 'self_checking' | 'episode_completed' | 'completed';

export type EpisodeStatus = 'pending' | 'generating' | 'checking' | 'passed' | 'warning' | 'failed';

export type OutputType = 'novel' | 'screenplay';

export type InputType = 'idea' | 'novel' | 'screenplay';

export type ContentStyle = 'normal' | 'dianwen';

export type StrengthPreference = 'auto' | 'low' | 'medium' | 'high';

export type WorkflowMode = 'create' | 'score';

export type ProjectStage =
  | 'configuring'
  | 'scheme_selection'
  | 'scheme_review'
  | 'initial_batch_review'
  | 'batch_review'
  | 'completed';

export interface GenerationConfig {
  apiBaseUrl: string;
  apiKey: string;
  modelName: string;
  fallbackModelName1: string;
  fallbackModelName2: string;
  reviewModelName: string;
  workflowMode: WorkflowMode;
  inputType: InputType;
  outputType: OutputType;
  contentStyle: ContentStyle;
  hongguoReviewEnabled: boolean;
  userIdea: string;
  sourceText: string;
  audience: 'male' | 'female';
  genre: string;
  era: string;
  isReborn: boolean;
  hasGoldenFinger: boolean;
  goldenFingerType?: string;
  coolPointDensity: StrengthPreference;
  reversalIntensity: StrengthPreference;
  episodeCount: number;
  chapterWordCount: number;
  episodeDurationSeconds: number;
  scenesPerEpisode: number;
  maxConcurrentProjectRuns: number;
  enableSelfCheck: boolean;
}

export interface Scheme {
  id: string;
  name: string;
  tagline: string;
  storyIntroduction: string;
  coreConflict: string;
  characterDesign: string;
  hongguoAdaptationNote: string;
  protagonistArc: string;
  antagonistProfile: string;
  highlightScenes: string[];
  recommendationScore?: number;
  recommendationReason?: string;
  missingInfoOptions?: string[];
  plotOutline: string;
  episodeDirectory: string;
}

export interface Scene {
  id: number;
  title: string;
  content: string;
}

export interface Script {
  title: string;
  scenes: Scene[];
  episodes: Episode[];
  totalLength: string;
}

export type GateKey = 'outputType' | 'storyPlan' | 'platform';

export type WeightedMetricKey =
  | 'openingHook'
  | 'retentionBeats'
  | 'bingeDrive'
  | 'continuity'
  | 'characterLogic'
  | 'dialogueNaturalness'
  | 'formatEfficiency'
  | 'deAi'
  | 'characterDepth'
  | 'plotLogicAndSatisfaction'
  | 'proseTexture'
  | 'empathyDrive'
  | 'themeCore'
  | 'worldbuilding'
  | 'storyCompleteness'
  | 'genreHeat'
  | 'audienceBreadth'
  | 'viralPotential'
  | 'adaptationFit'
  | 'monetization'
  | 'reputationRisk'
  | 'lifecycle'
  | 'plotClosure'
  | 'characterPortrayal'
  | 'pacingStructure'
  | 'conflictEmotion'
  | 'dialogueTexture'
  | 'commercialTraffic'
  | 'valueCompliance'
  | 'relationshipArchitecture'
  | 'productionFit';

export interface GateCheck {
  key: GateKey;
  name: string;
  passed: boolean;
  issue?: string;
  evidence?: string;
  repairInstruction?: string;
}

export interface WeightedMetric {
  key: WeightedMetricKey;
  name: string;
  weight: number;
  score: number;
  issue?: string;
  evidence?: string;
  repairInstruction?: string;
}

export interface SelfCheckReport {
  passed: boolean;
  score: number;
  gatePassed?: boolean;
  gates?: GateCheck[];
  weightedScore?: number;
  weightedMetrics?: WeightedMetric[];
  evaluationMeta?: {
    detectedTrack?: 'male' | 'female' | 'universal';
    detectedGenre?: string;
    rating?: string;
    literaryScore?: number;
    marketScore?: number;
    calibrationScore?: number;
    retentionScore?: number;
    suitableTracks?: string[];
    scoreReason?: string;
    scoreModel?: 'novel_market_conversion' | 'script_nine_dimensions';
    redLineItems?: string[];
    rectificationPriority?: string;
    productionConclusion?: string;
    trafficAdvice?: string;
    coreAdvantages?: string[];
    coreDisadvantages?: string[];
  };
  recommendedAction?: 'continue' | 'targeted_repair' | 'rewrite_episode' | 'reselect_scheme';
  summary: string;
  issues: string[];
  suggestions: string[];
  failedDimensions?: string[];
}

export interface SelfCheckRound {
  round: number;
  action: 'checked' | 'repairing' | 'passed';
  report: SelfCheckReport;
  selected?: boolean;
}

export type TrialVerdict = 'continue' | 'revise' | 'reselect';

export interface TrialFixItem {
  key: 'protagonist_identity' | 'opening_hook' | 'first_30_seconds' | 'episode_structure' | 'scheme_selling_point';
  title: string;
  issue: string;
  impact: string;
  action: string;
}

export interface TrialOpeningReview {
  firstLineStatus: string;
  firstThirtySecondsStatus: string;
  episodeStructureStatus: string;
}

export interface TrialJudgmentCard {
  grade: 'A' | 'B' | 'C';
  headline: string;
  action: 'test_now' | 'revise_then_test' | 'pause' | 'switch_scheme';
  whyItDeserves: string[];
  topFixes: TrialFixItem[];
  openingReview: TrialOpeningReview;
  pilotChainReview: string;
  riskFlags: string[];
  readyToScaleAfter: string;
}

export interface TrialJudgment {
  verdict: TrialVerdict;
  score: number;
  title: string;
  reason: string;
  details: string[];
  suggestions: string[];
  card: TrialJudgmentCard;
}

export interface Episode {
  id: number;
  title: string;
  content: string;
  scenes: Scene[];
  status: EpisodeStatus;
  selfCheck?: SelfCheckReport;
  selfCheckRounds?: SelfCheckRound[];
  error?: string;
}

export interface FinalEpisodeRecord {
  episodeId: number;
  title: string;
  content: string;
  scenes: Scene[];
  sourceEventId?: string;
  finalizedAt: string;
  status: EpisodeStatus;
  score?: number;
  outputType: OutputType;
  workflowMode: WorkflowMode;
}

export interface ProgressInfo {
  step: GenerationStep;
  progress: number;
  message: string;
  subMessage?: string;
  liveOutput?: string;
  detail?: string;
  startedAt?: string;
}

export interface ProjectSnapshot {
  id: string;
  label: string;
  createdAt: string;
  stage: ProjectStage;
  schemes: Scheme[];
  selectedScheme: Scheme | null;
  episodes: Episode[];
  hiddenStoryPlan: string;
  generatedScript: Script | null;
  score?: number;
}

export interface ProvenanceRecord {
  id: string;
  createdAt: string;
  action: string;
  inputType: InputType;
  outputType: OutputType;
  summary: string;
  content: string;
  contentHash: string;
  contentExcerpt: string;
  modelName?: string;
  reviewModelName?: string;
}

export type ProductionEventStatus = 'started' | 'passed' | 'failed' | 'saved' | 'info';

export interface ProductionEvent {
  id: string;
  createdAt: string;
  type:
    | 'project_created'
    | 'scheme_generation_started'
    | 'scheme_generation_completed'
    | 'scheme_generation_failed'
    | 'scheme_confirmed'
    | 'hidden_plan_started'
    | 'hidden_plan_completed'
    | 'episode_planning_started'
    | 'episode_drafting_started'
    | 'episode_draft_completed'
    | 'episode_check_started'
    | 'episode_repair_started'
    | 'episode_finalized'
    | 'episode_state_blocked'
    | 'generation_stopped'
    | 'generation_failed'
    | 'evaluation_started'
    | 'evaluation_completed'
    | 'evaluation_failed'
    | 'debug_export_created';
  episodeId?: number;
  status: ProductionEventStatus;
  summary: string;
  payload?: Record<string, unknown>;
  error?: string;
  modelName?: string;
  reviewModelName?: string;
}

export type EpisodeJobStep =
  | 'plan'
  | 'validatePlan'
  | 'draft'
  | 'validateDraft'
  | 'repair'
  | 'finalize'
  | 'ledgerPatch';

export type EpisodeJobStatus = 'queued' | 'running' | 'blocked' | 'completed' | 'failed' | 'stopped';

export interface EpisodeJob {
  id: string;
  episodeId: number;
  status: EpisodeJobStatus;
  currentStep: EpisodeJobStep;
  attempts: number;
  repairAttempts: number;
  startedAt: string;
  updatedAt: string;
  deadlineAt: string;
  requiredInputs: {
    previousEpisodeId?: number;
    schemeId?: string;
    hiddenStoryPlanReady?: boolean;
  };
  outputs?: {
    draftContentLength?: number;
    finalContentLength?: number;
    score?: number;
    gatePassed?: boolean;
  };
  blockers: string[];
  lastEventId?: string;
}

export type ProjectRunStatus = 'idle' | 'queued' | 'running' | 'stopped' | 'failed' | 'pilot_ready' | 'completed';

export interface ProjectRunState {
  status: ProjectRunStatus;
  queuedAt?: string;
  startedAt?: string;
  updatedAt: string;
  progress: number;
  message: string;
  activeEpisodeId?: number;
  error?: string;
}

export interface ScriptProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  stage: ProjectStage;
  nextAction: string;
  score?: number;
  config: GenerationConfig;
  schemes: Scheme[];
  selectedScheme: Scheme | null;
  hiddenStoryPlan: string;
  episodes: Episode[];
  finalEpisodes: FinalEpisodeRecord[];
  generatedScript: Script | null;
  snapshots: ProjectSnapshot[];
  provenanceRecords: ProvenanceRecord[];
  productionEvents: ProductionEvent[];
  episodeJobs: EpisodeJob[];
  runState?: ProjectRunState;
}

export interface AppContextType {
  projects: ScriptProject[];
  activeProjectId: string | null;
  activeProject: ScriptProject | null;
  provenanceRecords: ProvenanceRecord[];
  productionEvents: ProductionEvent[];
  episodeJobs: EpisodeJob[];
  exportDebugPackage: () => void;
  createProject: (name?: string, configOverride?: GenerationConfig) => void;
  openProject: (projectId: string) => void;
  closeProject: () => void;
  deleteProject: (projectId: string) => void;
  exportProject: (projectId: string) => void;
  enqueueProjectRun: (projectId: string) => void;
  stopProjectRun: (projectId: string) => void;
  importProject: (file: File) => Promise<void>;
  config: GenerationConfig;
  setConfig: (config: GenerationConfig) => void;
  schemes: Scheme[];
  selectedScheme: Scheme | null;
  setSelectedScheme: (scheme: Scheme | null) => void;
  updateScheme: (schemeId: string, patch: Partial<Scheme>) => void;
  generatedScript: Script | null;
  episodes: Episode[];
  finalEpisodes: FinalEpisodeRecord[];
  currentEpisodeIndex: number;
  generateSchemes: () => void;
  generateScript: (scheme?: Scheme) => void;
  evaluateUserWork: () => void;
  continueGeneration: () => void;
  applyTrialSuggestions: (suggestions: string[]) => void;
  trialRevisionPending: boolean;
  resetToSchemeSelection: () => void;
  stopGeneration: () => void;
  isGenerating: boolean;
  progress: ProgressInfo;
  setProgress: (progress: ProgressInfo | ((current: ProgressInfo) => ProgressInfo)) => void;
}
