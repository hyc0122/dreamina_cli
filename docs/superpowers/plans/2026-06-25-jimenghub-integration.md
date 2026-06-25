# JiMengHub Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production JiMengHub video provider that uses stored web Cookie accounts, while keeping the official CLI provider separate and unchanged.

**Architecture:** Reuse the existing web-session client and SQLite storage, add a small provider adapter for the main queue, and expose a clearer JiMengHub UI entry. Frontend model choices infer provider from `hub-*` values; backend maps `hub-*` to real web model ids before calling the signed web endpoints.

**Tech Stack:** FastAPI, SQLite storage helpers, pytest, React, TypeScript, Vite.

---

## File Structure

- Create: `backend/app/providers/jimeng_hub_provider.py`
  - Adapter between the main queue `VideoGenerationProvider` protocol and existing `web_session_client.py`.
- Modify: `backend/app/providers/__init__.py`
  - Export `JimengHubProvider` and model helper.
- Modify: `backend/app/api/queue.py`
  - Route `provider = jimeng_hub` to the new provider for manual polling.
- Modify: `backend/app/queue_worker.py`
  - Stop forcing every item to `dreamina_cli`; pass the real provider factory to worker.
- Modify: `backend/app/api/router.py`
  - Add a production JiMengHub router alias while keeping old web-session routes.
- Create or modify: `backend/app/api/jimeng_hub.py`
  - Formal `/jimeng/hub/*` endpoints that reuse the current web-session handlers/storage.
- Modify: `frontend/src/lib/jimengApi.ts`
  - Add `hub` page mode, hub model constants, helper functions, and JiMengHub API aliases.
- Modify: `frontend/src/components/jimeng/GenerationSettingsControl.tsx`
  - Preserve provider instead of forcing official CLI; infer provider from selected model.
- Modify: `frontend/src/components/jimeng/JimengApp.tsx`
  - Add JiMengHub navigation and rename settings label to official CLI.
- Create: `frontend/src/components/jimeng/pages/JimengHubPage.tsx`
  - Formal JiMengHub page using the existing web-session UI behavior.
- Modify: `README.md`, `CHANGELOG.md`, `docs/releases/v1.00.050-jimenghub-provider.md`, `pyproject.toml`, `frontend/package.json`
  - Version and release documentation.
- Test: `tests/test_jimeng_hub_provider.py`
  - Model mapping, account selection, submit and poll behavior.
- Test: `tests/test_jimeng_queue_generation_settings.py`
  - Queue worker respects `provider = jimeng_hub`.
- Test: `frontend/src/components/jimeng/__tests__/generationSettingsControl.test.mjs`
  - Frontend normalization keeps Hub provider and maps official models back to CLI.

---

### Task 1: Backend Hub Model Mapping and Provider

**Files:**
- Create: `backend/app/providers/jimeng_hub_provider.py`
- Modify: `backend/app/providers/__init__.py`
- Test: `tests/test_jimeng_hub_provider.py`

- [ ] **Step 1: Write failing backend provider tests**

Add tests that define the required public behavior before implementation:

