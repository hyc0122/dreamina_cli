# Launcher Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-based startup manager that opens the running service, scans active ports, closes the service, links to Feishu help/feedback, documents packaged usage, and prevents same-directory multi-instance database contention.

**Architecture:** Keep the existing FastAPI + Vite app. Add runtime endpoints in `backend/app/main.py`, add desktop single-instance discovery in `packaging/dreamina_desktop.py`, and add a `JimengLauncherPage` that is shown at `#/launcher`. The desktop EXE opens `#/launcher` by default; the main production app remains available through `#/app` or any non-launcher route.

**Tech Stack:** FastAPI, uvicorn, urllib, Vite React, TypeScript, Tailwind CSS, lucide-react, pytest, Node structure tests.

---

### Task 1: Runtime Health, Port Scan, and Shutdown

**Files:**
- Modify: `backend/app/main.py`
- Test: `tests/test_runtime_manager.py`

- [ ] **Step 1: Write failing backend tests**

Cover `/health` metadata, `/runtime/instances` scan payload shape, and `/runtime/shutdown` scheduling without actually terminating pytest.

- [ ] **Step 2: Run tests to verify failure**

Run: `python -m pytest tests/test_runtime_manager.py -q`

- [ ] **Step 3: Implement runtime helpers**

Add `STARTED_AT`, `RUNTIME_HOST`, `RUNTIME_PORT`, `discover_runtime_instances()`, `_schedule_shutdown()`, and routes:
- `GET /health`
- `GET /runtime/instances`
- `POST /runtime/shutdown`

- [ ] **Step 4: Run backend tests**

Run: `python -m pytest tests/test_runtime_manager.py tests/test_desktop_packaging.py -q`

### Task 2: Desktop Single Instance and Launcher URL

**Files:**
- Modify: `packaging/dreamina_desktop.py`
- Test: `tests/test_desktop_packaging.py`

- [ ] **Step 1: Write failing packaging tests**

Cover selecting an existing instance when health matches `project_dir`, default launch URL `/#/launcher`, and no duplicate service start when one is already running.

- [ ] **Step 2: Run tests to verify failure**

Run: `python -m pytest tests/test_desktop_packaging.py -q`

- [ ] **Step 3: Implement discovery before port selection**

Before binding a new port, scan `preferred_port..preferred_port+99` for `/health` matching the same `project_dir`. If found, open `http://host:port/#/launcher` and return without starting another uvicorn server.

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_desktop_packaging.py -q`

### Task 3: Frontend Launcher Page and Links

**Files:**
- Create: `frontend/src/components/jimeng/pages/JimengLauncherPage.tsx`
- Modify: `frontend/src/components/jimeng/JimengApp.tsx`
- Modify: `frontend/src/lib/jimengApi.ts`
- Test: `frontend/src/components/jimeng/__tests__/jimengStructure.test.mjs`

- [ ] **Step 1: Write failing structure tests**

Assert that the launcher page exists, the Feishu links exist, `JimengApp` routes `#/launcher`, and `jimengApi` exposes runtime methods.

- [ ] **Step 2: Run frontend test to verify failure**

Run: `cd frontend && npm run test -- --run src/components/jimeng/__tests__/jimengStructure.test.mjs`

- [ ] **Step 3: Implement UI**

Add a full-screen launcher page with a dark glass cockpit look, strong help/feedback links, current root/data/port status, discovered service list, and three main buttons:
- `登录` navigates to `#/app`
- `打开软件` navigates to `#/app`
- `关闭服务` calls `/runtime/shutdown`

- [ ] **Step 4: Add main-app top links**

Add `使用说明` and `问题反馈` links in the existing top header.

- [ ] **Step 5: Run frontend test and build**

Run: `cd frontend && npm run test -- --run src/components/jimeng/__tests__/jimengStructure.test.mjs`

### Task 4: Packaged Usage Documentation

**Files:**
- Create: `docs/打包版使用说明.md`
- Modify: `docs/使用说明.md`

- [ ] **Step 1: Write packaged usage document**

Document copying the full release folder, `data` directory responsibilities, logs, database, generated outputs, CLI profiles, cache, multi-instance rules, shutdown checks, and upgrade rules.

- [ ] **Step 2: Link it from the existing manual**

Add a short section pointing packaged users to `docs/打包版使用说明.md`.

### Task 5: Full Verification and Packaging

**Files:**
- Verify only

- [ ] **Step 1: Run full verification**

Run: `.\scripts\verify_all.ps1`

- [ ] **Step 2: Build EXE**

Run: `.\scripts\build_exe.ps1 -SkipNpmInstall -SkipPythonInstall -AppName "即梦cli批量工具启动管理版"`

- [ ] **Step 3: Smoke test packaged EXE**

Start the EXE with `DREAMINA_DESKTOP_NO_BROWSER=1`, request `/health`, `/runtime/instances`, and `/`, and verify the static page and runtime metadata respond.

