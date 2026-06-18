# Local Queue And Export Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将本地 Dreamina CLI 工具改为 API 与队列 worker 分离的持久化调度架构，正确发送绑定资产参考，并完成目录选择导出、工程拆分与稳定版文档清理。

**Architecture:** FastAPI 只维护 SQLite 状态和业务接口，独立 Python worker 使用数据库租约执行提交与轮询。绑定资产通过参考构建器转换为 multimodal CLI 参数；本地目录选择由受限的系统对话框服务完成。

**Tech Stack:** Python 3.11、FastAPI、SQLite WAL、Pydantic、React 18、TypeScript、Zustand、Axios、pytest、Vite。

---

### Task 1: 独立项目配置与唯一路由

**Files:**
- Create: `pyproject.toml`
- Modify: `backend/app/api/router.py`
- Replace: `backend/app/jimeng_api.py`
- Modify: `tests/test_jimeng_api_split.py`
- Modify: `tests/test_jimeng_asset_import.py`
- Modify: `tests/test_jimeng_deletion.py`
- Modify: `tests/test_jimeng_project_defaults.py`
- Modify: `tests/test_jimeng_shot_duration.py`
- Modify: `tests/test_jimeng_style_presets.py`

- [ ] 写一个失败测试，遍历 FastAPI 路由并断言每个 `(method, path)` 只注册一次，同时断言 `api/router.py` 不导入旧路由。
- [ ] 运行 `python -m pytest tests/test_jimeng_api_split.py -q`，确认重复路由断言失败。
- [ ] 删除 legacy router 挂载，将旧测试改为直接使用拆分模块和 `api.context` 测试存储注入；把 `jimeng_api.py` 缩为兼容模块。
- [ ] 创建独立 `pyproject.toml`，配置 `testpaths=["tests"]`、`pythonpath=["."]`、Python 3.11 和与 `backend/requirements.txt` 一致的依赖。
- [ ] 重跑拆分路由及相关 API 测试，确认通过。

### Task 2: 队列调度字段和全局设置

**Files:**
- Modify: `backend/app/jimeng_models.py`
- Modify: `backend/app/jimeng_storage.py`
- Modify: `backend/app/storage/queue.py`
- Modify: `backend/app/storage/settings.py`
- Modify: `backend/app/api/context.py`
- Modify: `backend/app/api/schemas.py`
- Modify: `backend/app/api/settings.py`
- Create: `tests/test_jimeng_queue_scheduler.py`

- [ ] 写失败测试，断言设置可保存 `submit_interval_seconds=3`、`max_in_flight=10`，并拒绝超出 1-300 秒和 1-50 条的值。
- [ ] 写失败测试，断言队列项支持 `submitting/retry_wait/blocked`、`attempt_count`、`next_attempt_at`、`last_polled_at` 和租约字段。
- [ ] 运行新测试确认因字段和迁移缺失而失败。
- [ ] 添加 SQLite 幂等迁移、WAL/busy timeout、设置默认值和 Pydantic 校验。
- [ ] 实现原子领取、统计在途任务、查找到期轮询任务和释放过期租约的存储方法。
- [ ] 重跑新测试和存储测试。

### Task 3: 绑定资产参考构建器

**Files:**
- Create: `backend/app/queue/references.py`
- Create: `backend/app/queue/__init__.py`
- Modify: `backend/app/storage/queue.py`
- Modify: `backend/app/jimeng_queue.py`
- Modify: `tests/test_jimeng_binding_voice.py`
- Create: `tests/test_jimeng_queue_references.py`

- [ ] 写失败测试，创建角色、场景、道具图片和角色音色绑定，断言调用 `submit_multimodal2video` 时图片顺序为角色、场景、道具，音频只包含已开启音色。
- [ ] 写失败测试覆盖文件缺失、图片超过 9 张、音频超过 3 段和路径去重。
- [ ] 运行测试确认当前 worker 没有从嵌套快照生成参考路径。
- [ ] 实现 `ReferenceBundle` 和 `build_reference_bundle()`，保留资产名称用于错误提示。
- [ ] worker 统一使用参考构建器；绑定资产存在时走 multimodal，显式首帧才走 image2video。
- [ ] 重跑参考、音色和生成参数测试。

### Task 4: 独立持久化队列 worker

**Files:**
- Create: `backend/app/queue/error_policy.py`
- Create: `backend/app/queue/scheduler.py`
- Create: `backend/app/queue_worker.py`
- Modify: `backend/app/cli/errors.py`
- Modify: `backend/app/cli/parser.py`
- Modify: `backend/app/jimeng_queue.py`
- Modify: `backend/app/api/queue.py`
- Modify: `backend/app/main.py`
- Create: `scripts/start_local.ps1`
- Modify: `tests/test_jimeng_queue_background.py`
- Modify: `tests/test_jimeng_queue_recovery.py`
- Create: `tests/test_jimeng_queue_error_policy.py`

