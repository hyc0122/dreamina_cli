"""应用版本检测接口。"""

from fastapi import APIRouter

from ..versioning import build_version_status


router = APIRouter(prefix="/app", tags=["app-version"])


@router.get("/version")
def app_version():
    return build_version_status()
