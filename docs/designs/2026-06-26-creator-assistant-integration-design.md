# 创作助手集成设计

- 设计时间：2026-06-26 13:07:44 +08:00
- 目标版本：后续实现版本从当前版本继续递增
- 集成来源：`script-creator`
- 新模块名称：创作助手

## 目标

把 `script-creator` 集成到当前项目，作为独立的“创作助手”模块，用于小说创作、短剧剧本创作、15 秒分镜稿创作和作品评测。当前项目原有剧本/分镜/资产/队列链路统一改名为“漫剧制作”，两者通过“一键导入到漫剧制作”打通。

创作助手保留原项目核心能力：首选模型、备选模型 1、备选模型 2、超时后自动切换、多任务并发生成、项目工作台、评分与导出。移除原项目独立 API Key 和独立请求地址配置，所有模型请求统一接入当前项目已有“大模型设置”里的佳速 API/兼容模型配置。

## 范围

本次集成包含四部分：

1. 前端新增“创作助手”模块。
2. 后端新增创作助手文本模型代理路由，底层复用现有 `backend/app/llm` 配置和佳速 API 调用能力。
3. 创作助手结果增加“一键导入到漫剧制作”。
4. 全局主题新增“赛博朋克”，和现有浅色、深色并列。

不再集成 `script-creator` 的独立桌面启动器、独立 Vite 入口、绿色包脚本、独立模型与 API Key 设置页。

## 模块命名

- 原当前项目主链路：从“剧本列表/分镜工作台”语义统一调整为“漫剧制作”。
- 新模块：`创作助手`。
- 原当前项目“大模型设置”保留为全局大模型配置中心。
- 创作助手内部原“全局设置/模型与 API Key”改为“模型策略”，只配置模型选择和生成策略，不再配置 API Key。

## 前端结构

建议新增目录：

- `frontend/src/components/creator/`
- `frontend/src/components/creator/pages/CreatorAssistantPage.tsx`
- `frontend/src/components/creator/services/creatorAiService.ts`
- `frontend/src/components/creator/adapters/importToJimeng.ts`
- `frontend/src/components/creator/types.ts`

从 `script-creator/src` 迁入以下核心模块，并按当前项目别名、样式 token 和 API 方式改造：

- `contexts/AppContext.tsx`
- `components/ConfigPanel`
- `components/SchemeCards`
- `components/ScriptGenerator`
- `components/ProjectWorkbench`
- `components/ProgressBar`
- `components/ExportButton`
- `engines/*`
- `services/selfCheckService.ts`
- `services/scriptEvaluationService.ts`
- `services/qualityService.ts`
- `utils/*`
- `types/index.ts`

不迁入或改造删除：

- `GlobalSettingsPage`
- 独立 `App.tsx` 入口壳
- 独立 `main.tsx`
- 独立 `index.css`
- 独立 API Key/请求地址表单

## 大模型策略

创作助手保留原本请求逻辑：

- 首选模型优先请求。
- 首选模型超时或可重试失败后，切换备选模型 1。
- 备选模型 1 失败后，切换备选模型 2。
- 支持原有多任务并发生成流程。
- 支持流式输出；如果后端当前不可流式，第一阶段可用非流式返回模拟一次性 token，接口保留 stream 字段。

模型策略配置只保存：

- primary_model_id
- fallback_model_id_1
- fallback_model_id_2
- timeout_seconds
- concurrency
- temperature
- max_tokens

模型列表来自当前“大模型设置”的文本模型。API Key、base_url、provider_id 不在创作助手里展示。

## 后端 API

新增路由文件：

- `backend/app/api/creator.py`

建议接口：

- `GET /jimeng/creator/model_options`
- `GET /jimeng/creator/settings`
- `PUT /jimeng/creator/settings`
- `POST /jimeng/creator/chat`
- `POST /jimeng/creator/chat/fallback`

`/chat/fallback` 接收首选和备选模型策略，由后端按顺序调用当前佳速 API/兼容接口。后端负责：

- 从 `load_llm_settings(get_store())` 获取 provider、base_url、api_key。
- 根据模型 id 找到对应文本模型。
- 统一调用聊天补全接口。
- 保留超时和错误摘要。
- 不把 API Key 返回前端。

第一阶段不做数据库化创作助手项目存储，先沿用前端 localStorage 项目体系；后续再决定是否迁移到 SQLite。

## 一键导入到漫剧制作

创作助手结果页增加 `导入到漫剧制作`。

导入规则：

- 15 秒分镜稿：保留原有分镜文本格式，转换为当前漫剧制作分镜导入格式，导入后进入分镜工作台。
- 短剧剧本：允许用户选择“创建漫剧制作项目并导入为分镜草稿”。
- 小说正文：允许用户选择“创建漫剧制作项目并保存为剧本素材”，必要时后续再由创作助手或大模型转分镜。

建议新增前端适配器：

- `parseCreatorStoryboardToJimengShots`
- `buildJimengProjectFromCreatorResult`
- `importCreatorResultToJimeng`

导入时优先复用当前已有 `jimengApi.createProject`、`jimengApi.importShots` 或对应分镜创建接口，不直接写 store。

## 主题设计

现有主题保留：

- 浅色
- 深色

新增：

- 赛博朋克

实现方式：

- 扩展主题状态为 `light | dark | cyberpunk`。
- CSS 新增 `html.cyberpunk` token。
- 所有主界面、创作助手、弹窗、按钮、输入框优先使用当前 token class，不引入第二套完全独立 CSS。

赛博朋克初始视觉：

- 背景：深黑蓝 + 低透明网格/霓虹线条。
- 主色：电蓝、青绿、紫粉少量点缀。
- 卡片：半透明深色，细亮边框。
- 按钮：主按钮使用电蓝/青绿高亮，危险按钮保持红色。

## 风险与控制

风险 1：直接迁入 `script-creator` 会引入大量局部状态和独立样式。

控制：先放在独立 `creator` 模块，保留内部状态边界，只通过后端 API 和导入适配器与漫剧制作通信。

风险 2：原项目模型调用在前端组织 prompt，当前项目 API Key 在后端。

控制：前端仍负责 prompt 构造，后端只做安全代理和模型策略执行。

风险 3：一键导入格式不稳定。

控制：第一阶段只保证 15 秒分镜稿格式稳定导入；小说/剧本导入提供明确选择和预览。

风险 4：赛博朋克主题影响现有浅色/深色。

控制：只通过 `html.cyberpunk` 覆盖 token，避免改动现有 `html.light`、`html.dark` 语义。

## 验证

实施完成后至少验证：

- 创作助手页面可打开。
- 模型策略不显示 API Key。
- 首选模型失败时能按顺序尝试备选模型。
- 创作助手能生成方案/剧本/分镜/评测。
- 15 秒分镜稿可一键导入到漫剧制作。
- 漫剧制作原有分镜、资产、队列、官方 CLI 不受影响。
- 浅色、深色、赛博朋克三种主题可切换。
- `npm run build`
- `python -m compileall backend/app`
