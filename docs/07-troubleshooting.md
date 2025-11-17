# HengBeGer 故障排除指南

## MySQL 连接失败
- 检查 MySQL 服务是否启动：`Get-Service -Name MySQL80` 或 `net start mysql`
- 检查 `.env` 文件中的密码是否正确
- 重新运行 `npm run setup-password`

## 启动项目
```bash
npm run launch
```

## 可用工具
| 工具 | 命令 | 功能 |
|------|------|------|
| 密码配置 | `npm run setup-password` | 交互式设置MySQL密码 |
| 数据库初始化 | `npm run init-db` | 初始化数据库和数据 |
| 安全检查 | `npm run security-check` | 运行安全检查 |
| 密码重置 | `reset-mysql-password.bat` | 重置MySQL密码 |