import { describe, expect, it } from "vitest";
import type { JimengQueueItem, JimengVideoCandidate } from "@/lib/jimengApi";
import { filterGenerationCandidates, getQueueStatusMeta, insertPromptVariable } from "../jimengUiHelpers";

const queueItem = (status: JimengQueueItem["status"], errorMessage: string | null = null): JimengQueueItem => ({
  id: `queue-${status}`,
  project_id: "p1",
  shot_id: "s1",
  status,
  position: 1,
  prompt_snapshot: "分镜",
  prompt_preset_id: null,
  prefix_prompt_snapshot: "",
  final_prompt_snapshot: "分镜",
  asset_snapshot: {},
  cli_command: "",
  poll_seconds: 30,
  download_dir: "",
  submit_id: null,
  gen_status: null,
  result_url: null,
  local_video_path: null,
  cli_raw_output: null,
  error_message: errorMessage,
  submitted_at: null,
  finished_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const candidate = (
  id: string,
  projectId: string,
  shotId: string,
  locked = false,
  queueItemId = `queue-${id}`,
): JimengVideoCandidate => ({
  id,
  project_id: projectId,
  shot_id: shotId,
  queue_item_id: queueItemId,
  video_filename: `${id}.mp4`,
  video_path: `/files/jimeng/${id}.mp4`,
  thumbnail_path: null,
  duration: null,
  ratio: null,
  resolution: null,
  source_url: null,
  is_default: false,
  is_locked: locked,
  created_at: "2026-01-01T00:00:00Z",
});

describe("jimengUiHelpers", () => {
  it("marks failed queue rows as red with error copy", () => {
    const meta = getQueueStatusMeta(queueItem("failed", "即梦返回失败"));

    expect(meta.label).toBe("失败");
    expect(meta.rowClassName).toContain("red");
    expect(meta.detail).toBe("即梦返回失败");
  });

  it("filters generation candidates by project, shot, and lock state", () => {
    const candidates = [
      candidate("c1", "p1", "s1", true),
      candidate("c2", "p1", "s2", false),
      candidate("c3", "p2", "s1", true),
    ];

    expect(
      filterGenerationCandidates(candidates, {
        projectId: "p1",
        shotId: "s1",
        lockState: "locked",
      }).map((item) => item.id),
    ).toEqual(["c1"]);

    expect(
      filterGenerationCandidates(candidates, {
        lockState: "unlocked",
      }).map((item) => item.id),
    ).toEqual(["c2"]);
  });

  it("inserts prompt preset variables at the current cursor range", () => {
    expect(insertPromptVariable("风格：。", "{{style}}", 3, 3)).toEqual({
      value: "风格：{{style}}。",
      cursor: 12,
    });

    expect(insertPromptVariable("角色：旧值。", "{{roles}}", 3, 5)).toEqual({
      value: "角色：{{roles}}。",
      cursor: 12,
    });
  });
});
