import axios from "axios";
import { API_URL } from "@/lib/api";

export type JimengProjectStatus = "draft" | "working" | "has_failed" | "completed";
export type JimengShotStatus = "draft" | "asset_missing" | "queued" | "running" | "failed" | "completed" | "locked";
export type JimengAssetType = "character" | "scene" | "prop";
export type JimengCharacterKind = "single" | "group";
export type JimengQueueStatus =
  | "waiting"
  | "submitting"
  | "running"
  | "polling"
  | "retry_wait"
  | "blocked"
  | "completed"
  | "failed"
  | "canceled"
  | "orphaned";
export type JimengPromptScope = "system" | "user";
export type JimengPageMode =
  | "creator"
  | "projects"
  | "workbench"
  | "assets"
  | "queue"
  | "history"
  | "llm"
  | "settings"
  | "prompt_manager";
export type JimengRightPanelMode = "preview" | "asset_picker";
export type JimengShotMoveDirection = "up" | "down";
export type JimengShotImportFormat = "plain" | "csv";
export type JimengQueueSortOrder = "asc" | "desc" | "position";
export type PromptManagerCategory = "video" | "creative";
export type PromptManagerTemplateSource = "official" | "user" | "vip";
export type PromptManagerTemplateType =
  | "prompt_reasoning"
  | "story_plot"
  | "character_extract"
  | "scene_extract"
  | "prop_extract"
  | "shot_adjust"
  | "novel_to_storyboard";