- [ ] 写失败测试：在途上限为 3 时第四条不提交；改成 10 后可继续；提交间隔未到时不领取下一条。
- [ ] 写失败测试：一个任务进入 polling 后，调度器可以提交下一条，而不是等待前一条完成。
- [ ] 写失败测试覆盖 queue full 退避、网络重试、登录/积分阻塞、参数错误永久失败。
- [ ] 扩展 CLI 错误分类并实现纯函数错误策略。
- [ ] 实现带租约和心跳的调度循环；API 的开始/暂停只写持久化控制状态，不再创建线程。
- [ ] 添加独立 worker 入口和本地三进程启动脚本。
- [ ] 重跑队列、恢复、CLI 解析与后台测试。

### Task 5: 系统目录选择和视频导出

**Files:**
- Create: `backend/app/services/directory_picker.py`
- Create: `backend/app/services/__init__.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/api/candidates.py`
- Modify: `backend/app/api/schemas.py`
- Modify: `tests/test_jimeng_candidate_export.py`
- Create: `tests/test_directory_picker.py`

- [ ] 写失败测试，断言目录选择仅允许回环客户端、取消返回空值、并发选择被拒绝。
- [ ] 写失败测试，断言单条导出命名为 `分镜N.mp4`，重名默认返回冲突，明确覆盖后成功。
- [ ] 写失败测试，断言批量导出创建“剧本名+年月日时分”目录并处理远程候选下载。
- [ ] 实现可注入的 Tk 目录选择服务、单条导出接口和批量导出增强。
- [ ] 重跑目录选择及候选视频测试。

### Task 6: 前端队列设置和导出交互

**Files:**
- Modify: `frontend/src/lib/jimengApi.ts`
- Modify: `frontend/src/components/jimeng/JimengSettingsPage.tsx`
- Modify: `frontend/src/components/jimeng/ShotProductionTable.tsx`
- Modify: `frontend/src/components/jimeng/ShotDetailPanel.tsx`
- Modify: `frontend/src/components/jimeng/JimengQueuePage.tsx`
- Modify: `frontend/src/components/jimeng/__tests__/jimengStructure.test.mjs`

- [ ] 先增加结构测试，断言设置页出现提交间隔和最大在途数，工作台不再调用 `window.prompt`，右侧存在单条下载按钮。
- [ ] 运行 `npm run test`，确认新增断言失败。
- [ ] 增加目录选择、单条导出和调度设置 API 类型与方法。
- [ ] 设置页使用数字输入保存全局调度参数；工作台批量导出和右侧单条下载调用系统目录选择器。
- [ ] 队列页展示 worker 在线状态、在途数量、阻塞和重试等待状态。
- [ ] 重跑前端测试和 `npm run build`。

### Task 7: 页面与大组件物理拆分

**Files:**
- Move implementations to: `frontend/src/components/jimeng/pages/*.tsx`
- Create: `frontend/src/components/jimeng/assets/AssetToolbar.tsx`
- Create: `frontend/src/components/jimeng/assets/AssetBrowser.tsx`
- Create: `frontend/src/components/jimeng/assets/AssetDetailPanel.tsx`
- Create: `frontend/src/components/jimeng/assets/AssetImageSettingsModal.tsx`
- Create: `frontend/src/components/jimeng/assets/AssetStyleLibraryModal.tsx`
- Create: `frontend/src/components/jimeng/assets/CreateAssetModal.tsx`
- Modify compatibility exports: `frontend/src/components/jimeng/Jimeng*Page.tsx`
- Modify: `frontend/src/components/jimeng/JimengApp.tsx`

- [ ] 增加结构测试，断言 `pages/` 不再反向导入根级页面，根级页面仅为兼容导出，资产管理页面不再包含全部弹窗实现。
- [ ] 运行测试确认旧代理方向导致失败。
- [ ] 逐个迁移页面真实实现，保持公共 API 不变。
- [ ] 将资产管理页按工具栏、浏览器、详情和弹窗拆分，避免行为变化。
- [ ] 运行前端测试和构建，修复循环依赖或类型错误。

### Task 8: 稳定版文档和完整验证

**Files:**
- Modify: `README.md`
- Modify: `docs/使用说明.md`
- Modify: `docs/打包版使用说明.md`
- Create: `docs/development/legacy-multi-account-and-jimeng-api.md`

- [ ] 将多账号、sessionid 和 Jimeng API 实验内容迁入开发历史文档，稳定版文档只保留官方单账号 CLI。
- [ ] 更新本地三进程启动、队列设置、错误分类、参考资产参数、导出方式和缓存目录说明。
- [ ] 运行 `python -m pytest tests -q`，确认全部后端测试通过。
- [ ] 运行 `npm run test` 和 `npm run build`，确认前端测试与构建通过。
- [ ] 启动本地环境，通过浏览器验证设置、工作台、目录选择、队列和生成记录页面，并检查控制台无错误。

