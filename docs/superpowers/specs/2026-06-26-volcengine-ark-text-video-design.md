# 火山方舟文本推理与文生视频接入设计

更新时间：2026-06-26 23:59:00 +08:00

## 背景

本项目当前已经有“大模型设置”和官方 CLI 视频队列。用户需要把火山方舟接入大模型设置，并且明确要求同时支持：

- 文本推理：用于创作助手、资产/角色/场景提取、文本改写、分镜调整等文本类能力。
- 文生视频：用于分镜工作台单个提交、批量提交、队列自动提交、任务轮询和视频下载。

火山方舟的文本推理和视频生成不是同一个接口。文本推理走 Chat Completions 风格接口，文生视频走异步任务接口，不能混用请求体。

## 接口依据

火山方舟文本推理：

- 请求地址：`POST https://ark.cn-beijing.volces.com/api/v3/chat/completions`
- 鉴权：`Authorization: Bearer <API_KEY>`
- 请求核心字段：`model`、`messages`、`temperature`、`max_tokens`
- 响应核心字段：`choices[0].message.content`

火山方舟文生视频：

- 创建任务：`POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`
- 查询任务：`GET https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}`
- 取消或删除任务：`DELETE https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}`
- 查询任务列表：`GET https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`
- 鉴权：`Authorization: Bearer <API_KEY>`
- 创建任务核心字段：`model`、`content`、`ratio`、`resolution`、`duration`
- 成功结果：任务状态为 `succeeded` 后，从返回内容中的 `video_url` 下载视频。

## 接入范围

本次第一阶段接入：

- 大模型设置新增火山方舟供应商类型。
- 同一个火山方舟供应商可以配置文本模型和视频模型。
- 文本模型接入现有 `call_chat_completion` 调用链。
- 视频模型接入分镜工作台提交参数和队列 worker。
- 队列支持方舟任务创建、轮询、失败映射和成功视频下载。
- 错误提示保留方舟返回的错误码和 message。

本次不接入：

- 不做真实联网自动验权。
- 不自动查询用户火山账号余额或权限。
- 不把本地图片、音频、视频路径直接发给方舟。方舟视频接口需要可访问 URL；没有公网 URL 的本地素材，第一版只走纯文本文生视频。
- 不影响官方 CLI 默认通道。官方 CLI 仍保留为默认视频生成方式。

## 大模型设置设计

新增供应商类型：

- `openai_compatible`：现有佳速 API / OpenAI 兼容接口。
- `volcengine_ark`：火山方舟，支持文本推理和视频生成。

火山方舟供应商字段：

- 供应商名称。
- 接口类型：火山方舟 Ark。
- Base URL，默认 `https://ark.cn-beijing.volces.com/api/v3`。
- API Key。
- 模型列表。

模型类型继续使用现有 `type` 字段：

- `text`：文本推理模型，走 `/chat/completions`。
- `video`：视频生成模型，走 `/contents/generations/tasks`。

前端说明文案需要从“只用于资产图片纯文本生图”改为“大模型设置统一管理文本、图片和视频模型；官方 CLI 仍在官方 CLI 页面独立管理”。

## 文本推理调用链

后端在 `backend/app/llm/client.py` 中新增方舟文本端点解析：

- 当 `provider.kind == "volcengine_ark"` 时，文本推理端点为 `{base_url}/chat/completions`。
- 不再追加 `/v1/chat/completions`，避免把方舟地址拼错成 `/api/v3/v1/chat/completions`。
- 请求体保持 Chat Completions 风格，兼容项目现有文本调用入口。

文本推理请求示例：

```json
{
  "model": "doubao-xxx-or-endpoint-id",
  "messages": [
    { "role": "user", "content": "请把下面文本整理成分镜。" }
  ],
  "temperature": 0.7,
  "max_tokens": 4096
}
```

调用方不需要知道供应商细节，只通过大模型设置选择启用的文本模型。

## 文生视频调用链

新增方舟视频 provider，遵守现有 `VideoGenerationProvider` 协议：

- `submit_text2video`
- `submit_image2video`
- `submit_multimodal2video`
- `query_result`

第一版重点实现 `submit_text2video` 和 `query_result`。对于图生视频、多模态视频，如果传入的是本地文件路径，则返回明确错误：`火山方舟视频参考素材需要公网 URL`。后续可接 OSS 或外链上传后再放开。

文生视频请求示例：

```json
{
  "model": "doubao-seedance-2-0-fast-xxx",
  "content": [
    { "type": "text", "text": "镜头描述和动作说明" }
  ],
  "ratio": "9:16",
  "resolution": "720p",
  "duration": 10
}
```

状态映射：

- `queued`、`running`：队列中或生成中。
- `succeeded`：完成，下载 `video_url`。
- `failed`：失败，显示错误原因。
- `expired`：失败，提示任务过期。
- `cancelled`：取消。

## 分镜工作台与队列设计

分镜工作台的视频模型来源改为合并：

- 官方 CLI 模型：保留原来的 Seedance 模型。
- 大模型设置里启用的火山方舟视频模型：显示为 `方舟 / 模型名称`。

提交时写入队列快照：

- `provider`: `volcengine_ark`
- `provider_id`: 大模型供应商 ID
- `model_version`: 方舟模型 ID 或 Endpoint ID
- `duration`
- `ratio`
- `video_resolution`
- `poll_seconds`

队列 worker 根据 `provider` 和 `provider_id` 构造 provider：

- `dreamina_cli`：继续使用官方 CLI provider。
- `volcengine_ark`：读取大模型设置中的供应商和模型，创建方舟 provider。

批量提交和单个提交共用同一套参数映射，避免出现单个能用、批量不能用的问题。

## 错误处理

需要明确展示以下错误：

- 火山方舟供应商未启用。
- 火山方舟 API Key 为空。
- 选择的模型不是视频模型或文本模型。
- 方舟接口返回 401/403/429/5xx。
- 方舟任务失败、过期或取消。
- 视频任务成功但没有返回 `video_url`。
- 方舟视频参考素材是本地路径，不是公网 URL。

错误信息进入队列记录，用户可以在即梦排队页查看并重试。

## 与提示词管理模块的顺序

本次实施顺序固定为：

1. 完成火山方舟文本推理和文生视频接入。
2. 验证大模型设置、文本推理、分镜文生视频队列。
3. 更新版本、README、CHANGELOG 和详细发布文档。
4. 再开始提示词管理模块项目。

提示词管理模块仍然是独立模块，不调用大模型；它只复用全局主题和后续可能使用的文本模型配置。

## 测试计划

后端离线测试：

- 方舟文本推理端点拼接测试。
- 方舟文本请求体测试。
- 方舟视频创建任务请求体测试。
- 方舟视频状态映射测试。
- 方舟视频成功结果 `video_url` 解析测试。
- 队列 provider factory 按 `volcengine_ark` 构造 provider 测试。

前端结构测试：

- 大模型设置可选择火山方舟供应商类型。
- 模型列表支持 `text` 和 `video`。
- 分镜工作台视频模型列表包含启用的方舟视频模型。
- 批量提交弹窗保留方舟 provider/model 参数。

建议验证命令：

```powershell
python -m pytest tests -q
npm run test
npm run build
git diff --check
```

## 自检

- 文本推理和文生视频接口已经分开，没有混用请求体。
- 默认官方 CLI 不受影响。
- 大模型设置只新增供应商类型和模型类型映射，不把方舟塞进佳速逻辑。
- 第一版明确限制本地素材不能直接传给方舟视频任务。
- 实施顺序明确：先方舟，再提示词管理。
