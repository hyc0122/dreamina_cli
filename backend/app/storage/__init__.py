"""即梦批量工具存储分层入口。

子模块可以安全地被旧 `jimeng_storage.py` 导入；兼容用的 `JimengStore` 采用懒加载，避免包初始化时形成循环导入。
"""

from typing import Any

__all__ = ["JimengStore"]


def __getattr__(name: str) -> Any:
    if name == "JimengStore":
        from .store import JimengStore

        return JimengStore
    raise AttributeError(name)
