# Native Launcher Assets Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native EXE startup manager, make storyboard asset selection include core asset-management tools, and stop misleading users about unsupported Dreamina CLI multi-account isolation.

**Architecture:** Keep the FastAPI + Vite main app. Add backend CLI credential-isolation diagnostics and expose them through settings APIs; add a small native Tkinter launcher in `packaging/dreamina_desktop.py`; extract reusable asset tool components so the workbench asset drawer can reuse the asset manager operations without duplicating export-only features.

**Tech Stack:** Python 3.11, FastAPI, PyInstaller, Tkinter, subprocess, React 18, TypeScript, Zustand, Vitest structure tests, pytest.

---

## File Structure

- `backend/app/api/settings.py`: add account isolation diagnostics and avoid duplicate total credit when CLI reads global credentials.
- `backend/app/jimeng_cli.py`: no major changes expected; use the existing hidden subprocess runner.
- `backend/app/jimeng_models.py`: add optional fields to `JimengCliAccount` if API needs to return isolation warnings.
- `frontend/src/lib/jimengApi.ts`: add settings response types for isolation diagnostics.
- `frontend/src/components/jimeng/JimengSettingsPage.tsx`: display account isolation status and prevent misleading total-credit display.
- `packaging/dreamina_desktop.py`: replace browser launcher default with a native Tkinter startup window.
- `tests/test_jimeng_cli_accounts.py`: add backend tests for isolation diagnostics and duplicate global user detection.
- `tests/test_desktop_packaging.py`: add static/unit tests for native launcher URL behavior and no browser launcher default.
- `frontend/src/components/jimeng/__tests__/jimengStructure.test.mjs`: assert settings warnings and asset drawer integrations exist.
- `frontend/src/components/jimeng/AssetPickerDrawer.tsx`: add compact asset management toolbar and modals.
- `frontend/src/components/jimeng/JimengAssetManagerPage.tsx`: factor shared helpers only when needed; keep export actions page-only.

---

### Task 1: CLI Account Isolation Diagnostics

**Files:**
- Modify: `backend/app/api/settings.py`
- Modify: `backend/app/jimeng_models.py`
- Test: `tests/test_jimeng_cli_accounts.py`

- [ ] **Step 1: Write failing backend tests**

Add tests that prove an empty-profile `user_credit` returning the same user is treated as global credentials, and duplicate account credits are not summed twice.

Run:
`python -m pytest tests/test_jimeng_cli_accounts.py -q`

Expected:
New tests fail because diagnostics are not implemented.

- [ ] **Step 2: Implement diagnostics**

Add helper functions:

```python
def _diagnose_cli_credential_isolation() -> dict[str, Any]:
    # Create a temporary profile env, run dreamina user_credit, parse output.
    # Return supported=false when an empty profile still returns a logged-in user.
```

Expose:

```python
@router.get("/settings/accounts/isolation_diagnostics")
def cli_account_isolation_diagnostics():
    return _call(_diagnose_cli_credential_isolation)
```

Update account list total calculation to count duplicate `user_id` only once when diagnostics show global credentials.

- [ ] **Step 3: Run backend tests**

Run:
`python -m pytest tests/test_jimeng_cli_accounts.py tests/test_jimeng_cli_no_window.py -q`

Expected:
All selected tests pass.

### Task 2: Settings UI for Isolation Status

**Files:**
- Modify: `frontend/src/lib/jimengApi.ts`
- Modify: `frontend/src/components/jimeng/JimengSettingsPage.tsx`
- Test: `frontend/src/components/jimeng/__tests__/jimengStructure.test.mjs`

- [ ] **Step 1: Write failing structure tests**

Assert the frontend has `getCliAccountIsolationDiagnostics`, renders `credential_isolation`, and contains Chinese warning copy for global login state.

Run:
`cd frontend && npm run test -- --run src/components/jimeng/__tests__/jimengStructure.test.mjs`

Expected:
Fails until API and UI text exist.

- [ ] **Step 2: Add API and UI**

