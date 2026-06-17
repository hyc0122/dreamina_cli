"""分镜资产绑定接口边界。

负责分镜与角色、场景、道具的手动绑定、解绑和排序。
不要在这里创建资产文件，也不要触发视频生成。
"""

from fastapi import APIRouter


router = APIRouter()

