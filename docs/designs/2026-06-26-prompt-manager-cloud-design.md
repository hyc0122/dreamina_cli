# 提示词管理与云端同步设计

- 设计时间：2026-06-26 21:00:24 +08:00
- 目标版本：v1.00.064 为设计确认版本，后续实现版本继续递增
- 新模块名称：提示词管理
- 云端项目名称：prompt-cloud

## 目标

新增独立的“提示词管理”大模块，用于管理视频创作提示词和创作作品提示词。该模块不串联漫剧项目、分镜工作台、资产管理、即梦队列和创作助手，只复用当前应用的全局主题和左侧导航框架。

同时新增一个独立的云端提示词同步小项目，用于免费模板下发、用户模板自动上传、VIP 模板后台预留管理。云端同步项目必须使用独立数据库，不能和当前应用的 `jimeng.sqlite3`、生成记录、资产数据或其他业务数据混用。

## 模块入口

左侧导航新增一级大模块：

- 提示词管理

提示词管理下分两组：

- 视频创作提示词
- 创作作品提示词

视频创作提示词包含：

- 提示词推理模板
- 故事情节模板
- 角色提取模板
- 场景提取模板
- 物品提取模板
- 分镜调整模板

创作作品提示词包含：

- 小说转分镜提示词

## 与现有模块的边界

不复用现有分镜工作台的 `prompt_presets` 作为主数据源。现有 `prompt_presets` 是“视频提交前置模板”，服务于分镜视频提交；新提示词管理是通用提示词库，负责编辑、组合、复制和同步。

提示词管理不直接读取当前剧本、当前分镜、当前资产和当前队列状态。后续如果需要把提示词套用到创作助手或分镜工作台，必须通过明确的导入/选择动作完成，不能默认联动。

## 本地数据库

新增独立本地数据库：

```text
prompt_manager.sqlite3
```

该库只保存提示词管理数据，不写入 `jimeng.sqlite3`。

建议表：

```text
prompt_templates
prompt_template_revisions
prompt_sync_queue
prompt_sync_logs
```

`prompt_templates` 建议字段：

- `id`
- `category`：`video_creation` / `creative_work`
- `template_type`
- `name`
- `source`：`official` / `user` / `user_encrypted` / `vip_placeholder`
- `content`
- `sop_prompt`
- `field_separator`
- `record_separator`
- `output_start`
- `output_end`
- `variables_json`
- `compiled_preview`
- `sync_status`：`local` / `synced` / `pending_upload` / `upload_failed`
- `remote_id`
- `content_hash`
- `created_at`
- `updated_at`

建议索引：

- `category, template_type`
- `source`
- `name`
- `updated_at`
- `content_hash`

## 页面布局

提示词管理页面参考用户截图布局：

- 顶部：模板大类和模板类型切换。
- 左侧：模板列表，显示官方、用户、用户加密、VIP 等来源标签。
- 右侧：模板编辑区。

编辑区通用字段：

- 模板名称
- 模型平台
- 模型选择
- 内容分隔符
- 记录分隔符
- 输出开始符
- 输出结束符
- 变量状态
- 大模型 SOP 提示词
- 模板正文
- 完整提示词预览
- 一键复制完整提示词
- 保存
- 删除
- 从云端同步

模型平台和模型选择第一阶段只作为模板元信息保留，不直接调用大模型，避免和大模型设置、创作助手、漫剧制作链路混在一起。

## 分隔符设置

内容分隔符、记录分隔符、输出开始符、输出结束符均支持“预设下拉 + 自定义输入”。

建议预设：

内容分隔符：

- `===`
- `---`
- `_::FIELD::_`

记录分隔符：

- `_::~RECORD::~_`
- `---RECORD---`
- `### RECORD`

输出开始符：

- `_::~OUTPUT_START::~_`
- `<<<OUTPUT_START>>>`

输出结束符：

- `_::~OUTPUT_END::~_`
- `<<<OUTPUT_END>>>`

## 完整提示词生成规则

完整提示词不是简单拼接，按以下顺序组合：

1. 大模型 SOP 提示词。
2. 当前模板变量说明。
3. 分隔符说明。
4. 模板正文。
5. 输出格式约束。
6. 输出开始符和输出结束符。

生成后的完整提示词用于复制，不直接自动提交给大模型。

## 初始模板来源

首批官方模板从用户提供的本地文件和截图整理：

- `G:/字字/提示词模板.txt`
- `G:/字字/分镜调整模板提示词.txt`

`提示词模板.txt` 初始化为“提示词推理模板”的核心官方模板，保留其中关于即梦 2.0 注释、角色/场景/物品映射、`{{输入文案}}`、`{{故事情节}}`、`{{推文文案}}`、`{{角色信息}}`、`{{场景信息}}`、`{{物品信息}}` 等变量的结构。

