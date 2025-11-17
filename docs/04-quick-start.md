# HengBeGer 快速启动指南

## 🚀 一键启动步骤

### 第一次使用（数据库配置）
1. 启动 MySQL 服务（Windows）
   ```powershell
   Start-Service -Name MySQL80
   # 或 net start mysql
   ```
2. 配置数据库密码
   ```bash
   npm run setup-password
   ```
3. 初始化数据库
   ```bash
   npm run init-db
   ```
4. 启动项目
   ```bash
   npm run launch
   ```

### 日常使用
```bash
npm run launch
```

## 📋 可用命令
| 命令 | 功能 |
|------|------|
| `npm run setup-password` | 配置MySQL密码 |
| `npm run init-db` | 初始化数据库 |
| `npm run launch` | 启动完整项目 |
| `npm run launch:frontend` | 仅启动前端 |
| `npm run launch:backend` | 仅启动后端 |

## 📚 更多文档
- [项目分析](./03-project-analysis.md)
- [存储实现](./08-storage-implementation.md)
- [架构说明](./01-architecture.md)