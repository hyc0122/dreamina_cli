# 火山方舟 Seedance Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在大模型设置中新增火山方舟 Seedance 视频接口，并让分镜工作台可以通过本地队列使用该接口生成和下载视频。

**Architecture:** 新增 `ArkVideoProvider` 适配火山方舟原生任务式 API，保持与现有 `DreaminaCliProvider` / `JimengApiProvider` 相同的 provider 协议。大模型设置负责保存方舟 API Key、Base URL 和视频模型 ID，分镜提交把 `llm:<providerId>:<modelId>` 解析为队列 `generation_settings`，worker 根据 provider 构造真实视频通道。

**Tech Stack:** FastAPI 后端、SQLite 本地存储、Python `urllib.request`、React/TypeScript 前端、现有 `npm run test` 与 `pytest` 测试体系。

---

## File Structure

- Create: `backend/app/providers/ark_video_provider.py`
  - 火山方舟视频任务 provider，负责创建任务、轮询、状态映射和视频下载。
- Create: `backend/app/providers/factory.py`
  - 根据 `generation_settings.provider` 和大模型设置构造 provider，避免 worker 里堆条件分支。
- Modify: `backend/app/providers/__init__.py`
  - 导出 `ArkVideoProvider` 和工厂函数。
- Modify: `backend/app/providers/base.py`
  - 为协议补充可选 `cancel_or_delete_task`。
- Modify: `backend/app/api/context.py`
  - 放开 `generation_provider` 白名单，不再强制写回 `dreamina_cli`。
- Modify: `backend/app/queue_worker.py`
  - worker 运行时使用 provider factory，不再强制 `force_provider_name="dreamina_cli"`。
- Modify: `backend/app/api/queue.py`
  - 队列扩展工厂与取消行为预留方舟任务取消。
- Modify: `backend/app/llm/models.py`
  - `LlmProviderSetting.kind` 支持 `volcengine_ark_video`。
- Modify: `backend/app/llm/settings.py`
  - 新增默认方舟供应商和归一化。
- Modify: `frontend/src/lib/jimengApi.ts`
  - 扩展 provider kind、视频设置字段。
- Modify: `frontend/src/components/jimeng/llm/llmDefaults.ts`
  - 新增方舟默认供应商。
- Modify: `frontend/src/components/jimeng/llm/LlmProviderPanel.tsx`
  - UI 支持选择火山方舟接口类型和默认地址说明。
- Modify: `frontend/src/components/jimeng/llm/LlmModelList.tsx`
  - 方舟供应商添加模型时默认类型为 `video`。
- Modify: `frontend/src/components/jimeng/GenerationSettingsControl.tsx`
  - 不再强制 provider 为 `dreamina_cli`，解析 `llm:` 视频模型选项。
- Modify: `frontend/src/components/jimeng/pages/JimengWorkbenchPage.tsx`
  - 从设置加载 provider，提交时保留大模型视频模型来源。
- Modify: `frontend/src/store/jimengStore.ts`
  - 将 `provider_id` 和 `model_id` 写入队列 `generation_settings`。
- Test: `tests/test_ark_video_provider.py`
  - 单测方舟 provider 请求体、状态解析、下载逻辑。
- Test: `tests/test_jimeng_generation_providers.py`
  - 单测队列 worker 能选择 `volcengine_ark_video`。
- Test: `frontend/src/components/jimeng/llm/__tests__/llmDefaults.behavior.test.mjs`
  - 单测默认方舟供应商存在且是视频模型。
- Docs: `README.md`、`CHANGELOG.md`、`docs/releases/v1.00.047-ark-seedance-provider.md`
  - 同步版本与说明。

---

### Task 1: Backend Ark Provider

**Files:**
- Create: `backend/app/providers/ark_video_provider.py`
- Modify: `backend/app/providers/__init__.py`
- Modify: `backend/app/providers/base.py`
- Test: `tests/test_ark_video_provider.py`

- [ ] **Step 1: Write failing provider tests**

Create `tests/test_ark_video_provider.py` with tests covering:

```python
from pathlib import Path

import pytest

from backend.app.providers.ark_video_provider import ArkHttpResponse, ArkVideoProvider


def test_ark_text2video_posts_task_body():
    calls = []

    def http_request(method, url, headers, body, timeout):
        calls.append({"method": method, "url": url, "headers": headers, "body": body, "timeout": timeout})
        return ArkHttpResponse(status_code=200, text='{"id":"cgt-1","status":"queued"}')

    provider = ArkVideoProvider(base_url="https://ark.example/api/v3", api_key="key-1", http_request=http_request)
    result = provider.submit_text2video(
        prompt="小猫奔跑",
        duration=5,
        ratio="9:16",
        video_resolution="720p",
        poll_seconds=30,
        model_version="doubao-seedance-2-0-pro",
    )

    assert result.submit_id == "cgt-1"
    assert result.gen_status == "queued"
    assert calls[0]["method"] == "POST"
    assert calls[0]["url"] == "https://ark.example/api/v3/contents/generations/tasks"
    assert calls[0]["headers"]["Authorization"] == "Bearer key-1"
    assert calls[0]["body"] == {
        "model": "doubao-seedance-2-0-pro",
        "content": [{"type": "text", "text": "小猫奔跑"}],
        "ratio": "9:16",
        "resolution": "720p",
        "duration": 5,
    }


def test_ark_multimodal_requires_visual_reference():
    provider = ArkVideoProvider(base_url="https://ark.example/api/v3", api_key="key-1")
    with pytest.raises(ValueError, match="至少需要 1 张图片或 1 段视频"):
        provider.submit_multimodal2video(audio_paths=["https://example.com/a.mp3"], prompt="测试")
```

- [ ] **Step 2: Run failing tests**

Run: `python -m pytest tests/test_ark_video_provider.py -q`

Expected: FAIL because `backend.app.providers.ark_video_provider` does not exist.

- [ ] **Step 3: Implement ArkVideoProvider**

Create `backend/app/providers/ark_video_provider.py` with:

```python
import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Optional, Sequence

from ..jimeng_cli import DreaminaTaskResult


@dataclass
class ArkHttpResponse:
    status_code: int
    text: str
    headers: dict[str, str] | None = None


ArkHttpRequest = Callable[[str, str, dict[str, str], dict[str, Any] | None, float], ArkHttpResponse]
_RUNNING = {"queued", "running"}
_SUCCESS = {"succeeded"}
_FAILED = {"failed", "expired", "cancelled", "canceled"}


class ArkVideoProvider:
    def __init__(self, base_url: str, api_key: str, timeout: float = 1200, http_request: ArkHttpRequest | None = None):
        self.base_url = (base_url or "https://ark.cn-beijing.volces.com/api/v3").rstrip("/")
        self.api_key = api_key.strip()
        self.timeout = timeout
        self.http_request = http_request or _default_http_request

    def submit_text2video(self, prompt: str, duration: int, ratio: str, video_resolution: str, poll_seconds: int, model_version: str = "") -> DreaminaTaskResult:
        body = self._base_body(prompt, duration, ratio, video_resolution, model_version)
        return self._create_task(body)

    def submit_image2video(self, image_path: Path | str, prompt: str, duration: int, ratio: str = "9:16", video_resolution: str = "720p", poll_seconds: int = 30, model_version: str = "") -> DreaminaTaskResult:
        return self.submit_multimodal2video([image_path], [], [], prompt, duration, ratio, video_resolution, poll_seconds, model_version)

    def submit_multimodal2video(self, image_paths: Optional[Sequence[Path | str]] = None, video_paths: Optional[Sequence[Path | str]] = None, audio_paths: Optional[Sequence[Path | str]] = None, prompt: str = "", duration: int = 5, ratio: str = "9:16", video_resolution: str = "720p", poll_seconds: int = 30, model_version: str = "") -> DreaminaTaskResult:
        images = _normalize_refs(image_paths)
        videos = _normalize_refs(video_paths)
        audios = _normalize_refs(audio_paths)
        if not images and not videos:
            raise ValueError("火山方舟多模态参考至少需要 1 张图片或 1 段视频")
        if len(images) > 9:
            raise ValueError("火山方舟图片参考不能超过 9 张")
        if len(videos) > 3:
            raise ValueError("火山方舟视频参考不能超过 3 段")
        if len(audios) > 3:
            raise ValueError("火山方舟音频参考不能超过 3 段")
        body = self._base_body("", duration, ratio, video_resolution, model_version)
        content = []
        content.extend({"type": "image_url", "image_url": {"url": _require_url(value)}} for value in images)
        content.extend({"type": "video_url", "video_url": {"url": _require_url(value)}} for value in videos)
        content.extend({"type": "audio_url", "audio_url": {"url": _require_url(value)}} for value in audios)
        if prompt.strip():
            content.append({"type": "text", "text": prompt})
        body["content"] = content
        return self._create_task(body)

    def query_result(self, submit_id: str, download_dir: Optional[Path] = None) -> DreaminaTaskResult:
        response = self._request("GET", f"{self.base_url}/contents/generations/tasks/{submit_id}", None)
        result = _parse_task_response(response.text)
        if result.result_url and download_dir:
            result.local_paths = [_download_video(result.result_url, download_dir, submit_id, self.timeout)]
        return result

    def cancel_or_delete_task(self, submit_id: str) -> ArkHttpResponse:
        return self._request("DELETE", f"{self.base_url}/contents/generations/tasks/{submit_id}", None)

    def _base_body(self, prompt: str, duration: int, ratio: str, video_resolution: str, model_version: str) -> dict[str, Any]:
        if not self.api_key:
            raise ValueError("火山方舟供应商缺少 API Key")
        if not model_version.strip():
            raise ValueError("火山方舟视频模型缺少 Model ID 或 Endpoint ID")
        return {
            "model": model_version.strip(),
            "content": [{"type": "text", "text": prompt}],
            "ratio": ratio,
            "resolution": video_resolution,
            "duration": int(duration),
        }

    def _create_task(self, body: dict[str, Any]) -> DreaminaTaskResult:
        response = self._request("POST", f"{self.base_url}/contents/generations/tasks", body)
        return _parse_task_response(response.text)

    def _request(self, method: str, url: str, body: dict[str, Any] | None) -> ArkHttpResponse:
        response = self.http_request(method, url, {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}, body, self.timeout)
        if not 200 <= response.status_code < 300:
            raise ValueError(f"火山方舟接口返回错误 {response.status_code}: {response.text}")
        return response
```

- [ ] **Step 4: Export provider and protocol method**

Modify `backend/app/providers/__init__.py`:

```python
from .ark_video_provider import ArkVideoProvider
from .dreamina_cli_provider import DreaminaCliProvider
from .jimeng_api_provider import JimengApiProvider, JimengApiSession
```

Modify `backend/app/providers/base.py` to add:

```python
    def cancel_or_delete_task(self, submit_id: str) -> object:
        ...
```

- [ ] **Step 5: Run provider tests**

Run: `python -m pytest tests/test_ark_video_provider.py -q`

Expected: PASS.

---

### Task 2: LLM Settings Support For Ark Video Provider

**Files:**
- Modify: `backend/app/llm/models.py`
- Modify: `backend/app/llm/settings.py`
- Modify: `frontend/src/lib/jimengApi.ts`
- Modify: `frontend/src/components/jimeng/llm/llmDefaults.ts`
- Modify: `frontend/src/components/jimeng/llm/LlmProviderPanel.tsx`
- Modify: `frontend/src/components/jimeng/llm/LlmModelList.tsx`
- Test: `tests/test_jimeng_model_settings.py`
- Test: `frontend/src/components/jimeng/llm/__tests__/llmDefaults.behavior.test.mjs`

- [ ] **Step 1: Write backend settings test**

Append to `tests/test_jimeng_model_settings.py`:

```python
def test_default_llm_settings_include_ark_video_provider():
    from backend.app.llm.settings import ARK_VIDEO_BASE_URL, default_llm_settings

    settings = default_llm_settings()
    provider = next(item for item in settings.providers if item.id == "volcengine_ark")
    assert provider.kind == "volcengine_ark_video"
    assert provider.base_url == ARK_VIDEO_BASE_URL
    assert any(model.type == "video" for model in provider.models)
```

