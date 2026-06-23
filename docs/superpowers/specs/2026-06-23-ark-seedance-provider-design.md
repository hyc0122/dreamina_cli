# 火山方舟 Seedance 视频接口接入设计

更新时间：2026-06-23 22:30:00 +08:00

## 背景

`方舟` 目录下的四份文档描述的是火山方舟原生视频生成任务接口，不是当前项目已有的即梦 CLI，也不是兼容 `/v1/videos/generations` 的 `jimeng_api_provider`。

本次目标是在“大模型设置”里增加火山方舟 Seedance 视频接口，并让分镜工作台可以选择该接口提交视频任务，作为更稳定的视频生成通道。

## 接入范围

本次接入包含：

- 大模型设置中新增火山方舟视频供应商类型。
- 后端新增火山方舟视频 provider。
- 分镜工作台视频模型选择可以映射到火山方舟 provider。
- 队列 worker 可以用火山方舟创建任务、轮询结果、下载视频。
- 队列取消时尽量调用方舟 DELETE 接口取消排队任务或删除已完成记录。
- 增加离线单元测试，验证请求体、状态映射和结果解析。

本次不包含：

- 不做真实联网测试。
- 不自动开通或查询火山方舟账号权限。
- 不把 Seedance 2.0 mini 写死为默认可用，因为文档说明它预计 2026-06-25 才支持 API 调用。

## 接口依据

方舟文档确认的接口：

- 创建任务：`POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`
- 查询任务：`GET https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}`
- 取消或删除任务：`DELETE https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}`
- 查询列表：`GET https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`

状态映射：

- `queued`、`running` 映射为项目队列运行中。
- `succeeded` 映射为完成，并下载 `content.video_url`。
- `failed`、`expired`、`cancelled` 映射为失败或取消。

关键限制：

- 文生视频可以只传文本。
- 多模态参考生视频最多 9 张图片、3 段视频、3 段音频。
- 音频不能单独提交，至少需要 1 张图片或 1 段视频。
- 成功返回的视频 URL 有效期为 24 小时，worker 应尽快下载到本地。

## 架构设计

新增 `ArkVideoProvider`，实现和现有 `DreaminaCliProvider`、`JimengApiProvider` 相同的视频 provider 方法：

- `submit_text2video`
- `submit_image2video`
- `submit_multimodal2video`
- `query_result`
- `cancel_or_delete_task`

`ArkVideoProvider` 内部负责：

- 用 `Authorization: Bearer <api_key>` 请求火山方舟。
- 构造 `model + content + ratio + resolution + duration` 请求体。
- 将图片、视频、音频参考转为方舟 `content` 数组。
- 解析任务 ID、状态、错误信息和 `content.video_url`。
- 下载视频到队列指定目录。

## 大模型设置设计

在大模型设置中支持新供应商类型：

- `openai_compatible`：现有图片和文本模型接口。
- `volcengine_ark_video`：火山方舟视频任务接口。

火山方舟供应商字段：

- 供应商名称。
- API Key。
- Base URL，默认 `https://ark.cn-beijing.volces.com/api/v3`。
- 视频模型列表，模型 ID 允许填写 Model ID 或 Endpoint ID。

为了避免误解，火山方舟 provider 只显示和视频相关的说明，不参与资产图片生图。

## 分镜队列设计

当前队列设置里 `generation_provider` 会被后端强制清回 `dreamina_cli`，这会阻止新 provider 生效。实现时需要改为允许白名单：

- `dreamina_cli`
- `jimeng_api`
- `volcengine_ark_video`

分镜提交时保存：

- provider：`volcengine_ark_video`
- provider_id：大模型设置里的供应商 ID
- model_version：方舟模型 ID 或 Endpoint ID
- duration、ratio、resolution、poll_seconds 等现有参数

worker 根据 provider 构造对应 provider 实例。方舟任务提交成功后先进入轮询状态，后续用同一个任务 ID 查询结果并下载视频。

## 请求体设计

文生视频：

```json
{
  "model": "<model_or_endpoint_id>",
  "content": [
    { "type": "text", "text": "<prompt>" }
  ],
  "ratio": "9:16",
  "resolution": "720p",
  "duration": 5
}
```

多模态参考：

```json
{
  "model": "<model_or_endpoint_id>",
  "content": [
    { "type": "image_url", "image_url": { "url": "<image_url>" } },
    { "type": "video_url", "video_url": { "url": "<video_url>" } },
    { "type": "audio_url", "audio_url": { "url": "<audio_url>" } },
    { "type": "text", "text": "<prompt>" }
  ],
  "ratio": "9:16",
  "resolution": "720p",
  "duration": 5
}
```

如果项目里的参考素材是本地文件，方舟接口需要可访问 URL。实现时优先支持已有 URL；本地文件后续可以通过项目已有上传或外链机制转成可访问地址。没有 URL 的本地文件应给出明确错误，不静默失败。

## 错误处理

错误提示需要保留方舟返回的错误码和 message。

典型错误：

- 缺 API Key。
- 模型 ID 或 Endpoint ID 不存在。
- 余额或权限不足。
- 参考素材数量超限。
- 本地参考素材没有可访问 URL。
- 任务超时或 URL 过期。

失败队列项应显示可读错误，并允许用户重试。

## 测试计划

新增离线测试：

- 火山方舟创建任务请求体测试。
- 文生视频、多模态参考参数测试。
- 图片 9 张、视频 3 段、音频 3 段上限测试。
- 音频单独提交拦截测试。
- `queued/running/succeeded/failed/expired/cancelled` 状态映射测试。
- 成功结果 `content.video_url` 解析测试。
- 队列 provider 工厂按 `volcengine_ark_video` 构造测试。

验证命令：

- `python -m pytest tests -q`
- `npm run test`
- `npm run build`

## 文档与版本

实现完成后需要同步：

- `README.md` 当前版本和本次更新概要。
- `CHANGELOG.md` 新版本号、更新时间精确到秒。
- `docs/releases/v1.00.045-ark-seedance-provider.md` 写详细修改内容。

## 自检

- 没有未定义字段。
- 接口路径和方舟文档一致。
- 明确区分大模型设置与分镜队列。
- 明确说明本地素材需要可访问 URL，避免实现时误把本地路径直接发给方舟。
- 当前设计聚焦方舟 Seedance 视频接口，没有扩大到资产生图或其他模型能力。
