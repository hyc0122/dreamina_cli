# Creator Assistant Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate `script-creator` as a standalone “创作助手” module, route its model calls through the existing Jiasu LLM settings, and add a one-click path into “漫剧制作”.

**Architecture:** Keep creator state isolated in `frontend/src/components/creator`, while backend exposes a thin creator LLM proxy under `/jimeng/creator/*`. The creator frontend keeps its prompt orchestration, fallback model strategy, and concurrent generation flow; secrets and provider URLs stay in the existing backend LLM settings.

**Tech Stack:** React 18, TypeScript, Vite, Zustand-adjacent local context, FastAPI, existing `backend/app/llm` settings/client modules, local structure tests plus `npm run build` and `python -m compileall`.

---

## File Structure

- Create `backend/app/api/creator.py`: creator model options, strategy settings, and chat/fallback proxy endpoints.
- Modify `backend/app/api/router.py`: include the new creator router.
- Extend `backend/app/llm/client.py` only if there is no reusable text chat helper; keep image generation behavior unchanged.
- Create `frontend/src/components/creator/`: migrated creator module.
- Create `frontend/src/components/creator/services/creatorAiService.ts`: replaces `script-creator/src/services/aiService.ts` request layer.
- Create `frontend/src/components/creator/adapters/importToJimeng.ts`: converts creator output into Jimeng project/shots.
- Modify `frontend/src/lib/jimengApi.ts`: add creator endpoints and page mode.
- Modify `frontend/src/components/jimeng/JimengApp.tsx`: add `创作助手`, rename main production label to `漫剧制作`.
- Modify `frontend/src/index.css` and theme switch UI later for `cyberpunk`.
- Update `README.md`, `CHANGELOG.md`, `docs/releases/*`, and version files for the implementation version.

---

### Task 1: Backend Creator LLM Proxy

**Files:**
- Create: `backend/app/api/creator.py`
- Modify: `backend/app/api/router.py`
- Modify if needed: `backend/app/llm/client.py`
- Test: `python -m compileall backend/app`

- [ ] **Step 1: Write failing backend structure test**

Create `tests/test_creator_api_structure.py`:

```python
from pathlib import Path


def test_creator_router_is_registered():
    router = Path("backend/app/api/router.py").read_text(encoding="utf-8")
    assert "creator" in router
    assert "creator_router" in router


def test_creator_api_uses_existing_llm_settings_without_exposing_key():
    source = Path("backend/app/api/creator.py").read_text(encoding="utf-8")
    assert "load_llm_settings" in source
    assert "api_key" not in source.lower().replace("api_key_secret", "")
    assert "/creator/chat/fallback" in source
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_creator_api_structure.py -q`

Expected: FAIL because `backend/app/api/creator.py` does not exist and router is not registered.

- [ ] **Step 3: Implement creator API models and routes**

Create `backend/app/api/creator.py` with:

```python
"""创作助手大模型代理接口。"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..llm.settings import load_llm_settings, model_dump
from .context import _call, get_store

router = APIRouter(prefix="/jimeng/creator", tags=["jimeng-creator"])


class CreatorChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"] = "user"
    content: str


class CreatorChatRequest(BaseModel):
    model_id: str | None = None
    messages: list[CreatorChatMessage] = Field(default_factory=list)
    prompt: str = ""
    temperature: float = 0.7
    max_tokens: int = 4096
    timeout_seconds: int = 180
    stream: bool = False


class CreatorFallbackChatRequest(CreatorChatRequest):
    fallback_model_id_1: str | None = None
    fallback_model_id_2: str | None = None


@router.get("/model_options")
def list_creator_model_options():
    def load_options():
        settings = load_llm_settings(get_store())
        options: list[dict[str, Any]] = []
        for provider in settings.providers:
            for model in provider.models:
                if model.type == "text" and model.enabled:
                    options.append(
                        {
                            "provider_id": provider.id,
                            "provider_name": provider.name,
                            "model_id": model.id,
                            "model_name": model.name,
                            "value": f"{provider.id}:{model.id}",
                            "label": f"{provider.name} / {model.name}",
                        }
                    )
        return {"options": options, "default_model_id": settings.default_model_id}

    return _call(load_options)


@router.post("/chat")
def creator_chat(request: CreatorChatRequest):
    return _call(lambda: _chat_with_current_settings(request, [request.model_id]))


@router.post("/chat/fallback")
def creator_chat_fallback(request: CreatorFallbackChatRequest):
    return _call(lambda: _chat_with_current_settings(request, [request.model_id, request.fallback_model_id_1, request.fallback_model_id_2]))
```

Then add `_chat_with_current_settings` by reusing or adding a backend text-chat helper in `backend/app/llm/client.py`.

