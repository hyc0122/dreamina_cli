# 资产管理全局生图模型与设置拆分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 资产管理统一使用全局图片模型，并把“生图设置”弹窗拆成多个独立小页面模块，README 只保留版本概要，详细更新内容进入 `docs/`。

**Architecture:** `AssetImageSettingsModal.tsx` 保留为主容器，新增多个 `AssetImage*SettingsSection.tsx` 子模块。全局模型值保存在 `AssetImageSettings.imageModelValue`，前端单张和批量资产生图都解析为 LLM provider/model；后端新增 LLM 批量资产生图接口，复用单张 LLM 生图函数。版本展示采用 `v1.00.001` 序列，详细更新说明放 `docs/releases/`。

**Tech Stack:** React + TypeScript + Vite、FastAPI + Pydantic、Axios API client、Markdown docs。

---

## File Structure

- Modify: `frontend/src/components/jimeng/assets/assetManagerShared.ts`
  - 增加 `imageModelValue`、全局模型解析 helper、显示标签 helper。
- Modify: `backend/app/llm/models.py`
  - 增加 LLM 批量资产生图请求模型。
- Modify: `backend/app/llm/asset_image.py`
  - 增加 LLM 批量资产生图函数。
- Modify: `backend/app/api/llm.py`
  - 增加 LLM 批量资产生图路由。
- Modify: `frontend/src/lib/jimengApi.ts`
  - 增加 LLM 批量资产生图客户端方法。
- Modify: `frontend/src/components/jimeng/assets/AssetImageSettingsModal.tsx`
  - 改成主弹窗和小页面导航容器。
- Create: `frontend/src/components/jimeng/assets/AssetImageModelSettingsSection.tsx`
  - 全局模型、默认画幅、分辨率。
- Create: `frontend/src/components/jimeng/assets/AssetImagePromptSettingsSection.tsx`
  - 全局必填提示词。
- Create: `frontend/src/components/jimeng/assets/AssetImageTypePrefixSettingsSection.tsx`
  - 人物、场景、道具前缀提示词。
- Create: `frontend/src/components/jimeng/assets/AssetImageStyleSettingsSection.tsx`
  - 风格库入口和应用状态。
- Create: `frontend/src/components/jimeng/assets/AssetImageSendPreviewSection.tsx`
  - 最终发送规则与当前类型预览。
- Modify: `frontend/src/components/jimeng/assets/AssetDetailPanel.tsx`
  - 移除单资产模型选择，显示只读全局模型。
- Modify: `frontend/src/components/jimeng/assets/CreateAssetModal.tsx`
  - 移除新建资产模型选择。
- Modify: `frontend/src/components/jimeng/pages/JimengAssetManagerPage.tsx`
  - 解析全局模型并传给弹窗、详情和批量生图。
- Modify: `README.md`
  - 当前版本、更新概要、更新日志入口。
- Modify: `CHANGELOG.md`
  - 版本列表，标题包含秒级时间。
- Create: `docs/releases/v1.00.001-asset-global-image-model.md`
  - 本次详细更新说明。
- Local verification: `frontend/src/__tests__/asset-global-image-model.local.mjs`
  - 本地结构测试，不提交。

---

### Task 1: Shared Settings Helper

**Files:**
- Modify: `frontend/src/components/jimeng/assets/assetManagerShared.ts`
- Local verification: `frontend/src/__tests__/asset-global-image-model.local.mjs`

- [ ] **Step 1: Run existing local test**

Run:

```bash
node frontend/src/__tests__/asset-global-image-model.local.mjs
```

Expected: after the helper change, it fails later on modal/backend assertions, not on `imageModelValue`.

- [ ] **Step 2: Verify shared helper contains these exports**

`assetManagerShared.ts` must include:

```ts
imageModelValue: string;
export const resolveAssetImageModelOption = (...): LlmModelOption | null => { ... };
export const assetImageModelLabel = (model: LlmModelOption | null): string => model?.label ?? "未选择可用模型";
```

- [ ] **Step 3: Commit helper**

```bash
git add frontend/src/components/jimeng/assets/assetManagerShared.ts
git commit -m "feat: add asset image model setting helpers"
```

---

### Task 2: Backend LLM Batch Generation

**Files:**
- Modify: `backend/app/llm/models.py`
- Modify: `backend/app/llm/asset_image.py`
- Modify: `backend/app/api/llm.py`
- Modify: `frontend/src/lib/jimengApi.ts`

- [ ] **Step 1: Add request model**

Add `JimengAssetType` import and:

```py
class LlmAssetImageBatchGenerateRequest(LlmAssetImageGenerateRequest):
    asset_ids: list[str] = Field(default_factory=list)
    asset_type: JimengAssetType | None = None
```

- [ ] **Step 2: Add batch function**

`backend/app/llm/asset_image.py` adds `batch_generate_asset_images(...)`, filters assets by `asset_ids` and `asset_type`, builds one `LlmAssetImageGenerateRequest`, calls `generate_asset_image` per asset, and returns `results/success_count/failed_count`.

- [ ] **Step 3: Add route**

Add:

```py
@router.post("/projects/{project_id}/assets/llm_image/batch_generate")
def batch_generate_llm_asset_images(...):
    return _call(lambda: _dump(batch_generate_asset_images(...)))
```

- [ ] **Step 4: Add frontend API method**

Add `batchGenerateAssetImagesWithLlm(projectId, data)` posting to `/assets/llm_image/batch_generate`.

- [ ] **Step 5: Verify and commit**

```bash
python -m compileall backend/app/llm backend/app/api
git add backend/app/llm/models.py backend/app/llm/asset_image.py backend/app/api/llm.py frontend/src/lib/jimengApi.ts
git commit -m "feat: add llm batch asset image generation"
```

