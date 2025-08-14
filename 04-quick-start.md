# HengBeGer 快速启动指南

## 🚀 一键启动步骤

### 第一次使用（数据库配置）

1. **启动MySQL服务**
   ```powershell
   # Windows PowerShell (管理员权限)
   Start-Service -Name MySQL80
   ```

2. **配置数据库密码**
   ```bash
   npm run setup-password
   ```
   按提示输入您的MySQL root密码

3. **测试数据库连接**
   ```bash
   npm run test-db
   ```

4. **初始化数据库**
   ```bash
   npm run init-db
   ```

5. **启动项目**
   ```bash
   npm run launch-improved
   ```

### 日常使用

启动MySQL服务后，直接运行：
```bash
npm run launch-improved
```

## 📋 可用命令

| 命令 | 功能 |
|------|------|
| `npm run setup-password` | 配置MySQL密码 |
| `npm run test-db` | 测试数据库连接 |
| `npm run init-db` | 初始化数据库 |
| `npm run launch-improved` | 启动完整项目 |
| `npm run launch-improved:frontend` | 仅启动前端 |
| `npm run launch-improved:backend` | 仅启动后端 |

## 🔧 故障排除

### MySQL连接失败
1. 检查MySQL服务是否启动：`Get-Service -Name MySQL80`
2. 检查.env文件中的密码是否正确
3. 重新运行 `npm run setup-password`

### 端口占用
- 前端默认端口：5173
- 后端默认端口：3001
- 如有冲突，请关闭占用端口的程序

### 依赖问题
```bash
npm install
```

## 📁 项目结构

```
HengBeGer/
├── src/                    # 前端源码
├── server/                 # 后端源码
├── launcher-improved.js    # 改进的启动器
├── setup-mysql-password.js # 密码配置助手
├── .env                    # 环境配置
└── package.json           # 项目配置
```

## 🌐 访问地址

- 前端：http://localhost:5173
- 后端API：http://localhost:3001

## 📚 更多文档

- [项目分析](./PROJECT_ANALYSIS.md)
- [存储实现](./STORAGE_IMPLEMENTATION.md)
- [架构说明](./ARCHITECTURE.md)