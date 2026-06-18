# 历史实验：多账号与 Jimeng API

本文仅保留开发历史，不属于当前稳定版功能。

项目曾实验过两条扩展路线：

1. 复制和切换 `credential.json` 的 CLI 多账号池。
2. 使用多个 `sessionid` 连接第三方 `jimeng-api` 兼容服务。

实测中，官方 Windows CLI 在隔离 profile 下仍可能读取全局登录态，导致不同账号返回同一个 `user_id`；第三方 sessionid 通道也存在接口版本、素材上传和结果回传不一致的问题。为保证本地工具先稳定可用，当前界面和提交链路只保留官方单账号 Dreamina CLI。

历史代码或数据迁移时请注意：

- 旧 `runtime_data/output/jimeng/cli_profiles` 不再参与稳定版提交。
- `jimeng_api_*` 设置会在保存稳定版设置时清理。
- 队列、生成记录和候选视频始终以本工具的 `jimeng.sqlite3` 为准。
- 将来若恢复多账号，必须先由官方 CLI 提供可验证的凭证目录隔离能力，并重新做端到端授权、积分、素材提交和结果回传测试。
