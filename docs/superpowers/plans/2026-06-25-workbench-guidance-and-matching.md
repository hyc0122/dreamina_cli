# 分镜工作台引导与匹配优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成分镜工作台选择、提交、匹配、时长、新手引导、手动拉取和剧本资产继承优化。

**Architecture:** 后端负责可测试的规则与状态变更：结构化匹配、时长识别、音频关闭、手动拉取和继承资产。前端负责低卡顿交互：选择按钮、提交拦截、高亮展示、引导流程和入口按钮。

**Tech Stack:** FastAPI/Pydantic/pytest、React/TypeScript/Zustand/Vite、SQLite 本地存储。

---

### Task 1: 后端匹配与时长规则

**Files:**
- Modify: `backend/app/jimeng_matching.py`
- Modify: `backend/app/api/context.py`
- Modify: `backend/app/api/shots.py`
- Test: `tests/test_jimeng_matching.py`
- Test: `tests/test_jimeng_shot_duration.py`

- [ ] 写失败测试：结构字段完整匹配、场景只匹配一个、短词不误匹配、未识别时长返回分镜号。
- [ ] 实现结构化字段匹配与时长正则增强。
- [ ] 批量检测接口返回 `undetected_shots`。
- [ ] 运行相关 pytest。

### Task 2: 后端音频分析、手动拉取、剧本继承

**Files:**
- Modify: `backend/app/api/shots.py`
- Modify: `backend/app/api/queue.py`
- Modify: `backend/app/api/projects.py`
- Modify: `backend/app/jimeng_queue.py`
- Modify: `backend/app/api/schemas.py`
- Test: `tests/test_jimeng_binding_voice.py`
- Test: `tests/test_jimeng_queue_recovery.py`
- Test: `tests/test_jimeng_project_inherit_assets.py`

- [ ] 写失败测试：无对白分镜关闭音频、有对白不关闭、手动拉取有 submit_id 的队列项、创建剧本继承分镜资产。
- [ ] 实现对应接口和存储调用。
- [ ] 运行相关 pytest。

### Task 3: 前端工作台选择、提交拦截和时长统计

**Files:**
- Modify: `frontend/src/components/jimeng/ShotProductionTable.tsx`
- Modify: `frontend/src/components/jimeng/pages/JimengWorkbenchPage.tsx`
- Modify: `frontend/src/components/jimeng/workbench/ShotDetailPanel.tsx`
- Modify: `frontend/src/lib/jimengApi.ts`

- [ ] 增加“全选未生视频”和数量展示。
- [ ] 批量提交前弹窗列出已生成视频分镜并停止。
- [ ] 显示推荐时长总和。
- [ ] 批量检测后展示未识别分镜号。
- [ ] 增加当前分镜手动拉取按钮。

### Task 4: 前端资产添加、高亮和新手引导

**Files:**
- Modify: `frontend/src/components/jimeng/AssetPickerDrawer.tsx`
- Modify: `frontend/src/components/jimeng/AssetMiniCard.tsx`
- Modify: `frontend/src/store/jimengStore.ts`
- Modify: `frontend/src/components/jimeng/promptHighlight.ts`
- Create: `frontend/src/components/jimeng/onboarding/JimengOnboardingGuide.tsx`

- [ ] 资产名称旁加“添加”按钮。
- [ ] 高亮区分已绑定亮色和未绑定灰色。
- [ ] 增加新手引导 12 步和 localStorage 状态。

### Task 5: 文档、版本、打包和推送

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Create: `docs/releases/v1.00.049-workbench-guidance-and-matching.md`
- Modify: version files as needed
- Modify/Create: `releases/*`

- [ ] 更新版本 `v1.00.049` 和秒级更新时间。
- [ ] 更新 README 当前版本概要、CHANGELOG 和详细发布文档。
- [ ] 运行后端 pytest、前端构建。
- [ ] 打包 releases 安装包并提交推送当前分支。
