# 标书生成核心逻辑说明

本文记录精简后仍保留的核心链路，方便后续按自己的架构重构。

## 主流程

1. 前端入口
   - `client/src/app/menuConfig.ts` 只保留标书生成、知识库、导出格式。
   - `client/src/app/AppRouter.tsx` 路由到技术方案、已有方案扩写、文档知识库、导出格式、设置。
   - 技术方案页面集中在 `client/src/features/technical-plan/pages/TechnicalPlanHome.tsx`。

2. 文件导入与解析
   - IPC：`client/electron/ipc/technicalPlanIpc.cjs`
   - 状态存储：`client/electron/services/technicalPlanStore.cjs`
   - 文件解析：`client/electron/services/fileService.cjs`
   - 本地转换：`client/electron/doc2markdown/convert.mjs`

   `importTenderDocument()` 解析招标文件，保存 Markdown 路径、文件名、hash、字符数和解析器标签。已有方案扩写模式会额外调用 `importOriginalPlanDocument()` 解析用户原方案。

3. 招标文件分析
   - 任务入口：`tasks:start-bid-analysis`
   - 调度器：`client/electron/services/taskService.cjs`
   - 实现：`client/electron/services/bidAnalysisTask.cjs`

   该阶段基于招标文件 Markdown 调用 AI，提取项目信息、甲方信息、交付服务要求、技术要求、评分办法、无效/废标条款等结构化素材，写回 `technical_plan_*` 表和前端状态。

4. 大纲生成
   - 任务入口：`tasks:start-outline-generation`
   - 实现：`client/electron/services/outlineGenerationTask.cjs`

   支持自由大纲和按技术要求对齐的大纲。可选读取知识库匹配结果，补充章节建议。生成结果保存为树形 `outlineData`。

5. 全局事实
   - 任务入口：`tasks:start-global-facts-generation`
   - 实现：`client/electron/services/globalFactsTask.cjs`

   将项目名称、服务周期、交付地点、团队配置等高频变量整理为全局事实，正文生成时优先引用，减少前后矛盾。

6. 正文生成
   - 任务入口：`tasks:start-content-generation`
   - 实现：`client/electron/services/contentGenerationTask.cjs`

   主要步骤是：章节编排、原方案内容还原、正文逐节生成、最低字数扩写、一致性检查、原方案覆盖检查、AI 配图。Mermaid 远程转图已禁用，相关代码只保留本地降级路径。

7. 知识库
   - 前端：`client/src/features/knowledge-base`
   - IPC：`client/electron/ipc/knowledgeBaseIpc.cjs`
   - 服务：`client/electron/services/knowledgeBaseService.cjs`
   - 存储：`client/electron/services/knowledgeBaseStore.cjs`

   文档上传后会解析 Markdown，拆分候选知识条目，再用 AI 做归并和匹配。正文生成和大纲生成可引用这些条目。

8. Word 导出
   - IPC：`client/electron/ipc/exportIpc.cjs`
   - 服务：`client/electron/services/exportService.cjs`
   - 前端格式页：`client/src/features/export-format`

   导出服务将 Markdown/HTML/表格/图片转换为 `docx` 包。当前只允许 data URL、本地路径和 `yibiao-asset://` 本地资产图片；http/https 图片会跳过。

## 建议重构边界

- 可优先保留：`aiService.cjs` 的 OpenAI 兼容请求封装、`technicalPlanStore.cjs` 的状态模型、四个生成任务文件、`exportService.cjs` 的 docx 转换逻辑。
- 建议重写：前端页面状态管理、SQLite 迁移层、AI prompt 组织方式、Mermaid/图片生成策略。
- 法务注意：当前代码仍来自 AGPLv3 项目。闭源产品不要直接复制核心实现。
