import axios from "axios";
import { API_URL } from "@/lib/api";

export type JimengProjectStatus = "draft" | "working" | "has_failed" | "completed";
export type JimengShotStatus = "draft" | "asset_missing" | "queued" | "running" | "failed" | "completed" | "locked";
export type JimengAssetType = "character" | "scene" | "prop";
export type JimengQueueStatus = "waiting" | "running" | "completed" | "failed" | "canceled";
export type JimengPromptScope = "system" | "user";
export type JimengPageMode = "projects" | "workbench" | "assets" | "queue" | "history" | "settings";
export type JimengRightPanelMode = "preview" | "asset_picker";
export type JimengShotMoveDirection = "up" | "down";
export type JimengShotImportFormat = "plain" | "csv";

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
  shot?: JimengShot;
}

export interface JimengBatchDurationDetectionResponse {
  results: JimengDurationDetectionResult[];
  updated_count: number;
  skipped_count: number;
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
}

export interface JimengHighlightSpan {
  text: string;
  asset_type: JimengAssetType;
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
    running_item: JimengQueueItem | null;
    waiting_count: number;
  };
}

export interface JimengSettings {
  dreamina_executable?: string;
  model_version?: string;
  poll_seconds?: number;
  duration?: number;
  ratio?: string;
  video_resolution?: string;
}

export interface JimengVideoGenerationSettings {
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

export const DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS: JimengVideoGenerationSettings = {
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
  listProjects: () =>
    axios.get<JimengProject[]>(`${API_URL}/jimeng/projects`).then((res) => res.data),
  createProject: (data: { name: string; style?: string; description?: string; default_ratio?: string }) =>
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
    axios.post<{ duration: number; shot: JimengShot }>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/detect_duration`).then((res) => res.data),
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
  matchAssets: (projectId: string) =>
    axios.post<JimengMatchAssetsResponse>(`${API_URL}/jimeng/projects/${projectId}/shots/match_assets`).then((res) => res.data),

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
  batchGenerateAssetImages: (
    projectId: string,
    data: { resolution_type?: "2k" | "4k"; poll_seconds?: number; extra_prompt?: string; asset_ids?: string[]; asset_type?: JimengAssetType } = {},
  ) =>
    axios.post<JimengAssetBatchImageGenerationResponse>(`${API_URL}/jimeng/projects/${projectId}/assets/batch_generate_images`, data).then((res) => res.data),
  uploadAssetVoice: (projectId: string, assetId: string, file: File) =>
    axios.post<JimengAsset>(`${API_URL}/jimeng/projects/${projectId}/assets/${assetId}/voice`, formDataWithFile(file), multipartHeaders).then((res) => res.data),
  getAssetVoiceUrl: (projectId: string, assetId: string) =>
    axios.get<{ audio_filename: string | null; audio_path: string | null }>(`${API_URL}/jimeng/projects/${projectId}/assets/${assetId}/voice`).then((res) => res.data),

  listBindings: (projectId: string, shotId: string) =>
    axios.get<JimengAssetBinding[]>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/bindings`).then((res) => res.data),
  createBinding: (projectId: string, shotId: string, data: { asset_id: string; asset_type: JimengAssetType; source?: string; locked?: boolean; slot_order?: number }) =>
    axios.post<JimengAssetBinding>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/bindings`, data).then((res) => res.data),
  deleteBinding: (projectId: string, shotId: string, bindingId: string) =>
    axios.delete<{ deleted: string }>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/bindings/${bindingId}`).then((res) => res.data),
  updateBinding: (projectId: string, shotId: string, bindingId: string, data: { locked?: boolean; voice_enabled?: boolean; slot_order?: number }) =>
    axios.put<JimengAssetBinding>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/bindings/${bindingId}`, data).then((res) => res.data),
  reorderBindings: (projectId: string, shotId: string, bindingIds: string[]) =>
    axios.post<{ bindings: JimengAssetBinding[] }>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/bindings/reorder`, { binding_ids: bindingIds }).then((res) => res.data),

  listQueue: (projectId?: string) =>
    axios.get<JimengQueueEnvelope>(`${API_URL}/jimeng/queue`, { params: { project_id: projectId } }).then((res) => res.data),
  createQueueItem: (item: JimengQueueItemCreate) =>
    axios.post<JimengQueueItem>(`${API_URL}/jimeng/queue/items`, item).then((res) => res.data),
  createQueueItems: (items: JimengQueueItemCreate[]) =>
    axios.post<{ items: JimengQueueItem[] }>(`${API_URL}/jimeng/queue/items/batch`, { items }).then((res) => res.data),
  startQueue: () =>
    axios.post<JimengQueueEnvelope["status"]>(`${API_URL}/jimeng/queue/start`).then((res) => res.data),
  pauseQueue: () =>
    axios.post<{ status: JimengQueueEnvelope["status"] }>(`${API_URL}/jimeng/queue/pause`).then((res) => res.data),
  cancelQueueItem: (queueItemId: string) =>
    axios.post<JimengQueueItem>(`${API_URL}/jimeng/queue/items/${queueItemId}/cancel`).then((res) => res.data),
  retryQueueItem: (queueItemId: string) =>
    axios.post<JimengQueueItem>(`${API_URL}/jimeng/queue/items/${queueItemId}/retry`).then((res) => res.data),
  reorderQueue: (queueItemIds: string[]) =>
    axios.post<{ items: JimengQueueItem[] }>(`${API_URL}/jimeng/queue/reorder`, { queue_item_ids: queueItemIds }).then((res) => res.data),

  listCandidates: (projectId: string, shotId: string) =>
    axios.get<JimengVideoCandidate[]>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/candidates`).then((res) => res.data),
  uploadVideoCandidate: (projectId: string, shotId: string, file: File) =>
    axios.post<JimengVideoCandidate>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/candidates/upload`, formDataWithFile(file), multipartHeaders).then((res) => res.data),
  setDefaultCandidate: (projectId: string, shotId: string, candidateId: string) =>
    axios.post<JimengVideoCandidate>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/candidates/${candidateId}/default`).then((res) => res.data),
  lockCandidate: (projectId: string, shotId: string, candidateId: string, locked = true) =>
    axios.post<JimengVideoCandidate>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/candidates/${candidateId}/lock`, { locked }).then((res) => res.data),
  downloadCandidate: (projectId: string, shotId: string, candidateId: string) =>
    axios.get<Blob>(`${API_URL}/jimeng/projects/${projectId}/shots/${shotId}/candidates/${candidateId}/download`, { responseType: "blob" }).then((res) => res.data),
  batchDownloadCandidates: (projectId: string) =>
    axios.post<{ candidates: JimengVideoCandidate[] }>(`${API_URL}/jimeng/projects/${projectId}/shots/batch_download`).then((res) => res.data),

  getSettings: () =>
    axios.get<JimengSettings>(`${API_URL}/jimeng/settings`).then((res) => res.data),
  updateSettings: (settings: JimengSettings) =>
    axios.put<JimengSettings>(`${API_URL}/jimeng/settings`, settings).then((res) => res.data),
  listCliAccounts: () =>
    axios.get<JimengCliAccountsEnvelope>(`${API_URL}/jimeng/settings/accounts`).then((res) => res.data),
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
