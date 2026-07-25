import { create } from "zustand";
import {
  clampJimengVideoDuration,
  jimengApi,
  type JimengAsset,
  type JimengAssetBinding,
  type JimengClearMatchedAssetsResponse,
  type JimengHighlightSpan,
  type JimengMatchAssetsResponse,
  type JimengPageMode,
  type JimengPromptPreviewResponse,
  type JimengProject,
  type JimengPromptPreset,
  type JimengQueueEnvelope,
  type JimengQueueQueryOptions,
  type JimengQueueItemCreate,
  type JimengQueueItem,
  type JimengRightPanelMode,
  type JimengShot,
  type JimengVideoCandidate,
  type JimengVideoGenerationSettings,
} from "@/lib/jimengApi";
import { calculatePromptHighlights } from "@/components/jimeng/promptHighlight";

export interface JimengVideoState {
  hasVideo: boolean;
  defaultCandidateId: string | null;
  lockedCandidateId: string | null;
}

export interface JimengStateData {
  activePage: JimengPageMode;
  rightPanelMode: JimengRightPanelMode;
  projects: JimengProject[];
  currentProject: JimengProject | null;
  shots: JimengShot[];
  assets: JimengAsset[];
  bindingsByShotId: Record<string, JimengAssetBinding[]>;
  highlightsByShotId: Record<string, JimengHighlightSpan[]>;
  videoStateByShotId: Record<string, JimengVideoState>;
  queue: JimengQueueItem[];
  queueStatus: JimengQueueEnvelope["status"] | null;
  promptPresets: JimengPromptPreset[];
  selectedShotIds: string[];
  selectedShotId: string | null;
  loading: boolean;
  error: string | null;
}

export interface JimengStore extends JimengStateData {
  loadProjects: () => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  loadProjectData: (projectId?: string) => Promise<void>;
  loadProjectAssets: (projectId?: string) => Promise<void>;
  refreshShotAssetsAndBindings: (projectId: string, shotId: string) => Promise<void>;
  saveShotPrompt: (projectId: string, shotId: string, prompt: string) => Promise<JimengShot>;
  setActivePage: (page: JimengPageMode) => void;
  setRightPanelMode: (mode: JimengRightPanelMode) => void;
  toggleShotSelection: (shotId: string, checked: boolean) => void;
  setShotSelection: (shotIds: string[]) => void;
  clearShotSelection: () => void;
  submitShots: (shotIds: string[], generationSettings?: JimengVideoGenerationSettings) => Promise<void>;
  submitSelectedShots: (generationSettings?: JimengVideoGenerationSettings) => Promise<void>;
  matchAssets: (shotIds: string[], options?: { clearExistingAuto?: boolean }) => Promise<JimengMatchAssetsResponse | undefined>;
  clearMatchedAssets: (shotIds: string[]) => Promise<JimengClearMatchedAssetsResponse | undefined>;
  loadQueue: (scope?: "currentProject" | "global", options?: JimengQueueQueryOptions) => Promise<void>;
  startQueue: () => Promise<void>;
  startQueueWorker: () => Promise<void>;
  pauseQueue: () => Promise<void>;
  cancelQueueItem: (queueItemId: string) => Promise<void>;
  deleteQueueItem: (queueItemId: string) => Promise<void>;
  retryQueueItem: (queueItemId: string) => Promise<void>;
  pollQueueItem: (queueItemId: string) => Promise<void>;
  reorderQueue: (queueItemIds: string[]) => Promise<void>;
}

export const createJimengInitialState = (): JimengStateData => ({
  activePage: "projects",
  rightPanelMode: "preview",
  projects: [],
  currentProject: null,
  shots: [],
  assets: [],
  bindingsByShotId: {},
  highlightsByShotId: {},
  videoStateByShotId: {},
  queue: [],
  queueStatus: null,
  promptPresets: [],
  selectedShotIds: [],
  selectedShotId: null,
  loading: false,
  error: null,
});

