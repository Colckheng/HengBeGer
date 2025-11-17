# HengBeGer 改进总结

## 本轮优化内容
- 整理文档到 `docs/` 目录，统一链接与命名。
- 修复过时命令引用，统一使用 `npm run launch`、`launch:frontend`、`launch:backend`。
- 修正快速启动与故障排除文档，去除不存在的脚本引用。
- 修复 README 中的命令拼写错误（`net stop mysql`）。

## 推荐使用流程
```bash
npm run setup-password   # 交互式设置 MySQL 密码
npm run init-db          # 初始化数据库
npm run launch           # 启动前后端
```

## 后续建议
- 增加自动化备份脚本与恢复流程。
- 强化输入验证与结构化日志。
- 补充部署与安全最佳实践细节。