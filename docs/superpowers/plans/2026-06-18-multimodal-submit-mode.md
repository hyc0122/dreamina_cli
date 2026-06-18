# Multimodal Submit Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为单个和批量分镜提交增加明确的生成模式，并保证全能参考素材、自然语言映射和 CLI 参数顺序一致。

**Architecture:** 前端在共享生成参数中保存 `generation_mode`，后端队列快照冻结资产，worker 使用纯函数解析最终模式并构建参考素材映射。CLI 适配器继续只负责重复传递 `--image/--video/--audio` 文件参数。

**Tech Stack:** React 18、TypeScript、Zustand、FastAPI、Pydantic、Python 3.11、pytest、Vitest

---

### Task 1: 后端模式解析与素材映射

**Files:**
- Modify: `backend/app/queue/references.py`
- Modify: `backend/app/jimeng_queue.py`
- Modify: `tests/test_jimeng_queue_references.py`

- [ ] 增加失败测试：`auto` 有图片走 `multimodal2video`，无图片走 `text2video`。
- [ ] 增加失败测试：强制 `multimodal2video` 无图片或视频时返回中文错误且不调用 provider。
- [ ] 增加失败测试：`text2video` 有绑定资产时也不传素材。
- [ ] 增加失败测试：素材映射的图片、视频、音频编号与 provider 参数顺序一致。
- [ ] 实现模式解析和映射文本构建，运行 `python -m pytest tests/test_jimeng_queue_references.py -q`。

### Task 2: 前端单个与批量提交控件

**Files:**
- Modify: `frontend/src/lib/jimengApi.ts`
- Modify: `frontend/src/components/jimeng/GenerationSettingsControl.tsx`
- Modify: `frontend/src/components/jimeng/__tests__/jimengStore.test.ts`
- Modify: `frontend/src/components/jimeng/__tests__/jimengStructure.test.mjs`

- [ ] 增加失败测试：默认参数包含 `generation_mode: "auto"`，队列项保留该字段。
- [ ] 增加失败结构测试：共享控件显示“生成模式”“自动判断”“全能参考”“纯文本生成”。
- [ ] 扩展 `JimengVideoGenerationSettings` 并实现选择控件和说明。
- [ ] 运行前端聚焦测试，确认单个和批量入口共用该设置。

### Task 3: 回归与文档

**Files:**
- Modify: `docs/使用说明.md`

- [ ] 写明全能参考命令规格、素材顺序、自然语言映射及不使用未证实 `@图片1` 语法的原因。
- [ ] 运行后端队列测试、前端测试与前端构建。
- [ ] 浏览器检查单个提交和批量参数弹窗中的模式选择、浅色和深色主题。

