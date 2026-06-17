# Jimeng Batch Production Implementation Plan

> 归档说明：本文档记录的是迁移到 `dreamina_cli` 独立项目之前的实施计划，内部可能保留 `src/apps/comic_gen`、`frontend/src/components/jimeng`、`17177`、`62073/#/jimeng` 等旧路径或旧端口。当前项目入口和启动方式以 `dreamina_cli/README.md` 为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent 即梦批量生产 module for multi-script storyboard management, canonical asset binding, manual queue submission, one-at-a-time Dreamina CLI execution, and multi-candidate video management.

**Architecture:** Add an isolated backend slice under `src/apps/comic_gen/jimeng_*.py` with a SQLite-backed repository and a `/jimeng` FastAPI router, then add a focused frontend slice under `frontend/src/components/jimeng` and `frontend/src/store/jimengStore.ts`. Keep the new module independent from existing `StoryboardR2V.tsx` and `pipeline.py`, reusing only general infrastructure such as FastAPI, static output paths, Axios, Zustand, Tailwind, and existing app shell navigation.

**Tech Stack:** FastAPI, Pydantic, Python `sqlite3`, subprocess-based `dreamina` CLI adapter, pytest, Next.js 14, React 18, TypeScript, Zustand, Axios, Tailwind CSS, lucide-react.

---

## Source Documents

- Spec: `docs/superpowers/specs/2026-06-15-jimeng-batch-production-design.md`
- CLI guide: `docs/superpowers/specs/即梦 CLI 体验指南.md`
- Existing backend entry: `src/apps/comic_gen/api.py`
- Existing frontend API client: `frontend/src/lib/api.ts`
- Existing shell navigation: `frontend/src/components/layout/GlobalSidebar.tsx`
- Existing main page hash router: `frontend/src/app/page.tsx`

## Scope Decision

The feature covers backend data, CLI execution, queue orchestration, and several frontend pages. This plan keeps it as one master implementation plan but splits execution into independently testable tasks. Each task must pass its own tests before the next task starts.

## File Structure

Create backend files:

- `src/apps/comic_gen/jimeng_models.py`: Pydantic models, enums, request/response schemas.
- `src/apps/comic_gen/jimeng_storage.py`: SQLite repository, schema initialization, CRUD, ordering, snapshots, file-path helpers.
- `src/apps/comic_gen/jimeng_prompting.py`: global video prompt presets, variable rendering, final prompt assembly.
- `src/apps/comic_gen/jimeng_matching.py`: text import parsing, CSV parsing, asset name/alias matching, highlight span calculation.
- `src/apps/comic_gen/jimeng_cli.py`: `dreamina` CLI detection, login commands, credit check, command building, output parsing, query/download helpers.
- `src/apps/comic_gen/jimeng_queue.py`: single-running queue worker, start/pause, `--poll` and `query_result` orchestration, failure skip, candidate creation.
- `src/apps/comic_gen/jimeng_api.py`: `/jimeng` router exposing project, shot, asset, binding, queue, candidate, setting, and prompt preset endpoints.

Modify backend files:

- `src/apps/comic_gen/api.py`: include the `/jimeng` router and mount `output/jimeng` as a static file path.

Create backend tests:

- `tests/test_jimeng_storage.py`
- `tests/test_jimeng_prompting.py`
- `tests/test_jimeng_matching.py`
- `tests/test_jimeng_cli.py`
- `tests/test_jimeng_queue.py`
- `tests/test_jimeng_api.py`

Create frontend files:

- `frontend/src/lib/jimengApi.ts`: typed Axios wrapper for `/jimeng`.
- `frontend/src/store/jimengStore.ts`: Zustand store for projects, selected project, shots, assets, queue, settings, prompt presets.
- `frontend/src/components/jimeng/JimengApp.tsx`: module shell with top menu: 剧本列表、分镜工作台、资产管理、即梦排队、生成记录、即梦设置.
- `frontend/src/components/jimeng/JimengProjectListPage.tsx`
- `frontend/src/components/jimeng/JimengWorkbenchPage.tsx`
- `frontend/src/components/jimeng/ShotProductionTable.tsx`
- `frontend/src/components/jimeng/ShotPromptCell.tsx`
- `frontend/src/components/jimeng/AssetSlotCell.tsx`
- `frontend/src/components/jimeng/AssetMiniCard.tsx`
- `frontend/src/components/jimeng/ShotDetailPanel.tsx`
- `frontend/src/components/jimeng/AssetPickerDrawer.tsx`
- `frontend/src/components/jimeng/JimengAssetManagerPage.tsx`
- `frontend/src/components/jimeng/JimengQueuePage.tsx`
- `frontend/src/components/jimeng/JimengGenerationHistoryPage.tsx`
- `frontend/src/components/jimeng/JimengSettingsPage.tsx`
- `frontend/src/components/jimeng/PromptPresetManager.tsx`
- `frontend/src/components/jimeng/PromptPresetEditor.tsx`
- `frontend/src/components/jimeng/ImportShotsModal.tsx`
- `frontend/src/components/jimeng/BatchReplaceModal.tsx`
- `frontend/src/components/jimeng/BatchUploadAssetsModal.tsx`
- `frontend/src/components/jimeng/ConfirmMissingPropsModal.tsx`

Modify frontend files:

- `frontend/src/components/layout/GlobalSidebar.tsx`: add a `jimeng` tab and icon.
- `frontend/src/app/page.tsx`: add `#/jimeng` hash route and render `JimengApp`.

Create frontend tests:

- `frontend/src/components/jimeng/__tests__/promptHighlight.test.ts`
- `frontend/src/components/jimeng/__tests__/jimengStore.test.ts`

Verification commands:

- Backend targeted tests: `python -m pytest tests/test_jimeng_storage.py tests/test_jimeng_prompting.py tests/test_jimeng_matching.py tests/test_jimeng_cli.py tests/test_jimeng_queue.py tests/test_jimeng_api.py -q`
- Backend broad smoke: `python -m pytest tests -q`
- Frontend type/lint: `cd frontend; npm run lint`
- Frontend tests: `cd frontend; npm run test -- --run`
- Frontend build smoke: `cd frontend; npm run build`

Current environment note: `G:\漫剧\LumenX` currently reports `fatal: not a git repository`. Each task still lists a commit checkpoint for execution in a Git-enabled workspace; in this workspace record the checkpoint in the task notes instead of running `git commit`.

---

### Task 1: Backend Domain Models And SQLite Storage

**Files:**
- Create: `src/apps/comic_gen/jimeng_models.py`
- Create: `src/apps/comic_gen/jimeng_storage.py`
- Create: `tests/test_jimeng_storage.py`

- [ ] **Step 1: Write failing storage tests**

Add tests that prove project creation, shot ordering, asset overwrite, prompt preset selection, and queue snapshots work with a temporary SQLite file.

