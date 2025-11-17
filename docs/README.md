# 文档索引

- 概览
  - [架构文档](./01-architecture.md)
  - [详细架构分析](./02-detailed-architecture.md)
  - [项目分析报告](./03-project-analysis.md)
- 使用
  - [快速开始](./04-quick-start.md)
  - [启动指南](./05-startup-guide.md)
  - [部署指南](./06-deployment.md)
  - [故障排除](./07-troubleshooting.md)
- 技术
  - [存储实现](./08-storage-implementation.md)
  - [开发规范](./10-dev-guidelines.md)
  - [管理员工作流](./11-admin-workflow.md)
- 评估
  - [改进总结](./09-improvements-summary.md)
  - [代码评估报告](./12-code-review.md)

## 命令统一
- 初始化数据库：`npm run init-db`
- 启动前后端：`npm run launch`
- 分别启动：`npm run launch:frontend`、`npm run launch:backend`

## 数据来源
- 前端数据：`GET /api/dual-storage/web/data`
- 管理员同步：`POST /api/dual-storage/sync`