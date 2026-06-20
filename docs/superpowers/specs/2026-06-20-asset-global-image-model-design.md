# 资产管理全局生图模型与设置拆分设计

日期：2026-06-20

## 背景

资产管理里的“生图设置”已经承担了模型、画幅、提示词、类型前缀、风格库和发送说明等职责。继续把所有功能塞在一个弹窗页面里，会让页面过长，也会让 `AssetImageSettingsModal.tsx` 越来越臃肿。

同时，单个资产详情和新建资产弹窗仍然提供“生图模型”选择，这和“大模型设置”里的图片模型列表、资产管理全局设置产生了职责重叠。用户希望资产生图模型统一在资产管理的全局设置里选择，单个资产只显示当前全局模型。

## 目标

1. 资产管理新增全局生图模型设置，单张资产 AI 生图和批量资产生图都使用它。
2. 单个资产详情不再选择模型，只显示当前全局模型，并提供进入设置的入口。
3. 新建资产弹窗不再选择模型，避免用户误以为每个资产都有独立模型。
4. “生图设置”弹窗拆成主弹窗 + 多个小页面模块，每个功能模块独立文件实现。
5. README 只展示当前版本、更新概要和更新日志入口；详细更新内容放在 `docs/` 下。
6. 每次更新使用 `v1.00.001`、`v1.00.002` 递增格式，并在更新日志中写到秒。

## 弹窗结构

采用左侧导航 + 右侧当前小页面的结构。

主弹窗 `AssetImageSettingsModal.tsx` 只负责：

- 打开/关闭、脏数据关闭确认。
- 保存按钮和保存状态。
- 当前小页面 tab 状态。
- 向子模块传入 `draft`、`setDraft`、模型列表、风格库回调等必要 props。

拆分的小页面模块：

- `AssetImageModelSettingsSection.tsx`：全局生图模型、默认资产画幅、分辨率。
- `AssetImagePromptSettingsSection.tsx`：全局必填提示词。
- `AssetImageTypePrefixSettingsSection.tsx`：人物、场景、道具前缀提示词。
- `AssetImageStyleSettingsSection.tsx`：风格库应用入口。
- `AssetImageSendPreviewSection.tsx`：展示最终发送规则和当前类型组合预览。

移动端可以让左侧导航自然换成顶部横向滚动按钮，但本次先复用响应式布局，不新增复杂路由。

## 全局模型数据流

扩展 `AssetImageSettings`，新增 `imageModelValue`，格式沿用现有 `llm:<providerId>:<modelId>`。

默认解析顺序：

1. 本地保存的资产全局模型。
2. 大模型设置里的默认图片模型。
3. 图片模型列表中的第一个可用模型。
4. 没有可用模型时显示“未选择可用模型”，后端继续按大模型默认配置报错或兜底。

资产详情调用单张 AI 生图时，解析全局模型并传给 `generateAssetImageWithLlm`。批量生图新增 LLM 批量接口，复用单张 LLM 生图逻辑，不删除旧即梦 CLI 资产生图接口。

## 兼容性

资产数据里的 `image_model` 字段继续保留，用于旧数据、导入导出和即梦 CLI 历史接口。新 UI 不主动修改该字段。

新建资产仍向后端传默认兼容值，避免后端字段约束变化；但 UI 不展示模型选择。

## 文档与版本

README 保持简短：

- 当前版本：`v1.00.001`。
- 最近更新概要：一句话说明本次更新名称。
- 更新日志入口：链接到根目录 `CHANGELOG.md`。

根目录 `CHANGELOG.md` 记录版本列表，每个版本标题包含精确到秒的更新时间，例如：

```md
## v1.00.001 - 2026-06-20 11:30:00 +08:00
```

详细更新说明写入 `docs/releases/v1.00.001-asset-global-image-model.md`，README 不堆长内容。

## 测试与验证

- 本地结构测试验证关键代码连线、模块拆分和文档规则。
- 后端 `python -m compileall backend/app/llm backend/app/api` 通过。
- 前端 `npm run build` 通过。
- `git ls-files tests frontend/src/**/__tests__ runtime_data frontend/dist build_cache releases backend/data` 不应输出路径，确保测试和本地生成数据不会被提交。