```python
# tests/test_jimeng_storage.py
from pathlib import Path

from src.apps.comic_gen.jimeng_models import JimengAssetType
from src.apps.comic_gen.jimeng_storage import JimengStore


def test_create_project_and_reorder_shots(tmp_path: Path):
    store = JimengStore(tmp_path / "jimeng.db", output_root=tmp_path / "output")
    project = store.create_project(name="老许农资", style="3D国漫", description="")
    first = store.create_shot(project.id, prompt="第一条分镜")
    second = store.create_shot(project.id, prompt="第二条分镜")

    store.move_shot(project.id, second.id, direction="up")
    shots = store.list_shots(project.id)

    assert [shot.id for shot in shots] == [second.id, first.id]
    assert [shot.shot_index for shot in shots] == [1, 2]


def test_same_type_asset_upload_replaces_previous_file(tmp_path: Path):
    store = JimengStore(tmp_path / "jimeng.db", output_root=tmp_path / "output")
    project = store.create_project(name="项目", style="写实", description="")

    first = store.upsert_asset_file(
        project_id=project.id,
        asset_type=JimengAssetType.character,
        name="许禾",
        source_path=tmp_path / "许禾.png",
        file_kind="image",
        content=b"old",
    )
    second = store.upsert_asset_file(
        project_id=project.id,
        asset_type=JimengAssetType.character,
        name="许禾",
        source_path=tmp_path / "许禾.jpg",
        file_kind="image",
        content=b"new",
    )

    assert first.id == second.id
    assert second.image_filename == "许禾.jpg"
    assert not (tmp_path / "output" / "jimeng" / "projects" / project.id / "assets" / "characters" / "许禾.png").exists()
    assert (tmp_path / "output" / "jimeng" / "projects" / project.id / "assets" / "characters" / "许禾.jpg").read_bytes() == b"new"
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `python -m pytest tests/test_jimeng_storage.py -q`

Expected: FAIL because `jimeng_models.py` and `jimeng_storage.py` do not exist.

- [ ] **Step 3: Add Pydantic models and enums**

Create `src/apps/comic_gen/jimeng_models.py` with enums and schemas named exactly:

```python
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class JimengProjectStatus(str, Enum):
    draft = "draft"
    working = "working"
    has_failed = "has_failed"
    completed = "completed"


class JimengShotStatus(str, Enum):
    draft = "draft"
    asset_missing = "asset_missing"
    queued = "queued"
    running = "running"
    failed = "failed"
    completed = "completed"
    locked = "locked"


class JimengAssetType(str, Enum):
    character = "character"
    scene = "scene"
    prop = "prop"


class JimengQueueStatus(str, Enum):
    waiting = "waiting"
    running = "running"
    completed = "completed"
    failed = "failed"
    canceled = "canceled"


class JimengPromptScope(str, Enum):
    system = "system"
    user = "user"


class JimengProject(BaseModel):
    id: str
    name: str
    style: str = ""
    prompt_preset_id: Optional[str] = None
    description: str = ""
    shot_count: int = 0
    status: JimengProjectStatus = JimengProjectStatus.draft
    created_at: str
    updated_at: str


class JimengShot(BaseModel):
    id: str
    project_id: str
    shot_index: int
    prompt: str
    status: JimengShotStatus = JimengShotStatus.draft
    default_video_candidate_id: Optional[str] = None
    locked_video_candidate_id: Optional[str] = None
    last_error: Optional[str] = None
    created_at: str
    updated_at: str


class JimengAsset(BaseModel):
    id: str
    project_id: str
    type: JimengAssetType
    name: str
    aliases: List[str] = Field(default_factory=list)
    image_filename: Optional[str] = None
    image_path: Optional[str] = None
    audio_filename: Optional[str] = None
    audio_path: Optional[str] = None
    created_at: str
    updated_at: str


class JimengAssetBinding(BaseModel):
    id: str
    project_id: str
    shot_id: str
    asset_id: str
    asset_type: JimengAssetType
    source: str
    locked: bool = False
    slot_order: int = 0
    created_at: str
    updated_at: str


class JimengQueueItem(BaseModel):
    id: str
    project_id: str
    shot_id: str
    status: JimengQueueStatus
    position: int
    prompt_snapshot: str
    prompt_preset_id: Optional[str] = None
    prefix_prompt_snapshot: str = ""
    final_prompt_snapshot: str
    asset_snapshot: Dict[str, Any] = Field(default_factory=dict)
    cli_command: str = ""
    poll_seconds: int = 30
    download_dir: str = ""
    submit_id: Optional[str] = None
    gen_status: Optional[str] = None
    result_url: Optional[str] = None
    local_video_path: Optional[str] = None
    cli_raw_output: Optional[str] = None
    error_message: Optional[str] = None
    submitted_at: Optional[str] = None
    finished_at: Optional[str] = None
    created_at: str
    updated_at: str


class JimengVideoCandidate(BaseModel):
    id: str
    project_id: str
    shot_id: str
    queue_item_id: str
    video_filename: str
    video_path: str
    thumbnail_path: Optional[str] = None
    duration: Optional[int] = None
    ratio: Optional[str] = None
    resolution: Optional[str] = None
    source_url: Optional[str] = None
    is_default: bool = False
    is_locked: bool = False
    created_at: str


class JimengPromptPreset(BaseModel):
    id: str
    name: str
    scope: JimengPromptScope
    content: str
    variables: List[str] = Field(default_factory=list)
    is_default: bool = False
    enabled: bool = True
    created_at: str
    updated_at: str
```

- [ ] **Step 4: Implement SQLite store**

Create `src/apps/comic_gen/jimeng_storage.py` with:

- `JimengStore.__init__(db_path: Path | str | None = None, output_root: Path | str = "output")`
- `init_schema()`
- `create_project()`, `list_projects()`, `get_project()`, `delete_project()`
- `create_shot()`, `list_shots()`, `update_shot()`, `delete_shot()`, `move_shot()`
- `upsert_asset_file()`, `list_assets()`, `update_asset_aliases()`, `delete_asset()`
- `create_binding()`, `list_bindings()`, `delete_binding()`
- `create_queue_item()`, `list_queue()`, `next_waiting_item()`, `update_queue_item()`
- `create_video_candidate()`, `list_candidates()`, `set_default_candidate()`, `lock_candidate()`
- `create_prompt_preset()`, `list_prompt_presets()`, `set_default_prompt_preset()`

Use `sqlite3.Row`, JSON text columns for `aliases`, `asset_snapshot`, and `variables`, and timestamps from `datetime.now(timezone.utc).isoformat()`.

- [ ] **Step 5: Run storage tests**

Run: `python -m pytest tests/test_jimeng_storage.py -q`

Expected: PASS.

- [ ] **Step 6: Checkpoint**

If the execution workspace has Git, run:

```bash
git add src/apps/comic_gen/jimeng_models.py src/apps/comic_gen/jimeng_storage.py tests/test_jimeng_storage.py
git commit -m "feat: add jimeng storage models"
```

In the current non-Git workspace, record this checkpoint in the task log.

---

### Task 2: Global Video Prompt Presets And Final Prompt Rendering

**Files:**
- Create: `src/apps/comic_gen/jimeng_prompting.py`
- Modify: `src/apps/comic_gen/jimeng_storage.py`
- Create: `tests/test_jimeng_prompting.py`

- [ ] **Step 1: Write failing prompt tests**

```python
# tests/test_jimeng_prompting.py
from pathlib import Path

from src.apps.comic_gen.jimeng_models import JimengAssetType
from src.apps.comic_gen.jimeng_prompting import render_prompt_preset
from src.apps.comic_gen.jimeng_storage import JimengStore