- [ ] **Step 4: Register creator router**

Modify `backend/app/api/router.py`:

```python
from .creator import router as creator_router

router.include_router(creator_router)
```

- [ ] **Step 5: Run backend verification**

Run:

```bash
python -m pytest tests/test_creator_api_structure.py -q
python -m compileall backend/app
```

Expected: PASS.

- [ ] **Step 6: Commit backend proxy**

```bash
git add backend/app/api/creator.py backend/app/api/router.py backend/app/llm/client.py tests/test_creator_api_structure.py
git commit -m "feat: add creator assistant llm proxy"
```

---

### Task 2: Frontend Creator Module Shell

**Files:**
- Create: `frontend/src/components/creator/pages/CreatorAssistantPage.tsx`
- Create: `frontend/src/components/creator/index.ts`
- Modify: `frontend/src/lib/jimengApi.ts`
- Modify: `frontend/src/components/jimeng/JimengApp.tsx`
- Test: `frontend/src/__tests__/creator-module-structure.local.mjs`

- [ ] **Step 1: Write failing frontend structure test**

Create `frontend/src/__tests__/creator-module-structure.local.mjs`:

```js
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/components/jimeng/JimengApp.tsx", "utf8");
const api = fs.readFileSync("src/lib/jimengApi.ts", "utf8");

assert.equal(app.includes("创作助手"), true, "top navigation should include 创作助手");
assert.equal(app.includes("漫剧制作"), true, "original production module should be renamed 漫剧制作");
assert.equal(app.includes("@/components/creator/pages/CreatorAssistantPage"), true);
assert.equal(api.includes('"creator"'), true, "JimengPageMode should include creator");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node src/__tests__/creator-module-structure.local.mjs`

Expected: FAIL because creator module does not exist.

- [ ] **Step 3: Add page mode and API placeholders**

Modify `frontend/src/lib/jimengApi.ts`:

```ts
export type JimengPageMode = "creator" | "projects" | "workbench" | "assets" | "queue" | "history" | "llm" | "settings";

export interface CreatorModelOption {
  provider_id: string;
  provider_name: string;
  model_id: string;
  model_name: string;
  value: string;
  label: string;
}
```

Add API methods:

```ts
listCreatorModelOptions: () =>
  axios.get<{ options: CreatorModelOption[]; default_model_id: string }>(`${API_URL}/jimeng/creator/model_options`).then((res) => res.data),
creatorChatFallback: (data: unknown) =>
  axios.post<{ content: string; model_id: string }>(`${API_URL}/jimeng/creator/chat/fallback`, data).then((res) => res.data),
```

- [ ] **Step 4: Create creator page shell**

Create `frontend/src/components/creator/pages/CreatorAssistantPage.tsx`:

```tsx
export default function CreatorAssistantPage() {
  return (
    <section className="space-y-4">
      <div className="glass-panel rounded-lg p-5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Creator Assistant</p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-foreground">创作助手</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          小说、短剧剧本、15 秒分镜稿创作和作品评测会在这里集成，模型请求统一走当前大模型设置。
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Register navigation**

Modify `frontend/src/components/jimeng/JimengApp.tsx`:

```tsx
import CreatorAssistantPage from "@/components/creator/pages/CreatorAssistantPage";
```

Add page:

```ts
{ id: "creator", label: "创作助手", icon: Sparkles },
{ id: "projects", label: "漫剧制作", icon: FolderOpen },
```

Route:

```tsx
if (activePage === "creator") return <CreatorAssistantPage />;
```

- [ ] **Step 6: Run frontend verification**

Run:

```bash
cd frontend
node src/__tests__/creator-module-structure.local.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit module shell**

```bash
git add frontend/src/components/creator frontend/src/lib/jimengApi.ts frontend/src/components/jimeng/JimengApp.tsx frontend/src/__tests__/creator-module-structure.local.mjs
git commit -m "feat: add creator assistant module shell"
```

---

### Task 3: Migrate Creator Core Without Independent API Key

**Files:**
- Copy/adapt: `script-creator/src/types/index.ts` to `frontend/src/components/creator/types.ts`
- Copy/adapt: `script-creator/src/contexts/AppContext.tsx` to `frontend/src/components/creator/context/CreatorContext.tsx`
- Copy/adapt: `script-creator/src/services/aiService.ts` to `frontend/src/components/creator/services/creatorAiService.ts`
- Copy/adapt: `script-creator/src/engines/*` to `frontend/src/components/creator/engines/*`
- Copy/adapt: creator UI components into `frontend/src/components/creator/components/*`

- [ ] **Step 1: Write failing API-key-removal test**

