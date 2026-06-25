# JiMengHub 多账号网页通道设计

## 背景

当前项目已经有两条即梦相关路径：

- 官方 CLI：通过本机 `dreamina` 命令提交、轮询和下载视频。
- 网页测试：通过 SessionID/Cookie 验证即梦网页接口是否可用，但目前只作为独立测试页，不进入主分镜生产队列。

用户希望把 `G:\漫剧\LumenX\dreamina_cli\jimenghub` 中的多账号登录和任务绑定思想集成进当前项目，形成一个新的正式模块 `JiMengHub`。这个模块必须与原来的官方 CLI 区分开，不能混成同一个入口。

## 目标

1. 顶部导航新增 `JiMengHub` 模块，用于管理多账号 Cookie、测试账号状态和查看通道说明。
2. 原来的“即梦设置”改名为“官方CLI”，继续负责本机官方 CLI 的安装、登录、积分、队列参数和默认视频参数。
3. 分镜工作台视频模型选择中新增 JiMengHub 模型分组。前端显示 `hub-seedance2.0` 这类名称，后端映射到实际即梦模型。
4. 主分镜队列支持 `provider = jimeng_hub`，任务提交后绑定一个账号，后续轮询和下载必须使用同一个账号 Cookie。
5. 保留现有官方 CLI 通道，不能破坏已有提交、轮询、候选视频和下载流程。
6. 参考 `jimenghub` 的账号池、任务绑定、状态管理思想，不整包复制它的授权后台、小说模块、OSS、图多多、Electron 商业化系统。

## 非目标

1. 不把 `jimenghub/` 目录整体纳入当前项目源码。
2. 不引入 Prisma、Electron 或 Node 后端服务。
3. 不把当前项目迁移到 `jimenghub` 架构。
4. 不在第一期替换官方 CLI。官方 CLI 与 JiMengHub 是并行通道。
5. 不承诺绕过即梦风控。4013、Cookie 失效、账号限额等错误只做明确提示和可重试机制。

## 命名规则

### 页面命名

- `官方CLI`：原“即梦设置”页面，负责本机 CLI。
- `JiMengHub`：新增页面，负责 Cookie/session 多账号网页通道。
- `网页测试`：如保留，仅作为底层接口测试页；正式入口以 `JiMengHub` 为准。

### Provider 命名

- 官方 CLI：`dreamina_cli`
- JiMengHub：`jimeng_hub`

### 模型显示与后端映射

前端显示：

- `hub-seedance2.0-fast`
- `hub-seedance2.0-mini`
- `hub-seedance2.0`
- `hub-seedance2.0-fast-vip`
- `hub-seedance2.0-vip`

后端实际模型：

- `hub-seedance2.0-fast` -> `seedance2.0fast`
- `hub-seedance2.0-mini` -> `seedance2.0mini`
- `hub-seedance2.0` -> `seedance2.0`
- `hub-seedance2.0-fast-vip` -> `seedance2.0fast_vip`
- `hub-seedance2.0-vip` -> `seedance2.0_vip`

队列快照保存前端选择的 `model_version` 和 `provider`，provider 内部再做真实模型映射，方便排查用户选择和后端实际请求之间的关系。

## 后端设计

### 存储

当前已有 `web_session_accounts` 和 `web_session_video_tasks` 表。第一期复用这套 SQLite 存储，避免重复建表。对外接口和前端命名改为 JiMengHub。

需要补充或统一的字段语义：

- `account_id`：任务绑定的账号。
- `cookie_header`：完整 Cookie 或由 sessionid 补齐后的 Cookie。
- `status`：账号状态，例如 `enabled`、`disabled`、`error`、`no_credit`。
- `last_error`：最近一次提交或轮询错误。
- `created_at`、`updated_at`：排序和排查使用。

### API

新增正式接口前缀：

```text
/jimeng/hub/accounts
/jimeng/hub/tasks
/jimeng/hub/diagnostics
```

为了减少改动，可以在实现上复用 `backend/app/api/web_session.py`、`backend/app/storage/web_session.py` 和 `backend/app/web_session_client.py`。旧的 `/jimeng/web-session` 保留给测试页使用。

账号接口能力：

- 新增账号：粘贴 sessionid 或完整 Cookie。
- 诊断 Cookie：提示缺少 `ttwid`、`odin_tt`、`user_spaces_idc` 等关键项。
- 启用/禁用账号。
- 删除账号。
- 测试账号提交。

任务接口能力：

- 查询 JiMengHub 任务记录。
- 手动轮询指定任务。
- 手动拉取已经提交但断网、程序关闭后未回收的视频。
- 失败任务可重试。

### Provider

新增文件：

```text
backend/app/providers/jimeng_hub_provider.py
```

职责：

1. 实现当前队列所需的 `VideoGenerationProvider` 协议。
2. 接收分镜队列传入的提示词、图片参考、视频参数和模型。
3. 从启用账号池中选择可用账号。
4. 提交任务后把 `account_id`、`submit_id`、`history_id` 等信息写入任务结果。
5. 查询结果时必须使用提交时绑定的同一个账号 Cookie。
6. 下载结果时同样使用同一个账号上下文，避免跨账号查不到或 403。