def test_render_prompt_preset_uses_project_and_bound_assets(tmp_path: Path):
    store = JimengStore(tmp_path / "jimeng.db", output_root=tmp_path / "output")
    project = store.create_project(name="项目", style="3D国漫", description="")
    shot = store.create_shot(project.id, "0~5秒：赵启明推门。")
    character = store.create_asset(project.id, JimengAssetType.character, "赵启明", aliases=["赵总"])
    scene = store.create_asset(project.id, JimengAssetType.scene, "老许农资", aliases=[])
    store.create_binding(project.id, shot.id, character.id, JimengAssetType.character, source="manual", locked=True)
    store.create_binding(project.id, shot.id, scene.id, JimengAssetType.scene, source="manual", locked=True)

    result = render_prompt_preset(
        template="美术风格：{{style}}。角色：{{roles}}。场景：{{scene}}。\n{{shot_prompt}}",
        project=project,
        shot=shot,
        bindings=store.list_bindings(project.id, shot.id),
        assets=store.list_assets(project.id),
    )

    assert result.unresolved_variables == []
    assert "美术风格：3D国漫" in result.prefix_prompt
    assert "角色：赵启明" in result.prefix_prompt
    assert "场景：老许农资" in result.prefix_prompt
    assert result.final_prompt.endswith("0~5秒：赵启明推门。")


def test_unresolved_variable_is_preserved(tmp_path: Path):
    store = JimengStore(tmp_path / "jimeng.db", output_root=tmp_path / "output")
    project = store.create_project(name="项目", style="", description="")
    shot = store.create_shot(project.id, "分镜")

    result = render_prompt_preset(
        template="未知：{{unknown_key}}",
        project=project,
        shot=shot,
        bindings=[],
        assets=[],
    )

    assert result.prefix_prompt == "未知：{{unknown_key}}"
    assert result.unresolved_variables == ["unknown_key"]
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `python -m pytest tests/test_jimeng_prompting.py -q`

Expected: FAIL because `jimeng_prompting.py` is missing.

- [ ] **Step 3: Implement prompt renderer**

Create `src/apps/comic_gen/jimeng_prompting.py` with:

```python
from dataclasses import dataclass
import re
from typing import Iterable, List

from .jimeng_models import JimengAsset, JimengAssetBinding, JimengAssetType, JimengProject, JimengShot


VARIABLE_RE = re.compile(r"{{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}}")


@dataclass(frozen=True)
class RenderedJimengPrompt:
    prefix_prompt: str
    final_prompt: str
    unresolved_variables: List[str]


def render_prompt_preset(
    template: str,
    project: JimengProject,
    shot: JimengShot,
    bindings: Iterable[JimengAssetBinding],
    assets: Iterable[JimengAsset],
    camera: str = "",
    era: str = "",
) -> RenderedJimengPrompt:
    asset_by_id = {asset.id: asset for asset in assets}
    names = {JimengAssetType.character: [], JimengAssetType.scene: [], JimengAssetType.prop: []}
    for binding in sorted(bindings, key=lambda item: item.slot_order):
        asset = asset_by_id.get(binding.asset_id)
        if asset:
            names[binding.asset_type].append(asset.name)

    values = {
        "style": project.style,
        "camera": camera,
        "era": era,
        "roles": "、".join(names[JimengAssetType.character]),
        "scene": "、".join(names[JimengAssetType.scene]),
        "props": "、".join(names[JimengAssetType.prop]),
        "shot_prompt": shot.prompt,
    }
    unresolved: List[str] = []

    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in values:
            unresolved.append(key)
            return match.group(0)
        return values[key]

    prefix = VARIABLE_RE.sub(replace, template).strip()
    final_prompt = f"{prefix}\n\n{shot.prompt}".strip() if prefix else shot.prompt
    return RenderedJimengPrompt(prefix, final_prompt, sorted(set(unresolved)))
```

- [ ] **Step 4: Add storage support for bare asset records**

Add `JimengStore.create_asset(project_id, asset_type, name, aliases)` for tests and frontend-created assets without files. Enforce same project, same type, same name uniqueness.

- [ ] **Step 5: Run prompt tests**

Run: `python -m pytest tests/test_jimeng_prompting.py tests/test_jimeng_storage.py -q`

Expected: PASS.

- [ ] **Step 6: Checkpoint**

If Git is available:

```bash
git add src/apps/comic_gen/jimeng_prompting.py src/apps/comic_gen/jimeng_storage.py tests/test_jimeng_prompting.py tests/test_jimeng_storage.py
git commit -m "feat: add jimeng prompt presets"
```

---

### Task 3: Shot Import, Asset Matching, And Highlight Spans

**Files:**
- Create: `src/apps/comic_gen/jimeng_matching.py`
- Create: `tests/test_jimeng_matching.py`

- [ ] **Step 1: Write failing matching tests**

```python
# tests/test_jimeng_matching.py
from src.apps.comic_gen.jimeng_matching import (
    calculate_highlights,
    match_assets_for_prompt,
    parse_csv_shots,
    parse_plain_text_shots,
)
from src.apps.comic_gen.jimeng_models import JimengAsset, JimengAssetType


def asset(asset_id: str, asset_type: JimengAssetType, name: str, aliases=None):
    return JimengAsset(
        id=asset_id,
        project_id="p1",
        type=asset_type,
        name=name,
        aliases=aliases or [],
        created_at="now",
        updated_at="now",
    )


def test_parse_plain_text_shots_keeps_prompt_body():
    text = "# 1\n场景：老许农资\n人物：许禾、赵启明\n分镜提示词：\n0~3秒：赵启明拍桌。\n\n# 2\n0~5秒：许禾回头。"
    shots = parse_plain_text_shots(text)

    assert len(shots) == 2
    assert "赵启明拍桌" in shots[0].prompt
    assert "许禾回头" in shots[1].prompt


def test_match_assets_by_name_and_alias_longest_first():
    assets = [
        asset("c1", JimengAssetType.character, "许禾", ["小许"]),
        asset("c2", JimengAssetType.character, "监管工作人员", ["监管"]),
        asset("s1", JimengAssetType.scene, "老许农资", []),
        asset("p1", JimengAssetType.prop, "文件夹", []),
    ]

    matches = match_assets_for_prompt("小许在老许农资拿起文件夹，监管工作人员进门。", assets)

    assert [match.asset_id for match in matches] == ["c2", "s1", "p1", "c1"]


def test_calculate_highlights_marks_types():
    assets = [
        asset("c1", JimengAssetType.character, "许禾"),
        asset("s1", JimengAssetType.scene, "老许农资"),
    ]
    spans = calculate_highlights("许禾走进老许农资。", assets)

    assert [(span.text, span.asset_type) for span in spans] == [
        ("许禾", JimengAssetType.character),
        ("老许农资", JimengAssetType.scene),
    ]
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `python -m pytest tests/test_jimeng_matching.py -q`

Expected: FAIL because `jimeng_matching.py` is missing.

- [ ] **Step 3: Implement parsing and matching**

Create:

- `ImportedJimengShot` dataclass with `prompt`, `raw_text`, `scene_names`, `character_names`, `prop_names`.
- `AssetMatch` dataclass with `asset_id`, `asset_type`, `matched_text`, `start`, `end`.
- `HighlightSpan` dataclass with `text`, `asset_type`, `start`, `end`.
- `parse_plain_text_shots(text: str) -> list[ImportedJimengShot]`.
- `parse_csv_shots(csv_text: str) -> list[ImportedJimengShot]`.
- `match_assets_for_prompt(prompt: str, assets: list[JimengAsset]) -> list[AssetMatch]`.
- `calculate_highlights(prompt: str, assets: list[JimengAsset]) -> list[HighlightSpan]`.

Matching rules:

- Include asset `name` and `aliases`.
- Sort candidate keywords by length descending so `监管工作人员` wins before `监管`.
- Deduplicate by asset ID.
- Return matches ordered by asset type priority: character, scene, prop, then by first occurrence.

- [ ] **Step 4: Run matching tests**

Run: `python -m pytest tests/test_jimeng_matching.py -q`

Expected: PASS.

- [ ] **Step 5: Checkpoint**

If Git is available:

```bash
git add src/apps/comic_gen/jimeng_matching.py tests/test_jimeng_matching.py
git commit -m "feat: add jimeng shot parsing and matching"
```

---

### Task 4: CLI Adapter For Dreamina Commands

**Files:**
- Create: `src/apps/comic_gen/jimeng_cli.py`
- Create: `tests/test_jimeng_cli.py`

- [ ] **Step 1: Write failing CLI tests with fake runner**

```python
# tests/test_jimeng_cli.py
from pathlib import Path

