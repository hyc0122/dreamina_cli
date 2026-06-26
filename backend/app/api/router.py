"""即梦业务路由聚合。

各业务域只在这里挂载一次，避免重复 include router。
"""

from fastapi import APIRouter

from .creator import router as creator_router

from . import app_version, assets, bindings, candidates, llm, projects, prompt_presets, queue, settings, shots


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
router.include_router(creator_router)
