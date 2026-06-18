import { create } from "zustand";
import {
  clampJimengVideoDuration,
  jimengApi,
  type JimengAsset,
  type JimengAssetBinding,
  type JimengHighlightSpan,
  type JimengMatchAssetsResponse,
  type JimengPageMode,
  type JimengPromptPreviewResponse,
  type JimengProject,
  type JimengPromptPreset,
  type JimengQueueEnvelope,
  type JimengQueueItemCreate,
  type JimengQueueItem,
  type JimengRightPanelMode,
  type JimengShot,
  type JimengVideoGenerationSettings,
} from "@/lib/jimengApi";

export interface JimengStateData {
  activePage: JimengPageMode;
  rightPanelMode: JimengRightPanelMode;
  projects: JimengProject[];
  currentProject: JimengProject | null;
  shots: JimengShot[];
  assets: JimengAsset[];
  bindingsByShotId: Record<string, JimengAssetBinding[]>;
  highlightsByShotId: Record<string, JimengHighlightSpan[]>;
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
  refreshShotAssetsAndBindings: (projectId: string, shotId: string) => Promise<void>;
  setActivePage: (page: JimengPageMode) => void;
  setRightPanelMode: (mode: JimengRightPanelMode) => void;
  toggleShotSelection: (shotId: string, checked: boolean) => void;
  setShotSelection: (shotIds: string[]) => void;
  clearShotSelection: () => void;
  submitShots: (shotIds: string[], generationSettings?: JimengVideoGenerationSettings) => Promise<void>;
  submitSelectedShots: (generationSettings?: JimengVideoGenerationSettings) => Promise<void>;
  matchAssets: () => Promise<void>;
  loadQueue: (scope?: "currentProject" | "global") => Promise<void>;
  startQueue: () => Promise<void>;
  pauseQueue: () => Promise<void>;
  cancelQueueItem: (queueItemId: string) => Promise<void>;
  retryQueueItem: (queueItemId: string) => Promise<void>;
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
  const entries = await Promise.all(
    shots.map(async (shot) => [shot.id, await jimengApi.listBindings(projectId, shot.id)] as const),
  );
  return Object.fromEntries(entries);
};

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
        generationSettings && shot?.default_duration
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
      const bindingsByShotId = await buildBindingsByShotId(targetProjectId, shots);

      if (requestId !== latestProjectDataRequestId) {
        return;
      }

      set({
        currentProject,
        shots,
        assets,
        bindingsByShotId,
        highlightsByShotId: Object.fromEntries(
          shots
            .filter((shot) => shot.id in get().highlightsByShotId)
            .map((shot) => [shot.id, get().highlightsByShotId[shot.id]]),
        ),
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

  refreshShotAssetsAndBindings: async (projectId, shotId) => {
    set({ loading: true, error: null });
    try {
      const [assets, bindings] = await Promise.all([
        jimengApi.listAssets(projectId),
        jimengApi.listBindings(projectId, shotId),
      ]);
      set((state) => ({
        assets,
        bindingsByShotId: {
          ...state.bindingsByShotId,
          [shotId]: bindings,
        },
        loading: false,
      }));
    } catch (error) {
      set({ error: errorMessageFrom(error), loading: false });
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
      await jimengApi.createQueueItems(queueItems);
      set((state) => ({
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

  matchAssets: async () => {
    const projectId = get().currentProject?.id;
    if (!projectId) {
      return;
    }

    set({ loading: true, error: null });
    try {
      const matchResponse = await jimengApi.matchAssets(projectId);
      const shots = await jimengApi.listShots(projectId);
      const bindingsByShotId = await buildBindingsByShotId(projectId, shots);
      set({ shots, bindingsByShotId, highlightsByShotId: buildHighlightsByShotId(matchResponse), loading: false });
    } catch (error) {
      set({ error: errorMessageFrom(error), loading: false });
    }
  },

  loadQueue: async (scope = "currentProject") => {
    const projectId = scope === "global" ? undefined : get().currentProject?.id;
    set({ loading: true, error: null });
    try {
      const queueEnvelope = await jimengApi.listQueue(projectId);
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
      await get().loadQueue("global");
    } catch (error) {
      set({ error: errorMessageFrom(error), loading: false });
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