export const moveSelectedShotIds = (selectedShotIds: string[], shotId: string, checked: boolean): string[] => {
  if (checked) {
    return selectedShotIds.includes(shotId) ? selectedShotIds : [...selectedShotIds, shotId];
  }
  return selectedShotIds.filter((id) => id !== shotId);
};

export const buildHighlightsByShotId = (response: JimengMatchAssetsResponse): Record<string, JimengHighlightSpan[]> =>
  Object.fromEntries(response.shots.map((shot) => [shot.shot_id, shot.highlights]));

export const finalPromptSnapshotFromPreview = (preview: JimengPromptPreviewResponse): string =>
  preview.final_prompt_snapshot ?? preview.final_prompt;

const errorMessageFrom = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "Jimeng request failed";
};

const buildBindingsByShotId = async (projectId: string, shots: JimengShot[]): Promise<Record<string, JimengAssetBinding[]>> => {
  if (shots.length === 0) {
    return {};
  }
  const response = await jimengApi.listBindingsByShotIds(projectId, shots.map((shot) => shot.id));
  return Object.fromEntries(shots.map((shot) => [shot.id, response.bindings_by_shot_id[shot.id] ?? []]));
};

const videoStateFromCandidates = (shot: JimengShot, candidates: JimengVideoCandidate[]): JimengVideoState => {
  const lockedCandidateId = candidates.find((candidate) => candidate.is_locked)?.id ?? shot.locked_video_candidate_id ?? null;
  const defaultCandidateId = candidates.find((candidate) => candidate.is_default)?.id ?? shot.default_video_candidate_id ?? null;
  return {
    hasVideo: candidates.length > 0 || Boolean(lockedCandidateId || defaultCandidateId),
    defaultCandidateId,
    lockedCandidateId,
  };
};

const buildVideoStateByShotId = async (projectId: string, shots: JimengShot[]): Promise<Record<string, JimengVideoState>> => {
  if (shots.length === 0) {
    return {};
  }
  const response = await jimengApi.listCandidatesByShotIds(projectId, shots.map((shot) => shot.id));
  return Object.fromEntries(shots.map((shot) => [shot.id, videoStateFromCandidates(shot, response.candidates_by_shot_id[shot.id] ?? [])]));
};

const calculateBoundPromptHighlights = (prompt: string, assets: JimengAsset[], bindings: JimengAssetBinding[]): JimengHighlightSpan[] => {
  const boundAssetIds = new Set(bindings.map((binding) => binding.asset_id));
  return calculatePromptHighlights(prompt, assets).map((span) => ({
    ...span,
    bound: span.asset_id ? boundAssetIds.has(span.asset_id) : false,
  }));
};

const buildBoundHighlightsByShotId = (
  shots: JimengShot[],
  assets: JimengAsset[],
  bindingsByShotId: Record<string, JimengAssetBinding[]>,
): Record<string, JimengHighlightSpan[]> =>
  Object.fromEntries(shots.map((shot) => [shot.id, calculateBoundPromptHighlights(shot.prompt, assets, bindingsByShotId[shot.id] ?? [])]));

const buildQueueItemsForShots = async (
  project: JimengProject,
  knownShots: JimengShot[],
  shotIds: string[],
  generationSettings?: JimengVideoGenerationSettings,
): Promise<JimengQueueItemCreate[]> => {
  return Promise.all(
    shotIds.map(async (shotId) => {
      const shot = knownShots.find((item) => item.id === shotId);
      const perShotSettings =
        generationSettings && generationSettings.duration_source !== "global" && shot?.default_duration != null
          ? { ...generationSettings, duration: clampJimengVideoDuration(shot.default_duration) }
          : generationSettings;
      const preview = await jimengApi.renderPromptPreview(project.id, shotId, {
        prompt_preset_id: project.prompt_preset_id,
      });
      return {
        project_id: project.id,
        shot_id: shotId,
        prompt_preset_id: project.prompt_preset_id,
        final_prompt_snapshot: finalPromptSnapshotFromPreview(preview),
        poll_seconds: perShotSettings?.poll_seconds,
        asset_snapshot: perShotSettings ? { generation_settings: perShotSettings } : undefined,
      };
    }),
  );
};