第一期建议优先支持主流程最常用的文本/参考图生成。若网页接口对多张图片、音频、视频参考存在限制，则在错误中明确说明，不静默降级。

### 队列接入

需要修改：

- `backend/app/api/queue.py`
- `backend/app/queue_worker.py`
- `backend/app/jimeng_queue.py`

队列 provider factory 增加：

```text
dreamina_cli -> DreaminaCliProvider
jimeng_hub -> JimengHubProvider
```

提交前校验：

- 如果选择 JiMengHub 模型但没有可用账号，前端或后端直接提示，不加入队列。
- 如果 Cookie 缺关键字段，任务不提交，错误指向 JiMengHub 页面。
- 如果账号正在忙，可按账号池策略选择下一个账号；没有可用账号时任务等待或失败，第一期建议直接失败并给出明确原因，避免用户以为正在制作。

### 错误处理

常见错误提示：

- Cookie 缺失：提示缺少字段，并说明去即梦网页复制完整 Cookie。
- 4013：提示可能是风控、Cookie 不完整、账号环境异常或提交过快。
- 403 下载失败：提示结果下载需要同账号 Cookie，允许手动重新拉取。
- 无可用账号：提示到 JiMengHub 添加或启用账号。
- 提交成功但轮询失败：保留 `submit_id`，允许手动继续拉取。

## 前端设计

### 导航

修改：

- 顶部 `即梦设置` 改成 `官方CLI`。
- 新增 `JiMengHub` 页面。
- 可保留 `网页测试`，但标注为内测/诊断工具。

### JiMengHub 页面

页面功能：

- 账号列表：名称、Cookie 完整度、启用状态、最近错误、更新时间。
- 新增账号：账号名称、sessionid 或完整 Cookie 输入。
- 粘贴 Cookie 按钮：读取剪贴板填入输入框。
- 打开即梦获取 Cookie：打开 `https://jimeng.jianying.com/ai-tool/generate`。
- Cookie 复制教程：弹窗说明从 Network 请求复制完整 Cookie 请求头。
- 测试提交：用选中账号提交一条测试提示词。
- 任务记录：显示提交账号、状态、submit_id、轮询结果、错误、可手动继续拉取。

### 模型选择

修改：

- `frontend/src/lib/jimengApi.ts`
- `frontend/src/components/jimeng/GenerationSettingsControl.tsx`

模型列表分组：

- 官方CLI
- JiMengHub
- 大模型视频模型

选择 JiMengHub 模型时：

- `provider` 自动写入 `jimeng_hub`。
- `model_version` 保存 `hub-*` 显示值。
- 不能被 `normalizeGenerationSettings()` 强制重置为 `dreamina_cli`。

### 分镜提交

单个提交和批量提交都复用同一套 `generation_settings`。

当选择 JiMengHub 模型时：

- 提交按钮仍进入当前主队列。
- 队列页来源显示 `JiMengHub`。
- 分镜右侧状态与官方 CLI 一致：等待、视频制作中、成功、失败、取消。

## 与参考项目的关系

从 `jimenghub` 借鉴：

- 账号池模型。
- 任务绑定账号。
- 同账号轮询和下载。
- Cookie/session 导入体验。
- 任务状态和错误展示。

不借鉴或不直接迁移：

- Prisma 数据层。
- Electron 打包架构。
- 云端授权、代理后台、许可证系统。
- 小说/剧本完整平台。
- OSS、图多多、浏览器插件整套系统。

## 验证方案

### 自动化测试

后端：

- Provider factory 根据 `provider` 返回正确 provider。
- Hub 模型映射正确。
- Cookie 诊断能识别缺失字段。
- JiMengHub provider 提交后保留绑定账号。
- 轮询时使用任务绑定账号，不切换账号。

前端：

- 选择 `hub-*` 模型后 `provider` 为 `jimeng_hub`。
- 选择官方 CLI 模型后 `provider` 为 `dreamina_cli`。
- `normalizeGenerationSettings()` 不再覆盖 Hub provider。

### 手动测试

1. 官方 CLI 模型提交一条分镜，确认旧流程可用。
2. JiMengHub 添加一个完整 Cookie 账号。
3. JiMengHub 测试页提交一条测试任务，确认失败时有明确错误。
4. 分镜工作台选择 `hub-seedance2.0-mini`，提交一条分镜，确认队列来源为 JiMengHub。
5. 断网或关闭程序后，重新打开，手动拉取已提交任务。

## 风险

1. 即梦网页接口可能变动，需集中封装在 `web_session_client.py`。
2. Cookie 不完整会导致 4013，必须在 UI 上提前诊断。
3. 多账号并发过高可能触发风控，第一期默认保守并发。
4. Hub 通道和官方 CLI 通道容易让用户混淆，所以页面和模型分组必须清楚。

## 版本与文档

本功能完成后需要：

- README 当前版本递增到 `v1.00.050`。
- `CHANGELOG.md` 增加 `v1.00.050`。
- `docs/releases/` 增加详细更新说明。
- 提醒用户同步云端版本地址 `https://version.j11.net/`。
