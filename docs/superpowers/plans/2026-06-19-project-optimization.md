# Project Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add versioned release documentation, keep README compact, make published source verification reliable without bundled test files, and improve the visible LLM/queue/startup status surfaces.

**Architecture:** Treat release metadata as a small cross-file contract: `CHANGELOG.md`, README current version, `pyproject.toml`, and `frontend/package.json` must agree. Add script checks that enforce version consistency and published-source scope. UX improvements stay in existing React pages and PowerShell scripts without changing ports, data directories, or core generation flow.

**Tech Stack:** Markdown, PowerShell, Python packaging metadata in `pyproject.toml`, npm package metadata, React + TypeScript + Vite, FastAPI backend.

---

## Scope Check

This plan covers three related optimization tracks from the approved design:

1. Release maintenance and documentation.
2. User-facing stability/status improvements.
3. Light code-structure guardrails.

The plan does not perform a full backend or frontend refactor. It creates the versioning foundation first, then makes small targeted UX and maintenance improvements that are independently verifiable.

## File Structure

- Create `CHANGELOG.md`: canonical update history with version, date, summary, changes, and known limits.
- Modify `README.md`: add current version and changelog link near the top; keep usage overview compact.
- Modify `pyproject.toml`: keep `project.version` synchronized.
- Modify `frontend/package.json`: keep `version` synchronized.
- Create `scripts/check_version.ps1`: verify the version contract across metadata files.
- Create `scripts/check_release_scope.ps1`: verify tracked files do not include local data, build output, or test directories.
- Modify `scripts/verify_all.ps1`: run release checks and build; run local tests only when the local ignored test files exist.
- Modify `scripts/start_local.ps1`: print API URL, web URL, worker PID, data dir, and process metadata path.
- Modify `frontend/src/components/jimeng/llm/LlmSettingsPage.tsx`: make image/video adaptation status explicit.
- Modify `frontend/src/components/jimeng/pages/JimengQueuePage.tsx`: add clearer worker/queue status details.
- No changes to `docs/使用说明.md` unless explicitly requested later; it currently has local uncommitted changes.

## Task 1: Add Canonical Changelog and README Version Entry

**Files:**
- Create: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `pyproject.toml`
- Modify: `frontend/package.json`

- [ ] **Step 1: Create `CHANGELOG.md` with the initial version record**

Create `CHANGELOG.md` with this content:

```markdown
# 更新日志

所有重要更新都记录在这里。每次更新必须同步版本号和更新内容。

## v0.1.0 - 2026-06-19

### 更新摘要

建立 Dreamina CLI 即梦批量生产工具的独立源码版本，包含后端 API、前端工作台、队列 worker、资产管理、大模型设置、打包脚本和 GitHub 使用说明。

### 新增内容

- 独立 FastAPI 后端和 Vite React 前端。
- 剧本、分镜、资产、队列、生成记录、即梦设置和大模型设置页面。
- 独立队列 worker，支持提交、轮询、失败跳过和候选视频回收。
- 资产图片纯文本生图的大模型设置入口。
- Windows 本地启动和打包脚本。

### 修复内容

- README 改为 GitHub 可读链接和拉取说明。
- 大弹窗使用不透明面板，提升文字可读性。
- 分镜工作台“参数设置”只保存参数，“批量提交”负责提交。

### 调整内容

- README 保留项目入口、环境、拉取、安装和启动说明。
- 本地运行数据、构建产物和测试目录不作为发布源码内容。

### 已知限制

- 大模型视频接口未完全适配，目前视频模型只作为参数选择展示。
- 即梦官方模型列表仍需要前端、后端和 CLI 校验处同步维护。
```

- [ ] **Step 2: Add current version and changelog link to `README.md`**

Insert this block after the badge line near the top of `README.md`:

```markdown
当前版本：`v0.1.0`

更新日志：[CHANGELOG.md](./CHANGELOG.md)
```

Expected top section:

```markdown
# Dreamina CLI 即梦批量生产工具

[![说明文档](https://img.shields.io/badge/说明文档-README-0ea5e9)](https://github.com/hyc0122/dreamina_cli#readme)

当前版本：`v0.1.0`

更新日志：[CHANGELOG.md](./CHANGELOG.md)

这是一个独立的即梦 CLI 批量分镜生产工具...
```

