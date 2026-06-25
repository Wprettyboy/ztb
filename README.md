# OpenBidKit Core Baseline

这是从 OpenBidKit / 易标投标工具箱中清理出的精简基线，仅保留后续重构标书生成智能体时最有价值的核心链路：

- 招标文件/原方案本地解析
- 技术方案生成与已有方案扩写
- 文档知识库
- Word 导出和格式配置
- 本地配置、SQLite 工作区、AI 调用封装

已移除远程公告、匿名埋点、自动更新、资源页、查重、废标检查、商务标、投标机会、开发示例和第三方默认服务地址。AI 调用只会使用用户在设置页显式填写的模型服务地址。

## 启动

```bash
cd client
npm install
npm run dev
```

## 重要文档

- [核心逻辑说明](docs/CORE_REFACTOR_NOTES.md)
- [清理审计记录](docs/CLEANUP_AUDIT.md)

## 许可证

原项目采用 GNU AGPLv3 only。当前基线保留了 `LICENSE` 和 `NOTICE`。如果继续基于这份代码分发或提供网络服务，需要遵守 AGPLv3 及 NOTICE 中的归属要求。若后续要做闭源商业化，建议以本文档中的核心流程为参考重新实现关键模块，并单独做法律审查。