```python
from types import SimpleNamespace

from backend.app.jimeng_cli import DreaminaTaskResult
from backend.app.providers.jimeng_hub_provider import JimengHubProvider, normalize_hub_model_version


def test_normalize_hub_model_version_maps_display_values_to_web_models():
    assert normalize_hub_model_version("hub-seedance2.0-fast") == "seedance2.0fast"
    assert normalize_hub_model_version("hub-seedance2.0-mini") == "seedance2.0mini"
    assert normalize_hub_model_version("hub-seedance2.0") == "seedance2.0"
    assert normalize_hub_model_version("hub-seedance2.0-fast-vip") == "seedance2.0fast_vip"
    assert normalize_hub_model_version("hub-seedance2.0-vip") == "seedance2.0_vip"
    assert normalize_hub_model_version("seedance2.0fast") == "seedance2.0fast"


def test_submit_text2video_uses_selected_account_cookie_and_records_web_task():
    calls = []

    class Store:
        def list_web_session_accounts(self):
            return [SimpleNamespace(id="acc_1", enabled=True, cookie_ready=True)]

        def get_web_session_account_secret(self, account_id):
            assert account_id == "acc_1"
            return {"id": "acc_1", "enabled": 1, "sessionid": "sid", "cookie_json": {"sessionid": "sid", "ttwid": "t", "odin_tt": "o", "user_spaces_idc": "u"}}

        def create_web_session_task(self, account_id, prompt, model, ratio, duration, resolution):
            calls.append(("create_task", account_id, prompt, model, ratio, duration, resolution))
            return SimpleNamespace(id="task_1")

        def update_web_session_task(self, task_id, **updates):
            calls.append(("update_task", task_id, updates))
            return SimpleNamespace(id=task_id, **updates)

    class Client:
        def signed_post(self, uri, body, extra_params=None):
            calls.append(("post", uri, body["submit_id"], extra_params))
            return {"ret": "0", "data": {"aigc_data": {"task": {"submit_id": body["submit_id"]}, "history_record_id": "hist_1"}}}

    provider = JimengHubProvider(Store(), client_factory=lambda account: Client())
    result = provider.submit_text2video("测试提示词", duration=6, ratio="9:16", video_resolution="720p", poll_seconds=30, model_version="hub-seedance2.0-mini")

    assert result.submit_id == "task_1"
    assert result.gen_status == "running"
    assert calls[0] == ("create_task", "acc_1", "测试提示词", "seedance2.0mini", "9:16", 6, "720p")


def test_query_result_uses_task_bound_account_and_returns_downloaded_local_path(tmp_path):
    class Store:
        def get_web_session_task(self, task_id):
            return SimpleNamespace(id=task_id, account_id="acc_1", history_id="hist_1", submit_id="submit_1")

        def get_web_session_account_secret(self, account_id):
            return {"id": account_id, "enabled": 1, "sessionid": "sid", "cookie_json": {"sessionid": "sid", "ttwid": "t", "odin_tt": "o", "user_spaces_idc": "u"}}

        def update_web_session_task(self, task_id, **updates):
            return SimpleNamespace(id=task_id, **updates)

    class Client:
        def signed_post(self, uri, body, extra_params=None):
            return {"ret": "0", "data": {"hist_1": {"status": "completed", "video_url": "https://example.com/video.mp4"}}}

    def fake_download(url, download_dir, task_id):
        path = download_dir / f"{task_id}.mp4"
        path.write_bytes(b"video")
        return path

    provider = JimengHubProvider(Store(), client_factory=lambda account: Client(), downloader=fake_download)
    result = provider.query_result("task_1", download_dir=tmp_path)

    assert result.gen_status == "completed"
    assert result.result_url == "https://example.com/video.mp4"
    assert result.local_paths == [str(tmp_path / "task_1.mp4")]
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
pytest tests/test_jimeng_hub_provider.py -q
```

Expected: fail because `backend.app.providers.jimeng_hub_provider` does not exist yet.

- [ ] **Step 3: Implement provider**

Create `backend/app/providers/jimeng_hub_provider.py` with:

```python
from pathlib import Path
from typing import Any, Callable, Optional, Sequence
import json
import urllib.request

from ..jimeng_cli import DreaminaTaskResult
from ..web_session_client import (
    WEB_GENERATE_EXTRA_PARAMS,
    build_history_query_payload,
    build_text_to_video_payload,
    create_web_session_client,
    extract_submit_identity,
    parse_poll_result,
    response_error_message,
    web_session_error_message,
)

HUB_MODEL_MAP = {
    "hub-seedance2.0-fast": "seedance2.0fast",
    "hub-seedance2.0-mini": "seedance2.0mini",
    "hub-seedance2.0": "seedance2.0",
    "hub-seedance2.0-fast-vip": "seedance2.0fast_vip",
    "hub-seedance2.0-vip": "seedance2.0_vip",
}

def normalize_hub_model_version(value: str | None) -> str:
    text = str(value or "").strip()
    return HUB_MODEL_MAP.get(text, text or "seedance2.0fast")
```

Then implement `JimengHubProvider` methods:

- `submit_text2video()` creates a web-session task, submits signed request, stores submit/history ids, returns `DreaminaTaskResult(submit_id=task.id, gen_status="running")`.
- `submit_image2video()` and `submit_multimodal2video()` initially submit prompt text with reference manifest already included by queue; if media references are unsupported by current web client, include that in raw output and keep the call deterministic.
- `query_result(submit_id)` treats `submit_id` as local web-session task id, loads bound account, polls history by the same account, downloads result URL to `download_dir`, and returns local path.

- [ ] **Step 4: Export provider**

Update `backend/app/providers/__init__.py`:

```python
from .jimeng_hub_provider import JimengHubProvider, normalize_hub_model_version
```

and add both names to `__all__`.

- [ ] **Step 5: Run backend provider tests to verify GREEN**

Run:

```powershell
pytest tests/test_jimeng_hub_provider.py -q
```

Expected: pass.

---

### Task 2: Queue Factory Integration

**Files:**
- Modify: `backend/app/api/queue.py`
- Modify: `backend/app/queue_worker.py`
- Test: `tests/test_jimeng_queue_generation_settings.py`

- [ ] **Step 1: Write failing queue provider test**

Add a test that proves the worker no longer forces provider to official CLI:

```python
def test_queue_worker_uses_generation_settings_provider_for_hub(store_with_project_and_shot):
    store, project, shot = store_with_project_and_shot
    item = store.create_queue_item(
        project_id=project.id,
        shot_id=shot.id,
        final_prompt="测试提示词",
        asset_snapshot={"generation_settings": {"provider": "jimeng_hub", "model_version": "hub-seedance2.0-mini"}},
    )
    seen = {}

    class Provider:
        def submit_text2video(self, **kwargs):
            seen.update(kwargs)
            return DreaminaTaskResult(submit_id="hub_task_1", gen_status="running", raw_output="ok")

        def query_result(self, submit_id, download_dir=None):
            return DreaminaTaskResult(submit_id=submit_id, gen_status="running", raw_output="polling")

    worker = JimengQueueWorker(store=store, cli=Provider(), provider_factory=lambda provider_name, account_id=None: Provider())
    worker.submit_item(item)

    updated = store.get_queue_item(item.id)
    assert updated.cli_command.startswith("jimeng_hub text2video")
    assert seen["model_version"] == "hub-seedance2.0-mini"
```

If fixture names differ, use the existing queue tests' project/shot fixture pattern.

- [ ] **Step 2: Run queue test to verify RED**

Run:

```powershell
pytest tests/test_jimeng_queue_generation_settings.py -q
```

Expected: fail if current queue runtime or helper forces `dreamina_cli`.

- [ ] **Step 3: Modify provider factories**

In `backend/app/api/queue.py`, import `JimengHubProvider` and return it when `provider_name == "jimeng_hub"`:

```python
def _provider_factory(provider_name: str, account_id: str | None = None) -> Any:
    if provider_name == "jimeng_hub":
        return JimengHubProvider(get_store(), account_id=account_id)
    return DreaminaCliProvider(_cli())
```

In `backend/app/queue_worker.py`, remove `force_provider_name="dreamina_cli"` and use:

```python
def _provider_factory(provider_name: str, account_id: str | None = None) -> Any:
    if provider_name == "jimeng_hub":
        return JimengHubProvider(get_store(), account_id=account_id)
    return DreaminaCliProvider(dreamina_cli())
```

- [ ] **Step 4: Run queue tests to verify GREEN**

Run:

```powershell
pytest tests/test_jimeng_queue_generation_settings.py tests/test_jimeng_queue_worker_runtime.py -q
```

Expected: pass.

---

### Task 3: JiMengHub API Alias

**Files:**
- Create: `backend/app/api/jimeng_hub.py`
- Modify: `backend/app/api/router.py`
- Test: `tests/test_jimeng_web_session.py`

- [ ] **Step 1: Write failing route alias test**

Add a test that `/jimeng/hub/accounts` returns the same envelope shape as the existing web-session endpoint:

```python
def test_jimeng_hub_accounts_alias_lists_accounts(client):
    response = client.get("/jimeng/hub/accounts")
    assert response.status_code == 200
    assert "accounts" in response.json()
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
pytest tests/test_jimeng_web_session.py -q
```

Expected: fail with 404 for `/jimeng/hub/accounts`.

- [ ] **Step 3: Add alias router**

Create `backend/app/api/jimeng_hub.py` that mirrors the existing web-session endpoints under `prefix="/jimeng/hub"` by importing and reusing request models and helper functions from `web_session.py`.

In `backend/app/api/router.py`, include:

```python
from . import jimeng_hub
router.include_router(jimeng_hub.router)
```

- [ ] **Step 4: Run route tests to verify GREEN**

Run:

```powershell
pytest tests/test_jimeng_web_session.py -q
```

Expected: pass.

---

### Task 4: Frontend Model Provider Normalization

**Files:**
- Modify: `frontend/src/lib/jimengApi.ts`
- Modify: `frontend/src/components/jimeng/GenerationSettingsControl.tsx`
- Test: `frontend/src/components/jimeng/__tests__/generationSettingsControl.test.mjs`

- [ ] **Step 1: Write failing frontend normalization tests**

Create the test file:

```javascript
import assert from "node:assert/strict";
import { normalizeGenerationSettings } from "../GenerationSettingsControl.tsx";

const hub = normalizeGenerationSettings({ model_version: "hub-seedance2.0-mini" });
assert.equal(hub.provider, "jimeng_hub");
assert.equal(hub.model_version, "hub-seedance2.0-mini");

const official = normalizeGenerationSettings({ provider: "jimeng_hub", model_version: "seedance2.0fast" });
assert.equal(official.provider, "dreamina_cli");
assert.equal(official.model_version, "seedance2.0fast");

console.log("generationSettingsControl tests passed");
```

- [ ] **Step 2: Run frontend tests to verify RED**

Run:

```powershell
cd frontend
npm test
cd ..
```

Expected: fail because `normalizeGenerationSettings()` currently forces every provider to `dreamina_cli`.

- [ ] **Step 3: Add Hub model constants and provider helper**

In `frontend/src/lib/jimengApi.ts`, add:

```typescript
export const JIMENG_HUB_VIDEO_MODELS = [
  { value: "hub-seedance2.0-fast", label: "JiMengHub / Seedance 2.0 Fast" },
  { value: "hub-seedance2.0-mini", label: "JiMengHub / Seedance 2.0 Mini" },
  { value: "hub-seedance2.0", label: "JiMengHub / Seedance 2.0" },
  { value: "hub-seedance2.0-fast-vip", label: "JiMengHub / Seedance 2.0 Fast VIP" },
  { value: "hub-seedance2.0-vip", label: "JiMengHub / Seedance 2.0 VIP" },
] as const;

export const providerForJimengVideoModel = (modelVersion: string, fallback = "dreamina_cli") =>
  modelVersion.startsWith("hub-") ? "jimeng_hub" : fallback === "jimeng_hub" ? "dreamina_cli" : fallback;
```

- [ ] **Step 4: Update normalization and select groups**

In `GenerationSettingsControl.tsx`:

- Import `JIMENG_HUB_VIDEO_MODELS` and `providerForJimengVideoModel`.
- Compute provider from `model_version`.
- Render official CLI options under `<optgroup label="官方CLI">`.
- Render hub options under `<optgroup label="JiMengHub">`.

- [ ] **Step 5: Run frontend tests to verify GREEN**

Run:

```powershell
cd frontend
npm test
cd ..
```

Expected: pass.

---

### Task 5: JiMengHub Page and Navigation

**Files:**
- Modify: `frontend/src/lib/jimengApi.ts`
- Modify: `frontend/src/components/jimeng/JimengApp.tsx`
- Create: `frontend/src/components/jimeng/pages/JimengHubPage.tsx`

- [ ] **Step 1: Add page mode and API aliases**

Update `JimengPageMode` to include `"hub"`.

Add API methods:

```typescript
listJimengHubAccounts: () => axios.get<JimengWebSessionAccountsEnvelope>(`${API_URL}/jimeng/hub/accounts`).then((res) => res.data),
createJimengHubAccount: (...) => axios.post<JimengWebSessionAccount>(`${API_URL}/jimeng/hub/accounts`, data).then((res) => res.data),
listJimengHubTasks: (...) => axios.get<JimengWebSessionTasksEnvelope>(`${API_URL}/jimeng/hub/tasks`, { params }).then((res) => res.data),
pollJimengHubTask: (taskId: string) => axios.post<JimengWebSessionTask>(`${API_URL}/jimeng/hub/tasks/${taskId}/poll`).then((res) => res.data),
```

- [ ] **Step 2: Create JiMengHub page**

Copy the useful structure from `JimengWebSessionTestPage.tsx`, but adjust text:

- Title: `JiMengHub 多账号通道`
- Red notice: `该功能内测中，建议先小批量测试。`
- Buttons: open Jimeng Cookie page, Cookie guide, paste Cookie, add account, submit test, poll task.
- Use `jimengApi.*JimengHub*` methods instead of web-session methods.

- [ ] **Step 3: Update navigation**

In `JimengApp.tsx`:

- Import `JimengHubPage`.
- Add page config after `web_session` or before settings:

```typescript
{
  id: "hub",
  label: "JiMengHub",
  placeholderTitle: "JiMengHub",
  placeholderText: "管理网页 Cookie 多账号和 Hub 通道测试。",
  icon: KeyRound,
}
```

- Rename settings label and placeholder from `即梦设置` to `官方CLI`.
- Render `<JimengHubPage />` when `activePage === "hub"`.

- [ ] **Step 4: Build frontend**

Run:

```powershell
cd frontend
npm run build
cd ..
```

Expected: TypeScript and Vite build pass.

---

### Task 6: Version and Documentation

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Create: `docs/releases/v1.00.050-jimenghub-provider.md`
- Modify: `pyproject.toml`
- Modify: `frontend/package.json`

- [ ] **Step 1: Update README current version**

Set:

```text
当前版本：v1.00.050
最近更新：新增 JiMengHub 多账号网页通道，官方CLI 与 Hub 模型分组区分，分镜队列可按 Hub 模型进入正式队列。
```

Also rename any user-facing “即梦设置” setup entry that now means the CLI page to “官方CLI”.

- [ ] **Step 2: Add changelog entry**

Add `v1.00.050` with exact current timestamp and link to `docs/releases/v1.00.050-jimenghub-provider.md`.

- [ ] **Step 3: Add detailed release doc**

Document:

- Added JiMengHub module.
- Official CLI page renamed.
- Hub model group and provider mapping.
- Queue provider factory support.
- Cookie limitations and manual copy requirements.
- Reminder to sync `https://version.j11.net/`.

- [ ] **Step 4: Sync package versions**

Set:

```text
pyproject.toml version = "1.0.50"
frontend/package.json version = "1.0.50"
```

- [ ] **Step 5: Run verification**

Run:

```powershell
pytest tests/test_jimeng_hub_provider.py tests/test_jimeng_web_session.py tests/test_jimeng_queue_generation_settings.py tests/test_jimeng_queue_worker_runtime.py -q
cd frontend
npm test
npm run build
cd ..
```

Expected: all pass.

- [ ] **Step 6: Commit implementation**

Stage only source, docs, tests, and version files. Do not stage local reference folders or runtime data.

```powershell
git add backend frontend tests docs README.md CHANGELOG.md pyproject.toml
git restore --staged jimenghub jimeng-cli runtime_data build_cache frontend/dist releases .venv 2>$null
git commit -m "feat: add jimenghub provider channel"
```

---

## Self-Review

- Spec coverage: covers JiMengHub page, official CLI rename, Hub model grouping, backend provider mapping, queue provider selection, same-account polling, tests, and version docs.
- Placeholder scan: no `TBD` or unbounded implementation placeholders remain; unsupported media handling is explicitly scoped to deterministic provider behavior.
- Type consistency: `jimeng_hub`, `hub-*`, `JimengHubProvider`, and `normalize_hub_model_version` names are used consistently across tasks.
