# 大模型资产纯文本生图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把佳速 API / OpenAI 兼容大模型能力接到“资产图片纯文本生图”，并把大模型设置从即梦设置中拆成独立模块。

**Architecture:** 大模型代码独立放在 `backend/app/llm/` 和 `frontend/src/components/jimeng/llm/`。后端新增 `/jimeng/llm/*` 设置接口和 `/assets/{asset_id}/llm_image/generate` 生图接口；资产图片生成成功后仍写回现有资产图片字段，方便预览、绑定和导出复用。

**Tech Stack:** FastAPI、SQLite/本地 JSON 设置、React + Zustand、Vite、pytest、Node 结构测试。

---

### Task 1: 后端独立大模型设置与资产生图接口

**Files:**
- Create: `backend/app/llm/models.py`
- Create: `backend/app/llm/settings.py`
- Create: `backend/app/llm/client.py`
- Create: `backend/app/llm/asset_image.py`
- Create: `backend/app/api/llm.py`
- Modify: `backend/app/api/router.py`
- Test: `tests/test_llm_asset_image.py`

- [ ] 写红灯测试：`GET /jimeng/llm/settings` 返回默认佳速 API，`PUT /jimeng/llm/settings` 可保存，`POST /assets/{id}/llm_image/generate` 会用资产描述生成图片并写回资产。
- [ ] 运行 `python -m pytest tests/test_llm_asset_image.py -q`，确认失败原因是接口/模块不存在。
- [ ] 新增 `backend/app/llm/` 专用模块，不复用即梦 CLI adapter。
- [ ] 实现 OpenAI 兼容图片接口：优先解析 `data[0].b64_json`，其次解析图片 URL 并下载。
- [ ] 实现资产提示词：类型前缀 + 全局必填提示词 + 资产描述 + 资产参数。
- [ ] 运行后端测试通过。

### Task 2: 前端独立大模型页面和资产调用

**Files:**
- Create: `frontend/src/components/jimeng/llm/LlmSettingsPage.tsx`
- Create: `frontend/src/components/jimeng/llm/LlmProviderPanel.tsx`
- Create: `frontend/src/components/jimeng/llm/LlmModelList.tsx`
- Create: `frontend/src/components/jimeng/llm/llmDefaults.ts`
- Modify: `frontend/src/components/jimeng/JimengApp.tsx`
- Modify: `frontend/src/lib/jimengApi.ts`
- Modify: `frontend/src/components/jimeng/assets/AssetDetailPanel.tsx`
- Modify: `frontend/src/components/jimeng/pages/JimengSettingsPage.tsx`
- Test: `frontend/src/components/jimeng/__tests__/jimengStructure.test.mjs`

- [ ] 写结构测试：菜单存在“大模型设置”，即梦设置页不含“模型服务”，大模型组件在 `jimeng/llm/` 目录中。
- [ ] 运行前端结构测试，确认失败。
- [ ] 从即梦设置页移除模型服务 UI。
- [ ] 新增大模型设置页面，独立管理供应商、模型、API Key、资产生图默认项。
- [ ] 资产详情“AI 生图”调用大模型纯文本生图接口。
- [ ] 运行 `npm run test -- --run src/components/jimeng/__tests__/jimengStructure.test.mjs` 和 `npm run build`。