`分镜调整模板提示词.txt` 初始化为“分镜调整模板”的官方模板，保留 JSON 分镜划分结构和 `{{故事情节}}`、`{{总分镜数}}`、`{{当前分镜数}}`、`{{单条输入文案}}` 等变量。

其他模板按截图中的结构补齐官方默认模板：

- 故事情节模板
- 角色提取模板
- 场景提取模板
- 物品提取模板
- 小说转分镜提示词

## 云端同步项目

新增独立项目目录：

```text
prompt-cloud/
```

该项目是独立云端服务，可以独立部署到服务器。第一阶段保持简单，重点是数据库、后台管理和同步接口清楚。

云端数据库必须独立：

```text
prompt_cloud.sqlite3
```

服务器部署时可替换为独立 MySQL 或 PostgreSQL，但必须保持独立连接和独立库，不得共用主软件数据库。

## 云端数据分区

云端模板至少分三类：

- `free`：免费版本，可被本地手动同步。
- `user_upload`：用户本地新建或修改后自动上传的模板。
- `vip`：VIP 版本提示词，第一阶段只在后台管理，不同步到本地。

## 云端后台

云端后台需要账号登录入口。

后台功能：

- 管理员登录
- 查看模板列表
- 新增、编辑、删除免费模板
- 查看用户上传模板
- 管理 VIP 模板
- 查看同步日志
- 搜索模板名、分类、来源、更新时间

建议表：

```text
admin_users
cloud_prompt_templates
cloud_prompt_versions
sync_logs
```

建议索引：

- `namespace, category, template_type`
- `name`
- `updated_at`
- `content_hash`

## 同步策略

手动同步：

- 用户在提示词管理点击“从云端同步”。
- 只同步云端 `free` 模板。
- 不同步 `vip` 模板。
- 不覆盖本地用户模板。
- 如果模板名重复，自动生成 `模板名 (2)`、`模板名 (3)`。

自动上传：

- 本地新建用户模板后自动上传到云端 `user_upload`。
- 本地修改用户模板后自动上传修订。
- 上传过程不弹窗、不打断用户。
- 上传失败时本地标记为 `pending_upload` 或 `upload_failed`，下次启动或下次手动同步时重试。

去重：

- 使用 `content_hash` 判断完全相同内容，避免重复上传。
- 同名不同内容按序号重命名。

## API 设计

本地接口建议：

```text
GET    /prompt-manager/templates
POST   /prompt-manager/templates
PUT    /prompt-manager/templates/{id}
DELETE /prompt-manager/templates/{id}
POST   /prompt-manager/templates/{id}/compile
POST   /prompt-manager/sync/download-free
POST   /prompt-manager/sync/upload-pending
GET    /prompt-manager/sync/logs
```

云端接口建议：

```text
POST   /admin/login
GET    /admin/templates
POST   /admin/templates
PUT    /admin/templates/{id}
DELETE /admin/templates/{id}
GET    /api/free-templates
POST   /api/user-templates
POST   /api/sync-log
```

## 主题和交互

提示词管理只使用当前全局主题：

- 默认赛博朋克风格。
- 支持深色和浅色。
- 不新增孤立黑色主题。
- 页面样式使用 `frontend/src/styles/themes/` 中的全局变量和组件皮肤。

交互原则：

- 模板编辑要避免和分镜大列表一样出现输入卡顿。
- 文本区只在保存或轻量防抖后更新预览。
- 完整提示词预览可延迟计算，避免每个按键都重排大文本。
- 本地同步和自动上传异步执行，不阻塞编辑。

## 实施顺序

1. 新增本地提示词管理数据库和存储层。
2. 新增本地提示词管理 API。
3. 初始化官方模板。
4. 新增前端提示词管理导航和页面。
5. 完成模板编辑、变量展示、完整提示词预览和一键复制。
6. 新增独立 `prompt-cloud` 云端小项目。
7. 完成免费模板手动同步。
8. 完成本地用户模板自动上传和失败重试。
9. 完成云端后台登录和模板管理。
10. 更新 README、CHANGELOG 和详细版本文档。

## 验证

实现后至少验证：

- 提示词管理能从左侧独立打开。
- 视频创作提示词和创作作品提示词目录完整。
- 模板名称、分隔符、SOP、正文保存后不影响漫剧项目数据。
- 完整提示词生成符合设置的分隔符和模板正文。
- 一键复制结果可用。
- 免费模板手动同步成功。
- 本地新建用户模板能自动进入待上传或已上传状态。
- 云端数据库与主软件数据库分离。
- VIP 模板不下发到本地。
- 浅色、深色、赛博朋克主题显示正常。
