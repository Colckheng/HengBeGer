# HengBeGer 项目分析报告

## 当前存在的问题

### 1. 数据库连接问题
- MySQL 服务未启动或配置不正确
- 后端无法连接到数据库

**解决方案**
- 启动 MySQL 服务：`net start mysql` 或 `Start-Service -Name MySQL80`
- 配置 `.env` 文件中的数据库密码
- 运行 `npm run init-db` 初始化数据库

## 启动器与命令

```bash
npm run launch              # 启动前后端
npm run launch:frontend     # 仅启动前端
npm run launch:backend      # 仅启动后端

npm start                   # 同时启动前后端（传统）
npm run dev                 # 仅前端
npm run server              # 仅后端
```