# 火山方舟与提示词管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有“大模型设置”接入火山方舟文本推理和文生视频，同时新增一个独立数据库的“提示词管理”模块。

**Architecture:** 火山方舟作为新的 LLM provider kind，不替换官方 CLI；队列仍走统一 `VideoGenerationProvider` 边界，按每个任务的 provider 设置选择官方 CLI 或方舟。提示词管理使用独立 SQLite 文件和独立 API 路由，前端只复用全局主题，不接大模型、不混用漫剧项目数据库。

**Tech Stack:** Python FastAPI、SQLite、urllib、Next/React、现有 glass/cyber theme class、Node local structure tests、pytest。

---

### Task 1: 火山方舟文本推理客户端

**Files:**
- Modify: `backend/app/llm/client.py`
- Test: `tests/test_volcengine_ark_llm.py`

- [ ] **Step 1: Write the failing test**

```python
import json
import urllib.request

from backend.app.llm.client import call_chat_completion
from backend.app.llm.models import LlmProviderSetting


class FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return json.dumps({"choices": [{"message": {"content": "ok"}}]}).encode("utf-8")


def test_volcengine_ark_chat_uses_api_v3_endpoint(monkeypatch):
    captured = {}

    def fake_urlopen(request: urllib.request.Request, timeout: int):
        captured["url"] = request.full_url
        captured["body"] = json.loads(request.data.decode("utf-8"))
        captured["auth"] = request.headers.get("Authorization")
        return FakeResponse()

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    provider = LlmProviderSetting(
        id="ark",
        name="火山方舟",
        kind="volcengine_ark",
        enabled=True,
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        api_key="ark-key",
    )

    result = call_chat_completion(provider, [{"role": "user", "content": "你好"}], "doubao-seed-1")

    assert result.content == "ok"
    assert captured["url"] == "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
    assert captured["auth"] == "Bearer ark-key"
    assert captured["body"]["model"] == "doubao-seed-1"
    assert captured["body"]["messages"] == [{"role": "user", "content": "你好"}]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_volcengine_ark_llm.py -q`

Expected: FAIL because `call_chat_completion` rejects `volcengine_ark`.

- [ ] **Step 3: Implement minimal Ark chat support**

Add constants and helpers in `backend/app/llm/client.py`:

```python
VOLCENGINE_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"


def _ark_api_root(base_url: str) -> str:
    value = str(base_url or VOLCENGINE_ARK_BASE_URL).strip().rstrip("/")
    for suffix in ("/chat/completions", "/contents/generations/tasks"):
        if value.endswith(suffix):
            value = value[: -len(suffix)].rstrip("/")
    return value or VOLCENGINE_ARK_BASE_URL


def _ark_chat_endpoint(base_url: str) -> str:
    return _join_url(_ark_api_root(base_url), "chat/completions")
```

Change `call_chat_completion()` so `settings.kind == "volcengine_ark"` uses `_ark_chat_endpoint(settings.base_url)` and the existing OpenAI-compatible chat body/extractor.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_volcengine_ark_llm.py -q`

Expected: PASS.

### Task 2: 火山方舟文生视频 provider

**Files:**
- Create: `backend/app/providers/volcengine_ark_provider.py`
- Modify: `backend/app/providers/__init__.py`
- Test: `tests/test_volcengine_ark_provider.py`

- [ ] **Step 1: Write failing provider tests**

```python
import json
import urllib.request
from pathlib import Path

import pytest

from backend.app.llm.models import LlmProviderSetting
from backend.app.providers.volcengine_ark_provider import VolcengineArkProvider


class FakeResponse:
    def __init__(self, payload: dict | None = None, content: bytes | None = None):
        self.payload = payload
        self.content = content

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        if self.content is not None:
            return self.content
        return json.dumps(self.payload).encode("utf-8")