- [ ] **Step 2: Add default provider constants**

Modify `backend/app/llm/settings.py`:

```python
ARK_VIDEO_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
ARK_DEFAULT_VIDEO_MODEL = "doubao-seedance-2-0-pro"
```

Add provider in `default_llm_settings()`:

```python
LlmProviderSetting(
    id="volcengine_ark",
    name="火山方舟 Seedance",
    kind="volcengine_ark_video",
    enabled=False,
    base_url=ARK_VIDEO_BASE_URL,
    api_key="",
    models=[
        LlmModelSetting(id=ARK_DEFAULT_VIDEO_MODEL, name="Seedance 2.0 Pro / Endpoint", type="video", enabled=True),
    ],
)
```

- [ ] **Step 3: Update frontend defaults**

Modify `frontend/src/components/jimeng/llm/llmDefaults.ts` with matching constants and provider:

```ts
export const ARK_VIDEO_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
export const ARK_DEFAULT_VIDEO_MODEL = "doubao-seedance-2-0-pro";
```

Append to `createDefaultLlmProviders()`:

```ts
{
  id: "volcengine_ark",
  name: "火山方舟 Seedance",
  kind: "volcengine_ark_video",
  enabled: false,
  base_url: ARK_VIDEO_BASE_URL,
  api_key: "",
  models: [{ id: ARK_DEFAULT_VIDEO_MODEL, name: "Seedance 2.0 Pro / Endpoint", type: "video", enabled: true }],
}
```

- [ ] **Step 4: Update provider UI**

In `LlmProviderPanel.tsx`, add `<option value="volcengine_ark_video">火山方舟视频任务接口</option>` and show Ark official endpoint note when `activeProvider.kind === "volcengine_ark_video"`.

In `LlmModelList.tsx`, set added model default type:

```ts
const defaultModelType = providerKind === "volcengine_ark_video" ? "video" : "image";
```

Pass `providerKind` from `LlmProviderPanel` to `LlmModelList`.

- [ ] **Step 5: Run settings tests**

Run:

```powershell
python -m pytest tests/test_jimeng_model_settings.py -q
node frontend/src/components/jimeng/llm/__tests__/llmDefaults.behavior.test.mjs
```

Expected: PASS.

---

### Task 3: Queue Provider Factory And Runtime Wiring

**Files:**
- Create: `backend/app/providers/factory.py`
- Modify: `backend/app/api/context.py`
- Modify: `backend/app/queue_worker.py`
- Modify: `backend/app/api/queue.py`
- Modify: `backend/app/jimeng_queue.py`
- Test: `tests/test_jimeng_generation_providers.py`
- Test: `tests/test_jimeng_queue_worker_runtime.py`

- [ ] **Step 1: Write queue factory test**

Append to `tests/test_jimeng_generation_providers.py`:

```python
def test_queue_worker_can_request_ark_video_provider(tmp_path: Path):
    store = JimengStore(db_path=tmp_path / "jimeng.sqlite3", output_root=tmp_path / "output")
    project = store.create_project("project")
    shot = store.create_shot(project.id, "prompt")
    provider = RecordingProvider()
    requested = []
    item = store.create_queue_item(
        project_id=project.id,
        shot_id=shot.id,
        final_prompt_snapshot="final prompt",
        asset_snapshot={"generation_settings": {"provider": "volcengine_ark_video", "provider_id": "volcengine_ark", "model_version": "doubao-seedance-2-0-pro"}},
    )

    def provider_factory(provider_name, account_id=None, provider_id=None):
        requested.append((provider_name, provider_id))
        return provider

    worker = JimengQueueWorker(store=store, cli=object(), provider_factory=provider_factory)
    worker.start(max_items=1)

    assert requested == [("volcengine_ark_video", "volcengine_ark")]
    assert store.get_queue_item(item.id).status.value == "completed"
```

- [ ] **Step 2: Create provider factory**

Create `backend/app/providers/factory.py`:

```python
from typing import Any

from ..api.context import dreamina_cli, get_store
from ..llm.settings import load_llm_settings
from .ark_video_provider import ArkVideoProvider
from .dreamina_cli_provider import DreaminaCliProvider


def build_video_provider(provider_name: str, account_id: str | None = None, provider_id: str | None = None) -> Any:
    if provider_name == "dreamina_cli":
        return DreaminaCliProvider(dreamina_cli())
    if provider_name == "volcengine_ark_video":
        settings = load_llm_settings(get_store())
        provider = next((item for item in settings.providers if item.id == (provider_id or "volcengine_ark")), None)
        if provider is None:
            raise ValueError(f"未找到火山方舟供应商: {provider_id or 'volcengine_ark'}")
        if not provider.enabled:
            raise ValueError(f"火山方舟供应商未启用: {provider.name}")
        return ArkVideoProvider(base_url=provider.base_url, api_key=provider.api_key)
    raise ValueError(f"unknown generation provider: {provider_name}")
```

- [ ] **Step 3: Allow provider settings**

Modify `backend/app/api/context.py`:

```python
_ALLOWED_GENERATION_PROVIDERS = {"dreamina_cli", "jimeng_api", "volcengine_ark_video"}
```

In `_sanitize_runtime_settings`, replace forced assignment with:

```python
provider = str(cleaned.get("generation_provider") or _DEFAULT_RUNTIME_SETTINGS["generation_provider"])
cleaned["generation_provider"] = provider if provider in _ALLOWED_GENERATION_PROVIDERS else "dreamina_cli"
```

- [ ] **Step 4: Wire worker runtime**

Modify `backend/app/queue_worker.py`:

```python
from .providers.factory import build_video_provider
```

Use:

```python
provider_factory=build_video_provider,
force_provider_name=None,
```

- [ ] **Step 5: Preserve provider_id in queue settings**

Modify `JimengQueueWorker._generation_settings()` to return:

```python
"provider_id": _string_setting(settings.get("provider_id"), ""),
```

Modify `_provider_for_item()`:

```python
provider_id = settings["provider_id"]
return self.provider_factory(provider_name, account_id, provider_id)
```

Keep a fallback for old two-argument factories by catching `TypeError`.

- [ ] **Step 6: Run queue tests**

Run:

```powershell
python -m pytest tests/test_jimeng_generation_providers.py tests/test_jimeng_queue_worker_runtime.py -q
```

Expected: PASS.

---

### Task 4: Frontend Model Mapping To Ark Provider

**Files:**
- Modify: `frontend/src/lib/jimengApi.ts`
- Modify: `frontend/src/components/jimeng/llm/modelOptions.ts`
- Modify: `frontend/src/components/jimeng/GenerationSettingsControl.tsx`
- Modify: `frontend/src/components/jimeng/pages/JimengWorkbenchPage.tsx`
- Modify: `frontend/src/store/jimengStore.ts`
- Test: `frontend/src/components/jimeng/__tests__/generationSettings.behavior.test.mjs`

- [ ] **Step 1: Preserve provider in normalizeGenerationSettings**

Change `GenerationSettingsControl.tsx`:

```ts
const parsedModel = parseLlmModelValue(value?.model_version ?? "");
const provider = parsedModel ? "volcengine_ark_video" : value?.provider || DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS.provider;
```

Return `provider` instead of `"dreamina_cli"`.

- [ ] **Step 2: Parse llm model values in store**

In `frontend/src/store/jimengStore.ts`, when building per-shot generation settings:

```ts
const parsedLlmModel = parseLlmModelValue(generationSettings.model_version);
const queueGenerationSettings = parsedLlmModel
  ? {
      ...generationSettings,
      provider: "volcengine_ark_video",
      provider_id: parsedLlmModel.providerId,
      model_version: parsedLlmModel.modelId,
    }
  : generationSettings;
```

Store `queueGenerationSettings` in `asset_snapshot.generation_settings`.

- [ ] **Step 3: Load video model options**

Keep existing `buildLlmModelOptions(settings, "video")`; ensure Ark provider video models appear because their model type is `video`.

