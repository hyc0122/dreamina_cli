# 即梦 CLI 多账号与打包实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已备份的“即梦cli稳定版1”基础上，补齐打包脚本、浅色 UI、CLI 安装、多账号积分、分镜时长检测、分类前缀模板和弹窗交互。

**Architecture:** 后端继续使用 FastAPI + SQLite；多账号采用独立 CLI Profile 目录隔离登录状态，每个账号运行 CLI 时覆盖 `HOME`/`USERPROFILE` 到该账号 profile 目录。前端保持 Vite + React + Zustand，账号池和总积分在即梦设置页展示，队列项通过快照记录提交账号。

**Tech Stack:** Python 3.11, FastAPI, SQLite, PyInstaller, React 18, TypeScript, Tailwind CSS, Vite.

---

### Task 0: 稳定版备份

**Files:**
- Output: `G:\漫剧\LumenX\备份\即梦cli稳定版1.zip`

- [x] **Step 1: 打包当前源码**

生成源码备份包，排除 `frontend/node_modules`、`frontend/dist`、`backend/data`、`__pycache__`。

### Task 1: 打包入口与一键脚本

**Files:**
- Create: `packaging/dreamina_desktop.py`
- Create: `scripts/build_exe.ps1`
- Modify: `README.md`
- Modify: `docs/使用说明.md`

- [ ] **Step 1: 添加桌面启动器**

启动器设置数据目录、挂载前端 `dist`、启动 FastAPI，并自动打开浏览器。

- [ ] **Step 2: 添加一键打包脚本**

脚本执行 `npm install`、`npm run build`、安装 PyInstaller，并生成 `dist_exe/即梦cli批量工具`。

### Task 2: 浅色 UI 与弹窗关闭规则

**Files:**
- Modify: `frontend/src/index.css`
- Modify: modal components under `frontend/src/components/jimeng`

- [ ] **Step 1: 补充主题化弹窗 class**

用 `bg-elevated`、`bg-overlay`、`text-foreground` 替换硬编码 `bg-black`、`bg-[#0b0b10]`、`text-white`。

- [ ] **Step 2: 支持 Esc 和点击空白关闭**

给主要弹窗增加 backdrop click 和 Escape listener。

- [ ] **Step 3: 有脏数据时确认**

编辑类弹窗关闭前提示是否放弃修改。

### Task 3: CLI 检测与一键安装

**Files:**
- Modify: `backend/app/jimeng_api.py`
- Modify: `frontend/src/lib/jimengApi.ts`
- Modify: `frontend/src/components/jimeng/JimengSettingsPage.tsx`

- [ ] **Step 1: 后端安装接口**

增加 `/jimeng/settings/install_cli`，执行 `bash -lc "curl -s https://jimeng.jianying.com/cli | bash"`，返回完整 stdout/stderr。

- [ ] **Step 2: 前端失败态安装按钮**

检测 CLI 失败时显示安装方案、命令和一键安装按钮。

### Task 4: 多账号资料与积分

**Files:**
- Modify: `backend/app/jimeng_models.py`
- Modify: `backend/app/jimeng_storage.py`
- Modify: `backend/app/jimeng_api.py`
- Modify: `backend/app/jimeng_cli.py`
- Modify: `frontend/src/lib/jimengApi.ts`
- Modify: `frontend/src/components/jimeng/JimengSettingsPage.tsx`

- [ ] **Step 1: 新增账号表**

保存账号名称、profile 目录、登录状态、积分、用户名、VIP、到期时间、更新时间。

- [ ] **Step 2: CLI Profile 隔离**

`DreaminaCli` 支持 env override；账号 CLI 设置 `HOME`、`USERPROFILE` 指向 profile 目录。

- [ ] **Step 3: 账号 API**

支持账号列表、创建、删除、查询积分、登录、退出登录。

- [ ] **Step 4: 设置页账号池 UI**

顶部显示积分总额，账号卡片分别显示状态、积分、用户名、VIP、到期时间和操作按钮。

### Task 5: 队列账号选择

**Files:**
- Modify: `frontend/src/components/jimeng/GenerationSettingsControl.tsx`
- Modify: `frontend/src/components/jimeng/ShotDetailPanel.tsx`
- Modify: `frontend/src/components/jimeng/BatchSubmitSettingsModal.tsx`
- Modify: `frontend/src/store/jimengStore.ts`
- Modify: `backend/app/jimeng_queue.py`

- [ ] **Step 1: 提交参数增加账号**

单独提交和批量提交都可选择账号；默认使用当前可用账号。

- [ ] **Step 2: 队列 worker 使用账号 CLI**

队列项读取 `asset_snapshot.generation_settings.account_id`，用对应账号 profile 调用 CLI。

### Task 6: 分镜时长检测和序号

**Files:**
- Modify: `backend/app/jimeng_models.py`
- Modify: `backend/app/jimeng_storage.py`
- Modify: `backend/app/jimeng_api.py`
- Modify: `frontend/src/components/jimeng/ShotProductionTable.tsx`
- Modify: `frontend/src/components/jimeng/ShotDetailPanel.tsx`

- [ ] **Step 1: 分镜保存默认时长**

shots 增加 `default_duration`，提交时优先使用单分镜时长。

- [ ] **Step 2: 一键检测时长**

解析 `总时长：15秒`、`时长 8 秒`、`duration: 6s`，写入分镜默认时长。

- [ ] **Step 3: 序号显示**

UI 从 `#1` 改成 `分镜1`。

### Task 7: 分类前缀提示词

**Files:**
- Modify: `backend/app/jimeng_models.py`
- Modify: `backend/app/jimeng_storage.py`
- Modify: `backend/app/jimeng_api.py`
- Modify: `frontend/src/components/jimeng/JimengAssetManagerPage.tsx`

- [ ] **Step 1: 增加资产分类模板**

保存角色、场景、道具三套前缀提示词。

- [ ] **Step 2: 生图时拼接分类前缀**

资产生图提示词 = 类型前缀 + 资产详情描述 + 资产参数配置。

### Task 8: 验证

**Commands:**
- `python -m pytest tests\test_jimeng_queue_generation_settings.py -q`
- `cd frontend && npm run build`
- `.\scripts\build_exe.ps1`

- [ ] **Step 1: 后端测试**

确认队列参数和账号快照不回退。

- [ ] **Step 2: 前端构建**

确认 TypeScript 和 Vite 构建通过。

- [ ] **Step 3: EXE 打包**

生成 Windows 目录版程序。
