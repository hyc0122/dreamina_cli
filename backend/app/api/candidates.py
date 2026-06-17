"""视频候选结果接口边界。

负责本地上传视频、候选视频列表、默认视频、锁定视频和下载。
不要在这里提交新的即梦生成任务。
"""

from fastapi import APIRouter


router = APIRouter()

