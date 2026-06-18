"""旧版 API 导入兼容层。

业务实现已经全部迁移到 :mod:`backend.app.api`。新代码不得从本模块导入；
保留这些名字只为避免外部脚本在升级时立即失效。
"""

from .api.context import reset_jimeng_store_for_tests, set_jimeng_store_for_tests
from .api.router import router
from .api.shots import batch_detect_project_durations, detect_shot_duration

__all__ = [
    "router",
    "set_jimeng_store_for_tests",
    "reset_jimeng_store_for_tests",
    "detect_shot_duration",
    "batch_detect_project_durations",
]