from src.apps.comic_gen.jimeng_cli import DreaminaCli, DreaminaResult


def test_builds_image2video_command_with_poll(tmp_path: Path):
    calls = []

    def runner(args, timeout):
        calls.append(args)
        return DreaminaResult(returncode=0, stdout='{"submit_id":"abc","gen_status":"querying"}', stderr="")

    cli = DreaminaCli(executable="dreamina", runner=runner)
    result = cli.submit_image2video(
        image_path=tmp_path / "first.png",
        prompt="最终提示词",
        duration=5,
        ratio="9:16",
        video_resolution="720P",
        poll_seconds=30,
    )

    assert result.submit_id == "abc"
    assert result.gen_status == "querying"
    assert calls[0] == [
        "dreamina",
        "image2video",
        "--image",
        str(tmp_path / "first.png"),
        "--prompt",
        "最终提示词",
        "--duration",
        "5",
        "--ratio",
        "9:16",
        "--video_resolution",
        "720P",
        "--poll",
        "30",
    ]


def test_query_result_download_dir(tmp_path: Path):
    calls = []

    def runner(args, timeout):
        calls.append(args)
        return DreaminaResult(returncode=0, stdout='{"gen_status":"success","result_url":"https://example.test/video.mp4"}', stderr="")

    cli = DreaminaCli(executable="dreamina", runner=runner)
    result = cli.query_result("abc", download_dir=tmp_path / "downloads")

    assert result.gen_status == "success"
    assert result.result_url == "https://example.test/video.mp4"
    assert calls[0][-2:] == ["--download_dir", str(tmp_path / "downloads")]
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `python -m pytest tests/test_jimeng_cli.py -q`

Expected: FAIL because `jimeng_cli.py` is missing.

- [ ] **Step 3: Implement CLI adapter**

Create:

- `DreaminaResult(returncode, stdout, stderr)`.
- `DreaminaTaskResult(submit_id, gen_status, result_url, local_paths, raw_output, error_message)`.
- `DreaminaCli` with injected `runner` for tests.
- Methods: `check_available()`, `login(debug=False)`, `relogin()`, `logout()`, `user_credit()`, `submit_text2video()`, `submit_image2video()`, `query_result()`, `list_task()`, `cli_paths()`.

Use `subprocess.run(args, capture_output=True, text=True, timeout=timeout, encoding="utf-8", errors="replace")` in the default runner.

Parse JSON when stdout is JSON. If stdout is not JSON, extract `submit_id`, `gen_status`, and URLs with conservative regexes.

- [ ] **Step 4: Run CLI tests**

Run: `python -m pytest tests/test_jimeng_cli.py -q`

Expected: PASS.

- [ ] **Step 5: Checkpoint**

If Git is available:

```bash
git add src/apps/comic_gen/jimeng_cli.py tests/test_jimeng_cli.py
git commit -m "feat: add dreamina cli adapter"
```

---

### Task 5: Queue Worker With Failure Skip And Candidate Creation

**Files:**
- Create: `src/apps/comic_gen/jimeng_queue.py`
- Modify: `src/apps/comic_gen/jimeng_storage.py`
- Create: `tests/test_jimeng_queue.py`

- [ ] **Step 1: Write failing queue tests**

```python
# tests/test_jimeng_queue.py
from pathlib import Path

from src.apps.comic_gen.jimeng_cli import DreaminaTaskResult
from src.apps.comic_gen.jimeng_models import JimengQueueStatus, JimengShotStatus
from src.apps.comic_gen.jimeng_queue import JimengQueueWorker
from src.apps.comic_gen.jimeng_storage import JimengStore


class FakeCli:
    def __init__(self):
        self.calls = []

    def submit_text2video(self, **kwargs):
        self.calls.append(("submit", kwargs))
        return DreaminaTaskResult(submit_id="s1", gen_status="querying", result_url=None, local_paths=[], raw_output="querying", error_message=None)

    def query_result(self, submit_id, download_dir=None):
        self.calls.append(("query", {"submit_id": submit_id, "download_dir": download_dir}))
        return DreaminaTaskResult(submit_id=submit_id, gen_status="success", result_url="https://example.test/v.mp4", local_paths=[str(Path(download_dir) / "v.mp4")], raw_output="success", error_message=None)


def test_worker_processes_one_waiting_item_to_completed(tmp_path: Path):
    store = JimengStore(tmp_path / "jimeng.db", output_root=tmp_path / "output")
    project = store.create_project("项目", "3D国漫", "")
    shot = store.create_shot(project.id, "分镜提示词")
    item = store.create_queue_item(project.id, shot.id, final_prompt_snapshot="最终提示词", asset_snapshot={})

    worker = JimengQueueWorker(store=store, cli=FakeCli(), poll_seconds=1)
    worker.process_next_once()

    updated = store.get_queue_item(item.id)
    updated_shot = store.get_shot(project.id, shot.id)
    candidates = store.list_candidates(project.id, shot.id)

    assert updated.status == JimengQueueStatus.completed
    assert updated_shot.status == JimengShotStatus.completed
    assert len(candidates) == 1
    assert candidates[0].is_default is True


def test_worker_marks_failure_and_moves_to_next(tmp_path: Path):
    class FailingThenSuccessCli(FakeCli):
        def __init__(self):
            super().__init__()
            self.count = 0

        def submit_text2video(self, **kwargs):
            self.count += 1
            if self.count == 1:
                return DreaminaTaskResult(submit_id=None, gen_status="failed", result_url=None, local_paths=[], raw_output="bad", error_message="积分不足")
            return super().submit_text2video(**kwargs)

    store = JimengStore(tmp_path / "jimeng.db", output_root=tmp_path / "output")
    project = store.create_project("项目", "", "")
    first = store.create_shot(project.id, "第一条")
    second = store.create_shot(project.id, "第二条")
    first_item = store.create_queue_item(project.id, first.id, final_prompt_snapshot="第一条", asset_snapshot={})
    second_item = store.create_queue_item(project.id, second.id, final_prompt_snapshot="第二条", asset_snapshot={})

    worker = JimengQueueWorker(store=store, cli=FailingThenSuccessCli(), poll_seconds=1)
    worker.process_next_once()
    worker.process_next_once()

    assert store.get_queue_item(first_item.id).status == JimengQueueStatus.failed
    assert store.get_queue_item(second_item.id).status == JimengQueueStatus.completed
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `python -m pytest tests/test_jimeng_queue.py -q`

Expected: FAIL because `jimeng_queue.py` is missing and storage queue helpers are incomplete.

- [ ] **Step 3: Implement queue worker**

Create `JimengQueueWorker` with:

- `start()`, `pause()`, `status()`, `process_next_once()`.
- Single running guard using storage query for `running`.
- If item has `image_path` in `asset_snapshot["reference_image_path"]`, call `submit_image2video`.
- Otherwise call `submit_text2video`.
- If submit returns `querying`, call `query_result` in the same `process_next_once()` during tests. In app runtime, the API start endpoint can call repeated `process_next_once()` from a background task.
- On success, create `JimengVideoCandidate` and set it default unless the shot is locked.
- On failure, set queue item failed, shot failed, and preserve `error_message` plus `cli_raw_output`.

- [ ] **Step 4: Run queue tests**

Run: `python -m pytest tests/test_jimeng_queue.py -q`

Expected: PASS.

- [ ] **Step 5: Checkpoint**

If Git is available:

```bash
git add src/apps/comic_gen/jimeng_queue.py src/apps/comic_gen/jimeng_storage.py tests/test_jimeng_queue.py
git commit -m "feat: add jimeng queue worker"
```

---

### Task 6: FastAPI Router And Static Output Mount

**Files:**
- Create: `src/apps/comic_gen/jimeng_api.py`
- Modify: `src/apps/comic_gen/api.py`
- Create: `tests/test_jimeng_api.py`

- [ ] **Step 1: Write failing API smoke tests**

```python
# tests/test_jimeng_api.py
from fastapi.testclient import TestClient

