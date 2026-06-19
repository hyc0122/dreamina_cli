# 璧勪骇绠＄悊鍏ㄥ眬鐢熷浘妯″瀷 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 璧勪骇绠＄悊缁熶竴閫氳繃鈥滅敓鍥捐缃€濋€夋嫨鍏ㄥ眬鍥剧墖妯″瀷锛屽崟涓祫浜у彧鏄剧ず褰撳墠鍏ㄥ眬妯″瀷锛屽崟寮犲拰鎵归噺 AI 鐢熷浘閮戒娇鐢ㄨ繖涓ā鍨嬨€?
**Architecture:** 鍓嶇鎶婅祫浜у浘鐗囨ā鍨嬩繚瀛樺埌 `AssetImageSettings.imageModelValue`锛岀敤鐜版湁 `llm:<providerId>:<modelId>` 缂栫爜鏍煎紡鍜屽ぇ妯″瀷鍥剧墖妯″瀷鍒楄〃瑙ｆ瀽銆傚崟寮犺祫浜х户缁蛋鐜版湁 LLM 鐢熷浘鎺ュ彛锛屾壒閲忚祫浜ф柊澧?LLM 鎵归噺鎺ュ彛骞跺鐢ㄥ悗绔崟寮?LLM 鐢熷浘鍑芥暟锛涙棫鍗虫ⅵ CLI 璧勪骇鐢熷浘鎺ュ彛涓嶅垹闄ゃ€傝祫浜ф暟鎹噷鐨?`image_model` 瀛楁淇濈暀缁欏巻鍙叉暟鎹€佸鍏ュ鍑哄拰鏃ф帴鍙ｅ吋瀹广€?
**Tech Stack:** React + TypeScript + Vite銆丗astAPI + Pydantic銆佺幇鏈?`jimengApi` Axios 瀹㈡埛绔€佹牴鐩綍鐗堟湰鏂囦欢鍜?`CHANGELOG.md`銆?
---

## File Structure

- Modify: `frontend/src/components/jimeng/assets/assetManagerShared.ts`
  - 涓鸿祫浜х敓鍥捐缃鍔?`imageModelValue`銆?  - 澧炲姞鍏ㄥ眬妯″瀷瑙ｆ瀽鍜屾爣绛?helper銆?- Modify: `frontend/src/components/jimeng/assets/AssetImageSettingsModal.tsx`
  - 鍦ㄢ€滅敓鍥捐缃€濆脊绐楅噷澧炲姞鍏ㄥ眬鐢熷浘妯″瀷涓嬫媺妗嗐€?- Modify: `frontend/src/components/jimeng/assets/AssetDetailPanel.tsx`
  - 绉婚櫎鍗曡祫浜фā鍨嬩笅鎷夋銆?  - 鏄剧ず鍙鈥滃叏灞€鐢熷浘妯″瀷鈥濄€?  - 鍗曞紶 AI 鐢熷浘浣跨敤鍏ㄥ眬妯″瀷瑙ｆ瀽缁撴灉銆?- Modify: `frontend/src/components/jimeng/assets/CreateAssetModal.tsx`
  - 绉婚櫎鏂板缓璧勪骇寮圭獥閲岀殑鐢熷浘妯″瀷閫夋嫨銆?- Modify: `frontend/src/components/jimeng/pages/JimengAssetManagerPage.tsx`
  - 鍔犺浇 LLM 鍥剧墖妯″瀷鍒楄〃鍜岄粯璁ゅ浘鐗囨ā鍨嬨€?  - 缁熶竴浼犻€掑叏灞€妯″瀷缁欒缃脊绐椼€佽鎯呴潰鏉垮拰鎵归噺鐢熷浘銆?- Modify: `frontend/src/lib/jimengApi.ts`
  - 澧炲姞 LLM 鎵归噺璧勪骇鐢熷浘瀹㈡埛绔柟娉曘€?- Modify: `backend/app/llm/models.py`
  - 澧炲姞 LLM 鎵归噺璧勪骇鐢熷浘璇锋眰妯″瀷銆?- Modify: `backend/app/llm/asset_image.py`
  - 澧炲姞鎵归噺 LLM 璧勪骇鐢熷浘鍑芥暟锛屽鐢ㄧ幇鏈夊崟寮?LLM 鐢熸垚銆?- Modify: `backend/app/api/llm.py`
  - 澧炲姞 `/jimeng/projects/{project_id}/assets/llm_image/batch_generate` 璺敱銆?- Modify: `README.md`
  - 当前项目版本更新为 `v1.00.001`，继续链接 `CHANGELOG.md`。