def provider() -> VolcengineArkProvider:
    return VolcengineArkProvider(
        LlmProviderSetting(
            id="ark",
            name="火山方舟",
            kind="volcengine_ark",
            enabled=True,
            base_url="https://ark.cn-beijing.volces.com/api/v3",
            api_key="ark-key",
        )
    )


def test_submit_text2video_posts_new_parameter_body(monkeypatch):
    captured = {}

    def fake_urlopen(request: urllib.request.Request, timeout: int):
        captured["url"] = request.full_url
        captured["body"] = json.loads(request.data.decode("utf-8"))
        return FakeResponse({"id": "task-1", "status": "queued"})

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    result = provider().submit_text2video(
        prompt="操场上一只小狗",
        duration=5,
        ratio="9:16",
        video_resolution="720p",
        poll_seconds=30,
        model_version="doubao-seedance-2-0-fast-260615",
    )

    assert result.submit_id == "task-1"
    assert result.gen_status == "queued"
    assert captured["url"].endswith("/contents/generations/tasks")
    assert captured["body"]["model"] == "doubao-seedance-2-0-fast-260615"
    assert captured["body"]["content"] == [{"type": "text", "text": "操场上一只小狗"}]
    assert captured["body"]["duration"] == 5
    assert captured["body"]["ratio"] == "9:16"
    assert captured["body"]["resolution"] == "720p"


def test_query_result_downloads_succeeded_video(monkeypatch, tmp_path: Path):
    calls = []

    def fake_urlopen(request: urllib.request.Request, timeout: int):
        calls.append(request.full_url)
        if request.full_url.endswith("/contents/generations/tasks/task-1"):
            return FakeResponse({"id": "task-1", "status": "succeeded", "content": {"video_url": "https://cdn.example/video.mp4"}})
        return FakeResponse(content=b"video-bytes")

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    result = provider().query_result("task-1", download_dir=tmp_path)

    assert result.gen_status == "succeeded"
    assert result.result_url == "https://cdn.example/video.mp4"
    assert result.local_paths and Path(result.local_paths[0]).read_bytes() == b"video-bytes"


def test_rejects_local_reference_assets():
    with pytest.raises(ValueError, match="火山方舟第一版仅支持纯文本文生视频"):
        provider().submit_image2video("local.png", "提示词", 5)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_volcengine_ark_provider.py -q`

Expected: FAIL because the provider file does not exist.

- [ ] **Step 3: Implement provider**

Create `VolcengineArkProvider` with:
- `submit_text2video()` POST `/contents/generations/tasks`
- `query_result()` GET `/contents/generations/tasks/{id}`
- `submit_image2video()` and `submit_multimodal2video()` raise a clear pure-text-only error for this first version
- succeeded status downloads `content.video_url` to `download_dir/{submit_id}.mp4`

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_volcengine_ark_provider.py -q`

Expected: PASS.

### Task 3: 队列和前端模型选择接入方舟 provider

**Files:**
- Modify: `backend/app/queue_worker.py`
- Modify: `backend/app/api/queue.py`
- Modify: `backend/app/llm/settings.py`
- Modify: `frontend/src/components/jimeng/GenerationSettingsControl.tsx`
- Modify: `frontend/src/components/jimeng/llm/LlmProviderPanel.tsx`
- Modify: `frontend/src/components/jimeng/llm/llmDefaults.ts`
- Test: `frontend/src/__tests__/ark-provider-ui.local.mjs`

- [ ] **Step 1: Write failing frontend structure test**