from src.apps.comic_gen.api import app


def test_jimeng_project_lifecycle():
    client = TestClient(app)

    created = client.post("/jimeng/projects", json={"name": "老许农资", "style": "3D国漫", "description": ""})
    assert created.status_code == 200
    project_id = created.json()["id"]

    listed = client.get("/jimeng/projects")
    assert listed.status_code == 200
    assert any(project["id"] == project_id for project in listed.json())


def test_prompt_preview_endpoint():
    client = TestClient(app)
    project = client.post("/jimeng/projects", json={"name": "项目", "style": "3D国漫", "description": ""}).json()
    shot = client.post(f"/jimeng/projects/{project['id']}/shots", json={"prompt": "分镜内容"}).json()
    preset = client.post("/jimeng/prompt_presets", json={"name": "通用", "scope": "user", "content": "风格：{{style}}。", "enabled": True}).json()
    client.post(f"/jimeng/projects/{project['id']}/prompt_preset", json={"prompt_preset_id": preset["id"]})

    response = client.post(f"/jimeng/projects/{project['id']}/shots/{shot['id']}/render_prompt_preview")

    assert response.status_code == 200
    assert "风格：3D国漫" in response.json()["final_prompt"]
```

- [ ] **Step 2: Run API tests and confirm failure**

Run: `python -m pytest tests/test_jimeng_api.py -q`

Expected: FAIL because `/jimeng` router is not registered.

- [ ] **Step 3: Implement `/jimeng` router**

Create `src/apps/comic_gen/jimeng_api.py` using `APIRouter(prefix="/jimeng", tags=["jimeng"])`.

Implement endpoints from the spec:

- Projects: `GET/POST/GET by id/PUT/DELETE/duplicate`.
- Shots: list/create/import/update/delete/move/batch_replace/match_assets.
- Assets: list/create/batch_upload/update/delete/image/voice.
- Bindings: list/create/delete/reorder.
- Queue: list/create/batch/start/pause/cancel/retry/reorder.
- Candidates: list/default/lock/download/batch_download.
- Settings: get/update/check_cli/login/login_debug/relogin/logout/query_credit/cli_paths/cli_capabilities.
- Prompt presets: list/create/update/delete/default/project selection/render preview.

Keep route bodies thin. They should call `JimengStore`, `render_prompt_preset`, `match_assets_for_prompt`, `DreaminaCli`, or `JimengQueueWorker`.

- [ ] **Step 4: Register router and static files**

Modify `src/apps/comic_gen/api.py`:

```python
from .jimeng_api import router as jimeng_router

app.include_router(jimeng_router)
os.makedirs("output/jimeng", exist_ok=True)
app.mount("/files/jimeng", StaticFiles(directory="output/jimeng"), name="files_jimeng")
```

Place the mount near the existing output static mounts.

- [ ] **Step 5: Run API tests**

Run: `python -m pytest tests/test_jimeng_api.py tests/test_jimeng_storage.py tests/test_jimeng_prompting.py tests/test_jimeng_matching.py tests/test_jimeng_cli.py tests/test_jimeng_queue.py -q`

Expected: PASS.

- [ ] **Step 6: Checkpoint**

If Git is available:

```bash
git add src/apps/comic_gen/jimeng_api.py src/apps/comic_gen/api.py tests/test_jimeng_api.py
git commit -m "feat: expose jimeng api"
```

---

### Task 7: Frontend API Client And Zustand Store

**Files:**
- Create: `frontend/src/lib/jimengApi.ts`
- Create: `frontend/src/store/jimengStore.ts`
- Create: `frontend/src/components/jimeng/__tests__/jimengStore.test.ts`

- [ ] **Step 1: Write store tests**

```ts
// frontend/src/components/jimeng/__tests__/jimengStore.test.ts
import { describe, expect, it } from "vitest";
import { createJimengInitialState, moveSelectedShotIds } from "@/store/jimengStore";