- Modify: `CHANGELOG.md`
  - 增加 `v1.00.001 - 2026-06-20 03:00:44 +08:00` 更新内容。
- Local verification: `frontend/src/__tests__/asset-global-image-model.local.mjs`
  - 鐢ㄧ幇鏈夋簮鐮佺粨鏋勬柇瑷€鏂瑰紡楠岃瘉鍏抽敭閫昏緫銆?
---

### Task 1: Shared Asset Image Model Settings

**Files:**
- Modify: `frontend/src/components/jimeng/assets/assetManagerShared.ts`
- Local verification: `frontend/src/__tests__/asset-global-image-model.local.mjs`

- [ ] **Step 1: Write the local structure test**

Create `frontend/src/__tests__/asset-global-image-model.local.mjs` with:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shared = readFileSync(new URL("../components/jimeng/assets/assetManagerShared.ts", import.meta.url), "utf8");
const settingsModal = readFileSync(new URL("../components/jimeng/assets/AssetImageSettingsModal.tsx", import.meta.url), "utf8");
const detailPanel = readFileSync(new URL("../components/jimeng/assets/AssetDetailPanel.tsx", import.meta.url), "utf8");
const createModal = readFileSync(new URL("../components/jimeng/assets/CreateAssetModal.tsx", import.meta.url), "utf8");
const assetPage = readFileSync(new URL("../components/jimeng/pages/JimengAssetManagerPage.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../lib/jimengApi.ts", import.meta.url), "utf8");
const llmApi = readFileSync(new URL("../../backend/app/api/llm.py", import.meta.url), "utf8");
const llmAssetImage = readFileSync(new URL("../../backend/app/llm/asset_image.py", import.meta.url), "utf8");

