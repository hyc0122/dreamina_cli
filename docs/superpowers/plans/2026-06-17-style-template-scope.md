# Style Template Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split video-template selection per project, split video and asset image style libraries, and make template variable behavior explicit.

**Architecture:** Keep project `prompt_preset_id` as per-project video template binding. Extend `style_presets` with a `scope` column so `video` styles and `image` styles are independently managed. Frontend uses horizontal style chips with one active editor instead of editing an unbounded vertical list.

**Tech Stack:** FastAPI, SQLite, Pydantic, React, TypeScript, Vite, Tailwind, PyInstaller packaging scripts.

---

### Task 1: Backend Style Scopes And Prompt Rendering

**Files:**
- Modify: `backend/app/jimeng_models.py`
- Modify: `backend/app/jimeng_storage.py`
- Modify: `backend/app/api/projects.py`
- Modify: `backend/app/jimeng_prompting.py`
- Modify: `backend/app/api/shots.py`
- Modify: `backend/app/jimeng_api.py`
- Test: `tests/test_jimeng_style_presets.py`

- [ ] Add `scope` and `accent` fields to `JimengStylePreset`.
- [ ] Add `scope` column to `style_presets`, seed default video and image presets.
- [ ] Add `scope` filtering to `list_style_presets(scope)`.
- [ ] Add `scope` to create/update style API.
- [ ] Update prompt rendering so `{{style}}` uses video-scope style prompt.
- [ ] Update prompt rendering so `{{shot_prompt}}` is not appended twice when the template already includes it.
- [ ] Run `python -m pytest tests/test_jimeng_style_presets.py -q`.

### Task 2: Frontend Style Library UI

**Files:**
- Modify: `frontend/src/lib/jimengApi.ts`
- Modify: `frontend/src/components/jimeng/JimengProjectListPage.tsx`
- Modify: `frontend/src/components/jimeng/JimengAssetManagerPage.tsx`
- Modify: `frontend/src/components/jimeng/PromptPresetEditor.tsx`

- [ ] Add `scope` and `accent` fields to `JimengStylePreset` TypeScript type and API methods.
- [ ] Change project style library modal to load and save only `video` styles.
- [ ] Replace vertical multi-item style editing with horizontal style chips and one active editor.
- [ ] Change asset image settings to load only `image` styles.
- [ ] Add asset image style library editor with the same horizontal chip layout.
- [ ] Ensure choosing an image style only reads and appends its prompt to the global required image prompt.
- [ ] Run `cd frontend; npm run build`.

### Task 3: Per-Project Video Template UX And Docs

**Files:**
- Modify: `frontend/src/components/jimeng/PromptPresetManager.tsx`
- Modify: `frontend/src/components/jimeng/JimengSettingsPage.tsx`
- Modify: `docs/使用说明.md`
- Modify: `scripts/build_exe.ps1`

- [ ] Clarify that video templates are reusable globally but selected per project.
- [ ] Explain asset references are submitted from bindings even when `{{roles}}`, `{{scene}}`, and `{{props}}` are omitted.
- [ ] Document that those variables only add text descriptions to the prompt.
- [ ] Document EXE packaging includes Python runtime environment and backend dependencies in the one-folder package, while the official Dreamina CLI is installed/updated externally.
- [ ] Run `npm run test -- --run`, `npm run build`, and `python -m pytest tests -q`.