Create `frontend/src/__tests__/creator-no-independent-api.local.mjs`:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = "src/components/creator";
const files = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    if (item.isFile() && /\.(ts|tsx)$/.test(item.name)) files.push(full);
  }
}
walk(root);
const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");

assert.equal(source.includes("zizidonghua.com"), false, "creator should not use old fixed API host");
assert.equal(source.includes("VITE_API_KEY"), false, "creator should not read independent env API key");
assert.equal(source.includes("apiKey"), false, "creator UI state should not expose API Key");
assert.equal(source.includes("creatorChatFallback"), true, "creator should call current backend fallback route");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node src/__tests__/creator-no-independent-api.local.mjs`

Expected: FAIL until creator core is migrated and old API fields removed.

- [ ] **Step 3: Migrate types and remove API key fields**

In `frontend/src/components/creator/types.ts`, keep creator domain types but remove `apiKey` and `apiBaseUrl` from runtime config. Replace model fields with:

```ts
export interface CreatorModelStrategy {
  primaryModelId: string;
  fallbackModelId1: string;
  fallbackModelId2: string;
  timeoutSeconds: number;
  concurrency: number;
}
```

- [ ] **Step 4: Replace AI service with backend adapter**

Implement `frontend/src/components/creator/services/creatorAiService.ts`:

```ts
import { jimengApi } from "@/lib/jimengApi";

export async function callCreatorAI(prompt: string, maxTokens: number, temperature: number, options: {
  modelId: string;
  fallbackModelId1?: string;
  fallbackModelId2?: string;
  signal?: AbortSignal;
  timeoutSeconds?: number;
}) {
  const response = await jimengApi.creatorChatFallback({
    model_id: options.modelId,
    fallback_model_id_1: options.fallbackModelId1,
    fallback_model_id_2: options.fallbackModelId2,
    prompt,
    max_tokens: maxTokens,
    temperature,
    timeout_seconds: options.timeoutSeconds ?? 180,
    stream: false,
  });
  return response.content;
}
```

- [ ] **Step 5: Update engines to call creator adapter**

Replace imports from old `services/aiService` with `services/creatorAiService`. Preserve fallback and concurrency call sites by mapping old `modelName` fields to `CreatorModelStrategy` fields.

- [ ] **Step 6: Run frontend tests and build**

Run:

```bash
cd frontend
node src/__tests__/creator-no-independent-api.local.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit migrated creator core**

```bash
git add frontend/src/components/creator frontend/src/lib/jimengApi.ts frontend/src/__tests__/creator-no-independent-api.local.mjs
git commit -m "feat: migrate creator core to shared llm backend"
```

---

### Task 4: One-Click Import To Manju Production

**Files:**
- Create: `frontend/src/components/creator/adapters/importToJimeng.ts`
- Modify: creator result UI component under `frontend/src/components/creator/components/ScriptGenerator/*`
- Modify: `frontend/src/lib/jimengApi.ts` if import endpoint wrappers are missing.

- [ ] **Step 1: Write failing adapter test**

Create `frontend/src/__tests__/creator-import-to-jimeng.local.mjs`:

```js
import assert from "node:assert/strict";
import fs from "node:fs";

const adapter = fs.readFileSync("src/components/creator/adapters/importToJimeng.ts", "utf8");
assert.equal(adapter.includes("parseCreatorStoryboardToJimengShots"), true);
assert.equal(adapter.includes("importCreatorResultToJimeng"), true);
assert.equal(adapter.includes("jimengApi.createProject"), true);
assert.equal(adapter.includes("jimengApi.importShots"), true);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node src/__tests__/creator-import-to-jimeng.local.mjs`

Expected: FAIL because adapter does not exist.

- [ ] **Step 3: Implement adapter**

Create `frontend/src/components/creator/adapters/importToJimeng.ts`:

```ts
import { jimengApi } from "@/lib/jimengApi";

export interface CreatorImportResult {
  projectId: string;
  shotCount: number;
}

export function parseCreatorStoryboardToJimengShots(text: string): string {
  return text
    .split(/\n(?=分镜\s*\d+|镜头\s*\d+)/)
    .map((block) => block.trim())
    .filter(Boolean)
    .join("\n\n");
}

export async function importCreatorResultToJimeng(data: { title: string; content: string; ratio?: string }): Promise<CreatorImportResult> {
  const project = await jimengApi.createProject({
    name: data.title || "创作助手导入项目",
    style: "",
    default_ratio: data.ratio || "9:16",
    description: "由创作助手一键导入。",
  });
  const shotsText = parseCreatorStoryboardToJimengShots(data.content);
  const imported = await jimengApi.importShots(project.id, { text: shotsText });
  return { projectId: project.id, shotCount: imported.shots.length };
}
```

- [ ] **Step 4: Add result page action**

