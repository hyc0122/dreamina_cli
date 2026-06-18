"""JimengStore 兼容聚合入口。

当前阶段复用旧实现，保证所有现有调用不需要改 import。
后续会把 schema、路径安全、项目、分镜、资产、绑定、队列、候选视频、账号和模板逐步拆到同目录文件。
"""

from ..jimeng_storage import JimengStore

__all__ = ["JimengStore"]

