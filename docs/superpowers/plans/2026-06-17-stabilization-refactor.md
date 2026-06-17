# 即梦 CLI 批量工具稳定化重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 稳定化即梦 CLI 批量工具，补齐批量删除、目录隔离、后端/存储拆分、队列恢复、CLI 输出分层、测试和使用手册。

**Architecture:** 采用分阶段兼容重构：先补行为测试和高风险删除规则，再拆 API/存储为小模块，保留现有 `/jimeng` 路径和 `JimengStore` 调用入口。队列使用 SQLite 持久状态恢复，CLI 输出解析独立成 parser/errors 层。

**Tech Stack:** FastAPI、SQLite、Pydantic、React、Vite、TypeScript、Zustand、PyInstaller。

---

### Task 1: 已绑定资产删除保护和批量删除后端

**Files:**
- Modify: `backend/app/jimeng_storage.py`
- Modify: `backend/app/jimeng_api.py`
- Test: `tests/test_jimeng_deletion.py`

- [ ] **Step 1: Write failing tests**

新增测试：创建项目、分镜、资产、绑定；删除已绑定资产时返回 400，错误信息包含 `分镜1`；批量删除中有已绑定资产时整体失败，未绑定资产仍存在。

- [ ] **Step 2: Run tests and verify red**

Run: `python -m pytest tests/test_jimeng_deletion.py -q`
Expected: FAIL，因为删除保护和批量删除接口尚未实现。

- [ ] **Step 3: Implement minimal backend behavior**

在 store 中新增 `asset_binding_shot_indexes()`、`delete_assets()`、`delete_shots()`。在 API 中新增 `AssetBatchDelete`、`ShotBatchDelete` 请求模型和批量删除接口。

- [ ] **Step 4: Run tests and verify green**

Run: `python -m pytest tests/test_jimeng_deletion.py -q`
Expected: PASS。

### Task 2: 分镜批量删除和前端 API

**Files:**
- Modify: `frontend/src/lib/jimengApi.ts`
- Modify: `frontend/src/store/jimengStore.ts`
- Modify: `frontend/src/components/jimeng/ShotProductionTable.tsx`
- Modify: `frontend/src/components/jimeng/JimengWorkbenchPage.tsx`

- [ ] **Step 1: Add API methods**

新增 `batchDeleteShots(projectId, shotIds)`。

- [ ] **Step 2: Add store action**

新增 `deleteSelectedShots()`，删除后刷新项目数据并清空选中项。

- [ ] **Step 3: Add UI button**

分镜工作台批量操作区新增“批量删除分镜”，未选中时禁用，确认后删除。

- [ ] **Step 4: Verify frontend build**

Run: `cd frontend; npm run build`
Expected: PASS。

### Task 3: 资产批量删除和三种预览模式

**Files:**
- Modify: `frontend/src/lib/jimengApi.ts`
- Modify: `frontend/src/components/jimeng/JimengAssetManagerPage.tsx`

- [ ] **Step 1: Add API methods**

新增 `batchDeleteAssets(projectId, assetIds)`。

- [ ] **Step 2: Add selection state**

资产页新增 `selectedAssetIds`，支持单选详情和多选批量删除共存。

- [ ] **Step 3: Add view mode**

新增 `assetViewMode: "compact" | "large" | "preview"`，切换小图标、大图标、预览布局。

- [ ] **Step 4: Add empty detail state**

未选中资产时右侧只展示轻量图标空态，不自动选中第一个资产。

- [ ] **Step 5: Add bound error display**

后端返回绑定分镜序号时，前端原样展示。

