# HengBeGer 故障排除指南

## 🔍 当前问题诊断

根据诊断结果，项目存在以下问题：

### 1. MySQL连接问题 ❌
**错误信息**: `Access denied for user 'root'@'localhost'`

**原因**: MySQL root用户密码认证失败

**解决方案**:

#### 方案A: 重置MySQL密码（推荐）
1. 以管理员权限运行PowerShell
2. 执行以下命令：
   ```powershell
   # 停止MySQL服务
   Stop-Service -Name MySQL80
   
   # 以安全模式启动MySQL
   Start-Process -FilePath "mysqld" -ArgumentList "--skip-grant-tables", "--skip-networking" -WindowStyle Hidden
   
   # 等待几秒钟
   Start-Sleep -Seconds 5
   
   # 连接并重置密码
   mysql -u root -e "USE mysql; UPDATE user SET authentication_string='' WHERE User='root'; FLUSH PRIVILEGES;"
   
   # 重启MySQL服务
   Stop-Process -Name "mysqld" -Force
   Start-Service -Name MySQL80
   ```

#### 方案B: 使用批处理脚本
1. 以管理员权限运行 `reset-mysql-password.bat`
2. 按照脚本提示操作

#### 方案C: 手动重置
1. 打开MySQL命令行客户端
2. 使用您记得的密码登录
3. 执行：`ALTER USER 'root'@'localhost' IDENTIFIED BY '';`

## 🚀 完整解决流程

### 第一步：解决MySQL连接
1. 确保MySQL服务运行：
   ```powershell
   Get-Service -Name MySQL80
   Start-Service -Name MySQL80  # 如果未运行
   ```

2. 重置MySQL密码（选择上述方案之一）

3. 测试连接：
   ```bash
   node diagnose-mysql.js
   ```

### 第二步：配置项目
1. 设置正确的数据库密码：
   ```bash
   npm run setup-password
   ```
   或手动编辑 `.env` 文件中的 `DB_PASSWORD`

2. 测试数据库连接：
   ```bash
   npm run test-db
   ```

3. 初始化数据库：
   ```bash
   npm run init-db
   ```

### 第三步：启动项目
```bash
npm run launch-improved
```

## 🛠️ 可用工具

| 工具 | 命令 | 功能 |
|------|------|------|
| 诊断工具 | `node diagnose-mysql.js` | 诊断MySQL连接问题 |
| 密码配置 | `npm run setup-password` | 交互式设置MySQL密码 |
| 连接测试 | `npm run test-db` | 测试数据库连接 |
| 数据库初始化 | `npm run init-db` | 初始化数据库和数据 |
| 改进启动器 | `npm run launch-improved` | 启动完整项目 |
| 密码重置 | `reset-mysql-password.bat` | 重置MySQL密码 |

## 📋 检查清单

- [ ] MySQL服务正在运行
- [ ] MySQL密码已正确设置
- [ ] `.env` 文件配置正确
- [ ] 数据库连接测试通过
- [ ] 数据库已初始化
- [ ] 项目启动成功

## 🔧 常见问题

### Q: MySQL服务启动失败
**A**: 检查端口3306是否被占用，或尝试重新安装MySQL

### Q: 忘记MySQL密码
**A**: 使用上述密码重置方案

### Q: 数据库初始化失败
**A**: 确保数据库连接正常，检查 `src/assets/新建 文本文档.txt` 文件是否存在

### Q: 前端无法连接后端
**A**: 检查后端是否在3001端口正常运行，检查防火墙设置

## 📞 获取帮助

如果问题仍然存在，请：
1. 运行 `node diagnose-mysql.js` 获取详细诊断信息
2. 检查终端错误日志
3. 确认所有依赖已正确安装：`npm install`

## 🎯 项目改进

本次改进包括：
- ✅ 创建了改进的启动器 (`launcher-improved.js`)
- ✅ 添加了数据库连接测试功能
- ✅ 提供了密码配置助手
- ✅ 创建了MySQL诊断工具
- ✅ 添加了密码重置工具
- ✅ 完善了文档和故障排除指南