describe("jimengStore helpers", () => {
  it("creates a stable initial state", () => {
    const state = createJimengInitialState();
    expect(state.projects).toEqual([]);
    expect(state.selectedShotIds).toEqual([]);
    expect(state.activePage).toBe("projects");
  });

  it("preserves selected shot order when toggling", () => {
    expect(moveSelectedShotIds(["s1", "s2"], "s3", true)).toEqual(["s1", "s2", "s3"]);
    expect(moveSelectedShotIds(["s1", "s2"], "s1", false)).toEqual(["s2"]);
  });
});
```

- [ ] **Step 2: Run frontend test and confirm failure**

Run: `cd frontend; npm run test -- --run frontend/src/components/jimeng/__tests__/jimengStore.test.ts`

Expected: FAIL because `jimengStore.ts` does not exist.

- [ ] **Step 3: Implement typed API client**

Create `frontend/src/lib/jimengApi.ts` with:

- TypeScript types matching `JimengProject`, `JimengShot`, `JimengAsset`, `JimengAssetBinding`, `JimengQueueItem`, `JimengVideoCandidate`, `JimengPromptPreset`.
- Functions for all `/jimeng` endpoints.
- File upload functions using `FormData`.
- No direct dependency on existing `api.ts`.

- [ ] **Step 4: Implement Zustand store**

Create `frontend/src/store/jimengStore.ts` with:

- `activePage: "projects" | "workbench" | "assets" | "queue" | "history" | "settings"`.
- `projects`, `currentProject`, `shots`, `assets`, `bindingsByShotId`, `queue`, `promptPresets`, `selectedShotIds`.
- Actions: `loadProjects`, `selectProject`, `loadProjectData`, `setActivePage`, `toggleShotSelection`, `clearShotSelection`, `submitSelectedShots`, `matchAssets`, `loadQueue`, `startQueue`, `pauseQueue`.
- Export helpers `createJimengInitialState()` and `moveSelectedShotIds()` for tests.

- [ ] **Step 5: Run frontend store tests**

Run: `cd frontend; npm run test -- --run frontend/src/components/jimeng/__tests__/jimengStore.test.ts`

Expected: PASS.

- [ ] **Step 6: Checkpoint**

If Git is available:

```bash
git add frontend/src/lib/jimengApi.ts frontend/src/store/jimengStore.ts frontend/src/components/jimeng/__tests__/jimengStore.test.ts
git commit -m "feat: add jimeng frontend data layer"
```

---

### Task 8: App Navigation And Jimeng Module Shell

**Files:**
- Modify: `frontend/src/components/layout/GlobalSidebar.tsx`
- Modify: `frontend/src/app/page.tsx`
- Create: `frontend/src/components/jimeng/JimengApp.tsx`

- [ ] **Step 1: Add `jimeng` tab type and sidebar item**

Modify `GlobalSidebar.tsx`:

```ts
export type GlobalTab = "workspace" | "library" | "playground" | "jimeng" | "settings";
```

Add nav item:

```ts
{ id: "jimeng", icon: Film, hash: "#/jimeng" }
```

Import `Film` from `lucide-react`.

- [ ] **Step 2: Add hash route in `page.tsx`**

Add dynamic import:

```ts
const JimengApp = dynamic(() => import("@/components/jimeng/JimengApp"), { ssr: false });
```

Extend `currentView` union with `"jimeng"`. In hash handler, add:

```ts
if (hash === "#/jimeng") {
  setCurrentView("jimeng");
  setActiveTab("jimeng");
  setProjectId(null);
  setSeriesId(null);
  setEpisodeId(null);
  return;
}
```

In `renderContent()`:

```tsx
if (currentView === "jimeng") {
  return <JimengApp />;
}
```

- [ ] **Step 3: Create module shell**

Create `JimengApp.tsx` with a top menu containing:

- 剧本列表
- 分镜工作台
- 资产管理
- 即梦排队
- 生成记录
- 即梦设置

Use `useJimengStore` for `activePage` and `setActivePage`.

- [ ] **Step 4: Run frontend checks**

Run: `cd frontend; npm run lint`

Expected: PASS or existing unrelated lint warnings only. New files must not introduce lint errors.

- [ ] **Step 5: Checkpoint**

If Git is available:

```bash
git add frontend/src/components/layout/GlobalSidebar.tsx frontend/src/app/page.tsx frontend/src/components/jimeng/JimengApp.tsx
git commit -m "feat: add jimeng navigation shell"
```

---

### Task 9: Project List And Workbench Layout

**Files:**
- Create: `frontend/src/components/jimeng/JimengProjectListPage.tsx`
- Create: `frontend/src/components/jimeng/JimengWorkbenchPage.tsx`
- Create: `frontend/src/components/jimeng/ShotProductionTable.tsx`
- Create: `frontend/src/components/jimeng/ShotPromptCell.tsx`
- Create: `frontend/src/components/jimeng/AssetSlotCell.tsx`
- Create: `frontend/src/components/jimeng/AssetMiniCard.tsx`
- Create: `frontend/src/components/jimeng/ShotDetailPanel.tsx`
- Create: `frontend/src/components/jimeng/AssetPickerDrawer.tsx`
- Create: `frontend/src/components/jimeng/ImportShotsModal.tsx`
- Create: `frontend/src/components/jimeng/BatchReplaceModal.tsx`
- Create: `frontend/src/components/jimeng/ConfirmMissingPropsModal.tsx`
- Create: `frontend/src/components/jimeng/__tests__/promptHighlight.test.ts`

- [ ] **Step 1: Write highlight helper test**

Create a local helper exported from `ShotPromptCell.tsx` or `frontend/src/components/jimeng/promptHighlight.ts`.

```ts
// frontend/src/components/jimeng/__tests__/promptHighlight.test.ts
import { describe, expect, it } from "vitest";
import { buildPromptSegments } from "../promptHighlight";

describe("buildPromptSegments", () => {
  it("splits prompt into typed highlight segments", () => {
    const segments = buildPromptSegments("许禾走进老许农资，拿起文件夹。", [
      { start: 0, end: 2, text: "许禾", asset_type: "character" },
      { start: 4, end: 8, text: "老许农资", asset_type: "scene" },
      { start: 11, end: 14, text: "文件夹", asset_type: "prop" },
    ]);

    expect(segments.filter((item) => item.kind !== "text").map((item) => item.kind)).toEqual([
      "character",
      "scene",
      "prop",
    ]);
  });
});
```

- [ ] **Step 2: Run frontend test and confirm failure**

Run: `cd frontend; npm run test -- --run frontend/src/components/jimeng/__tests__/promptHighlight.test.ts`

Expected: FAIL because `promptHighlight.ts` is missing.

- [ ] **Step 3: Implement project list**

`JimengProjectListPage` must:

- Show existing Jimeng projects from store.
- Create a new project.
- Enter project workbench by setting `currentProject` and `activePage="workbench"`.
- Show counts for shots, assets, queue, failures.

- [ ] **Step 4: Implement v6 workbench table**

`ShotProductionTable` columns:

- checkbox
- 序号
- 分镜提示词
- 出场角色
- 场景
- 道具
- 视频
- 操作

Top action order:

1. 导入分镜
2. 格式示例
3. 添加分镜
4. 匹配资产
5. 批量文本替换
6. 批量下载视频素材
7. 批量提交选中分镜

- [ ] **Step 5: Implement right panel behavior**

`ShotDetailPanel` shows current default video and candidate videos. `AssetPickerDrawer` temporarily replaces the right panel when the user clicks an asset `+` slot.

- [ ] **Step 6: Implement submit validation UX**

When submitting selected shots:

- Block if character or scene assets are missing.
- If only props are missing, open `ConfirmMissingPropsModal`.
- Show current prompt preset name.
- Show final prompt preview for one selected shot.

- [ ] **Step 7: Run frontend tests**

Run: `cd frontend; npm run test -- --run frontend/src/components/jimeng/__tests__/promptHighlight.test.ts frontend/src/components/jimeng/__tests__/jimengStore.test.ts`

Expected: PASS.

- [ ] **Step 8: Checkpoint**

If Git is available:

```bash
git add frontend/src/components/jimeng frontend/src/store/jimengStore.ts frontend/src/lib/jimengApi.ts
git commit -m "feat: add jimeng workbench"
```

---

### Task 10: Asset Manager With Canonical Upload And Voice Preview

**Files:**
- Create: `frontend/src/components/jimeng/JimengAssetManagerPage.tsx`
- Create: `frontend/src/components/jimeng/BatchUploadAssetsModal.tsx`
- Modify: `src/apps/comic_gen/jimeng_api.py`
- Modify: `src/apps/comic_gen/jimeng_storage.py`

- [x] **Step 1: Add backend upload tests**

Extend `tests/test_jimeng_api.py` with:

```python
def test_asset_upload_uses_canonical_name_and_replaces_old_extension(tmp_path):
    client = TestClient(app)
    project = client.post("/jimeng/projects", json={"name": "项目", "style": "", "description": ""}).json()

    first = client.post(
        f"/jimeng/projects/{project['id']}/assets/batch_upload",
        files={"files": ("许禾.png", b"old", "image/png")},
        data={"asset_type": "character"},
    )
    assert first.status_code == 200

    second = client.post(
        f"/jimeng/projects/{project['id']}/assets/batch_upload",
        files={"files": ("许禾.jpg", b"new", "image/jpeg")},
        data={"asset_type": "character"},
    )
    assert second.status_code == 200
    assets = client.get(f"/jimeng/projects/{project['id']}/assets?asset_type=character").json()

    assert assets[0]["name"] == "许禾"
    assert assets[0]["image_filename"] == "许禾.jpg"