### Task 4: 运行数据和构建产物隔离

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/app/jimeng_api.py`
- Modify: `packaging/dreamina_desktop.py`
- Modify: `scripts/build_exe.ps1`
- Create: `.gitignore`
- Create: `scripts/clean_runtime_cache.ps1`

- [ ] **Step 1: Switch dev data default**

开发环境默认 `DREAMINA_CLI_DATA_DIR` 改为项目根 `runtime_data`。

- [ ] **Step 2: Switch build paths**

打包缓存改为 `build_cache`，发布产物改为 `releases`。

- [ ] **Step 3: Add ignore rules**

忽略 `runtime_data/`、`build_cache/`、`releases/`、`frontend/dist/`、`__pycache__/`、日志和 tsbuildinfo。

### Task 5: 后端 API 拆分

**Files:**
- Create: `backend/app/api/router.py`
- Create: `backend/app/api/projects.py`
- Create: `backend/app/api/shots.py`
- Create: `backend/app/api/assets.py`
- Create: `backend/app/api/bindings.py`
- Create: `backend/app/api/queue.py`
- Create: `backend/app/api/candidates.py`
- Create: `backend/app/api/settings.py`
- Create: `backend/app/api/prompt_presets.py`
- Modify: `backend/app/main.py`
- Keep compatibility: `backend/app/jimeng_api.py`

- [ ] **Step 1: Extract shared context**

把 store、settings、dump、call 等共享函数放入 `backend/app/api/context.py`。

- [ ] **Step 2: Move routers by domain**

按项目、分镜、资产、绑定、队列、候选、设置、模板移动接口。每个文件顶部写中文注释。

- [ ] **Step 3: Keep import compatibility**

`jimeng_api.py` 重新导出 router 和测试辅助函数，避免现有测试大改。

### Task 6: 存储层拆分

**Files:**
- Create: `backend/app/storage/schema.py`
- Create: `backend/app/storage/paths.py`
- Create: `backend/app/storage/store.py`
- Create: `backend/app/storage/projects.py`
- Create: `backend/app/storage/shots.py`
- Create: `backend/app/storage/assets.py`
- Create: `backend/app/storage/bindings.py`
- Create: `backend/app/storage/queue.py`
- Create: `backend/app/storage/candidates.py`
- Create: `backend/app/storage/accounts.py`
- Create: `backend/app/storage/presets.py`
- Modify: `backend/app/jimeng_storage.py`

- [ ] **Step 1: Extract schema and paths**

先拆建表和路径安全工具。

- [ ] **Step 2: Extract CRUD mixins**

按数据域拆方法，`JimengStore` 组合 mixin。

- [ ] **Step 3: Keep compatibility**

`jimeng_storage.py` 只导入并导出 `JimengStore`。

### Task 7: CLI 输出解析分层

**Files:**
- Create: `backend/app/cli/models.py`
- Create: `backend/app/cli/errors.py`
- Create: `backend/app/cli/parser.py`
- Create: `backend/app/cli/capabilities.py`
- Modify: `backend/app/jimeng_cli.py`
- Test: `tests/test_jimeng_cli_parser.py`

- [ ] **Step 1: Add parser tests**

覆盖登录授权、积分、submit_id、result_url、未登录、积分不足、未知错误。

- [ ] **Step 2: Extract parser**

把 `_parse_output`、`_parse_json_output`、`_parse_text_output` 移入 parser。

- [ ] **Step 3: Return error category**

CLI task result 增加错误分类字段，前端可展示。

### Task 8: 队列持久恢复

**Files:**
- Modify: `backend/app/jimeng_models.py`
- Modify: `backend/app/jimeng_queue.py`
- Modify: `backend/app/jimeng_storage.py`
- Test: `tests/test_jimeng_queue_recovery.py`

- [ ] **Step 1: Add queue statuses**

新增 `polling`、`orphaned`。

- [ ] **Step 2: Add recovery method**

启动 worker 前恢复 running/polling 状态。

- [ ] **Step 3: Add tests**

覆盖有 submit_id 继续 polling、无 submit_id 变 orphaned。

### Task 9: 前端页面分层

**Files:**
- Create: `frontend/src/components/jimeng/pages/*.tsx`
- Create: `frontend/src/components/jimeng/assets/*.tsx`
- Create: `frontend/src/components/jimeng/workbench/*.tsx`
- Modify: `frontend/src/components/jimeng/JimengApp.tsx`

- [ ] **Step 1: Create page wrappers**

首页、剧本列表、分镜工作台、资产管理、队列、生成记录、设置进入 pages。

- [ ] **Step 2: Move asset subcomponents**

资产卡片、详情面板、预览弹窗、设置弹窗进入 assets。

### Task 10: 测试脚本和使用手册

**Files:**
- Modify: `frontend/package.json`
- Modify: `docs/使用说明.md`
- Create: `scripts/verify_all.ps1`

- [ ] **Step 1: Add frontend test script**

补齐可运行的前端测试命令或先以 Node helper test 作为轻量入口。

- [ ] **Step 2: Add all verification script**

运行后端 pytest、前端 build、API URL 测试。

- [ ] **Step 3: Update manual**

写明缓存位置、CLI 返回、队列状态、多账号、打包和排错。