```javascript
const fs = require("node:fs");

const generationControl = fs.readFileSync("frontend/src/components/jimeng/GenerationSettingsControl.tsx", "utf8");
const providerPanel = fs.readFileSync("frontend/src/components/jimeng/llm/LlmProviderPanel.tsx", "utf8");
const defaults = fs.readFileSync("frontend/src/components/jimeng/llm/llmDefaults.ts", "utf8");

if (!generationControl.includes("parseLlmModelValue")) throw new Error("GenerationSettingsControl must parse LLM model values");
if (!generationControl.includes('provider: "volcengine_ark"')) throw new Error("LLM video model selection must set provider volcengine_ark");
if (generationControl.includes('const provider = "dreamina_cli"')) throw new Error("normalizeGenerationSettings must not force all providers to dreamina_cli");
if (!providerPanel.includes("火山方舟")) throw new Error("provider panel must expose 火山方舟 kind");
if (!defaults.includes("VOLCENGINE_ARK_BASE_URL")) throw new Error("LLM defaults must include Ark base URL");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node frontend/src/__tests__/ark-provider-ui.local.mjs`

Expected: FAIL because the UI still forces official CLI.

- [ ] **Step 3: Implement backend factory and defaults**

Backend provider factories read LLM settings and return `VolcengineArkProvider` when `provider_name == "volcengine_ark"`; use `account_id` as the selected LLM provider id so a queue item can keep polling with the same configured provider.

Add default Ark provider:
- id: `volcengine_ark`
- kind: `volcengine_ark`
- base_url: `https://ark.cn-beijing.volces.com/api/v3`
- default text model placeholder: `doubao-seed-1-6-250615`
- default video model placeholder: `doubao-seedance-2-0-fast-260615`

- [ ] **Step 4: Implement frontend selection**

When a video model option value parses as `llm:{providerId}:{modelId}`, save:
- `provider: "volcengine_ark"` when the chosen provider kind is `volcengine_ark`
- `account_id: providerId`
- `model_version: modelId`
- `generation_mode: "text2video"` for Ark first version

Official CLI options continue saving `provider: "dreamina_cli"` and `account_id: ""`.

- [ ] **Step 5: Verify targeted tests**

Run:
- `python -m pytest tests/test_volcengine_ark_llm.py tests/test_volcengine_ark_provider.py -q`
- `node frontend/src/__tests__/ark-provider-ui.local.mjs`

Expected: all PASS.

### Task 4: 提示词管理独立数据库和 API

**Files:**
- Create: `backend/app/prompt_manager.py`
- Create: `backend/app/api/prompt_manager.py`
- Modify: `backend/app/api/__init__.py` or the app router registration file used by this project
- Test: `tests/test_prompt_manager_store.py`

- [ ] **Step 1: Write failing store tests**

```python
from pathlib import Path

import pytest

from backend.app.prompt_manager import PromptManagerStore


def test_prompt_manager_uses_independent_sqlite(tmp_path: Path):
    store = PromptManagerStore(tmp_path)
    assert store.db_path == tmp_path / "prompt_manager" / "prompt_manager.sqlite3"
    assert store.db_path.parent.name == "prompt_manager"


def test_seeds_official_templates_and_rejects_official_edit(tmp_path: Path):
    store = PromptManagerStore(tmp_path)
    templates = store.list_templates()
    assert any(item["scope"] == "official" and item["type"] == "prompt_reasoning" for item in templates)
    official = next(item for item in templates if item["scope"] == "official")
    with pytest.raises(ValueError, match="官方模板不可修改"):
        store.update_template(official["id"], name="改名")


def test_duplicate_user_names_get_numeric_suffix(tmp_path: Path):
    store = PromptManagerStore(tmp_path)
    first = store.create_template(category="video", type="story", name="通用", content="A")
    second = store.create_template(category="video", type="story", name="通用", content="B")
    assert first["name"] == "通用"
    assert second["name"] == "通用 2"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_prompt_manager_store.py -q`

Expected: FAIL because prompt manager store does not exist.

- [ ] **Step 3: Implement store**

Implement a standalone SQLite store under `<runtime_data>/prompt_manager/prompt_manager.sqlite3` with table:
- `id`
- `category` (`video` / `creative`)
- `type`
- `scope` (`official` / `user` / `vip`)
- `name`
- `content`
- `content_separator`
- `record_separator`
- `output_start`
- `output_end`
- `created_at`
- `updated_at`

