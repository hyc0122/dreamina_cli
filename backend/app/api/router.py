"""即梦业务 API 总路由。

各业务域只在这里挂载一次。旧 ``jimeng_api.py`` 仅用于兼容历史导入，
不得再次挂载，否则 FastAPI 会按注册顺序静默覆盖同名接口。
"""

from fastapi import APIRouter

from . import app_version, assets, bindings, candidates, jimeng_hub, llm, projects, prompt_presets, queue, settings, shots, web_session


router = APIRouter()
router.include_router(app_version.router)
router.include_router(projects.router)
router.include_router(shots.router)
router.include_router(assets.router)
router.include_router(bindings.router)
router.include_router(candidates.router)
router.include_router(queue.router)
router.include_router(settings.router)
router.include_router(llm.router)
router.include_router(prompt_presets.router)
router.include_router(web_session.router)
router.include_router(jimeng_hub.router)
