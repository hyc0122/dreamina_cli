"""提示词模板接口边界。

负责全局视频生成模板、图片指令模板和项目默认模板绑定。
不要在这里直接调用即梦 CLI。
"""

from fastapi import APIRouter


router = APIRouter()