---

### Task 3: Split Asset Image Settings Modal

**Files:**
- Modify: `frontend/src/components/jimeng/assets/AssetImageSettingsModal.tsx`
- Create: `frontend/src/components/jimeng/assets/AssetImageModelSettingsSection.tsx`
- Create: `frontend/src/components/jimeng/assets/AssetImagePromptSettingsSection.tsx`
- Create: `frontend/src/components/jimeng/assets/AssetImageTypePrefixSettingsSection.tsx`
- Create: `frontend/src/components/jimeng/assets/AssetImageStyleSettingsSection.tsx`
- Create: `frontend/src/components/jimeng/assets/AssetImageSendPreviewSection.tsx`

- [ ] **Step 1: Create section components**

Each section receives only the props it needs. Use existing CSS classes (`glass-input`, `bg-surface-inset`, `border-glass-border`) and keep text compact.

Required module responsibilities:

```text
AssetImageModelSettingsSection: imageModelOptions, resolvedImageModelValue, draft, setDraft
AssetImagePromptSettingsSection: draft, setDraft, clear status/error callbacks
AssetImageTypePrefixSettingsSection: draft, setDraft, activePrefixType, setActivePrefixType
AssetImageStyleSettingsSection: stylePresets, selectedStyleId, appendStylePrompt, onStylePresetsChanged
AssetImageSendPreviewSection: draft, activePreviewType
```

- [ ] **Step 2: Refactor modal into navigation container**

`AssetImageSettingsModal.tsx` should define tab ids:

```ts
type AssetImageSettingsTab = "model" | "prompt" | "prefix" | "style" | "preview";
```

Render left navigation on desktop and wrapping/horizontal controls on small screens. The main panel renders only the selected section.

- [ ] **Step 3: Preserve existing behavior**

Keep:

- `useModalDismiss` dirty check.
- prompt empty validation on save.
- style prompt append behavior.
- save status/error messages.

- [ ] **Step 4: Local structure check**

Update local test to assert section file names and `AssetImageSettingsModal` imports them. Run:

```bash
node frontend/src/__tests__/asset-global-image-model.local.mjs
```

Expected: still may fail until Task 4 wiring, but section assertions pass.

- [ ] **Step 5: Commit modal split**

```bash
git add frontend/src/components/jimeng/assets/AssetImageSettingsModal.tsx frontend/src/components/jimeng/assets/AssetImageModelSettingsSection.tsx frontend/src/components/jimeng/assets/AssetImagePromptSettingsSection.tsx frontend/src/components/jimeng/assets/AssetImageTypePrefixSettingsSection.tsx frontend/src/components/jimeng/assets/AssetImageStyleSettingsSection.tsx frontend/src/components/jimeng/assets/AssetImageSendPreviewSection.tsx
git commit -m "refactor: split asset image settings modal"
```

---

### Task 4: UI Wiring Uses Global Model

**Files:**
- Modify: `frontend/src/components/jimeng/assets/AssetDetailPanel.tsx`
- Modify: `frontend/src/components/jimeng/assets/CreateAssetModal.tsx`
- Modify: `frontend/src/components/jimeng/pages/JimengAssetManagerPage.tsx`

- [ ] **Step 1: Asset detail**

Remove editable model select. Add read-only global model block and parse `globalImageModelValue` in `generateImage`.

- [ ] **Step 2: Create asset modal**

Remove model props/imports/UI. Keep `image_model: draft.imageModel` in create payload for compatibility.

- [ ] **Step 3: Asset manager page**

Load LLM settings, compute fallback image model using `encodeLlmModelValue`, resolve model via `resolveAssetImageModelOption`, pass label/value to detail and modal, and use `batchGenerateAssetImagesWithLlm` for batch generation.

- [ ] **Step 4: Verify and commit**

```bash
node frontend/src/__tests__/asset-global-image-model.local.mjs
npm run build
git add frontend/src/components/jimeng/assets/AssetDetailPanel.tsx frontend/src/components/jimeng/assets/CreateAssetModal.tsx frontend/src/components/jimeng/pages/JimengAssetManagerPage.tsx
git commit -m "feat: use global asset image model in UI"
```

---

### Task 5: Version Docs

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Create: `docs/releases/v1.00.001-asset-global-image-model.md`

- [ ] **Step 1: README**

README 只显示：

```md
当前版本：`v1.00.001`

最近更新：资产管理全局生图模型与设置拆分

更新日志：[CHANGELOG.md](./CHANGELOG.md)
```

- [ ] **Step 2: CHANGELOG**

Add top entry with current Asia/Shanghai timestamp precise to seconds:

```md
## v1.00.001 - 2026-06-20 11:22:36 +08:00

- 资产管理全局生图模型与设置拆分。详细说明：`docs/releases/v1.00.001-asset-global-image-model.md`
```

- [ ] **Step 3: Detailed release doc**

`docs/releases/v1.00.001-asset-global-image-model.md` 写详细更新内容，包括弹窗拆分、全局模型、批量 LLM 生图、兼容性和验证结果。

- [ ] **Step 4: Commit docs**

```bash
git add README.md CHANGELOG.md docs/releases/v1.00.001-asset-global-image-model.md
git commit -m "docs: release v1.00.001 asset global image model"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run local test**

```bash
node frontend/src/__tests__/asset-global-image-model.local.mjs
```

Expected: `asset global image model wiring verified`.

- [ ] **Step 2: Run backend compile**

```bash
python -m compileall backend/app/llm backend/app/api
```

Expected: no syntax errors.

- [ ] **Step 3: Run frontend build**

```bash
npm run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 4: Check tracked scope**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; status only includes intended source or documentation changes.