export interface PromptManagerTemplate {
  id: string;
  category: PromptManagerCategory;
  type: PromptManagerTemplateType;
  source: PromptManagerTemplateSource;
  name: string;
  content_separator: string;
  record_separator: string;
  output_start: string;
  output_end: string;
  sop_prompt: string;
  content: string;
  variables: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface PromptManagerTemplatePayload {
  category?: PromptManagerCategory;
  type?: PromptManagerTemplateType;
  name?: string;
  content?: string;
  content_separator?: string;
  record_separator?: string;
  output_start?: string;
  output_end?: string;
  sop_prompt?: string;
  variables?: string[];
  enabled?: boolean;
}

export interface JimengProject {
  id: string;
  name: string;
  style: string;
  default_ratio: string;
  prompt_preset_id: string | null;
  description: string;
  shot_count: number;
  status: JimengProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface JimengShot {
  id: string;
  project_id: string;
  shot_index: number;
  prompt: string;
  default_duration: number | null;
  status: JimengShotStatus;
  default_video_candidate_id: string | null;
  locked_video_candidate_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface JimengDurationDetectionResult {
  shot_id: string;
  shot_index: number;
  duration: number | null;
  updated: boolean;
  detected?: boolean;
  shot?: JimengShot;
}

export interface JimengBatchDurationDetectionResponse {
  results: JimengDurationDetectionResult[];
  updated_count: number;
  skipped_count: number;
  undetected_shots?: JimengDurationDetectionResult[];
}

export interface JimengAsset {
  id: string;
  project_id: string;
  type: JimengAssetType;
  name: string;
  aliases: string[];
  description: string;
  image_model: string;
  image_ratio: "16:9" | "9:16";
  image_params: string;
  video_prompt: string;
  character_kind: JimengCharacterKind;
  image_filename: string | null;
  image_path: string | null;
  audio_filename: string | null;
  audio_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface JimengAssetBinding {
  id: string;
  project_id: string;
  shot_id: string;
  asset_id: string;
  asset_type: JimengAssetType;
  source: string;
  locked: boolean;
  voice_enabled: boolean;
  slot_order: number;
  created_at: string;
  updated_at: string;
}

export interface JimengQueueItem {
  id: string;
  project_id: string;
  shot_id: string;
  status: JimengQueueStatus;
  position: number;
  prompt_snapshot: string;
  prompt_preset_id: string | null;
  prefix_prompt_snapshot: string;
  final_prompt_snapshot: string;
  asset_snapshot: Record<string, unknown>;
  cli_command: string;
  poll_seconds: number;
  download_dir: string;
  submit_id: string | null;
  gen_status: string | null;
  result_url: string | null;
  local_video_path: string | null;
  cli_raw_output: string | null;
  error_message: string | null;
  attempt_count?: number;
  next_attempt_at?: string | null;
  last_polled_at?: string | null;
  lease_owner?: string | null;
  lease_expires_at?: string | null;
  submitted_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface JimengVideoCandidate {
  id: string;
  project_id: string;
  shot_id: string;
  queue_item_id: string;
  video_filename: string;
  video_path: string;
  thumbnail_path: string | null;
  duration: number | null;
  ratio: string | null;
  resolution: string | null;
  source_url: string | null;
  is_default: boolean;
  is_locked: boolean;
  created_at: string;
}

export interface JimengCandidatesByShotIdResponse {
  candidates: JimengVideoCandidate[];
  candidates_by_shot_id: Record<string, JimengVideoCandidate[]>;
}

export interface JimengBatchDownloadExportFile {
  shot_id: string;
  shot_index: number;
  candidate_id: string;
  filename: string;
  path: string;
}

export interface JimengBatchDownloadExportResult {
  export_dir: string;
  files: JimengBatchDownloadExportFile[];
  skipped: Array<{
    shot_id: string;
    shot_index: number;
    reason: string;
  }>;
}

export interface JimengCandidateExportResult {
  shot_id: string;
  shot_index: number;
  candidate_id: string;
  filename: string;
  path: string;
}

export type JimengBatchDownloadResponse =
  | { candidates: JimengVideoCandidate[] }
  | JimengBatchDownloadExportResult;

export interface JimengPromptPreset {
  id: string;
  name: string;
  scope: JimengPromptScope;
  content: string;
  variables: string[];
  is_default: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface JimengStylePreset {
  id: string;
  name: string;
  scope: "video" | "image";
  prompt: string;
  accent: string;
  created_at: string;
  updated_at: string;
}

export interface JimengCliAccount {
  id: string;
  label: string;
  profile_dir: string;
  status: string;
  total_credit: string | null;
  user_id: string | null;
  user_name: string | null;
  vip_level: string | null;
  vip_expire_at: string | null;
  last_error: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface JimengCliAccountsEnvelope {
  accounts: JimengCliAccount[];
  total_credit: string | null;
  raw_total_credit?: string | null;
  duplicate_user_ids?: string[];
  total_credit_note?: string | null;
}

export interface JimengCliAccountIsolationDiagnostics {
  supported: boolean | null;
  status: "global_credentials_detected" | "empty_profile_logged_out" | "unknown" | string;
  message: string;
  empty_profile_user_id: string | null;
  empty_profile_total_credit: string | null;
  raw_output: string;
}

export interface JimengRuntimeInfo {
  ok: boolean;
  app: string;
  app_name?: string;
  version?: string;
  pid: number;
  host: string;
  port: number;
  started_at: string;
  project_dir: string;
  data_dir: string;
  output_dir: string;
  is_current?: boolean;
}

export interface JimengSilentVoiceAnalysisResult {
  disabled: Array<{
    shot_id: string;
    shot_index: number;
    binding_id: string;
    asset_id: string;
    asset_name: string;
  }>;
  skipped: Array<{
    shot_id: string;
    shot_index: number;
    binding_id: string;
    reason: string;
  }>;
  disabled_count: number;
}

export interface JimengVersionStatus {
  app_name: string;
  current_version: string;
  latest_version: string;
  update_available: boolean;
  update_required: boolean;
  update_check_url: string;
  update_url: string;
  message: string;
  error: string | null;
  checked_at: string;
}

export interface CreatorModelOption {
  provider_id: string;
  provider_name: string;
  model_id: string;
  model_name: string;
  value: string;
  label: string;
}

export interface CreatorChatFallbackRequest {
  prompt: string;
  model_id?: string;
  fallback_model_id_1?: string;
  fallback_model_id_2?: string;
  timeout_seconds?: number;
  temperature?: number;
  max_tokens?: number;
}

export interface CreatorChatFallbackResponse {
  content: string;
  provider_id: string;
  model_id: string;
  attempts?: Array<{
    provider_id: string;
    model_id: string;
    ok: boolean;
    error?: string | null;
  }>;
}
export interface JimengRuntimeInstancesEnvelope {
  instances: JimengRuntimeInfo[];
  scan_range: {
    start: number;
    end: number;
  };
}

export interface JimengHighlightSpan {
  text: string;
  asset_type: JimengAssetType;
  asset_id?: string;
  bound?: boolean;
  start: number;
  end: number;
}

export interface JimengAssetMatch {
  asset_id: string;
  asset_type: JimengAssetType;
  matched_text: string;
  start: number;
  end: number;
}

export interface JimengMatchAssetsShotResult {
  shot_id: string;
  bindings: JimengAssetBinding[];
  matches: JimengAssetMatch[];
  highlights: JimengHighlightSpan[];
}

export interface JimengMatchAssetsResponse {
  shots: JimengMatchAssetsShotResult[];
}

export interface JimengMatchAssetsRequest {
  shot_ids?: string[];
  clear_existing_auto?: boolean;
}

export interface JimengClearMatchedAssetsShotResult {
  shot_id: string;
  deleted: string[];
  bindings: JimengAssetBinding[];
  highlights: JimengHighlightSpan[];
}

export interface JimengClearMatchedAssetsResponse {
  shots: JimengClearMatchedAssetsShotResult[];
  deleted: string[];
  deleted_count: number;
}

export interface JimengBindingsByShotIdResponse {
  bindings_by_shot_id: Record<string, JimengAssetBinding[]>;
}

export interface JimengPromptPreviewResponse {
  prefix_prompt: string;
  final_prompt: string;
  unresolved_variables: string[];
  final_prompt_snapshot?: string;
}

export interface JimengQueueEnvelope {
  items: JimengQueueItem[];
  status: {
    started: boolean;
    paused: boolean;
    worker_online: boolean;
    worker_id: string | null;
    worker_heartbeat_at: string | null;
    in_flight_count: number;
    running_item: JimengQueueItem | null;
    waiting_count: number;
    last_error: string | null;
  };
}

export interface JimengQueueQueryOptions {
  created_from?: string;
  created_to?: string;
  sort_order?: JimengQueueSortOrder;
}

export interface JimengQueueWorkerStartResponse {
  started: boolean;
  message: string;
  worker_pid?: number | null;
  mode?: string | null;
  script_path?: string | null;
  status: JimengQueueEnvelope["status"];
}

export interface JimengSettings {
  dreamina_executable?: string;
  generation_provider?: "dreamina_cli" | string;
  model_version?: string;
  poll_seconds?: number;
  duration?: number;
  ratio?: string;
  video_resolution?: string;
  submit_interval_seconds?: number;
  max_in_flight?: number;
  result_poll_interval_seconds?: number;
  max_retry_attempts?: number;
  retry_base_seconds?: number;
}
export interface JimengLlmModelSetting {
  id: string;
  name: string;
  type: "text" | "image" | "video" | "audio" | string;
  enabled: boolean;
}

export interface JimengLlmProviderSetting {
  id: string;
  name: string;
  kind: "openai_compatible" | "anthropic_compatible" | "gemini_compatible" | string;
  enabled: boolean;
  base_url: string;
  api_key: string;
  models: JimengLlmModelSetting[];
}

export interface JimengLlmAssetImageSettings {
  global_prompt: string;
  character_prefix: string;
  scene_prefix: string;
  prop_prefix: string;
  size: string;
}

export interface JimengLlmSettings {
  default_provider_id: string;
  default_model_id: string;
  providers: JimengLlmProviderSetting[];
  asset_image: JimengLlmAssetImageSettings;
}

export interface JimengLlmAssetImageGenerationResponse {
  asset: JimengAsset;
  provider: JimengLlmProviderSetting;
  model: JimengLlmModelSetting;
  prompt: string;
  source_path: string;
  result: Record<string, unknown>;
  record?: JimengLlmAssetImageRecord;
  message: string;
}

export interface JimengLlmAssetImageRecordFeedback {
  at: string;
  level: "info" | "success" | "warning" | "error" | string;
  message: string;
  payload?: Record<string, unknown>;
}

export interface JimengLlmAssetImageRecord {
  id: string;
  project_id: string;
  asset_id: string;
  asset_name: string;
  asset_type: JimengAssetType;
  provider_id: string;
  provider_name: string;
  model_id: string;
  model_name: string;
  size: string;
  quality?: string;
  reference_images?: string[];
  prompt: string;
  task_id: string;
  status: "submitted" | "running" | "timeout" | "poll_error" | "succeeded" | "failed" | "canceled" | string;
  state: string;
  progress: string;
  result_url: string;
  result_type: string;
  error: string;
  poll_count: number;
  last_checked_at: string;
  created_at: string;
  updated_at: string;
  source_path?: string;
  asset_image_path?: string;
  asset_image_filename?: string;
  asset_current_image_path?: string;
  asset_current_image_filename?: string;
  feedback: JimengLlmAssetImageRecordFeedback[];
}

export interface JimengLlmAssetImageRecordsEnvelope {
  records: JimengLlmAssetImageRecord[];
  total?: number;
  limit?: number;
  offset?: number;
}

export interface JimengVideoGenerationSettings {
  provider: "dreamina_cli" | string;
  generation_mode: "auto" | "multimodal2video" | "text2video";
  duration_source?: "per_shot" | "global";
  model_version: string;
  duration: number;
  ratio: string;
  video_resolution: string;
  poll_seconds: number;
  account_id?: string;
}

export const JIMENG_VIDEO_MODELS = [
  { value: "seedance2.0fast", label: "Seedance 2.0 Fast" },
  { value: "seedance2.0mini", label: "Seedance 2.0 Mini" },
  { value: "seedance2.0", label: "Seedance 2.0" },
  { value: "seedance2.0fast_vip", label: "Seedance 2.0 Fast VIP" },
  { value: "seedance2.0_vip", label: "Seedance 2.0 VIP" },
] as const;

export const JIMENG_VIDEO_RATIOS = ["1:1", "3:4", "16:9", "4:3", "9:16", "21:9"] as const;
export const JIMENG_VIDEO_DURATION_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 4);

export const clampJimengVideoDuration = (value: unknown): number => {
  if (value === null || value === undefined || value === "") {
    return 5;
  }
  const duration = Number(value);
  if (!Number.isFinite(duration)) {
    return 5;
  }
  return Math.min(15, Math.max(4, Math.round(duration)));
};

export const DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS: JimengVideoGenerationSettings = {
  provider: "dreamina_cli",
  generation_mode: "auto",
  duration_source: "per_shot",
  model_version: "seedance2.0fast",
  duration: 5,
  ratio: "9:16",
  video_resolution: "720p",
  poll_seconds: 30,
  account_id: "",
};

export interface JimengCliResult {
  submit_id: string | null;
  gen_status: string | null;
  result_url: string | null;
  local_paths: string[];
  raw_output: string;
  error_message: string | null;
}

export interface JimengCliInstallResult {
  ok: boolean;
  returncode: number;
  stdout: string;
  stderr: string;
  command: string;
}

export interface JimengCheckLoginResponse {
  logged_in: boolean;
  result: JimengCliResult;
}

export interface JimengLoginAuth {
  url: string;
  user_code?: string | null;
  device_code?: string | null;
  poll_interval?: string | null;
  expires_at?: string | null;
}

export type JimengLoginSessionStatus = "starting" | "running" | "waiting_auth" | "completed" | "failed" | "canceled";

export interface JimengLoginSession {
  session_id: string;
  account_id?: string | null;
  mode: "login" | "login_debug" | "relogin";
  status: JimengLoginSessionStatus;
  auth: JimengLoginAuth | null;
  auth_opened?: boolean;
  auth_open_error?: string | null;
  result: JimengCliResult | null;
  credit_result: JimengCliResult | null;
  raw_output: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  returncode: number | null;
}

export type JimengLoginMode = "login" | "login_debug" | "relogin";

export interface JimengCliCapabilities {
  commands: string[];
  supports_text2image?: boolean;
  supports_text2video: boolean;
  supports_image2video: boolean;
  supports_multimodal2video?: boolean;
  model_versions?: string[];
  image_model_versions?: string[];
  image_resolution_types?: string[];
  ratios?: string[];
  multimodal_limits?: {
    max_images: number;
    max_videos: number;
    max_audios: number;
    audio_min_seconds: number;
    audio_max_seconds: number;
  };
}

export interface JimengQueueItemCreate {
  project_id: string;
  shot_id: string;
  prefix_prompt?: string;
  final_prompt?: string;
  final_prompt_snapshot?: string;
  asset_snapshot?: Record<string, unknown>;
  prompt_preset_id?: string | null;
  cli_command?: string;
  poll_seconds?: number;
  download_dir?: string;
}

export interface JimengAssetMetadataInput {
  type: JimengAssetType;
  name: string;
  aliases?: string[];
  description?: string;
  image_model?: string;
  image_ratio?: "16:9" | "9:16";
  image_params?: string;
  video_prompt?: string;
  character_kind?: JimengCharacterKind;
}

export interface JimengAssetImageGenerationResponse {
  asset: JimengAsset;
  result: JimengCliResult;
  source_path: string | null;
  message: string;
}

export interface JimengAssetBatchImageGenerationResponse {
  results: Array<{
    asset_id: string;
    asset_name: string;
    ok: boolean;
    asset?: JimengAsset;
    result?: JimengCliResult;
    source_path?: string | null;
    message?: string;
    error?: string;
  }>;
  success_count: number;
  failed_count: number;
}

const multipartHeaders = { headers: { "Content-Type": "multipart/form-data" } };

const formDataWithFile = (file: File): FormData => {
  const formData = new FormData();
  formData.append("file", file);
  return formData;
};

export const jimengApi = {
  getRuntimeInfo: () =>
    axios.get<JimengRuntimeInfo>(`${API_URL}/health`).then((res) => res.data),
  getAppVersion: () =>
    axios.get<JimengVersionStatus>(`${API_URL}/app/version`).then((res) => res.data),
  listCreatorModelOptions: () =>
    axios.get<{ options: CreatorModelOption[]; default_model_id: string }>(`${API_URL}/jimeng/creator/model_options`).then((res) => res.data),
  creatorChatFallback: (data: CreatorChatFallbackRequest) =>
    axios.post<CreatorChatFallbackResponse>(`${API_URL}/jimeng/creator/chat/fallback`, data).then((res) => res.data),
  listRuntimeInstances: () =>
    axios.get<JimengRuntimeInstancesEnvelope>(`${API_URL}/runtime/instances`).then((res) => res.data),
  shutdownRuntime: () =>
    axios.post<{ ok: boolean; message: string }>(`${API_URL}/runtime/shutdown`).then((res) => res.data),
  selectDirectory: () =>
    axios.post<{ path: string | null }>(`${API_URL}/runtime/select-directory`).then((res) => res.data),
  listProjects: () =>
    axios.get<JimengProject[]>(`${API_URL}/jimeng/projects`).then((res) => res.data),
  createProject: (data: { name: string; style?: string; description?: string; default_ratio?: string; inherit_source_project_id?: string; inherit_source_shot_id?: string }) =>
    axios.post<JimengProject>(`${API_URL}/jimeng/projects`, data).then((res) => res.data),
  getProject: (projectId: string) =>
    axios.get<JimengProject>(`${API_URL}/jimeng/projects/${projectId}`).then((res) => res.data),
  updateProject: (projectId: string, data: Partial<Pick<JimengProject, "name" | "style" | "description" | "default_ratio" | "prompt_preset_id" | "status">>) =>
    axios.put<JimengProject>(`${API_URL}/jimeng/projects/${projectId}`, data).then((res) => res.data),
  deleteProject: (projectId: string) =>
    axios.delete<{ deleted: string }>(`${API_URL}/jimeng/projects/${projectId}`).then((res) => res.data),
  duplicateProject: (projectId: string) =>
    axios.post<JimengProject>(`${API_URL}/jimeng/projects/${projectId}/duplicate`).then((res) => res.data),

  listShots: (projectId: string) =>
    axios.get<JimengShot[]>(`${API_URL}/jimeng/projects/${projectId}/shots`).then((res) => res.data),
  createShot: (projectId: string, data: { prompt: string }) =>
    axios.post<JimengShot>(`${API_URL}/jimeng/projects/${projectId}/shots`, data).then((res) => res.data),
  importShots: (projectId: string, data: { text: string; format?: JimengShotImportFormat }) =>
    axios.post<{ shots: JimengShot[] }>(`${API_URL}/jimeng/projects/${projectId}/shots/import`, data).then((res) => res.data),
  updateShot: (projectId: string, shotId: string, data: Partial<Pick<JimengShot, "prompt" | "default_duration" | "status" | "default_video_candidate_id" | "locked_video_candidate_id" | "last_error">>) =>
    axios.put<JimengShot>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}`, data).then((res) => res.data),
  detectShotDuration: (projectId: string, shotId: string) =>
    axios.post<{ duration: number; detected?: boolean; shot: JimengShot }>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/detect_duration`).then((res) => res.data),
  batchDetectShotDurations: (projectId: string) =>
    axios.post<JimengBatchDurationDetectionResponse>(`${API_URL}/jimeng/projects/${projectId}/shots/batch_detect_duration`).then((res) => res.data),
  deleteShot: (projectId: string, shotId: string) =>
    axios.delete<{ deleted: string }>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}`).then((res) => res.data),
  batchDeleteShots: (projectId: string, shotIds: string[]) =>
    axios.post<{ deleted: string[] }>(`${API_URL}/jimeng/projects/${projectId}/shots/batch_delete`, { shot_ids: shotIds }).then((res) => res.data),
  moveShot: (projectId: string, shotId: string, direction: JimengShotMoveDirection) =>
    axios.post<JimengShot>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/move`, { direction }).then((res) => res.data),
  batchReplaceShots: (projectId: string, data: { find: string; replace: string }) =>
    axios.post<{ shots: JimengShot[] }>(`${API_URL}/jimeng/projects/${projectId}/shots/batch_replace`, data).then((res) => res.data),
  matchAssets: (projectId: string, data: JimengMatchAssetsRequest = {}) =>
    axios.post<JimengMatchAssetsResponse>(`${API_URL}/jimeng/projects/${projectId}/shots/match_assets`, data).then((res) => res.data),
  clearMatchedAssets: (projectId: string, data: { shot_ids: string[] }) =>
    axios.post<JimengClearMatchedAssetsResponse>(`${API_URL}/jimeng/projects/${projectId}/shots/clear_matched_assets`, data).then((res) => res.data),
  analyzeSilentVoice: (projectId: string, data: { shot_ids?: string[] } = {}) =>
    axios.post<JimengSilentVoiceAnalysisResult>(`${API_URL}/jimeng/projects/${projectId}/shots/analyze_silent_voice`, data).then((res) => res.data),

  listAssets: (projectId: string, type?: JimengAssetType) =>
    axios.get<JimengAsset[]>(`${API_URL}/jimeng/projects/${projectId}/assets`, { params: { type } }).then((res) => res.data),
  createAsset: (projectId: string, data: JimengAssetMetadataInput) =>
    axios.post<JimengAsset>(`${API_URL}/jimeng/projects/${projectId}/assets`, data).then((res) => res.data),
  batchUploadAssets: (projectId: string, assets: JimengAssetMetadataInput[]) =>
    axios.post<{ assets: JimengAsset[] }>(`${API_URL}/jimeng/projects/${projectId}/assets/batch_upload`, assets).then((res) => res.data),
  importAssetMetadata: (projectId: string, data: { format: "json" | "csv"; text: string }) =>
    axios.post<{ assets: JimengAsset[] }>(`${API_URL}/jimeng/projects/${projectId}/assets/import_metadata`, data).then((res) => res.data),
  exportAssetMetadata: (projectId: string) =>
    axios.get<{ assets: JimengAsset[] }>(`${API_URL}/jimeng/projects/${projectId}/assets/export_metadata`).then((res) => res.data),
  exportAssetImages: (projectId: string, assetType?: JimengAssetType) =>
    axios.get<Blob>(`${API_URL}/jimeng/projects/${projectId}/assets/export_images`, { params: { asset_type: assetType }, responseType: "blob" }).then((res) => res.data),
  batchUploadAssetFiles: (projectId: string, assetType: JimengAssetType, files: File[], imageRatio: "16:9" | "9:16" = "16:9") => {
    const formData = new FormData();
    formData.append("asset_type", assetType);
    formData.append("image_ratio", imageRatio);
    files.forEach((file) => formData.append("files", file));
    return axios.post<{ assets: JimengAsset[] }>(`${API_URL}/jimeng/projects/${projectId}/assets/batch_upload`, formData, multipartHeaders).then((res) => res.data);
  },
  uploadAssetReferenceImage: (file: File) =>
    axios.post<{ filename: string; path: string; url: string }>(`${API_URL}/jimeng/assets/reference_images`, formDataWithFile(file), multipartHeaders).then((res) => res.data),
  updateAsset: (projectId: string, assetId: string, data: Partial<Omit<JimengAssetMetadataInput, "type">>) =>
    axios.put<JimengAsset>(`${API_URL}/jimeng/projects/${projectId}/assets/${assetId}`, data).then((res) => res.data),
  deleteAsset: (projectId: string, assetId: string) =>
    axios.delete<{ deleted: string }>(`${API_URL}/jimeng/projects/${projectId}/assets/${assetId}`).then((res) => res.data),
  batchDeleteAssets: (projectId: string, assetIds: string[]) =>
    axios.post<{ deleted: string[] }>(`${API_URL}/jimeng/projects/${projectId}/assets/batch_delete`, { asset_ids: assetIds }).then((res) => res.data),
  uploadAssetImage: (projectId: string, assetId: string, file: File) =>
    axios.post<JimengAsset>(`${API_URL}/jimeng/projects/${projectId}/assets/${assetId}/image`, formDataWithFile(file), multipartHeaders).then((res) => res.data),
  generateAssetImage: (projectId: string, assetId: string, data: { resolution_type?: "2k" | "4k"; poll_seconds?: number; extra_prompt?: string } = {}) =>
    axios.post<JimengAssetImageGenerationResponse>(`${API_URL}/jimeng/projects/${projectId}/assets/${assetId}/image/generate`, data).then((res) => res.data),
  generateAssetImageWithLlm: (
    projectId: string,
    assetId: string,
    data: { provider_id?: string; model_id?: string; size?: string; quality?: string; reference_images?: string[]; extra_prompt?: string } = {},
  ) =>
    axios
      .post<JimengLlmAssetImageGenerationResponse>(`${API_URL}/jimeng/projects/${projectId}/assets/${assetId}/llm_image/generate`, data)
      .then((res) => res.data),
  batchGenerateAssetImages: (
    projectId: string,
    data: { resolution_type?: "2k" | "4k"; poll_seconds?: number; extra_prompt?: string; asset_ids?: string[]; asset_type?: JimengAssetType } = {},
  ) =>
    axios.post<JimengAssetBatchImageGenerationResponse>(`${API_URL}/jimeng/projects/${projectId}/assets/batch_generate_images`, data).then((res) => res.data),
  batchGenerateAssetImagesWithLlm: (
    projectId: string,
    data: { provider_id?: string; model_id?: string; size?: string; quality?: string; reference_images?: string[]; extra_prompt?: string; asset_ids?: string[]; asset_type?: JimengAssetType } = {},
  ) =>
    axios
      .post<JimengAssetBatchImageGenerationResponse>(`${API_URL}/jimeng/projects/${projectId}/assets/llm_image/batch_generate`, data)
      .then((res) => res.data),
  listLlmAssetImageRecords: (projectId?: string, options: { status?: string; limit?: number; offset?: number } = {}) =>
    axios
      .get<JimengLlmAssetImageRecordsEnvelope>(`${API_URL}/jimeng/llm/asset_image_records`, {
        params: {
          project_id: projectId,
          status: options.status,
          limit: options.limit,
          offset: options.offset,
        },
      })
      .then((res) => res.data),
  pollLlmAssetImageRecords: (data: { project_id?: string; record_ids?: string[]; limit?: number; auto_cancel_minutes?: number | null; force?: boolean } = {}) =>
    axios.post<{ records: JimengLlmAssetImageRecord[] }>(`${API_URL}/jimeng/llm/asset_image_records/poll`, data).then((res) => res.data),
  pollLlmAssetImageRecord: (recordId: string, data: { auto_cancel_minutes?: number | null; force?: boolean } = {}) =>
    axios.post<JimengLlmAssetImageRecord>(`${API_URL}/jimeng/llm/asset_image_records/${recordId}/poll`, null, { params: data }).then((res) => res.data),
  applyLlmAssetImageRecord: (recordId: string) =>
    axios.post<{ asset: JimengAsset; record: JimengLlmAssetImageRecord }>(`${API_URL}/jimeng/llm/asset_image_records/${recordId}/apply`).then((res) => res.data),
  cancelLlmAssetImageRecord: (recordId: string) =>
    axios.post<JimengLlmAssetImageRecord>(`${API_URL}/jimeng/llm/asset_image_records/${recordId}/cancel`).then((res) => res.data),
  deleteLlmAssetImageRecord: (recordId: string) =>
    axios.delete<{ deleted: string }>(`${API_URL}/jimeng/llm/asset_image_records/${recordId}`).then((res) => res.data),
  batchDeleteLlmAssetImageRecords: (recordIds: string[]) =>
    axios.post<{ deleted: string[] }>(`${API_URL}/jimeng/llm/asset_image_records/batch_delete`, { record_ids: recordIds }).then((res) => res.data),
  uploadAssetVoice: (projectId: string, assetId: string, file: File) =>
    axios.post<JimengAsset>(`${API_URL}/jimeng/projects/${projectId}/assets/${assetId}/voice`, formDataWithFile(file), multipartHeaders).then((res) => res.data),
  getAssetVoiceUrl: (projectId: string, assetId: string) =>
    axios.get<{ audio_filename: string | null; audio_path: string | null }>(`${API_URL}/jimeng/projects/${projectId}/assets/${assetId}/voice`).then((res) => res.data),

  listBindings: (projectId: string, shotId: string) =>
    axios.get<JimengAssetBinding[]>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/bindings`).then((res) => res.data),
  listBindingsByShotIds: (projectId: string, shotIds: string[] = []) =>
    axios
      .get<JimengBindingsByShotIdResponse>(`${API_URL}/jimeng/projects/${projectId}/bindings`, {
        params: { shot_ids: shotIds.join(",") },
      })
      .then((res) => res.data),
  createBinding: (projectId: string, shotId: string, data: { asset_id: string; asset_type: JimengAssetType; source?: string; locked?: boolean; slot_order?: number }) =>
    axios.post<JimengAssetBinding>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/bindings`, data).then((res) => res.data),
  deleteBinding: (projectId: string, shotId: string, bindingId: string) =>
    axios.delete<{ deleted: string }>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/bindings/${bindingId}`).then((res) => res.data),
  updateBinding: (projectId: string, shotId: string, bindingId: string, data: { locked?: boolean; voice_enabled?: boolean; slot_order?: number }) =>
    axios.put<JimengAssetBinding>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/bindings/${bindingId}`, data).then((res) => res.data),
  reorderBindings: (projectId: string, shotId: string, bindingIds: string[]) =>
    axios.post<{ bindings: JimengAssetBinding[] }>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/bindings/reorder`, { binding_ids: bindingIds }).then((res) => res.data),

  listQueue: (projectId?: string, options: JimengQueueQueryOptions = {}) =>
    axios
      .get<JimengQueueEnvelope>(`${API_URL}/jimeng/queue`, {
        params: {
          project_id: projectId,
          created_from: options.created_from,
          created_to: options.created_to,
          sort_order: options.sort_order,
        },
      })
      .then((res) => res.data),
  createQueueItem: (item: JimengQueueItemCreate) =>
    axios.post<JimengQueueItem>(`${API_URL}/jimeng/queue/items`, item).then((res) => res.data),
  createQueueItems: (items: JimengQueueItemCreate[]) =>
    axios.post<{ items: JimengQueueItem[] }>(`${API_URL}/jimeng/queue/items/batch`, { items }).then((res) => res.data),
  startQueue: () =>
    axios.post<JimengQueueEnvelope["status"]>(`${API_URL}/jimeng/queue/start`).then((res) => res.data),
  startQueueWorker: () =>
    axios.post<JimengQueueWorkerStartResponse>(`${API_URL}/jimeng/queue/worker/start`).then((res) => res.data),
  pauseQueue: () =>
    axios.post<{ status: JimengQueueEnvelope["status"] }>(`${API_URL}/jimeng/queue/pause`).then((res) => res.data),
  cancelQueueItem: (queueItemId: string) =>
    axios.post<JimengQueueItem>(`${API_URL}/jimeng/queue/items/${queueItemId}/cancel`).then((res) => res.data),
  deleteQueueItem: (queueItemId: string) =>
    axios.delete<{ deleted_id: string }>(`${API_URL}/jimeng/queue/items/${queueItemId}`).then((res) => res.data),
  retryQueueItem: (queueItemId: string) =>
    axios.post<JimengQueueItem>(`${API_URL}/jimeng/queue/items/${queueItemId}/retry`).then((res) => res.data),
  pollQueueItem: (queueItemId: string) =>
    axios.post<JimengQueueItem>(`${API_URL}/jimeng/queue/items/${queueItemId}/poll`).then((res) => res.data),
  reorderQueue: (queueItemIds: string[]) =>
    axios.post<{ items: JimengQueueItem[] }>(`${API_URL}/jimeng/queue/reorder`, { queue_item_ids: queueItemIds }).then((res) => res.data),

  listCandidates: (projectId: string, shotId: string) =>
    axios.get<JimengVideoCandidate[]>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/candidates`).then((res) => res.data),
  listCandidatesByShotIds: (projectId: string, shotIds: string[] = [], limitPerShot = 0) =>
    axios
      .get<JimengCandidatesByShotIdResponse>(`${API_URL}/jimeng/projects/${projectId}/candidates`, {
        params: { shot_ids: shotIds.join(","), limit_per_shot: limitPerShot },
      })
      .then((res) => res.data),
  uploadVideoCandidate: (projectId: string, shotId: string, file: File) =>
    axios.post<JimengVideoCandidate>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/candidates/upload`, formDataWithFile(file), multipartHeaders).then((res) => res.data),
  setDefaultCandidate: (projectId: string, shotId: string, candidateId: string) =>
    axios.post<JimengVideoCandidate>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/candidates/${candidateId}/default`).then((res) => res.data),
  lockCandidate: (projectId: string, shotId: string, candidateId: string, locked = true) =>
    axios.post<JimengVideoCandidate>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/candidates/${candidateId}/lock`, { locked }).then((res) => res.data),
  downloadCandidate: (projectId: string, shotId: string, candidateId: string) =>
    axios.get<Blob>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/candidates/${candidateId}/download`, { responseType: "blob" }).then((res) => res.data),
  exportCandidate: (projectId: string, shotId: string, candidateId: string, data: { target_dir: string; overwrite?: boolean }) =>
    axios.post<JimengCandidateExportResult>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/candidates/${candidateId}/export`, data).then((res) => res.data),
  batchDownloadCandidates: (projectId: string, data: { target_dir?: string; shot_ids?: string[] } = {}) =>
    axios.post<JimengBatchDownloadResponse>(`${API_URL}/jimeng/projects/${projectId}/shots/batch_download`, data).then((res) => res.data),

  getSettings: () =>
    axios.get<JimengSettings>(`${API_URL}/jimeng/settings`).then((res) => res.data),
  updateSettings: (settings: JimengSettings) =>
    axios.put<JimengSettings>(`${API_URL}/jimeng/settings`, settings).then((res) => res.data),
  getLlmSettings: () =>
    axios.get<JimengLlmSettings>(`${API_URL}/jimeng/llm/settings`).then((res) => res.data),
  updateLlmSettings: (settings: JimengLlmSettings) =>
    axios.put<JimengLlmSettings>(`${API_URL}/jimeng/llm/settings`, settings).then((res) => res.data),
  listCliAccounts: () =>
    axios.get<JimengCliAccountsEnvelope>(`${API_URL}/jimeng/settings/accounts`).then((res) => res.data),
  getCliAccountIsolationDiagnostics: () =>
    axios.get<JimengCliAccountIsolationDiagnostics>(`${API_URL}/jimeng/settings/accounts/isolation_diagnostics`).then((res) => res.data),
  createCliAccount: (data: { label: string }) =>
    axios.post<JimengCliAccount>(`${API_URL}/jimeng/settings/accounts`, data).then((res) => res.data),
  updateCliAccount: (accountId: string, data: { label?: string }) =>
    axios.put<JimengCliAccount>(`${API_URL}/jimeng/settings/accounts/${accountId}`, data).then((res) => res.data),
  deleteCliAccount: (accountId: string) =>
    axios.delete<{ deleted: string }>(`${API_URL}/jimeng/settings/accounts/${accountId}`).then((res) => res.data),
  setDefaultCliAccount: (accountId: string) =>
    axios.post<JimengCliAccount>(`${API_URL}/jimeng/settings/accounts/${accountId}/default`).then((res) => res.data),
  checkCliAccountLogin: (accountId: string) =>
    axios.post<JimengCheckLoginResponse & { account: JimengCliAccount }>(`${API_URL}/jimeng/settings/accounts/${accountId}/check_login`).then((res) => res.data),
  queryCliAccountCredit: (accountId: string) =>
    axios.post<{ account: JimengCliAccount; result: JimengCliResult }>(`${API_URL}/jimeng/settings/accounts/${accountId}/query_credit`).then((res) => res.data),
  logoutCliAccount: (accountId: string) =>
    axios.post<{ account: JimengCliAccount; result: JimengCliResult }>(`${API_URL}/jimeng/settings/accounts/${accountId}/logout`).then((res) => res.data),
  importCliAccountLoginJson: (accountId: string, credentialJson: Record<string, unknown> | string) =>
    axios
      .post<{ account: JimengCliAccount; result: JimengCliResult; credit_result: JimengCliResult | null }>(
        `${API_URL}/jimeng/settings/accounts/${accountId}/login_json`,
        { credential_json: credentialJson },
      )
      .then((res) => res.data),
  importLoginJson: (credentialJson: Record<string, unknown> | string) =>
    axios
      .post<{ result: JimengCliResult; credit_result: JimengCliResult | null }>(
        `${API_URL}/jimeng/settings/login_json`,
        { credential_json: credentialJson },
      )
      .then((res) => res.data),
  startCliAccountLoginSession: (accountId: string, mode: JimengLoginMode = "login", openBrowser = true) =>
    axios.post<JimengLoginSession>(`${API_URL}/jimeng/settings/accounts/${accountId}/login/start`, { mode, open_browser: openBrowser }).then((res) => res.data),
  checkCli: () =>
    axios.post<{ available: boolean }>(`${API_URL}/jimeng/settings/check_cli`).then((res) => res.data),
  installCli: () =>
    axios.post<JimengCliInstallResult>(`${API_URL}/jimeng/settings/install_cli`).then((res) => res.data),
  checkLogin: () =>
    axios.post<JimengCheckLoginResponse>(`${API_URL}/jimeng/settings/check_login`).then((res) => res.data),
  startLoginSession: (mode: JimengLoginMode = "login", openBrowser = true, accountId?: string) =>
    axios.post<JimengLoginSession>(`${API_URL}/jimeng/settings/login/start`, { mode, open_browser: openBrowser, account_id: accountId }).then((res) => res.data),
  getLoginSession: (sessionId: string) =>
    axios.get<JimengLoginSession>(`${API_URL}/jimeng/settings/login_sessions/${sessionId}`).then((res) => res.data),
  cancelLoginSession: (sessionId: string) =>
    axios.post<JimengLoginSession>(`${API_URL}/jimeng/settings/login_sessions/${sessionId}/cancel`).then((res) => res.data),
  login: () =>
    axios.post<JimengCliResult>(`${API_URL}/jimeng/settings/login`).then((res) => res.data),
  loginDebug: () =>
    axios.post<JimengCliResult>(`${API_URL}/jimeng/settings/login_debug`).then((res) => res.data),
  relogin: () =>
    axios.post<JimengCliResult>(`${API_URL}/jimeng/settings/relogin`).then((res) => res.data),
  logout: () =>
    axios.post<JimengCliResult>(`${API_URL}/jimeng/settings/logout`).then((res) => res.data),
  queryCredit: () =>
    axios.post<JimengCliResult>(`${API_URL}/jimeng/settings/query_credit`).then((res) => res.data),
  cliPaths: () =>
    axios.get<{ config: string | null; tasks: string | null; logs: string | null }>(`${API_URL}/jimeng/settings/cli_paths`).then((res) => res.data),
  capabilities: () =>
    axios.get<JimengCliCapabilities>(`${API_URL}/jimeng/settings/cli_capabilities`).then((res) => res.data),

  listPromptManagerTemplates: (options: { type?: PromptManagerTemplateType; category?: PromptManagerCategory } = {}) =>
    axios
      .get<PromptManagerTemplate[]>(`${API_URL}/jimeng/prompt-manager/templates`, {
        params: { type: options.type, category: options.category },
      })
      .then((res) => res.data),
  createPromptManagerTemplate: (data: Required<Pick<PromptManagerTemplatePayload, "category" | "type" | "name">> & PromptManagerTemplatePayload) =>
    axios.post<PromptManagerTemplate>(`${API_URL}/jimeng/prompt-manager/templates`, data).then((res) => res.data),
  updatePromptManagerTemplate: (templateId: string, data: PromptManagerTemplatePayload) =>
    axios.put<PromptManagerTemplate>(`${API_URL}/jimeng/prompt-manager/templates/${templateId}`, data).then((res) => res.data),
  deletePromptManagerTemplate: (templateId: string) =>
    axios.delete<{ deleted: string }>(`${API_URL}/jimeng/prompt-manager/templates/${templateId}`).then((res) => res.data),
  duplicatePromptManagerTemplate: (templateId: string) =>
    axios.post<PromptManagerTemplate>(`${API_URL}/jimeng/prompt-manager/templates/${templateId}/duplicate`).then((res) => res.data),
  getPromptManagerFullPrompt: (templateId: string) =>
    axios.get<{ full_prompt: string }>(`${API_URL}/jimeng/prompt-manager/templates/${templateId}/full-prompt`).then((res) => res.data),
  listPromptPresets: (enabledOnly = false) =>
    axios.get<JimengPromptPreset[]>(`${API_URL}/jimeng/prompt_presets`, { params: { enabled_only: enabledOnly } }).then((res) => res.data),
  createPromptPreset: (data: { name: string; scope?: JimengPromptScope; content: string; variables?: string[]; is_default?: boolean; enabled?: boolean }) =>
    axios.post<JimengPromptPreset>(`${API_URL}/jimeng/prompt_presets`, data).then((res) => res.data),
  updatePromptPreset: (presetId: string, data: Partial<Pick<JimengPromptPreset, "name" | "scope" | "content" | "variables" | "is_default" | "enabled">>) =>
    axios.put<JimengPromptPreset>(`${API_URL}/jimeng/prompt_presets/${presetId}`, data).then((res) => res.data),
  deletePromptPreset: (presetId: string) =>
    axios.delete<{ deleted: string }>(`${API_URL}/jimeng/prompt_presets/${presetId}`).then((res) => res.data),
  setDefaultPromptPreset: (presetId: string) =>
    axios.post<JimengPromptPreset>(`${API_URL}/jimeng/prompt_presets/${presetId}/default`).then((res) => res.data),
  setProjectPromptPreset: (projectId: string, promptPresetId: string | null) =>
    axios.post<JimengProject>(`${API_URL}/jimeng/projects/${projectId}/prompt_preset`, { prompt_preset_id: promptPresetId }).then((res) => res.data),
  renderPromptPreview: (projectId: string, shotId: string, data: { prompt_preset_id?: string | null; content?: string; camera?: string; era?: string } = {}) =>
    axios.post<JimengPromptPreviewResponse>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/render_prompt_preview`, data).then((res) => res.data),

  listStylePresets: (scope?: "video" | "image") =>
    axios.get<JimengStylePreset[]>(`${API_URL}/jimeng/style_presets`, { params: { scope } }).then((res) => res.data),
  createStylePreset: (data: { name: string; prompt?: string; scope?: "video" | "image"; accent?: string }) =>
    axios.post<JimengStylePreset>(`${API_URL}/jimeng/style_presets`, data).then((res) => res.data),
  updateStylePreset: (presetId: string, data: Partial<Pick<JimengStylePreset, "name" | "prompt" | "scope" | "accent">>) =>
    axios.put<JimengStylePreset>(`${API_URL}/jimeng/style_presets/${presetId}`, data).then((res) => res.data),
  deleteStylePreset: (presetId: string) =>
    axios.delete<{ deleted: string }>(`${API_URL}/jimeng/style_presets/${presetId}`).then((res) => res.data),
};
