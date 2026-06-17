"""API 总路由聚合。

当前阶段先挂载兼容路由，确保既有 `/jimeng` 接口不变。
后续每个业务域会逐步从 `jimeng_api.py` 迁移到同目录下的独立文件。
"""

from fastapi import APIRouter

from . import assets, projects, queue, settings, shots
from ..jimeng_api import router as legacy_jimeng_router


router = APIRouter()
router.include_router(projects.router)
router.include_router(shots.router)
router.include_router(assets.router)
router.include_router(queue.router)
router.include_router(settings.router)
router.include_router(legacy_jimeng_router)