- [ ] **Step 3: Verify package versions are already aligned**

Confirm `pyproject.toml` contains:

```toml
version = "0.1.0"
```

Confirm `frontend/package.json` contains:

```json
{
  "version": "0.1.0"
}
```

If either file differs, set it to `0.1.0`.

- [ ] **Step 4: Inspect the changed docs**

Run:

```powershell
git diff -- README.md CHANGELOG.md pyproject.toml frontend/package.json
```

Expected: README has only the current version/changelog block; `CHANGELOG.md` has the initial `v0.1.0` entry; package versions are `0.1.0`.

- [ ] **Step 5: Commit release docs**

Run:

```powershell
git add README.md CHANGELOG.md pyproject.toml frontend/package.json
git commit -m "docs: add versioned changelog"
```

Expected: commit succeeds and does not include `docs/使用说明.md`.

## Task 2: Add Version and Release Scope Checks

**Files:**
- Create: `scripts/check_version.ps1`
- Create: `scripts/check_release_scope.ps1`
- Modify: `.gitignore`

- [ ] **Step 1: Create `scripts/check_version.ps1`**

Create `scripts/check_version.ps1`:

```powershell
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = (Resolve-Path -LiteralPath (Join-Path $ScriptDir "..")).Path

$pyproject = Get-Content -Encoding UTF8 -Raw -Path (Join-Path $Root "pyproject.toml")
$packageJson = Get-Content -Encoding UTF8 -Raw -Path (Join-Path $Root "frontend/package.json") | ConvertFrom-Json
$readme = Get-Content -Encoding UTF8 -Raw -Path (Join-Path $Root "README.md")
$changelog = Get-Content -Encoding UTF8 -Raw -Path (Join-Path $Root "CHANGELOG.md")

$pyVersion = [regex]::Match($pyproject, '(?m)^version\s*=\s*"([^"]+)"').Groups[1].Value
$npmVersion = [string]$packageJson.version
$readmeVersion = [regex]::Match($readme, '当前版本：`v([^`]+)`').Groups[1].Value
$changelogVersion = [regex]::Match($changelog, '(?m)^## v([0-9]+\.[0-9]+\.[0-9]+)\s+-\s+[0-9]{4}-[0-9]{2}-[0-9]{2}').Groups[1].Value

$versions = @($pyVersion, $npmVersion, $readmeVersion, $changelogVersion)
if ($versions | Where-Object { -not $_ }) {
  throw "版本检查失败：pyproject、package.json、README 或 CHANGELOG 缺少版本号。"
}

if (($versions | Select-Object -Unique).Count -ne 1) {
  throw "版本检查失败：版本号不一致。pyproject=$pyVersion, package=$npmVersion, README=$readmeVersion, CHANGELOG=$changelogVersion"
}

Write-Host "版本检查通过：v$pyVersion" -ForegroundColor Green
```

- [ ] **Step 2: Create `scripts/check_release_scope.ps1`**

Create `scripts/check_release_scope.ps1`:

```powershell
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = (Resolve-Path -LiteralPath (Join-Path $ScriptDir "..")).Path

Push-Location $Root
try {
  $tracked = git ls-tree -r --name-only HEAD
}
finally {
  Pop-Location
}

$blockedPatterns = @(
  '^tests/',
  '(^|/)__tests__/',
  '^runtime_data/',
  '^backend/data/',
  '^backend/1/',
  '^frontend/dist/',
  '^frontend/node_modules/',
  '^build_cache/',
  '^releases/',
  '^dist_exe/',
  '^build_exe/',
  '\.pyc$',
  '(^|/)__pycache__/'
)

$blocked = @()
foreach ($path in $tracked) {
  foreach ($pattern in $blockedPatterns) {
    if ($path -match $pattern) {
      $blocked += $path
      break
    }
  }
}

if ($blocked.Count -gt 0) {
  $blockedText = $blocked -join [Environment]::NewLine
  throw "发布范围检查失败，以下文件不应出现在 Git 跟踪内容中：$([Environment]::NewLine)$blockedText"
}

Write-Host "发布范围检查通过：未跟踪测试、本地数据或构建产物。" -ForegroundColor Green
```

- [ ] **Step 3: Verify `.gitignore` protects local files**

Ensure `.gitignore` contains these entries:

```gitignore
runtime_data/
build_cache/
releases/
backend/data/
backend/1/
build_exe/
dist_exe/
frontend/dist/
frontend/node_modules/
frontend/.vite/
frontend/tsconfig.tsbuildinfo
frontend/src/**/__tests__/
tests/
*.log
__pycache__/
*.py[cod]
.pytest_cache/
.superpowers/
```

- [ ] **Step 4: Run the new checks**

Run:

```powershell
.\scripts\check_version.ps1
.\scripts\check_release_scope.ps1
```

Expected:

```text
版本检查通过：v0.1.0
发布范围检查通过：未跟踪测试、本地数据或构建产物。
```

- [ ] **Step 5: Commit release checks**

Run:

```powershell
git add .gitignore scripts/check_version.ps1 scripts/check_release_scope.ps1
git commit -m "chore: add release verification checks"
```

Expected: commit succeeds with only script and ignore-rule changes.

## Task 3: Make `verify_all.ps1` Work With Published Source

**Files:**
- Modify: `scripts/verify_all.ps1`

- [ ] **Step 1: Replace `scripts/verify_all.ps1` with optional local test execution**

Update `scripts/verify_all.ps1` to:

```powershell
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = (Resolve-Path -LiteralPath (Join-Path $ScriptDir "..")).Path
$Frontend = Join-Path $Root "frontend"

Write-Host "== version check ==" -ForegroundColor Cyan
& (Join-Path $ScriptDir "check_version.ps1")

Write-Host "== release scope check ==" -ForegroundColor Cyan
& (Join-Path $ScriptDir "check_release_scope.ps1")

$backendTests = Join-Path $Root "tests"
if (Test-Path -LiteralPath $backendTests) {
  Write-Host "== backend pytest ==" -ForegroundColor Cyan
  Push-Location $Root
  try {
    python -m pytest tests -q
  }
  finally {
    Pop-Location
  }
}
else {
  Write-Host "== backend pytest skipped: tests directory is not published ==" -ForegroundColor Yellow
}

Write-Host "== frontend build ==" -ForegroundColor Cyan
Push-Location $Frontend
try {
  $frontendRunner = Join-Path $Frontend "src/__tests__/runAll.mjs"
  if (Test-Path -LiteralPath $frontendRunner) {
    Write-Host "== frontend tests ==" -ForegroundColor Cyan
    npm run test
  }
  else {
    Write-Host "== frontend tests skipped: frontend test runner is not published ==" -ForegroundColor Yellow
  }
  npm run build
}
finally {
  Pop-Location
}

Write-Host "== verification complete ==" -ForegroundColor Green
```

- [ ] **Step 2: Run full verification**

Run:

```powershell
.\scripts\verify_all.ps1
```

Expected in a fresh published checkout without test files:

```text
== version check ==
版本检查通过：v0.1.0
== release scope check ==
发布范围检查通过：未跟踪测试、本地数据或构建产物。
== backend pytest skipped: tests directory is not published ==
== frontend build ==
== frontend tests skipped: frontend test runner is not published ==
...
== verification complete ==
```

Expected in the current local workspace with ignored tests present: backend and frontend tests may run if their files exist; `npm run build` must pass.

- [ ] **Step 3: Commit verification behavior**

Run:

```powershell
git add scripts/verify_all.ps1
git commit -m "chore: make verification work without published tests"
```

Expected: commit succeeds.

## Task 4: Improve Startup Script Output

**Files:**
- Modify: `scripts/start_local.ps1`

- [ ] **Step 1: Add explicit output paths and URLs**

In `scripts/start_local.ps1`, replace the final `Write-Host` line with:

```powershell
$ProcessFile = Join-Path $RuntimeDir "local-processes.json"

Write-Host "本地服务已启动" -ForegroundColor Green
Write-Host "API 地址：http://127.0.0.1:$ApiPort"
Write-Host "网页地址：http://127.0.0.1:$WebPort/#/jimeng"
Write-Host "数据目录：$DataDir"
Write-Host "进程记录：$ProcessFile"
Write-Host "API PID=$($api.Id)，Worker PID=$($worker.Id)，Web PID=$($web.Id)"
```

Also update the JSON write block to use `$ProcessFile`:

```powershell
$ProcessFile = Join-Path $RuntimeDir "local-processes.json"
@{
    api_pid = $api.Id
    worker_pid = $worker.Id
    web_pid = $web.Id
    api_url = "http://127.0.0.1:$ApiPort"
    web_url = "http://127.0.0.1:$WebPort/#/jimeng"
    data_dir = $DataDir
} | ConvertTo-Json | Set-Content -Encoding UTF8 $ProcessFile
```

- [ ] **Step 2: Run syntax check**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start_local.ps1 -ApiPort 18178 -WebPort 62101
```

Expected: starts services on alternate ports and prints API URL, web URL, data directory, process record path, and process IDs.

- [ ] **Step 3: Stop the temporary processes**

Run:

```powershell
$processFile = "runtime_data\runtime\local-processes.json"
$processes = Get-Content -Encoding UTF8 -Raw -Path $processFile | ConvertFrom-Json
@($processes.api_pid, $processes.worker_pid, $processes.web_pid) | ForEach-Object {
  Stop-Process -Id $_ -ErrorAction SilentlyContinue
}
```

Expected: temporary processes stop.

- [ ] **Step 4: Commit startup output**

Run:

```powershell
git add scripts/start_local.ps1
git commit -m "chore: clarify local startup output"
```

Expected: commit succeeds.

## Task 5: Make LLM Capability Status Explicit

**Files:**
- Modify: `frontend/src/components/jimeng/llm/LlmSettingsPage.tsx`

- [ ] **Step 1: Add a small capability status list**

In `LlmSettingsPage.tsx`, add this block under the existing red warning paragraph:

```tsx
<div className="mt-3 grid gap-2 sm:grid-cols-2">
  <div className="rounded-md border border-emerald-400/25 bg-emerald-500/10 px-3 py-2">
    <p className="text-xs font-semibold text-emerald-200">图片生图：已接入</p>
    <p className="mt-1 text-xs leading-5 text-text-secondary">资产管理可使用 type=image 的大模型做纯文本生图。</p>
  </div>
  <div className="rounded-md border border-red-400/25 bg-red-500/10 px-3 py-2">
    <p className="text-xs font-semibold text-red-200">视频生成：未完全适配</p>
    <p className="mt-1 text-xs leading-5 text-text-secondary">type=video 模型目前只进入模型选择，不代表已能完成视频提交。</p>
  </div>
</div>
```

- [ ] **Step 2: Build frontend**

Run:

```powershell
cd frontend
npm run build
cd ..
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 3: Commit LLM status UI**

Run:

```powershell
git add frontend/src/components/jimeng/llm/LlmSettingsPage.tsx
git commit -m "feat: clarify llm capability status"
```

Expected: commit succeeds.

## Task 6: Strengthen Queue Status Messaging

**Files:**
- Modify: `frontend/src/components/jimeng/pages/JimengQueuePage.tsx`

- [ ] **Step 1: Add a derived queue status message**

In `JimengQueuePage.tsx`, after `const [currentPage, setCurrentPage] = useState(1);`, add:

```tsx
const queueHealthMessage = useMemo(() => {
  if (!queueStatus?.worker_online) {
    return "独立 worker 离线：请确认本地启动脚本或打包启动器已启动 worker。";
  }
  if (!queueStatus.started) {
    return "队列已暂停：点击开始队列后才会继续提交和轮询。";
  }
  if ((queueStatus.in_flight_count ?? 0) > 0) {
    return `队列运行中：当前有 ${queueStatus.in_flight_count} 个在途任务。`;
  }
  if (statusCounts.waiting > 0) {
    return `队列运行中：还有 ${statusCounts.waiting} 个等待任务。`;
  }
  return "队列空闲：没有正在处理或等待提交的任务。";
}, [queueStatus?.in_flight_count, queueStatus?.started, queueStatus?.worker_online, statusCounts.waiting]);
```

- [ ] **Step 2: Render the queue status message**

Below the existing worker status grid, add:

```tsx
<p className="mt-2 rounded-md border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-xs leading-5 text-blue-100">
  {queueHealthMessage}
</p>
```

- [ ] **Step 3: Build frontend**

Run:

```powershell
cd frontend
npm run build
cd ..
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 4: Commit queue status messaging**

Run:

```powershell
git add frontend/src/components/jimeng/pages/JimengQueuePage.tsx
git commit -m "feat: clarify queue health messaging"
```

Expected: commit succeeds.

## Task 7: Add Lightweight Structure Guardrails

**Files:**
- Create: `docs/development/maintenance-guidelines.md`
- Modify: `README.md`

- [ ] **Step 1: Create maintenance guidelines**

Create `docs/development/maintenance-guidelines.md`:

```markdown
# 维护规范

## 版本记录

- 每次更新必须写入根目录 `CHANGELOG.md`。
- README 只保留当前版本和更新日志链接，不复制完整更新历史。
- `CHANGELOG.md`、README、`pyproject.toml`、`frontend/package.json` 的版本号必须一致。

## 发布范围

- GitHub 发布源码不包含 `tests/`、`__tests__/`、`runtime_data/`、`backend/data/`、`backend/1/`、`frontend/dist/`、`build_cache/`、`releases/`。
- 发布前运行 `.\scripts\verify_all.ps1`。

## 前端结构

- 新页面实现放在 `frontend/src/components/jimeng/pages/`。
- 资产相关组件放在 `frontend/src/components/jimeng/assets/`。
- 分镜工作台相关组件放在 `frontend/src/components/jimeng/workbench/`。
- 大模型相关组件放在 `frontend/src/components/jimeng/llm/`。
- 根目录兼容导出文件只用于旧引用过渡，新代码优先从实现目录导入。

## 后端结构

- API 路由放在 `backend/app/api/`。
- SQLite 读写逻辑放在 `backend/app/storage/`。
- 队列调度和错误策略放在 `backend/app/queue/`。
- 生成 provider 放在 `backend/app/providers/`。
- 大模型独立能力放在 `backend/app/llm/`。
```

- [ ] **Step 2: Link maintenance guidelines from README**

In README, under “常用脚本” or “目录结构”, add:

```markdown
维护规范：

```text
docs/development/maintenance-guidelines.md
```
```

If nesting fenced blocks is awkward while editing, use this single sentence instead:

```markdown
维护规范见 `docs/development/maintenance-guidelines.md`。
```

- [ ] **Step 3: Commit maintenance docs**

Run:

```powershell
git add README.md docs/development/maintenance-guidelines.md
git commit -m "docs: add maintenance guidelines"
```

Expected: commit succeeds.

## Task 8: Final Verification and Push

**Files:**
- No new files unless verification reveals a defect.

- [ ] **Step 1: Run full verification**

Run:

```powershell
.\scripts\verify_all.ps1
```

Expected:

- Version check passes.
- Release scope check passes.
- Local tests run only if ignored local test files exist.
- Frontend build passes.

- [ ] **Step 2: Confirm published tree excludes local-only paths**

Run:

```powershell
git ls-tree -r --name-only HEAD | rg '(^tests/|__tests__|frontend/dist|runtime_data|backend/data|backend/1|build_cache|releases)'
```

Expected: no output.

- [ ] **Step 3: Push to GitHub**

Run:

```powershell
git push origin main
```

Expected: push succeeds.

## Self-Review

### Spec coverage

- Release maintenance: Tasks 1, 2, 3, 7, and 8.
- README compactness: Tasks 1 and 7.
- Version synchronization: Tasks 1 and 2.
- Published-source scope: Tasks 2, 3, and 8.
- Startup status: Task 4.
- LLM capability boundary: Task 5.
- Queue status clarity: Task 6.
- Structure guardrails: Task 7.

### Red-flag scan

The plan contains concrete file paths, commands, expected results, and code blocks for every file-changing step. It avoids open-ended instructions and does not require publishing local test files.

### Type and property consistency

- Frontend uses existing `queueStatus.worker_online`, `queueStatus.started`, and `queueStatus.in_flight_count` properties from `JimengQueuePage.tsx`.
- Version strings use package format `0.1.0` and display format `v0.1.0`.
- PowerShell scripts use existing repository paths and do not change default ports or data directories.