assert.match(shared, /imageModelValue:\s*string/, "璧勪骇鐢熷浘璁剧疆搴斿寘鍚叏灞€妯″瀷鍊?);
assert.match(shared, /resolveAssetImageModelOption/, "搴旀彁渚涘叏灞€妯″瀷瑙ｆ瀽 helper");
assert.match(shared, /assetImageModelLabel/, "搴旀彁渚涘叏灞€妯″瀷鏄剧ず鏍囩 helper");
assert.match(settingsModal, /鍏ㄥ眬鐢熷浘妯″瀷/, "鐢熷浘璁剧疆寮圭獥搴旀樉绀哄叏灞€鐢熷浘妯″瀷");
assert.match(settingsModal, /imageModelOptions\.map/, "鐢熷浘璁剧疆寮圭獥搴斾娇鐢ㄥぇ妯″瀷鍥剧墖妯″瀷鍒楄〃");
assert.doesNotMatch(detailPanel, /IMAGE_MODELS\.map/, "鍗曡祫浜ц鎯呬笉搴旂户缁覆鏌撴棫鐢熷浘妯″瀷鍒楄〃");
assert.doesNotMatch(detailPanel, /updateForm\("imageModel"/, "鍗曡祫浜ц鎯呬笉搴旂户缁慨鏀瑰崟璧勪骇妯″瀷");
assert.match(detailPanel, /globalImageModelLabel/, "鍗曡祫浜ц鎯呭簲鏄剧ず鍏ㄥ眬妯″瀷鏍囩");
assert.match(detailPanel, /parseLlmModelValue\(globalImageModelValue\)/, "鍗曞紶 AI 鐢熷浘搴旇В鏋愬叏灞€妯″瀷鍊?);
assert.doesNotMatch(createModal, /imageModelOptions\.map/, "鏂板缓璧勪骇寮圭獥涓嶅簲娓叉煋妯″瀷鍒楄〃");
assert.doesNotMatch(createModal, /updateDraft\("imageModel"/, "鏂板缓璧勪骇寮圭獥涓嶅簲淇敼鍗曡祫浜фā鍨?);
assert.match(assetPage, /resolveAssetImageModelOption/, "璧勪骇绠＄悊椤靛簲瑙ｆ瀽鍏ㄥ眬妯″瀷");
assert.match(assetPage, /batchGenerateAssetImagesWithLlm/, "璧勪骇绠＄悊鎵归噺鐢熷浘搴旇皟鐢?LLM 鎵归噺鎺ュ彛");
assert.match(api, /batchGenerateAssetImagesWithLlm/, "鍓嶇 API 搴旀毚闇?LLM 鎵归噺鐢熷浘鏂规硶");
assert.match(llmApi, /llm_image\/batch_generate/, "鍚庣搴旀毚闇?LLM 鎵归噺鐢熷浘璺敱");
assert.match(llmAssetImage, /def batch_generate_asset_images/, "鍚庣搴斿疄鐜?LLM 鎵归噺鐢熷浘鍑芥暟");

console.log("asset global image model wiring verified");
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node frontend/src/__tests__/asset-global-image-model.local.mjs
```

Expected: FAIL on `imageModelValue` or `resolveAssetImageModelOption`, because the shared settings helper has not been implemented yet.

- [ ] **Step 3: Extend `AssetImageSettings` and helper functions**

In `frontend/src/components/jimeng/assets/assetManagerShared.ts`, add a type-only import:

```ts
import type { LlmModelOption } from "@/components/jimeng/llm/modelOptions";
```

Extend the settings interface:

```ts
export interface AssetImageSettings {
  resolutionType: "2k" | "4k";
  defaultImageRatio: AssetImageRatio;
  imageModelValue: string;
  imagePromptTemplate: string;
  characterPromptPrefix: string;
  scenePromptPrefix: string;
  propPromptPrefix: string;
}
```

Add the default field:

```ts
export const DEFAULT_IMAGE_SETTINGS: AssetImageSettings = {
  resolutionType: "2k",
  defaultImageRatio: "16:9",
  imageModelValue: "",
  imagePromptTemplate: "缁熶竴鐢婚锛屽共鍑€鑳屾櫙锛屼富浣撴竻鏅帮紝閫傚悎浣滀负婕墽璧勪骇鍙傝€冨浘銆?,
  characterPromptPrefix: "瑙掕壊璧勪骇鍥撅細淇濇寔浜虹墿浜斿畼銆佹湇瑁呫€佸彂鍨嬬ǔ瀹氾紝閫傚悎浣滀负鍚庣画瑙嗛鍙傝€冦€?,
  scenePromptPrefix: "鍦烘櫙璧勪骇鍥撅細寮鸿皟绌洪棿缁撴瀯銆佸厜绾裤€佸彲澶嶇敤鑳屾櫙锛屼笉瑕佸嚭鐜颁富浣撲汉鐗┿€?,
  propPromptPrefix: "閬撳叿璧勪骇鍥撅細鍗曚綋閬撳叿娓呮櫚灞呬腑锛屾潗璐ㄧ粏鑺傛槑纭紝鑳屾櫙绠€娲併€?,
};
```

Add these helpers below `writeImageSettings`:

```ts
export const resolveAssetImageModelOption = (
  settings: AssetImageSettings,
  imageModelOptions: LlmModelOption[],
  fallbackImageModelValue = "",
): LlmModelOption | null => {
  const saved = settings.imageModelValue ? imageModelOptions.find((model) => model.value === settings.imageModelValue) : null;
  if (saved) {
    return saved;
  }
  const fallback = fallbackImageModelValue ? imageModelOptions.find((model) => model.value === fallbackImageModelValue) : null;
  return fallback ?? imageModelOptions[0] ?? null;
};

export const assetImageModelLabel = (model: LlmModelOption | null): string => model?.label ?? "鏈€夋嫨鍙敤妯″瀷";
```

- [ ] **Step 4: Run the local test**

Run:

```bash
node frontend/src/__tests__/asset-global-image-model.local.mjs
```

Expected: FAIL moves forward to modal/page/backend assertions, proving Task 1 passed and later wiring remains missing.

- [ ] **Step 5: Commit Task 1**

```bash
git add frontend/src/components/jimeng/assets/assetManagerShared.ts
git commit -m "feat: add asset image model setting helpers"
```

---

### Task 2: Backend LLM Batch Asset Image Generation

**Files:**
- Modify: `backend/app/llm/models.py`
- Modify: `backend/app/llm/asset_image.py`
- Modify: `backend/app/api/llm.py`
- Modify: `frontend/src/lib/jimengApi.ts`

- [ ] **Step 1: Add the batch request model**

In `backend/app/llm/models.py`, add this import:

```py
from ..jimeng_models import JimengAssetType
```

Add the model below `LlmAssetImageGenerateRequest`:

```py
class LlmAssetImageBatchGenerateRequest(LlmAssetImageGenerateRequest):
    asset_ids: list[str] = Field(default_factory=list)
    asset_type: JimengAssetType | None = None
```

- [ ] **Step 2: Add the batch generator**

In `backend/app/llm/asset_image.py`, add `LlmAssetImageBatchGenerateRequest` to the import:

```py
from .models import LlmAssetImageBatchGenerateRequest, LlmAssetImageGenerateRequest
```

Add this function below `generate_asset_image`:

```py
def batch_generate_asset_images(store: JimengStore, project_id: str, request: LlmAssetImageBatchGenerateRequest):
    store.get_project(project_id)
    if request.asset_ids:
        wanted = set(request.asset_ids)
        assets = [asset for asset in store.list_assets(project_id, request.asset_type) if asset.id in wanted]
    else:
        assets = store.list_assets(project_id, request.asset_type)

    results: list[dict[str, Any]] = []
    single_request = LlmAssetImageGenerateRequest(
        provider_id=request.provider_id,
        model_id=request.model_id,
        size=request.size,
        extra_prompt=request.extra_prompt,
    )
    for asset in assets:
        try:
            result = generate_asset_image(store, project_id, asset.id, single_request)
            results.append({"asset_id": asset.id, "asset_name": asset.name, "ok": True, **result})
        except ValueError as exc:
            results.append({"asset_id": asset.id, "asset_name": asset.name, "ok": False, "error": str(exc)})
    return {
        "results": results,
        "success_count": sum(1 for item in results if item.get("ok")),
        "failed_count": sum(1 for item in results if not item.get("ok")),
    }
```

- [ ] **Step 3: Add the backend route**

In `backend/app/api/llm.py`, update imports:

```py
from ..llm.asset_image import batch_generate_asset_images, generate_asset_image
from ..llm.models import LlmAssetImageBatchGenerateRequest, LlmAssetImageGenerateRequest, LlmSettings
```

Add the route after `generate_llm_asset_image`:

```py
@router.post("/projects/{project_id}/assets/llm_image/batch_generate")
def batch_generate_llm_asset_images(
    project_id: str,
    request: Optional[LlmAssetImageBatchGenerateRequest] = None,
):
    return _call(lambda: _dump(batch_generate_asset_images(get_store(), project_id, request or LlmAssetImageBatchGenerateRequest())))
```

- [ ] **Step 4: Add the frontend API method**

In `frontend/src/lib/jimengApi.ts`, add this method next to `batchGenerateAssetImages`:

```ts
batchGenerateAssetImagesWithLlm: (
  projectId: string,
  data: { provider_id?: string; model_id?: string; size?: string; extra_prompt?: string; asset_ids?: string[]; asset_type?: JimengAssetType } = {},
) =>
  axios
    .post<JimengAssetBatchImageGenerationResponse>(`${API_URL}/jimeng/projects/${projectId}/assets/llm_image/batch_generate`, data)
    .then((res) => res.data),
```

- [ ] **Step 5: Run backend syntax check and local structure test**

Run:

```bash
python -m compileall backend/app/llm backend/app/api
node frontend/src/__tests__/asset-global-image-model.local.mjs
```

Expected: Python compile succeeds. The local structure test still fails on UI wiring assertions until Task 3.

- [ ] **Step 6: Commit Task 2**

```bash
git add backend/app/llm/models.py backend/app/llm/asset_image.py backend/app/api/llm.py frontend/src/lib/jimengApi.ts
git commit -m "feat: add llm batch asset image generation"
```

---

### Task 3: Asset Management UI Uses Global Model

**Files:**
- Modify: `frontend/src/components/jimeng/assets/AssetImageSettingsModal.tsx`
- Modify: `frontend/src/components/jimeng/assets/AssetDetailPanel.tsx`
- Modify: `frontend/src/components/jimeng/assets/CreateAssetModal.tsx`
- Modify: `frontend/src/components/jimeng/pages/JimengAssetManagerPage.tsx`

- [ ] **Step 1: Add model selector props to the settings modal**

In `AssetImageSettingsModal.tsx`, add:

```ts
import type { LlmModelOption } from "@/components/jimeng/llm/modelOptions";
```

Update props:

```ts
imageModelOptions,
resolvedImageModelValue,
```

and the prop type:

```ts
imageModelOptions: LlmModelOption[];
resolvedImageModelValue: string;
```

Update the open effect:

```ts
setDraft({ ...value, imageModelValue: value.imageModelValue || resolvedImageModelValue });
```

Add this UI near the top of the settings body:

```tsx
<label className="block space-y-2 rounded-lg border border-glass-border bg-surface-inset p-3">
  <span className="text-sm font-medium text-text-secondary">鍏ㄥ眬鐢熷浘妯″瀷</span>
  <select
    value={draft.imageModelValue || resolvedImageModelValue}
    onChange={(event) => {
      setDraft((state) => ({ ...state, imageModelValue: event.target.value }));
      setSaveError(null);
      setStatusMessage(null);
    }}
    disabled={imageModelOptions.length === 0}
    className="glass-input h-10 w-full text-sm text-foreground"
  >
    {imageModelOptions.length === 0 ? <option value="">鏈€夋嫨鍙敤妯″瀷</option> : null}
    {imageModelOptions.map((model) => (
      <option key={model.value} value={model.value}>
        {model.label}
      </option>
    ))}
  </select>
  <span className="block text-xs leading-5 text-text-muted">杩欓噷鐨勬ā鍨嬩細鐢ㄤ簬璧勪骇绠＄悊閲岀殑鍗曞紶 AI 鐢熷浘鍜屾壒閲忕敓鍥俱€?/span>
</label>
```

- [ ] **Step 2: Update the asset detail panel props**

In `AssetDetailPanel.tsx`, remove `IMAGE_MODELS` and `LlmModelOption` imports. Keep `parseLlmModelValue`.

Update props:

```ts
globalImageModelValue,
globalImageModelLabel,
```

with types:

```ts
globalImageModelValue: string;
globalImageModelLabel: string;
```

Remove `imageModelOptions` from props.

- [ ] **Step 3: Stop saving per-asset image model from detail panel**

In `AssetDetailPanel.tsx`, change `buildMetadataPayload` to:

```ts
const buildMetadataPayload = () => ({
  name: form?.name.trim() ?? "",
  aliases: splitAliases(form?.aliasesText ?? ""),
  description: form?.description ?? "",
  image_ratio: form?.imageRatio ?? "16:9",
});
```

Change `generateImage` model parsing to:

```ts
const selectedLlmModel = parseLlmModelValue(globalImageModelValue);
```

- [ ] **Step 4: Replace the model dropdown with read-only global model display**

In `AssetDetailPanel.tsx`, remove the model `<select>` block and keep the grid as:

```tsx
<div className="grid gap-2 sm:grid-cols-2 sm:items-end">
  <div className="rounded-lg border border-glass-border bg-surface-inset p-3">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-text-secondary">鍏ㄥ眬鐢熷浘妯″瀷</span>
      <button type="button" onClick={onSettingsOpen} className="text-xs font-medium text-primary hover:text-primary/80">
        璁剧疆
      </button>
    </div>
    <p className="mt-2 truncate text-sm font-medium text-foreground">{globalImageModelLabel}</p>
  </div>
  <div className="space-y-1.5">
    <span className="block text-xs font-medium text-text-secondary">鐢诲箙</span>
    <div className="inline-flex h-10 w-full rounded-md border border-glass-border bg-surface-inset p-1">
      {(["16:9", "9:16"] as const).map((ratio) => (
        <button
          key={ratio}
          type="button"
          onClick={() => updateForm("imageRatio", ratio)}
          className={clsx(
            "flex-1 rounded px-3 text-xs font-medium transition-colors",
            form.imageRatio === ratio ? "bg-primary text-white" : "text-text-secondary hover:bg-hover-bg hover:text-foreground",
          )}
        >
          {ratio}
        </button>
      ))}
    </div>
  </div>
</div>
```

Keep the existing resolution selector in its own label below this grid so global resolution still saves through `onSettingsChange`.

- [ ] **Step 5: Remove model selector from create modal**

In `CreateAssetModal.tsx`, remove `imageModelOptions` from props and prop type. Remove `IMAGE_MODELS` and `LlmModelOption` imports.

Remove the model `<select>` block and use this grid:

```tsx
<div className="grid gap-3 md:grid-cols-1">
  <div className="space-y-1.5">
    <span className="block text-xs font-medium text-text-secondary">鐢诲箙</span>
    <div className="inline-flex h-10 w-full rounded-md border border-glass-border bg-surface-inset p-1">
      {(["16:9", "9:16"] as const).map((ratio) => (
        <button
          key={ratio}
          type="button"
          onClick={() => updateDraft("imageRatio", ratio)}
          className={clsx(
            "flex-1 rounded px-3 text-xs font-medium transition-colors",
            draft.imageRatio === ratio ? "bg-primary text-white" : "text-text-secondary hover:bg-hover-bg hover:text-foreground",
          )}
        >
          {ratio}
        </button>
      ))}
    </div>
  </div>
</div>
```

Keep create payload as:

```ts
image_model: draft.imageModel,
```

because the backend asset model still has this compatibility field.

- [ ] **Step 6: Wire global model resolution in the asset manager page**

In `JimengAssetManagerPage.tsx`, update imports:

```ts
import {
  type AssetImageSettings,
  type AssetViewMode,
  assetGroupKey,
  assetImageModelLabel,
  imagePromptForAsset,
  readImageSettings,
  requestErrorMessage,
  resolveAssetImageModelOption,
  writeImageSettings,
} from "@/components/jimeng/assets/assetManagerShared";
import { buildLlmModelOptions, encodeLlmModelValue, parseLlmModelValue, type LlmModelOption } from "@/components/jimeng/llm/modelOptions";
```

Add state:

```ts
const [fallbackImageModelValue, setFallbackImageModelValue] = useState("");
```

Update the LLM settings load effect:

```ts
useEffect(() => {
  jimengApi
    .getLlmSettings()
    .then((settings) => {
      const options = buildLlmModelOptions(settings, "image");
      setImageModelOptions(options);
      const defaultValue = encodeLlmModelValue(settings.default_provider_id, settings.default_model_id);
      const fallback = options.find((model) => model.value === defaultValue)?.value ?? options[0]?.value ?? "";
      setFallbackImageModelValue(fallback);
    })
    .catch(() => {
      setImageModelOptions([]);
      setFallbackImageModelValue("");
    });
}, []);
```

Add memoized global model values:

```ts
const resolvedImageModelOption = useMemo(
  () => resolveAssetImageModelOption(imageSettings, imageModelOptions, fallbackImageModelValue),
  [fallbackImageModelValue, imageModelOptions, imageSettings],
);
const resolvedImageModelValue = resolvedImageModelOption?.value ?? "";
const resolvedImageModelLabel = assetImageModelLabel(resolvedImageModelOption);
```

- [ ] **Step 7: Use global model for batch generation**

In `JimengAssetManagerPage.tsx`, update batch generation:

```ts
const selectedLlmModel = parseLlmModelValue(resolvedImageModelValue);
const result = await jimengApi.batchGenerateAssetImagesWithLlm(currentProject.id, {
  asset_ids: targets.map((asset) => asset.id),
  asset_type: activeType,
  provider_id: selectedLlmModel?.providerId,
  model_id: selectedLlmModel?.modelId,
  extra_prompt: imagePromptForAsset(imageSettings, activeType),
});
```

- [ ] **Step 8: Pass global model props through JSX**

Update `AssetDetailPanel` usage:

```tsx
<AssetDetailPanel
  projectId={currentProject.id}
  asset={selectedAsset}
  groupedAssets={selectedGroup}
  settings={imageSettings}
  globalImageModelValue={resolvedImageModelValue}
  globalImageModelLabel={resolvedImageModelLabel}
  onSettingsOpen={() => setSettingsOpen(true)}
  onSettingsChange={saveImageSettings}
  onRefresh={refreshProject}
  onPreview={setPreviewAsset}
  onSelectAsset={setSelectedAssetId}
/>
```

Update `AssetImageSettingsModal` usage:

```tsx
<AssetImageSettingsModal
  open={settingsOpen}
  value={imageSettings}
  imageModelOptions={imageModelOptions}
  resolvedImageModelValue={resolvedImageModelValue}
  stylePresets={stylePresets}
  onStylePresetsChanged={reloadAssetStylePresets}
  onClose={() => setSettingsOpen(false)}
  onSave={saveImageSettings}
/>
```

Update `CreateAssetModal` usage by removing `imageModelOptions={imageModelOptions}`.

- [ ] **Step 9: Run frontend validation**

Run:

```bash
node frontend/src/__tests__/asset-global-image-model.local.mjs
npm run build
```

Expected: local structure test passes. Vite build and TypeScript compilation pass.

- [ ] **Step 10: Commit Task 3**

```bash
git add frontend/src/components/jimeng/assets/AssetImageSettingsModal.tsx frontend/src/components/jimeng/assets/AssetDetailPanel.tsx frontend/src/components/jimeng/assets/CreateAssetModal.tsx frontend/src/components/jimeng/pages/JimengAssetManagerPage.tsx
git commit -m "feat: use global asset image model in UI"
```

---

### Task 4: Project Version and Changelog

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update README current project version**

Change the README current version line:

```md
当前版本：`v1.00.001`
```

Keep the changelog link:

```md
更新日志：[CHANGELOG.md](./CHANGELOG.md)
```

项目展示版本以 README/CHANGELOG 的 `v1.00.001` 序列为准。除非包管理工具验证通过，否则不要把这种带前导零的展示版本写入 npm 或 Python 包元数据，避免破坏构建。

- [ ] **Step 2: Add changelog entry with second-level timestamp**

Insert this entry at the top of `CHANGELOG.md`, above the existing entries:

```md
## v1.00.001 - 2026-06-20 03:00:44 +08:00

- 资产管理新增全局生图模型设置，单个资产详情只显示当前全局模型。
- 单张资产 AI 生图和批量资产生图统一使用资产管理全局模型。
- 新建资产弹窗移除单资产生图模型选择，保留旧资产模型字段兼容历史数据。
- 新增 LLM 批量资产生图接口，复用现有单张 LLM 生图流程。
```

Use this numbering rule for later releases:

```text
第一次更新：v1.00.001
第二次更新：v1.00.002
第三次更新：v1.00.003
```

每条更新日志标题都必须包含 Asia/Shanghai 时间，并且更新时间精确到秒。

- [ ] **Step 3: Commit Task 4**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: release v1.00.001 asset global image model"
```
---

### Task 5: Final Verification

**Files:**
- Verify repository state and build output.

- [ ] **Step 1: Run targeted local test**

Run:

```bash
node frontend/src/__tests__/asset-global-image-model.local.mjs
```

Expected:

```text
asset global image model wiring verified
```

- [ ] **Step 2: Run backend compile check**

Run:

```bash
python -m compileall backend/app/llm backend/app/api
```

Expected: compile completes without syntax errors.

- [ ] **Step 3: Run frontend build**

Run from `frontend`:

```bash
npm run build
```

Expected: TypeScript and Vite build finish successfully.

- [ ] **Step 4: Check tracked files**

Run:

```bash
git status --short
git diff --check
git ls-files tests frontend/src/**/__tests__ runtime_data frontend/dist build_cache releases backend/data
```

Expected:
- `git status --short` shows only intended tracked source/doc/version changes if any remain uncommitted.
- `git diff --check` prints no whitespace errors.
- `git ls-files ...` prints no paths from those local/generated locations.

- [ ] **Step 5: Final commit if verification required small fixes**

If verification forces a small source/doc fix, commit it:

```bash
git add <changed-source-or-doc-files>
git commit -m "fix: polish asset global image model wiring"
```

If no fixes are needed, do not create an empty commit.

---

Plan complete and saved to `docs/superpowers/plans/2026-06-20-asset-global-image-model.md`.

Execution choice already selected by the user for this project: Subagent-Driven. If agent dispatch is unavailable in the current session, execute the same tasks inline with review checkpoints and keep commits task-sized.




