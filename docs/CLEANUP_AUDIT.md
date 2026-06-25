# 清理审计记录

## 已移除

- 远程公告：`UpdateNotifier`、`remoteNotice`
- 匿名埋点：保留 no-op 接口，移除外联 endpoint 和 client id
- 自动更新：`updateService`、`electron-updater`、更新 IPC、更新 UI、更新配置字段
- 资源页：远程资源接口和页面目录
- 查重/废标检查：前端页面、IPC、服务、preload 暴露、任务调度入口
- 商务标、投标机会、开发示例：前端功能目录和路由入口
- MinerU：配置字段、UI、远程解析逻辑
- 第三方默认服务地址：文本/生图模型默认 base_url/model 清空
- 远程图片下载：文件导入和 Word 导出均不再自动拉取 http/https 图片
- Mermaid 远程转图：禁用 mermaid.ink，导出时按代码块保留
- 仓库杂项：GitHub 工作流、历史归档、截图、文章、临时 patch/progress/test 文档

## 保留但需后续评估

- `client/electron/services/sqliteDatabase.cjs` 中仍有查重/废标历史 schema 函数的死代码；新迁移不再调用。若后续确认不需要兼容旧 workspace，可再做一次数据库文件瘦身。
- `client/src/styles.css` 中仍有部分已删除页面的历史样式。它们不影响运行，可在 UI 重构时统一清理。
- Mermaid npm 包已移除。历史 Markdown 里的 Mermaid 代码块会按普通代码块展示和导出。

## 当前外联边界

- AI 文本/生图/模型列表请求：只使用用户在设置页填写的 `base_url`。
- `openExternal`：只在用户点击 Markdown 链接等显式动作时打开系统浏览器。
- 开发服务器脚本中的 `http://127.0.0.1` 是本地地址。
