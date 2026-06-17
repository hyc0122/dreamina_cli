# Workbench C Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the C-version storyboard workbench with fixed shell, independent scroll panes, per-submit generation settings, cleaner login controls, and updated user documentation.

**Architecture:** Keep the existing FastAPI/Zustand/Vite stack. Store per-submit video settings in queue item snapshots and render them from reusable React controls near submit actions.

**Tech Stack:** Python 3.11 FastAPI, SQLite storage, React 18, TypeScript, Zustand, Tailwind CSS, Vite.

---

### Task 1: Queue Item Generation Settings

**Files:**
- Modify: `backend/app/jimeng_queue.py`
- Test: `tests/test_jimeng_queue_generation_settings.py`

- [x] **Step 1: Write failing backend test**

Test creates a queue item with `asset_snapshot.generation_settings` and `poll_seconds=7`, runs the worker, and asserts the CLI call uses `seedance2.0mini`, `16:9`, `1080p`, duration `8`, poll `7`.

- [x] **Step 2: Verify test fails**

Run: `python -m pytest tests\test_jimeng_queue_generation_settings.py -q`

Expected: FAIL because worker uses default `seedance2.0fast`, `9:16`, `720p`, duration `5`, poll `30`.

- [x] **Step 3: Implement queue setting resolution**

Add a worker helper that reads `asset_snapshot.generation_settings`, falls back to queue item `poll_seconds`, then worker defaults.

- [x] **Step 4: Verify test passes**

Run: `python -m pytest tests\test_jimeng_queue_generation_settings.py -q`

Expected: PASS.

### Task 2: Frontend Types And Store Submit API

**Files:**
- Modify: `frontend/src/lib/jimengApi.ts`
- Modify: `frontend/src/store/jimengStore.ts`

- [ ] **Step 1: Add generation settings type**

Create `JimengVideoGenerationSettings` with `model_version`, `duration`, `ratio`, `video_resolution`, and `poll_seconds`.

- [ ] **Step 2: Add explicit submit action**

Add `submitShots(shotIds, generationSettings)` and keep `submitSelectedShots(settings)` as a wrapper.

- [ ] **Step 3: Queue payload**

Each queue item sends `poll_seconds` and `asset_snapshot.generation_settings`.

### Task 3: Workbench Layout And Card List

**Files:**
- Modify: `frontend/src/components/jimeng/JimengApp.tsx`
- Modify: `frontend/src/components/jimeng/JimengWorkbenchPage.tsx`
- Modify: `frontend/src/components/jimeng/ShotProductionTable.tsx`
- Modify: `frontend/src/components/jimeng/ShotPromptCell.tsx`
- Modify: `frontend/src/components/jimeng/AssetSlotCell.tsx`
- Modify: `frontend/src/components/jimeng/AssetMiniCard.tsx`

- [ ] **Step 1: Fixed compact app shell**

Make the app root `h-screen overflow-hidden`, header/nav compact and fixed by flex layout, and page content `min-h-0 flex-1 overflow-hidden`.

- [ ] **Step 2: Independent workbench scroll**

Make workbench root `h-full overflow-hidden`, keep project summary compact, and set left list/right detail as independent `overflow-y-auto` panes.

- [ ] **Step 3: Replace table with card list**

Render each shot as a card with checkbox, index/status, fixed-height prompt, asset sections, and action icons. Remove horizontal overflow.

- [ ] **Step 4: Add all-select**

Add a header checkbox/button that selects or clears all shots.

- [ ] **Step 5: Prompt fixed-height editing**

Non-edit and edit modes use fixed height with internal scroll; double-click enters edit.

- [ ] **Step 6: Asset voice indicator**

Show a highlighted speaker icon for character assets with `audio_path`, with a local toggle to mute/unmute display.

### Task 4: Submit Settings UI

**Files:**
- Create: `frontend/src/components/jimeng/GenerationSettingsControl.tsx`
- Create: `frontend/src/components/jimeng/BatchSubmitSettingsModal.tsx`
- Modify: `frontend/src/components/jimeng/ShotDetailPanel.tsx`
- Modify: `frontend/src/components/jimeng/ShotProductionTable.tsx`
- Modify: `frontend/src/components/jimeng/JimengWorkbenchPage.tsx`

- [ ] **Step 1: Shared settings controls**

Use defaults: `seedance2.0fast`, duration `5`, ratio `9:16`, resolution `720p`, poll `30`.

- [ ] **Step 2: Right panel single submit**

Place controls above submit button and let submit current focused shot without needing checkbox.

- [ ] **Step 3: Batch modal**

Place a settings icon/button beside batch submit; confirm applies settings to selected shots.

### Task 5: Settings Page Cleanup

**Files:**
- Modify: `frontend/src/components/jimeng/JimengSettingsPage.tsx`

- [ ] **Step 1: Remove default generation parameter block**

Keep CLI command path and account/capability sections. Generation parameters live at submit positions.

- [ ] **Step 2: Login button visibility**

Logged-in state shows query credit, logout, and CLI check. Logged-out state shows login and check login.

### Task 6: Documentation And Verification

**Files:**
- Modify: `README.md`
- Create: `docs/使用说明.md`
- Create screenshots under: `docs/screenshots/`

- [ ] **Step 1: Document cache locations**

List SQLite DB, assets, voices, generated videos, uploaded videos, static file URLs.

- [ ] **Step 2: Document full usage workflow**

Cover project creation, import formats, asset import/export, matching, single/batch submit, queue, history, global templates, and settings.

- [ ] **Step 3: Document EXE packaging**

Explain frontend build, backend deps, PyInstaller one-folder path, and runtime data directory.

- [ ] **Step 4: Verify**

Run backend pytest, frontend build, and browser visual checks for the C layout.
