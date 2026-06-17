import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JimengProject, JimengShot } from "@/lib/jimengApi";

const mockJimengApi = vi.hoisted(() => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  listShots: vi.fn(),
  listAssets: vi.fn(),
  listQueue: vi.fn(),
  listPromptPresets: vi.fn(),
  listBindings: vi.fn(),
  renderPromptPreview: vi.fn(),
  createQueueItems: vi.fn(),
  matchAssets: vi.fn(),
  startQueue: vi.fn(),
  pauseQueue: vi.fn(),
}));

vi.mock("@/lib/jimengApi", () => ({
  jimengApi: mockJimengApi,
}));

import {
  buildHighlightsByShotId,
  createJimengInitialState,
  finalPromptSnapshotFromPreview,
  moveSelectedShotIds,
  useJimengStore,
} from "@/store/jimengStore";

const project = (id: string): JimengProject => ({
  id,
  name: id,
  style: "comic",
  prompt_preset_id: null,
  description: "",
  shot_count: 1,
  status: "draft",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const shot = (id: string, projectId: string): JimengShot => ({
  id,
  project_id: projectId,
  shot_index: 1,
  prompt: `prompt-${id}`,
  default_duration: null,
  status: "draft",
  default_video_candidate_id: null,
  locked_video_candidate_id: null,
  last_error: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const queueEnvelope = {
  items: [],
  status: {
    started: false,
    paused: false,
    running_item: null,
    waiting_count: 0,
  },
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

describe("jimengStore helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useJimengStore.setState(createJimengInitialState());
  });

  it("creates a stable initial state", () => {
    const state = createJimengInitialState();
    expect(state.projects).toEqual([]);
    expect(state.selectedShotIds).toEqual([]);
    expect(state.highlightsByShotId).toEqual({});
    expect(state.activePage).toBe("projects");
  });

  it("preserves selected shot order when toggling", () => {
    expect(moveSelectedShotIds(["s1", "s2"], "s3", true)).toEqual(["s1", "s2", "s3"]);
    expect(moveSelectedShotIds(["s1", "s2"], "s1", false)).toEqual(["s2"]);
  });

  it("does not duplicate an already selected shot id", () => {
    expect(moveSelectedShotIds(["s1", "s2"], "s1", true)).toEqual(["s1", "s2"]);
  });

  it("keeps key defaults stable", () => {
    const state = createJimengInitialState();
    expect(state.activePage).toBe("projects");
    expect(state.rightPanelMode).toBe("preview");
    expect(state.queue).toEqual([]);
    expect(state.promptPresets).toEqual([]);
    expect(state.highlightsByShotId).toEqual({});
    expect(state.currentProject).toBeNull();
    expect(state.selectedShotId).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("maps match response highlights by shot id", () => {
    expect(
      buildHighlightsByShotId({
        shots: [
          {
            shot_id: "s1",
            bindings: [],
            matches: [],
            highlights: [{ text: "老许", asset_type: "character", start: 0, end: 2 }],
          },
          {
            shot_id: "s2",
            bindings: [],
            matches: [],
            highlights: [{ text: "农资店", asset_type: "scene", start: 3, end: 6 }],
          },
        ],
      }),
    ).toEqual({
      s1: [{ text: "老许", asset_type: "character", start: 0, end: 2 }],
      s2: [{ text: "农资店", asset_type: "scene", start: 3, end: 6 }],
    });
  });

  it("uses rendered final prompt as queue snapshot", () => {
    expect(
      finalPromptSnapshotFromPreview({
        prefix_prompt: "国漫风格",
        final_prompt: "国漫风格\n\n老许走进农资店",
        unresolved_variables: [],
      }),
    ).toBe("国漫风格\n\n老许走进农资店");

    expect(
      finalPromptSnapshotFromPreview({
        prefix_prompt: "国漫风格",
        final_prompt: "fallback",
        final_prompt_snapshot: "snapshot",
        unresolved_variables: [],
      }),
    ).toBe("snapshot");
  });

  it("loads global queue without current project filtering", async () => {
    mockJimengApi.listQueue.mockResolvedValue(queueEnvelope);
    useJimengStore.setState({ currentProject: project("p1") });

    await useJimengStore.getState().loadQueue("global");

    expect(mockJimengApi.listQueue).toHaveBeenCalledWith(undefined);
  });

  it("rejects submitSelectedShots failures and keeps the error visible", async () => {
    const queueError = new Error("queue failed");
    mockJimengApi.renderPromptPreview.mockResolvedValue({
      prefix_prompt: "",
      final_prompt: "final prompt",
      unresolved_variables: [],
    });
    mockJimengApi.createQueueItems.mockRejectedValue(queueError);
    useJimengStore.setState({
      currentProject: project("p1"),
      selectedShotIds: ["s1"],
    });

    await expect(useJimengStore.getState().submitSelectedShots()).rejects.toThrow("queue failed");

    expect(useJimengStore.getState().error).toBe("queue failed");
    expect(useJimengStore.getState().selectedShotIds).toEqual(["s1"]);
  });

  it("ignores stale loadProjectData responses that finish after a newer request", async () => {
    const oldProject = deferred<JimengProject>();
    mockJimengApi.getProject.mockImplementation((projectId: string) =>
      projectId === "old" ? oldProject.promise : Promise.resolve(project("new")),
    );
    mockJimengApi.listShots.mockImplementation((projectId: string) => Promise.resolve([shot(`${projectId}-shot`, projectId)]));
    mockJimengApi.listAssets.mockResolvedValue([]);
    mockJimengApi.listQueue.mockResolvedValue(queueEnvelope);
    mockJimengApi.listPromptPresets.mockResolvedValue([]);
    mockJimengApi.listBindings.mockResolvedValue([]);

    const oldRequest = useJimengStore.getState().loadProjectData("old");
    const newRequest = useJimengStore.getState().loadProjectData("new");
    await newRequest;
    expect(useJimengStore.getState().currentProject?.id).toBe("new");

    oldProject.resolve(project("old"));
    await oldRequest;

    expect(useJimengStore.getState().currentProject?.id).toBe("new");
    expect(useJimengStore.getState().shots[0]?.project_id).toBe("new");
  });
});