```

- [x] **Step 2: Run API test and confirm failure**

Run: `python -m pytest tests/test_jimeng_api.py::test_asset_upload_uses_canonical_name_and_replaces_old_extension -q`

Expected: FAIL until multipart endpoint is complete.

- [x] **Step 3: Implement batch asset upload endpoint**

In `/jimeng/projects/{project_id}/assets/batch_upload`:

- Accept `asset_type`.
- Accept multiple files.
- Derive asset name from filename stem.
- For image files, call `upsert_asset_file(project_id=project_id, asset_type=asset_type, name=asset_name, source_path=upload_path, file_kind="image", content=file_bytes)`.
- For audio files on character type, call `upsert_asset_file(project_id=project_id, asset_type=JimengAssetType.character, name=asset_name, source_path=upload_path, file_kind="audio", content=file_bytes)`.
- Reject audio files for scene and prop.
- Reject names containing `\ / : * ? " < > |`.

- [x] **Step 4: Implement asset manager page**

`JimengAssetManagerPage` must:

- Switch tabs: 角色、场景、道具.
- Search name and aliases.
- Batch upload role/scene/prop files.
- For character cards, upload image and voice separately.
- Render `<audio controls src={voiceUrl}>` for voice preview.
- Display current file extension, such as `许禾.jpg` or `许禾.wav`.

- [x] **Step 5: Run upload tests**

Run: `python -m pytest tests/test_jimeng_api.py tests/test_jimeng_storage.py -q`

Expected: PASS.

- [x] **Step 6: Run frontend lint**

Run: `cd frontend; npm run lint`

Expected: PASS or existing unrelated lint warnings only.

- [x] **Step 7: Checkpoint**

If Git is available:

```bash
git add src/apps/comic_gen/jimeng_api.py src/apps/comic_gen/jimeng_storage.py tests/test_jimeng_api.py frontend/src/components/jimeng/JimengAssetManagerPage.tsx frontend/src/components/jimeng/BatchUploadAssetsModal.tsx
git commit -m "feat: add jimeng asset manager"
```

---

### Task 11: Queue, History, Settings, And Prompt Preset UI

**Files:**
- Create: `frontend/src/components/jimeng/JimengQueuePage.tsx`
- Create: `frontend/src/components/jimeng/JimengGenerationHistoryPage.tsx`
- Create: `frontend/src/components/jimeng/JimengSettingsPage.tsx`
- Create: `frontend/src/components/jimeng/PromptPresetManager.tsx`
- Create: `frontend/src/components/jimeng/PromptPresetEditor.tsx`
- Modify: `frontend/src/store/jimengStore.ts`
- Modify: `frontend/src/lib/jimengApi.ts`

- [x] **Step 1: Implement queue page**

`JimengQueuePage` must:

- Show global queue rows across projects.
- Show status colors: waiting, running, completed, failed, canceled.
- Show failed rows in red with `error_message`.
- Provide start, pause, cancel, retry, reorder controls.
- Show `submit_id`, `gen_status`, `poll_seconds`, and `cli_raw_output` summary.
- Link back to the source shot by selecting project and opening workbench.

- [x] **Step 2: Implement generation history page**

`JimengGenerationHistoryPage` must:

- Filter by project, shot, status, and final lock.
- Show all candidate videos.
- Allow set default and lock final.
- Allow download individual candidate video.

- [x] **Step 3: Implement settings page**

`JimengSettingsPage` must:

- Configure CLI path and default generation parameters.
- Trigger check CLI, login, login debug, relogin, logout, user credit.
- Display `~/.dreamina_cli/config.toml`, `~/.dreamina_cli/tasks.db`, and `~/.dreamina_cli/logs/`.
- Display detected CLI capabilities.

- [x] **Step 4: Implement prompt preset manager**

`PromptPresetManager` and `PromptPresetEditor` must:

- Show 指令模板 and 我的指令.
- Add named custom presets.
- Insert variables: `{{style}}`, `{{camera}}`, `{{era}}`, `{{roles}}`, `{{scene}}`, `{{props}}`, `{{shot_prompt}}`.
- Support 仅保存.
- Support 保存并使用 for current project.

- [x] **Step 5: Run frontend checks**

Run:

```bash
cd frontend
npm run test -- --run frontend/src/components/jimeng/__tests__/jimengStore.test.ts frontend/src/components/jimeng/__tests__/promptHighlight.test.ts
npm run lint
```

Expected: tests PASS; lint PASS or existing unrelated warnings only.

- [x] **Step 6: Checkpoint**

If Git is available:

```bash
git add frontend/src/components/jimeng frontend/src/store/jimengStore.ts frontend/src/lib/jimengApi.ts
git commit -m "feat: add jimeng queue history settings"
```

Task notes:
- Task 10 completed in this workspace. Verified backend upload validation, canonical overwrite behavior, storage rollback cleanup, and asset manager UI lint.
- Task 11 completed in this workspace. Added global queue page, generation history page, Jimeng settings page, global prompt preset manager/editor, reusable UI helpers, and global queue store actions.
- Verification completed for Task 11: `npm run test -- --run src/components/jimeng/__tests__/jimengUiHelpers.test.ts src/components/jimeng/__tests__/jimengStore.test.ts src/components/jimeng/__tests__/promptHighlight.test.ts` passed with 15 tests; targeted `next lint --file ...` passed with no ESLint warnings or errors.
- `npm run typecheck` was attempted and stopped on existing environment dependency issue: `TS2688 Cannot find type definition file for 'whatwg-mimetype'`.
- Git checkpoint skipped because this workspace reports `fatal: not a git repository`.


---

### Task 12: Full Backend And Frontend Integration

**Files:**
- Modify: all new Jimeng backend and frontend files as needed.
- Modify: `docs/superpowers/specs/2026-06-15-jimeng-batch-production-design.md` only if implementation discovers a necessary spec correction.

- [x] **Step 1: Run backend targeted suite**

Run:

```bash
python -m pytest tests/test_jimeng_storage.py tests/test_jimeng_prompting.py tests/test_jimeng_matching.py tests/test_jimeng_cli.py tests/test_jimeng_queue.py tests/test_jimeng_api.py -q
```

Expected: PASS.

Task note: Passed on 2026-06-16 after Dreamina CLI parameter corrections.

```bash
python -m pytest tests/test_jimeng_storage.py tests/test_jimeng_prompting.py tests/test_jimeng_matching.py tests/test_jimeng_cli.py tests/test_jimeng_queue.py tests/test_jimeng_api.py -q
# 88 passed
```

- [x] **Step 2: Run backend broad suite**

Run:

```bash
python -m pytest tests -q
```

Expected: PASS. If unrelated existing failures appear, record the exact failing tests and confirm they are not caused by Jimeng files.

Task note: `dashscope>=1.20.0` was installed into the local Python environment on 2026-06-16 because it is already declared in `requirements.txt` and the backend app imports it during startup. Full backend suite now runs to completion, with Jimeng tests passing and remaining failures outside the Jimeng module.