In creator result UI, add a button:

```tsx
<button type="button" onClick={handleImportToJimeng} className="glass-button-primary">
  导入到漫剧制作
</button>
```

`handleImportToJimeng` calls `importCreatorResultToJimeng`, then `useJimengStore.setState({ activePage: "workbench" })` after selecting the new project.

- [ ] **Step 5: Run verification**

Run:

```bash
cd frontend
node src/__tests__/creator-import-to-jimeng.local.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit import bridge**

```bash
git add frontend/src/components/creator frontend/src/lib/jimengApi.ts frontend/src/__tests__/creator-import-to-jimeng.local.mjs
git commit -m "feat: import creator output into production workspace"
```

---

### Task 5: Cyberpunk Theme

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/components/jimeng/JimengApp.tsx`
- Modify theme controls wherever the current light/dark switch is implemented.

- [ ] **Step 1: Write failing theme structure test**

Create `frontend/src/__tests__/cyberpunk-theme.local.mjs`:

```js
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/index.css", "utf8");
const app = fs.readFileSync("src/components/jimeng/JimengApp.tsx", "utf8");
assert.equal(css.includes("html.cyberpunk"), true);
assert.equal(app.includes("cyberpunk"), true);
assert.equal(app.includes("赛博朋克"), true);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node src/__tests__/cyberpunk-theme.local.mjs`

Expected: FAIL because cyberpunk theme is not implemented.

- [ ] **Step 3: Add CSS token theme**

In `frontend/src/index.css`, add:

```css
html.cyberpunk {
  color-scheme: dark;
  --color-bg: 222 47% 5%;
  --color-surface: 220 38% 9%;
  --color-surface-inset: 218 34% 12%;
  --color-foreground: 185 100% 94%;
  --color-text-secondary: 188 40% 72%;
  --color-text-muted: 205 24% 58%;
  --color-primary: 184 100% 50%;
  --color-primary-foreground: 222 47% 5%;
  --color-accent: 310 100% 62%;
  --color-glass-border: 184 100% 50% / 0.28;
}
```

- [ ] **Step 4: Extend theme switch**

Change theme state type from boolean/light-dark to:

```ts
type AppTheme = "light" | "dark" | "cyberpunk";
```

Ensure `document.documentElement.classList` removes all three and adds the selected theme.

- [ ] **Step 5: Run verification**

Run:

```bash
cd frontend
node src/__tests__/cyberpunk-theme.local.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit cyberpunk theme**

```bash
git add frontend/src/index.css frontend/src/components/jimeng/JimengApp.tsx frontend/src/__tests__/cyberpunk-theme.local.mjs
git commit -m "feat: add cyberpunk theme"
```

---

### Task 6: Version, Docs, Full Verification

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `backend/app/versioning.py`
- Modify: `pyproject.toml`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `docs/releases/v1.00.057-creator-assistant-integration.md`

- [ ] **Step 1: Update version**

Increment from `v1.00.056` to `v1.00.057` unless another implementation commit has already advanced the version.

- [ ] **Step 2: Update README current version summary**

README summary:

```md
- 当前版本：v1.00.057
- 更新时间：<current timestamp>
- 最近更新：新增创作助手模块，接入现有佳速 API 大模型策略，支持生成结果一键导入漫剧制作，并新增赛博朋克主题。
```

- [ ] **Step 3: Add release detail**

Create release doc with:

```md
# v1.00.057 创作助手集成

## 修改内容

- 新增创作助手模块。
- 原漫剧制作链路导航文案调整。
- 创作助手模型请求统一走当前大模型设置。
- 保留首选/备选模型 fallback 和并发生成策略。
- 增加一键导入到漫剧制作。
- 新增赛博朋克主题。

## 验证

- npm run build
- python -m compileall backend/app
```

- [ ] **Step 4: Run full verification**

Run:

```bash
cd frontend
npm run build
cd ..
python -m compileall backend/app
git diff --check
```

Expected: all pass; Vite chunk-size warning is acceptable.

- [ ] **Step 5: Commit final version/docs**

```bash
git add README.md CHANGELOG.md backend/app/versioning.py pyproject.toml frontend/package.json frontend/package-lock.json docs/releases/v1.00.057-creator-assistant-integration.md
git commit -m "docs: release creator assistant integration"
```

---

## Self-Review

- Spec coverage: backend proxy, model fallback, no API Key UI, module navigation, one-click import, cyberpunk theme, and docs/versioning are each covered by a task.
- Placeholder scan: no unfinished markers or unspecified “add tests” instructions remain.
- Type consistency: frontend uses `creatorChatFallback`, `CreatorModelOption`, `creator` page mode, and backend uses `/jimeng/creator/*` consistently.
