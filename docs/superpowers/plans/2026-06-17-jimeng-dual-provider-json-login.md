# Jimeng Dual Provider JSON Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加即梦 CLI 浏览器 JSON 导入登录、生成 Provider 抽象、Jimeng API 多 sessionid 视频通道，保留现有打包备份不覆盖。

**Architecture:** 现有官方 CLI 仍是默认通道。新增 Provider 层，让队列只调用统一提交/查询接口；CLI Provider 包装现有 `DreaminaCli`，Jimeng API Provider 走 HTTP 接口并按启用的 sessionid 轮换。CLI 账号继续保存 `credential.json`，Jimeng API sessionid 单独保存到设置，不混用。

**Tech Stack:** FastAPI, SQLite, Pydantic, React, TypeScript, Axios, pytest, Vitest/Vite.

---

### Task 1: CLI JSON 导入登录

**Files:**
- Modify: `dreamina_cli/backend/app/jimeng_cli.py`
- Modify: `dreamina_cli/backend/app/api/schemas.py`
- Modify: `dreamina_cli/backend/app/api/settings.py`
- Modify: `dreamina_cli/frontend/src/lib/jimengApi.ts`
- Modify: `dreamina_cli/frontend/src/components/jimeng/JimengSettingsPage.tsx`
- Test: `dreamina_cli/tests/test_jimeng_cli_accounts.py`

- [ ] 后端测试：模拟 `dreamina login --json <payload>` 成功后，把全局 `credential.json` 捕获到目标账号目录。
- [ ] 实现 `DreaminaCli.login_with_json(payload)`，参数必须是 JSON object 或 JSON string，空 `sessionid` 直接报 400。
- [ ] 增加接口 `POST /jimeng/settings/accounts/{account_id}/login_json`，调用 CLI 导入登录并刷新积分。
- [ ] 前端账号卡增加“导入浏览器 JSON”按钮，支持粘贴 JSON；成功后刷新账号列表。

### Task 2: Provider 抽象和官方 CLI Provider

**Files:**
- Create: `dreamina_cli/backend/app/providers/__init__.py`
- Create: `dreamina_cli/backend/app/providers/base.py`
- Create: `dreamina_cli/backend/app/providers/dreamina_cli_provider.py`
- Modify: `dreamina_cli/backend/app/jimeng_queue.py`
- Test: `dreamina_cli/tests/test_jimeng_generation_providers.py`

- [ ] 定义 `VideoGenerationProvider` 协议，包含 `submit_text2video`、`submit_image2video`、`submit_multimodal2video`、`query_result`。
- [ ] 将现有 CLI 调用包装到 `DreaminaCliProvider`，不改变原有 `DreaminaCli` 的对外行为。
- [ ] 队列根据 `asset_snapshot.generation_settings.provider` 选择 provider；默认值为 `dreamina_cli`，确保现有队列测试不变。

### Task 3: Jimeng API 多 sessionid 视频通道

**Files:**
- Create: `dreamina_cli/backend/app/providers/jimeng_api_provider.py`
- Modify: `dreamina_cli/backend/app/api/schemas.py`
- Modify: `dreamina_cli/backend/app/api/settings.py`
- Modify: `dreamina_cli/frontend/src/lib/jimengApi.ts`
- Modify: `dreamina_cli/frontend/src/components/jimeng/JimengSettingsPage.tsx`
- Test: `dreamina_cli/tests/test_jimeng_generation_providers.py`

- [ ] 新增设置结构 `jimeng_api_sessions`：最多先按 UI 支持 5 条，每条包含 `label`、`sessionid`、`enabled`。
- [ ] Jimeng API Provider 提交视频时只从 enabled sessionid 中选取；轮换失败时跳过该 sessionid 并返回清晰错误。
- [ ] 支持 `text2video`、`image2video`、`multimodal2video` 的请求组装，字段映射为 `model`、`prompt`、`duration`、`aspect_ratio`、`resolution`、`images/videos/audios`。
- [ ] 设置页增加 Jimeng API 实验通道区域，按截图提供多 sessionid 输入、启用开关、默认模型、模式、画幅、时长和并发数量字段。

### Task 4: 文档和验证

**Files:**
- Modify: `dreamina_cli/docs/使用说明.md`
- Modify: `dreamina_cli/docs/打包版使用说明.md`

- [ ] 说明两套通道差异：官方 CLI 是默认、Jimeng API 是实验通道。
- [ ] 说明浏览器 JSON 导入只用于登录授权，不自动读取浏览器 Cookie。
- [ ] 运行后端测试：`python -m pytest tests/test_jimeng_cli_accounts.py tests/test_jimeng_generation_providers.py -q`
- [ ] 运行前端结构测试：`npm run test -- --run src/components/jimeng/__tests__/jimengStructure.test.mjs`
- [ ] 运行前端构建：`npm run build`