Add `jimengApi.getCliAccountIsolationDiagnostics()`.

In settings page:
- load diagnostics alongside account list;
- show a warning panel when `supported === false`;
- show total credit as unique-user total, with a note when duplicate `user_id` values were collapsed;
- on account cards, show a warning when another account has the same `user_id`.

- [ ] **Step 3: Run frontend tests**

Run:
`cd frontend && npm run test -- --run src/components/jimeng/__tests__/jimengStructure.test.mjs`

Expected:
Passes.

### Task 3: Native EXE Startup Manager

**Files:**
- Modify: `packaging/dreamina_desktop.py`
- Test: `tests/test_desktop_packaging.py`

- [ ] **Step 1: Write failing packaging tests**

Assert `_launcher_url()` is no longer the default startup target, and `main()` can call a native launcher function instead of `_open_browser_later`.

Run:
`python -m pytest tests/test_desktop_packaging.py -q`

Expected:
Fails until native launcher function exists.

- [ ] **Step 2: Implement Tkinter launcher**

Add `_show_native_launcher(host, port, data_dir, project_dir)`:
- open main app button -> `webbrowser.open(_app_url(host, port))`;
- scan/open ports button -> show known port list using `/runtime/instances`;
- help/feedback buttons -> open Feishu links;
- close service button -> call `/runtime/shutdown`;
- display root/data/port/PID.

`main()` starts uvicorn in a daemon thread and shows the native launcher window unless `DREAMINA_DESKTOP_NO_BROWSER=1`.

- [ ] **Step 3: Run packaging tests**

Run:
`python -m pytest tests/test_desktop_packaging.py tests/test_runtime_manager.py -q`

Expected:
Passes.

### Task 4: Workbench Asset Drawer Tool Integration

**Files:**
- Modify: `frontend/src/components/jimeng/AssetPickerDrawer.tsx`
- Possibly modify: `frontend/src/components/jimeng/JimengAssetManagerPage.tsx`
- Test: `frontend/src/components/jimeng/__tests__/jimengStructure.test.mjs`

- [ ] **Step 1: Write failing structure tests**

Assert `AssetPickerDrawer.tsx` contains actions for:
- 生图设置
- 批量生图
- 新建资产
- 批量删除
- 批量上传图片/音色
- 导入资产描述

Assert it does not contain export actions.

- [ ] **Step 2: Implement compact toolbar**

Add a compact toolbar above the asset search/list. Reuse existing modals where possible:
- `BatchUploadAssetsModal`
- `AssetMetadataImportModal`
- new or existing create asset modal if exported; otherwise add a compact local create flow.

Keep export buttons absent.

- [ ] **Step 3: Run frontend tests and build**

Run:
`cd frontend && npm run test -- --run src/components/jimeng/__tests__/jimengStructure.test.mjs src/components/jimeng/__tests__/jimengStore.test.ts`

Run:
`cd frontend && npm run build`

Expected:
Tests and build pass.

### Task 5: Full Verification and Package

**Files:**
- Modify docs if behavior changes need user-facing notes.

- [ ] **Step 1: Update docs**

Update:
- `docs/使用说明.md`
- `docs/打包版使用说明.md`

Include:
- native launcher behavior;
- account isolation warning;
- asset drawer integrated tools.

- [ ] **Step 2: Run full verification**

Run:
`.\scripts\verify_all.ps1`

Expected:
Backend tests, frontend tests, and frontend production build pass.

- [ ] **Step 3: Build EXE**

Run:
`.\scripts\build_exe.ps1 -SkipNpmInstall -SkipPythonInstall -AppName "即梦cli批量工具原生启动器版"`

Expected:
Release folder contains EXE, `_internal`, `docs`, and `data`.

- [ ] **Step 4: Smoke test EXE**

Start EXE with `DREAMINA_DESKTOP_NO_BROWSER=1`, discover `/health`, verify `/runtime/instances`, and ensure no stray test process remains.

Expected:
Smoke test prints `SMOKE_OK`.