let latestProjectDataRequestId = 0;

export const useJimengStore = create<JimengStore>((set, get) => ({
  ...createJimengInitialState(),

  loadProjects: async () => {
    set({ loading: true, error: null });
    try {
      const projects = await jimengApi.listProjects();
      set({ projects, loading: false });
    } catch (error) {
      set({ error: errorMessageFrom(error), loading: false });
    }
  },

  selectProject: async (projectId: string) => {
    set({ loading: true, error: null });
    try {
      const currentProject = await jimengApi.getProject(projectId);
      set({ currentProject, activePage: "workbench" });
      await get().loadProjectData(projectId);
    } catch (error) {
      set({ error: errorMessageFrom(error), loading: false });
    }
  },

  loadProjectData: async (projectId?: string) => {
    const targetProjectId = projectId ?? get().currentProject?.id;
    if (!targetProjectId) {
      set({ error: "No Jimeng project selected", loading: false });
      return;
    }

    const requestId = ++latestProjectDataRequestId;
    set({ loading: true, error: null });
    try {
      const [currentProject, shots, assets, queueEnvelope, promptPresets] = await Promise.all([
        jimengApi.getProject(targetProjectId),
        jimengApi.listShots(targetProjectId),
        jimengApi.listAssets(targetProjectId),
        jimengApi.listQueue(targetProjectId),
        jimengApi.listPromptPresets(),
      ]);
      const [bindingsByShotId, videoStateByShotId] = await Promise.all([
        buildBindingsByShotId(targetProjectId, shots),
        buildVideoStateByShotId(targetProjectId, shots),
      ]);

      if (requestId !== latestProjectDataRequestId) {
        return;
      }

      set({
        currentProject,
        shots,
        assets,
        bindingsByShotId,
        videoStateByShotId,
        highlightsByShotId: buildBoundHighlightsByShotId(shots, assets, bindingsByShotId),
        queue: queueEnvelope.items,
        queueStatus: queueEnvelope.status,
        promptPresets,
        selectedShotIds: get().selectedShotIds.filter((id) => shots.some((shot) => shot.id === id)),
        selectedShotId: shots.some((shot) => shot.id === get().selectedShotId) ? get().selectedShotId : null,
        loading: false,
      });
    } catch (error) {
      if (requestId === latestProjectDataRequestId) {
        set({ error: errorMessageFrom(error), loading: false });
      }
    }
  },

  loadProjectAssets: async (projectId?: string) => {
    const targetProjectId = projectId ?? get().currentProject?.id;
    if (!targetProjectId) {
      set({ error: "No Jimeng project selected", loading: false });
      return;
    }

    set({ loading: true, error: null });
    try {
      const [currentProject, assets] = await Promise.all([
        jimengApi.getProject(targetProjectId),
        jimengApi.listAssets(targetProjectId),
      ]);
      set((state) => ({
        currentProject,
        assets,
        highlightsByShotId: buildBoundHighlightsByShotId(state.shots, assets, state.bindingsByShotId),
        loading: false,
      }));
    } catch (error) {
      set({ error: errorMessageFrom(error), loading: false });
    }
  },

  refreshShotAssetsAndBindings: async (projectId, shotId) => {
    set({ loading: true, error: null });
    try {
      const [assets, bindings] = await Promise.all([
        jimengApi.listAssets(projectId),
        jimengApi.listBindingsByShotIds(projectId, [shotId]).then((response) => response.bindings_by_shot_id[shotId] ?? []),
      ]);
      set((state) => ({
        assets,
        bindingsByShotId: {
          ...state.bindingsByShotId,
          [shotId]: bindings,
        },
        highlightsByShotId: {
          ...state.highlightsByShotId,
          [shotId]: calculateBoundPromptHighlights(state.shots.find((shot) => shot.id === shotId)?.prompt ?? "", assets, bindings),
        },
        loading: false,
      }));
    } catch (error) {
      set({ error: errorMessageFrom(error), loading: false });
    }
  },

  saveShotPrompt: async (projectId, shotId, prompt) => {
    try {
      const updatedShot = await jimengApi.updateShot(projectId, shotId, { prompt });
      set((state) => ({
        shots: state.shots.map((shot) => (shot.id === updatedShot.id ? updatedShot : shot)),
        highlightsByShotId: {
          ...state.highlightsByShotId,
          [updatedShot.id]: calculateBoundPromptHighlights(updatedShot.prompt, state.assets, state.bindingsByShotId[updatedShot.id] ?? []),
        },
        error: null,
      }));
      return updatedShot;
    } catch (error) {
      set({ error: errorMessageFrom(error) });
      throw error;
    }
  },

  setActivePage: (activePage) => set({ activePage }),

  setRightPanelMode: (rightPanelMode) => set({ rightPanelMode }),

  toggleShotSelection: (shotId, checked) =>
    set((state) => ({
      selectedShotIds: moveSelectedShotIds(state.selectedShotIds, shotId, checked),
      selectedShotId: checked ? shotId : state.selectedShotId === shotId ? null : state.selectedShotId,
    })),

  setShotSelection: (shotIds) =>
    set((state) => ({
      selectedShotIds: shotIds,
      selectedShotId: shotIds.includes(state.selectedShotId ?? "") ? state.selectedShotId : shotIds[0] ?? state.selectedShotId,
    })),

  clearShotSelection: () => set({ selectedShotIds: [], selectedShotId: null }),

  submitShots: async (shotIds, generationSettings) => {
    const { currentProject } = get();
    const uniqueShotIds = [...new Set(shotIds)].filter(Boolean);
    if (!currentProject || uniqueShotIds.length === 0) {
      return;
    }

    set({ loading: true, error: null });
    try {
      const queueItems = await buildQueueItemsForShots(currentProject, get().shots, uniqueShotIds, generationSettings);
      const response = await jimengApi.createQueueItems(queueItems);
      set((state) => ({
        shots: state.shots.map((shot) =>
          uniqueShotIds.includes(shot.id)
            ? {
                ...shot,
                status: "queued",
                last_error: null,
              }
            : shot,
        ),
        queue: [...state.queue.filter((item) => !response.items.some((created) => created.id === item.id)), ...response.items],
        selectedShotIds: state.selectedShotIds.filter((id) => !uniqueShotIds.includes(id)),
        selectedShotId: uniqueShotIds.includes(state.selectedShotId ?? "") ? null : state.selectedShotId,
        loading: false,
      }));
    } catch (error) {
      set({ error: errorMessageFrom(error), loading: false });
      throw error;
    }
  },

  submitSelectedShots: async (generationSettings) => {
    await get().submitShots(get().selectedShotIds, generationSettings);
  },

  matchAssets: async (shotIds, options) => {
    const projectId = get().currentProject?.id;
    const targetShotIds = [...new Set(shotIds)].filter(Boolean);
    if (!projectId || targetShotIds.length === 0) {
      return undefined;
    }

    set({ loading: true, error: null });
    try {
      // 前端只提交一次；后端按五条分镜分批读写，避免大量连续 HTTP 请求。
      const matchResponse = await jimengApi.matchAssets(projectId, {
        shot_ids: targetShotIds,
        clear_existing_auto: options?.clearExistingAuto ?? false,
      });
      const fullBindingsByShotId = Object.fromEntries(
        matchResponse.shots.map((shot) => [shot.shot_id, shot.all_bindings]),
      );
      set((state) => ({
        bindingsByShotId: {
          ...state.bindingsByShotId,
          ...fullBindingsByShotId,
        },
        highlightsByShotId: {
          ...state.highlightsByShotId,
          ...buildHighlightsByShotId(matchResponse),
        },
        loading: false,
      }));
      return matchResponse;
    } catch (error) {
      set({ error: errorMessageFrom(error), loading: false });
      throw error;
    }
  },

  clearMatchedAssets: async (shotIds) => {
    const projectId = get().currentProject?.id;
    const targetShotIds = [...new Set(shotIds)].filter(Boolean);
    if (!projectId || targetShotIds.length === 0) {
      return undefined;
    }

    set({ loading: true, error: null });
    try {
      const response = await jimengApi.clearMatchedAssets(projectId, { shot_ids: targetShotIds });
      const clearedHighlights = Object.fromEntries(targetShotIds.map((shotId) => [shotId, [] as JimengHighlightSpan[]]));
      set((state) => ({
        bindingsByShotId: {
          ...state.bindingsByShotId,
          ...Object.fromEntries(response.shots.map((shot) => [shot.shot_id, shot.bindings])),
        },
        highlightsByShotId: {
          ...state.highlightsByShotId,
          ...clearedHighlights,
        },
        loading: false,
      }));
      return response;
    } catch (error) {
      set({ error: errorMessageFrom(error), loading: false });
      throw error;
    }
  },

  loadQueue: async (scope = "currentProject", options = {}) => {
    const projectId = scope === "global" ? undefined : get().currentProject?.id;
    set({ loading: true, error: null });
    try {
      const queueEnvelope = await jimengApi.listQueue(projectId, options);
      set({ queue: queueEnvelope.items, queueStatus: queueEnvelope.status, loading: false });
    } catch (error) {
      set({ error: errorMessageFrom(error), loading: false });
    }
  },

  startQueue: async () => {
    set({ loading: true, error: null });
    try {
      await jimengApi.startQueue();
      await get().loadQueue("global");
    } catch (error) {
      set({ error: errorMessageFrom(error), loading: false });
      throw error;
    }
  },

  startQueueWorker: async () => {
    set({ loading: true, error: null });
    try {
      await jimengApi.startQueueWorker();
      await get().loadQueue("global");
    } catch (error) {
      set({ error: errorMessageFrom(error), loading: false });
      throw error;
    }
  },

  pauseQueue: async () => {
    set({ loading: true, error: null });
    try {
      await jimengApi.pauseQueue();
      await get().loadQueue("global");
    } catch (error) {
      set({ error: errorMessageFrom(error), loading: false });
    }
  },

  cancelQueueItem: async (queueItemId) => {
    set({ loading: true, error: null });
    try {
      await jimengApi.cancelQueueItem(queueItemId);
      const projectId = get().currentProject?.id;
      if (projectId) {
        await get().loadProjectData(projectId);
      } else {
        await get().loadQueue("global");
      }
    } catch (error) {
      set({ error: errorMessageFrom(error), loading: false });
    }
  },

  deleteQueueItem: async (queueItemId) => {
    set({ loading: true, error: null });
    try {
      await jimengApi.deleteQueueItem(queueItemId);
      await get().loadQueue("global");
    } catch (error) {
      set({ error: errorMessageFrom(error), loading: false });
      throw error;
    }
  },

  retryQueueItem: async (queueItemId) => {
    set({ loading: true, error: null });
    try {
      await jimengApi.retryQueueItem(queueItemId);
      await get().loadQueue("global");
    } catch (error) {
      set({ error: errorMessageFrom(error), loading: false });
    }
  },

  pollQueueItem: async (queueItemId) => {
    set({ loading: true, error: null });
    try {
      await jimengApi.pollQueueItem(queueItemId);
      const projectId = get().currentProject?.id;
      if (projectId) {
        await get().loadProjectData(projectId);
      } else {
        await get().loadQueue("global");
      }
    } catch (error) {
      set({ error: errorMessageFrom(error), loading: false });
      throw error;
    }
  },

  reorderQueue: async (queueItemIds) => {
    set({ loading: true, error: null });
    try {
      const response = await jimengApi.reorderQueue(queueItemIds);
      set({ queue: response.items, loading: false });
    } catch (error) {
      set({ error: errorMessageFrom(error), loading: false });
    }
  },
}));
