# 全局主题目录

本目录集中管理软件全局视觉风格，业务组件不要再分散写整套主题色。

- `app-themes.css`：深色、浅色、赛博朋克主题的语义颜色 token 和全局皮肤效果。
- `frontend/src/index.css`：只负责引入主题、基础 body 样式、通用工具类和动画。
- `frontend/tailwind.config.ts`：`primary`、`secondary`、`accent` 等颜色必须使用 CSS 变量，不再写死颜色。

新增或调整全局风格时，优先改这里的变量和 `html.<theme>` 选择器；只有某个组件有独立业务状态时，才在组件局部补少量 class。