Seed official templates for:
- `prompt_reasoning`
- `story_plot`
- `character_extract`
- `scene_extract`
- `prop_extract`
- `shot_adjust`
- `novel_to_storyboard`

- [ ] **Step 4: Implement API**

Expose:
- `GET /prompt-manager/templates`
- `POST /prompt-manager/templates`
- `PUT /prompt-manager/templates/{template_id}`
- `POST /prompt-manager/templates/{template_id}/duplicate`

Official and VIP templates cannot be edited; duplicating them creates a user template.

- [ ] **Step 5: Run store tests**

Run: `python -m pytest tests/test_prompt_manager_store.py -q`

Expected: PASS.

### Task 5: 提示词管理前端模块

**Files:**
- Modify: `frontend/src/lib/jimengApi.ts`
- Modify: `frontend/src/components/jimeng/JimengApp.tsx`
- Create: `frontend/src/components/prompts/PromptManagerPage.tsx`
- Create: `frontend/src/components/prompts/promptManagerConfig.ts`
- Test: `frontend/src/__tests__/prompt-manager-module.local.mjs`

- [ ] **Step 1: Write failing structure test**

```javascript
const fs = require("node:fs");

const app = fs.readFileSync("frontend/src/components/jimeng/JimengApp.tsx", "utf8");
const api = fs.readFileSync("frontend/src/lib/jimengApi.ts", "utf8");
const page = fs.existsSync("frontend/src/components/prompts/PromptManagerPage.tsx")
  ? fs.readFileSync("frontend/src/components/prompts/PromptManagerPage.tsx", "utf8")
  : "";

if (!app.includes("提示词管理")) throw new Error("left navigation must include 提示词管理 module");
if (!api.includes("PromptManagerTemplate")) throw new Error("jimengApi must include prompt manager API types");
if (!page.includes("视频创作提示词")) throw new Error("prompt manager page must show video prompt category");
if (!page.includes("创作作品提示词")) throw new Error("prompt manager page must show creative prompt category");
if (page.includes("模型平台") || page.includes("模型选择")) throw new Error("prompt manager must not expose model controls");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node frontend/src/__tests__/prompt-manager-module.local.mjs`

Expected: FAIL because the module is not wired.

- [ ] **Step 3: Implement frontend**

Add a new main module `prompt_manager` in the left navigation. The page layout:
- left category tree:
  - 提示词管理
    - 视频创作提示词
      - 提示词推理模板
      - 故事情节模板
      - 角色提取模板
      - 场景提取模板
      - 物品提取模板
      - 分镜调整模板
    - 创作作品提示词
      - 小说转分镜提示词
- center template list with official/user/vip color tags
- right template editor and generated full prompt preview
- no model/API controls

- [ ] **Step 4: Run frontend structure test**

Run: `node frontend/src/__tests__/prompt-manager-module.local.mjs`

Expected: PASS.

### Task 6: 版本、文档和验证

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Create: `docs/releases/v1.00.064-volcengine-ark-prompt-manager.md` or next actual version file after checking current version
- Modify version source files found by `rg "v1\\.00\\."`

- [ ] **Step 1: Detect current version**

Run: `rg "v1\\.00\\.|1\\.00\\." README.md CHANGELOG.md frontend backend pyproject.toml package.json`

Use the highest current project version and increment the patch number by one.

- [ ] **Step 2: Update docs**

README keeps only current version and changelog link. CHANGELOG gets one concise entry. Detailed release file records:
- 火山方舟文本推理
- 火山方舟文生视频
- 提示词管理独立数据库
- 提示词管理页面

- [ ] **Step 3: Final verification**

Run:
- `python -m pytest tests/test_volcengine_ark_llm.py tests/test_volcengine_ark_provider.py tests/test_prompt_manager_store.py -q`
- `node frontend/src/__tests__/ark-provider-ui.local.mjs`
- `node frontend/src/__tests__/prompt-manager-module.local.mjs`
- `git diff --check`

Expected: all PASS.