- [ ] **Step 4: Run frontend tests**

Run:

```powershell
npm run test
npm run typecheck
```

Expected: PASS.

---

### Task 5: Version, Docs, And Full Verification

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Create: `docs/releases/v1.00.047-ark-seedance-provider.md`
- Modify: `pyproject.toml`
- Modify: `frontend/package.json`

- [ ] **Step 1: Update version**

Set version to:

- README current version: `v1.00.047`
- `pyproject.toml`: `1.0.47`
- `frontend/package.json`: `1.0.47`

- [ ] **Step 2: Add changelog entry**

Add to top of `CHANGELOG.md`:

```markdown
## v1.00.046 - 火山方舟 Seedance 视频接口

- 更新时间：2026-06-23 HH:mm:ss +08:00
- 在大模型设置中新增火山方舟 Seedance 视频供应商。
- 分镜队列支持通过方舟任务接口提交、轮询和下载视频。
- 增加方舟请求体、状态映射、队列 provider 选择测试。
```

- [ ] **Step 3: Add release detail**

Create `docs/releases/v1.00.047-ark-seedance-provider.md` with:

```markdown
# v1.00.046 火山方舟 Seedance 视频接口

更新时间：2026-06-23 HH:mm:ss +08:00

## 新增

- 大模型设置新增火山方舟 Seedance 视频供应商。
- 后端新增火山方舟原生任务式视频 provider。
- 分镜队列可选择方舟视频模型进行提交、轮询和下载。

## 修复

- 取消前后端强制回退到 `dreamina_cli` 的限制，允许白名单 provider 正常保存。

## 注意

- 方舟接口需要可访问 URL，本地参考素材无法直接作为本地路径提交到方舟。
- Seedance 2.0 mini 按文档预计 2026-06-25 才支持 API 调用，当前不写死为默认可用。
```

- [ ] **Step 4: Full verification**

Run:

```powershell
python -m pytest tests/test_ark_video_provider.py tests/test_jimeng_generation_providers.py tests/test_jimeng_model_settings.py -q
npm run test
npm run build
git diff --check
```

Expected:

- Python tests PASS.
- Frontend tests PASS.
- Build PASS.
- `git diff --check` only shows existing line ending warnings or no output.

- [ ] **Step 5: Commit**

Stage only source and docs that belong to this feature:

```powershell
git add backend/app/providers/ark_video_provider.py backend/app/providers/factory.py backend/app/providers/__init__.py backend/app/providers/base.py backend/app/api/context.py backend/app/queue_worker.py backend/app/api/queue.py backend/app/jimeng_queue.py backend/app/llm/models.py backend/app/llm/settings.py frontend/src/lib/jimengApi.ts frontend/src/components/jimeng/llm/llmDefaults.ts frontend/src/components/jimeng/llm/LlmProviderPanel.tsx frontend/src/components/jimeng/llm/LlmModelList.tsx frontend/src/components/jimeng/GenerationSettingsControl.tsx frontend/src/components/jimeng/pages/JimengWorkbenchPage.tsx frontend/src/store/jimengStore.ts tests/test_ark_video_provider.py tests/test_jimeng_generation_providers.py tests/test_jimeng_model_settings.py README.md CHANGELOG.md docs/releases/v1.00.047-ark-seedance-provider.md pyproject.toml frontend/package.json docs/superpowers/plans/2026-06-23-ark-seedance-provider.md
git commit -m "feat: 接入火山方舟 Seedance 视频接口"
```

Do not stage local runtime data, test output folders, `jimeng-web2api-master`, `webbaseseeddancapi-master`, zip files, or `LumenX.lnk`.

---

## Self-Review

- Spec coverage: 大模型设置、方舟 provider、队列 worker、前端模型映射、版本文档和测试均有对应任务。
- Placeholder scan: 本计划没有未决占位项；时间戳在执行时使用当前秒级时间替换。
- Type consistency: provider 名统一为 `volcengine_ark_video`；默认供应商 ID 统一为 `volcengine_ark`；模型值沿用现有 `llm:<providerId>:<modelId>` 编码。