```bash
python -m pytest tests -q
# 275 passed, 5 failed, 50 warnings
# FAIL tests/test_local_only_flow.py::test_local_only_pipeline_flow_without_oss
# FAIL tests/test_model_catalog.py::TestModelCatalog::test_repo_catalog_builds_with_phase1_compatibility_defaults_and_legacy_model_ids
# FAIL tests/test_provider_media.py::test_dashscope_non_image_local_without_oss_uses_temp_url_and_header[audio]
# FAIL tests/test_provider_media.py::test_dashscope_non_image_local_without_oss_uses_temp_url_and_header[video]
# FAIL tests/test_provider_media.py::test_dashscope_non_image_local_without_oss_uses_temp_url_and_header[reference_video]
```

- [x] **Step 3: Run frontend suite**

Run:

```bash
cd frontend
npm run test -- --run
npm run lint
npm run build
```

Expected: PASS. If build fails because environment variables for existing modules are missing, record the exact message and run the narrow Jimeng tests plus lint as the minimum verification.

Task note: Narrow Jimeng frontend verification passed on 2026-06-16 after settings updates.

```bash
cd frontend
npm run test -- --run src/components/jimeng/__tests__/jimengUiHelpers.test.ts src/components/jimeng/__tests__/jimengStore.test.ts src/components/jimeng/__tests__/promptHighlight.test.ts
# 3 files, 15 tests passed
node node_modules\next\dist\bin\next lint --file src/lib/jimengApi.ts --file src/components/jimeng/JimengSettingsPage.tsx
# No ESLint warnings or errors
```

Task note: Frontend dependency recovery completed on 2026-06-16. `next-intl` and `@types/whatwg-mimetype` package contents were restored with `npm install --prefer-online --registry=https://registry.npmjs.org --replace-registry-host=always --no-audit --no-fund`.

```bash
cd frontend
npm run typecheck
# PASS
npm run build
# PASS, with existing Next.js output:export rewrites warnings
node node_modules\next\dist\bin\next lint --file src/components/settings/SettingsPage.tsx
# No ESLint warnings or errors
```

Task note: Additional local-dev UI fixes completed after browser smoke:
- `frontend/src/lib/api.ts` now routes localhost development ports other than `17177` to the backend on `17177`, so Codex/Next dev ports such as `62072` and `62073` do not send `/jimeng` requests to the frontend server.
- `frontend/src/components/EnvConfigChecker.tsx` skips the mandatory DashScope environment dialog on `#/jimeng`, allowing the Jimeng CLI-only workflow to open without a DashScope key.
- `frontend/src/components/jimeng/JimengSettingsPage.tsx` displays `multimodal limits: images<=9, videos<=3, audios<=3, audio 2-15s`.

```bash
cd frontend
npm run typecheck
# PASS
npm run test -- --run src/components/jimeng/__tests__/jimengUiHelpers.test.ts src/components/jimeng/__tests__/jimengStore.test.ts src/components/jimeng/__tests__/promptHighlight.test.ts
# 15 passed
node node_modules\next\dist\bin\next lint --file src/components/EnvConfigChecker.tsx --file src/components/jimeng/JimengSettingsPage.tsx
# No ESLint warnings or errors
npm run build
# PASS, with existing Next.js output:export rewrites warnings
```

Current non-Jimeng blockers:
- `python -m pytest tests -q` now runs after installing declared dependency `dashscope`, but still has 5 unrelated failures in path separator assertions and global model catalog compatibility assertions.
- `npm run test -- --run` passes Jimeng tests but fails existing global model catalog assertions in `src/__tests__/model-catalog.test.ts` and `src/__tests__/video-params.test.ts`. The failures expect older Wan 2.6/global R2V selector behavior while the current catalog returns Seedance/HappyHorse entries.
- Full lint over `src/lib/api.ts` still reports many pre-existing `@typescript-eslint/no-explicit-any` errors. The Jimeng files and the touched `SettingsPage.tsx` pass targeted lint.

- [x] **Step 4: Manual smoke**

Start backend:

```bash
python -m uvicorn src.apps.comic_gen.api:app --reload --host 0.0.0.0 --port 17177
```

Start frontend:

```bash
cd frontend
npm run dev
```

Manual path:

1. Open `http://localhost:3008`.
2. Click 即梦 sidebar entry.
3. Create a Jimeng project.
4. Import two shots from the text example in the spec.
5. Batch upload `许禾.png`, `许禾.mp3`, `老许农资.png`, `文件夹.png`.
6. Click 匹配资产.
7. Verify prompt highlights differ for role, scene, and prop.
8. Submit selected shots.
9. Open 即梦排队 and verify items are waiting.
10. Use a fake CLI in tests for automated completion; use real `dreamina` only after user confirms account readiness.

Task note: Initial manual browser automation could not be completed on 2026-06-16 because the in-app browser connection repeatedly failed with the local Windows sandbox error `CryptUnprotectData failed: 2148073483`. After sandbox restrictions were lifted, browser smoke completed successfully. Backend and frontend services were started successfully:

```bash
curl.exe -s http://127.0.0.1:17177/health
# {"ok":true,...}
curl.exe -s http://127.0.0.1:62073
# returned the LumenX Studio HTML and sidebar with the Jimeng entry
```

API smoke completed without invoking the real Dreamina generation queue:
- Created project `jimeng_project_6330cb3a0dab4d1f80ff73f00008e372`.
- Created/imported shots, including ASCII smoke shot `jimeng_shot_7936efdb3da0426098fd7ed7a960ac7c`.
- Created assets `XuHe`, `LaoXuNongzi`, and `folder`.
- `POST /jimeng/projects/{project_id}/shots/match_assets` auto-bound character, scene, and prop and returned typed highlight spans.
- `GET /jimeng/settings/cli_capabilities` returned `seedance2.0mini`, `multimodal2video`, ratios `1:1, 3:4, 16:9, 4:3, 9:16, 21:9`, and multimodal limits `9/3/3` with audio `2-15` seconds.
- `GET /jimeng/settings` returned default `model_version=seedance2.0fast` and `video_resolution=720p`.
- Created one local waiting queue item and verified `GET /jimeng/queue` returns `waiting_count=1`; queue was not started.
- Browser smoke verified `http://127.0.0.1:62073/#/jimeng` renders without the DashScope modal, loads the smoke project, enters the workbench, shows the matched role/scene/prop bindings, shows the waiting queue item, and shows settings with `Seedance 2.0 Mini`, default `seedance2.0fast`, `720p`, `multimodal2video`, and multimodal limits.

- [ ] **Step 5: Final checkpoint**

If Git is available:

```bash
git add src/apps/comic_gen frontend/src docs/superpowers
git commit -m "feat: add jimeng batch production module"
```

In the current non-Git workspace, provide the changed file list and verification output in the final report.

---

## Plan Self-Review

- Spec coverage: covered project list, workbench v6 layout, shot import, asset management, canonical filename overwrite, voice upload and preview, asset matching, prompt highlighting, global prompt presets, Dreamina CLI commands, queue execution, failure skip, candidate videos, history, settings, and verification.
- Placeholder scan: searched for `TODO`, `TBD`, `待定`, `占位`, `implement later`, `Similar to`, `省略`, and literal ellipses. No plan placeholders remain.
- Type consistency: backend names use `JimengProject`, `JimengShot`, `JimengAsset`, `JimengAssetBinding`, `JimengQueueItem`, `JimengVideoCandidate`, and `JimengPromptPreset` consistently across storage, API, queue, frontend API, and store tasks.
- Execution note: the current workspace is not a Git repository, so commit checkpoints are written for a Git-enabled execution environment and should be recorded as task checkpoints here.
